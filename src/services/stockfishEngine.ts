import { Chess } from 'chess.js';
import { MoveAnalysis, MoveClassification, PlayerStats } from '../types/chess';
import { extractGameClocks } from '../utils/clockUtils';
import { getOpeningBookEvaluation, checkIsTheoreticalMove, identifyGameOpening } from './openingBook';

export interface EngineEvaluation {
  cp: number; // centipawns from White's perspective (+ White, - Black)
  mate: number | null; // mate in N moves (+ White wins, - Black wins)
  bestMoveUci: string;
  bestMoveSan: string;
  pv: string[];
}

interface WorkerSlot {
  id: number;
  worker: Worker;
  busy: boolean;
  failed: boolean;
}

interface QueuedTask {
  fen: string;
  depth: number;
  resolve: (evaluation: EngineEvaluation) => void;
  reject: (err: any) => void;
}

export class StockfishService {
  private workers: WorkerSlot[] = [];
  private taskQueue: QueuedTask[] = [];
  private transpositionTable = new Map<string, EngineEvaluation>();
  private workerScript = '/stockfish.wasm.js';
  private allWorkersFailed = false;

  constructor() {
    this.initWorkers();
  }

  private initWorkers() {
    if (typeof window === 'undefined') return;

    try {
      // Test wasm support
      const wasmSupported =
        typeof WebAssembly === 'object' &&
        WebAssembly.validate(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));

      this.workerScript = wasmSupported ? '/stockfish.wasm.js' : '/stockfish.js';

      // Detect optimal concurrency: 3 to 4 workers on multi-core machines, 2 on low-core
      const numWorkers =
        typeof navigator !== 'undefined' && navigator.hardwareConcurrency
          ? Math.min(4, Math.max(2, navigator.hardwareConcurrency >= 4 ? 3 : 2))
          : 2;

      for (let i = 0; i < numWorkers; i++) {
        this.createWorkerSlot(i);
      }
    } catch (err) {
      console.warn('Could not instantiate Stockfish Web Workers:', err);
      this.allWorkersFailed = true;
    }
  }

  private createWorkerSlot(id: number) {
    try {
      const worker = new Worker(this.workerScript);
      const slot: WorkerSlot = {
        id,
        worker,
        busy: false,
        failed: false,
      };

      worker.onerror = (e) => {
        console.warn(`Stockfish Worker #${id} error:`, e);
        slot.failed = true;
        slot.busy = false;
        this.processQueue();
      };

      worker.postMessage('uci');
      worker.postMessage('setoption name Threads value 1');
      worker.postMessage('setoption name Hash value 32');
      worker.postMessage('isready');

      this.workers.push(slot);
    } catch (e) {
      console.warn(`Failed creating worker #${id}`, e);
    }
  }

  private processQueue() {
    if (this.taskQueue.length === 0) return;

    // Find available worker slot
    const availableSlot = this.workers.find((w) => !w.busy && !w.failed);

    if (!availableSlot) {
      // Check if all workers failed
      const activeWorkers = this.workers.filter((w) => !w.failed);
      if (activeWorkers.length === 0) {
        while (this.taskQueue.length > 0) {
          const task = this.taskQueue.shift()!;
          task.resolve(this.evaluateHeuristic(task.fen));
        }
      }
      return;
    }

    const task = this.taskQueue.shift();
    if (!task) return;

    availableSlot.busy = true;
    this.runWorkerTask(availableSlot, task);

    // If there are more tasks and more idle workers, keep dispatching concurrently
    if (this.taskQueue.length > 0) {
      this.processQueue();
    }
  }

  private runWorkerTask(slot: WorkerSlot, task: QueuedTask) {
    const { fen, depth, resolve } = task;
    const chess = new Chess(fen);
    const isBlackTurn = chess.turn() === 'b';

    let currentEval: EngineEvaluation = {
      cp: 0,
      mate: null,
      bestMoveUci: '',
      bestMoveSan: '',
      pv: [],
    };

    let completed = false;

    const timeoutId = setTimeout(() => {
      if (completed) return;
      completed = true;
      cleanup();
      slot.busy = false;

      // Interrupt search on worker
      try {
        slot.worker.postMessage('stop');
      } catch {
        // ignore
      }

      const finalEval = currentEval.bestMoveUci ? currentEval : this.evaluateHeuristic(fen);
      this.transpositionTable.set(fen, finalEval);
      resolve(finalEval);
      this.processQueue();
    }, 3500);

    const onMessage = (event: MessageEvent) => {
      const line = typeof event.data === 'string' ? event.data : '';

      // info depth X score cp/mate ... pv ...
      if (line.startsWith('info') && line.includes('score')) {
        const parts = line.split(' ');
        const scoreIdx = parts.indexOf('score');
        if (scoreIdx !== -1) {
          const type = parts[scoreIdx + 1];
          const val = parseInt(parts[scoreIdx + 2], 10);

          if (type === 'cp' && !isNaN(val)) {
            currentEval.cp = isBlackTurn ? -val : val;
            currentEval.mate = null;
          } else if (type === 'mate' && !isNaN(val)) {
            currentEval.mate = isBlackTurn ? -val : val;
            currentEval.cp = (currentEval.mate > 0 ? 10000 : -10000) - currentEval.mate * 10;
          }
        }

        const pvIdx = parts.indexOf('pv');
        if (pvIdx !== -1) {
          const moves = parts.slice(pvIdx + 1);
          currentEval.pv = moves;
          if (moves[0]) {
            currentEval.bestMoveUci = moves[0];
          }
        }
      }

      // bestmove ...
      if (line.startsWith('bestmove')) {
        if (completed) return;
        completed = true;
        cleanup();
        slot.busy = false;

        const parts = line.split(' ');
        const bestMove = parts[1];
        if (bestMove && bestMove !== '(none)') {
          currentEval.bestMoveUci = bestMove;
          try {
            const moveObj = chess.move({
              from: bestMove.substring(0, 2),
              to: bestMove.substring(2, 4),
              promotion: bestMove.length > 4 ? bestMove[4] : undefined,
            });
            if (moveObj) {
              currentEval.bestMoveSan = moveObj.san;
            }
          } catch {
            currentEval.bestMoveSan = bestMove;
          }
        }

        this.transpositionTable.set(fen, currentEval);
        resolve(currentEval);
        this.processQueue();
      }
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      slot.worker.removeEventListener('message', onMessage);
    };

    slot.worker.addEventListener('message', onMessage);
    slot.worker.postMessage(`position fen ${fen}`);
    slot.worker.postMessage(`go depth ${depth}`);
  }

  /**
   * Evaluate a single position using Stockfish UCI protocol.
   * If worker is unavailable or times out, uses positional heuristic evaluation.
   */
  public async evaluatePosition(fen: string, depth = 12): Promise<EngineEvaluation> {
    // 1. Initial starting position (instant 0 ms cache)
    if (fen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
      return {
        cp: 20,
        mate: null,
        bestMoveUci: 'e2e4',
        bestMoveSan: 'e4',
        pv: ['e2e4', 'e7e5'],
      };
    }

    // 2. Transposition table (instant 0 ms cache)
    if (this.transpositionTable.has(fen)) {
      return this.transpositionTable.get(fen)!;
    }

    // 3. Opening Book lookup (instant 0 ms theoretical cache)
    const bookEval = getOpeningBookEvaluation(fen);
    if (bookEval) {
      this.transpositionTable.set(fen, bookEval);
      return bookEval;
    }

    // 4. Terminal game-over positions (instant 0 ms resolution)
    try {
      const chess = new Chess(fen);
      if (chess.isGameOver()) {
        const terminalEval = this.evaluateHeuristic(fen);
        this.transpositionTable.set(fen, terminalEval);
        return terminalEval;
      }

      // 5. Forced single moves: if only 1 legal move exists, depth 4 is instantaneous
      const legalMoves = chess.moves({ verbose: true });
      const effectiveDepth = legalMoves.length === 1 ? Math.min(4, depth) : depth;

      // 6. Queue to parallel worker pool
      return new Promise<EngineEvaluation>((resolve, reject) => {
        this.taskQueue.push({
          fen,
          depth: effectiveDepth,
          resolve,
          reject,
        });
        this.processQueue();
      });
    } catch {
      return this.evaluateHeuristic(fen);
    }
  }

  /**
   * Fast, reliable chess evaluation fallback based on Shannon & modern heuristics:
   * Piece values, piece-square tables, mobility, king safety, center control, pawn structure.
   */
  public evaluateHeuristic(fen: string): EngineEvaluation {
    const chess = new Chess(fen);
    const legalMoves = chess.moves({ verbose: true });

    if (chess.isGameOver()) {
      if (chess.isCheckmate()) {
        const mateWinner = chess.turn() === 'w' ? -1 : 1;
        return {
          cp: mateWinner * 10000,
          mate: mateWinner,
          bestMoveUci: '',
          bestMoveSan: '',
          pv: [],
        };
      }
      return { cp: 0, mate: null, bestMoveUci: '', bestMoveSan: '', pv: [] };
    }

    // Piece material values
    const pieceValues: Record<string, number> = {
      p: 100,
      n: 320,
      b: 330,
      r: 500,
      q: 900,
      k: 20000,
    };

    let score = 0;
    const board = chess.board();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;

        const val = pieceValues[piece.type] || 0;
        let posBonus = 0;

        // Central control bonus for pawns and knights
        if (piece.type === 'p') {
          if ((r === 3 || r === 4) && (c === 3 || c === 4)) posBonus += 25;
          else if ((r >= 2 && r <= 5) && (c >= 2 && c <= 5)) posBonus += 10;
        } else if (piece.type === 'n') {
          if ((r >= 2 && r <= 5) && (c >= 2 && c <= 5)) posBonus += 20;
        }

        if (piece.color === 'w') {
          score += val + posBonus;
        } else {
          score -= val + posBonus;
        }
      }
    }

    // Mobility bonus
    const turnSign = chess.turn() === 'w' ? 1 : -1;
    score += turnSign * legalMoves.length * 3;

    // Pick top legal move (captures, checks, or center moves)
    let best = legalMoves[0];
    let bestMoveScore = -Infinity;

    for (const move of legalMoves) {
      let moveVal = 0;
      if (move.captured) {
        moveVal += (pieceValues[move.captured] || 100) * 2;
      }
      if (move.san.includes('+')) moveVal += 40;
      if (move.to === 'd4' || move.to === 'e4' || move.to === 'd5' || move.to === 'e5') moveVal += 20;
      if (moveVal > bestMoveScore) {
        bestMoveScore = moveVal;
        best = move;
      }
    }

    const bestUci = best ? `${best.from}${best.to}${best.promotion || ''}` : '';
    const bestSan = best ? best.san : '';

    return {
      cp: score,
      mate: null,
      bestMoveUci: bestUci,
      bestMoveSan: bestSan,
      pv: bestUci ? [bestUci] : [],
    };
  }

  /**
   * Helper: Win Probability from Centipawn score (from White's perspective)
   * Formula: 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
   */
  public static calculateWinPercentage(cp: number): number {
    const clampedCp = Math.max(-1000, Math.min(1000, cp));
    return 100 / (1 + Math.pow(10, -clampedCp / 400));
  }

  /**
   * Classify move based on Win% drop and Centipawn Loss
   */
  public static classifyMove(
    isWhite: boolean,
    playedSan: string,
    bestSan: string,
    cpLoss: number,
    winPctDrop: number,
    evalBefore: number,
    evalAfter: number,
    isSacrifice = false
  ): MoveClassification {
    // Book / Identical to best move
    if (playedSan === bestSan || cpLoss <= 10) {
      if (isSacrifice && cpLoss <= 15) {
        return 'brilliant';
      }
      return 'best';
    }

    // Missed win: Was heavily winning (>+3.0 or mate) and dropped to near equal or worse
    if (isWhite && evalBefore >= 250 && evalAfter <= 50) return 'missedWin';
    if (!isWhite && evalBefore <= -250 && evalAfter >= -50) return 'missedWin';

    // Blunder (Gaffe): Huge drop
    if (winPctDrop >= 18 || cpLoss >= 200) {
      return 'blunder';
    }

    // Mistake (Erreur)
    if (winPctDrop >= 9 || cpLoss >= 90) {
      return 'mistake';
    }

    // Inaccuracy (Imprécision)
    if (winPctDrop >= 4 || cpLoss >= 45) {
      return 'inaccuracy';
    }

    // Excellent / Good
    if (cpLoss <= 25) {
      return 'excellent';
    }

    return 'good';
  }

  /**
   * Full Game Analysis
   * Parses moves, runs Stockfish at given depth, classifies moves and aggregates statistics.
   */
  public async analyzeFullGame(
    pgn: string,
    depth = 12,
    onProgress?: (current: number, total: number) => void
  ): Promise<{
    moves: MoveAnalysis[];
    statsWhite: PlayerStats;
    statsBlack: PlayerStats;
    detectedOpening?: { eco: string; name: string } | null;
  }> {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });

    const totalPlies = history.length;
    const movesAnalysis: MoveAnalysis[] = [];

    // Extract clocks and thinking times from PGN comments if present
    const { moveClocks } = extractGameClocks(pgn, history);

    // Replay moves to get FENs
    const replayChess = new Chess();
    const fensBefore: string[] = [];
    const fensAfter: string[] = [];

    for (const m of history) {
      fensBefore.push(replayChess.fen());
      replayChess.move(m);
      fensAfter.push(replayChess.fen());
    }

    // Collect all unique FENs across the entire game for parallel evaluation
    const allUniqueFens = Array.from(new Set([...fensBefore, ...fensAfter]));
    const totalPositions = allUniqueFens.length;
    let completedPositions = 0;

    // Concurrent evaluation of all unique positions with the parallel worker pool & opening book
    const evalPromises = allUniqueFens.map(async (fen) => {
      const res = await this.evaluatePosition(fen, depth);
      completedPositions++;
      if (onProgress) {
        onProgress(completedPositions, totalPositions);
      }
      return { fen, res };
    });

    const evaluatedResults = await Promise.all(evalPromises);
    const evalCache = new Map<string, EngineEvaluation>();
    for (const item of evaluatedResults) {
      evalCache.set(item.fen, item.res);
    }

    // Build MoveAnalysis records with pre-evaluated positions
    for (let ply = 0; ply < totalPlies; ply++) {
      const move = history[ply];
      const isWhite = move.color === 'w';
      const fenBefore = fensBefore[ply];
      const fenAfter = fensAfter[ply];

      const evalBeforeRes = evalCache.get(fenBefore) || this.evaluateHeuristic(fenBefore);
      const evalAfterRes = evalCache.get(fenAfter) || this.evaluateHeuristic(fenAfter);

      const evalBefore = evalBeforeRes.cp;
      const evalAfter = evalAfterRes.cp;

      const winPctBefore = StockfishService.calculateWinPercentage(evalBefore);
      const winPctAfter = StockfishService.calculateWinPercentage(evalAfter);

      // Check if played move is recognized in the official Lichess theoretical opening book
      const bookCheck = ply < 25 ? checkIsTheoreticalMove(fenBefore, move.san) : { isBook: false };

      // Centipawn loss and win% drop from moving player's point of view
      let cpLoss = isWhite ? evalBefore - evalAfter : evalAfter - evalBefore;
      if (cpLoss < 0 || bookCheck.isBook) cpLoss = 0;

      let winPctDrop = isWhite ? winPctBefore - winPctAfter : winPctAfter - winPctBefore;
      if (winPctDrop < 0 || bookCheck.isBook) winPctDrop = 0;

      // Check if played move was a piece sacrifice
      const pieceType = move.piece;
      const isSacrifice = (pieceType === 'q' || pieceType === 'r' || pieceType === 'b' || pieceType === 'n') &&
        move.captured === undefined &&
        evalAfterRes.cp * (isWhite ? 1 : -1) > 100;

      const classification = bookCheck.isBook
        ? 'book'
        : StockfishService.classifyMove(
            isWhite,
            move.san,
            evalBeforeRes.bestMoveSan,
            cpLoss,
            winPctDrop,
            evalBefore,
            evalAfter,
            isSacrifice
          );

      const moveNumber = Math.floor(ply / 2) + 1;
      const clockInfo = moveClocks[ply];

      movesAnalysis.push({
        ply,
        moveNumber,
        color: move.color,
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion || ''}`,
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        fenBefore,
        fenAfter,
        evalBefore,
        evalAfter,
        mateBefore: evalBeforeRes.mate,
        mateAfter: evalAfterRes.mate,
        bestMoveUci: evalBeforeRes.bestMoveUci,
        bestMoveSan: evalBeforeRes.bestMoveSan || evalBeforeRes.bestMoveUci,
        bestMoveFrom: evalBeforeRes.bestMoveUci?.substring(0, 2) || '',
        bestMoveTo: evalBeforeRes.bestMoveUci?.substring(2, 4) || '',
        pv: evalBeforeRes.pv,
        centipawnLoss: Math.round(cpLoss),
        winPercentBefore: Math.round(winPctBefore),
        winPercentAfter: Math.round(winPctAfter),
        winPercentLoss: Math.round(winPctDrop),
        classification,
        clock: clockInfo?.clock,
        thinkTimeSeconds: clockInfo?.thinkTimeSeconds,
        thinkTimeFormatted: clockInfo?.thinkTimeFormatted,
        isLongThink: clockInfo?.isLongThink,
        thinkRatioToAverage: clockInfo?.thinkRatioToAverage,
      });
    }

    // Identify the official Lichess opening name & ECO
    const detectedOpening = identifyGameOpening(fensAfter);

    // Compute stats for White and Black
    const statsWhite = this.computePlayerStats(movesAnalysis.filter((m) => m.color === 'w'), totalPlies);
    const statsBlack = this.computePlayerStats(movesAnalysis.filter((m) => m.color === 'b'), totalPlies);

    return {
      moves: movesAnalysis,
      statsWhite,
      statsBlack,
      detectedOpening,
    };
  }

  private computePlayerStats(playerMoves: MoveAnalysis[], totalGamePlies: number): PlayerStats {
    let brilliant = 0;
    let great = 0;
    let best = 0;
    let excellent = 0;
    let good = 0;
    let inaccuracies = 0;
    let mistakes = 0;
    let blunders = 0;
    let missedWins = 0;
    let totalCpLoss = 0;
    let openingBlunders = 0;
    let middlegameBlunders = 0;
    let endgameBlunders = 0;

    for (const m of playerMoves) {
      totalCpLoss += m.centipawnLoss;

      // Classify game phase (approximate: ply < 20 Opening, 20-50 Middlegame, > 50 Endgame)
      const isOpening = m.ply < 20;
      const isMiddlegame = m.ply >= 20 && m.ply < 50;
      const isEndgame = m.ply >= 50;

      switch (m.classification) {
        case 'book':
        case 'best':
          best++;
          break;
        case 'brilliant':
          brilliant++;
          break;
        case 'great':
          great++;
          break;
        case 'best':
          best++;
          break;
        case 'excellent':
          excellent++;
          break;
        case 'good':
          good++;
          break;
        case 'inaccuracy':
          inaccuracies++;
          break;
        case 'mistake':
          mistakes++;
          if (isOpening) openingBlunders++;
          else if (isMiddlegame) middlegameBlunders++;
          else endgameBlunders++;
          break;
        case 'blunder':
        case 'missedWin':
          blunders++;
          if (isOpening) openingBlunders++;
          else if (isMiddlegame) middlegameBlunders++;
          else endgameBlunders++;
          break;
      }
    }

    const totalMoves = playerMoves.length || 1;
    const avgCentipawnLoss = Math.round(totalCpLoss / totalMoves);

    // Calculate think time metrics if available
    const movesWithThink = playerMoves.filter((m) => m.thinkTimeSeconds !== undefined);
    const avgThinkTimeSeconds = movesWithThink.length > 0
      ? Math.round(movesWithThink.reduce((a, b) => a + (b.thinkTimeSeconds || 0), 0) / movesWithThink.length)
      : undefined;
    const longThinksCount = playerMoves.filter((m) => m.isLongThink).length;

    // Accuracy formula: Chess.com / Lichess CAPS-like precision curve
    // accuracy = 100 * exp(-0.0035 * avgCpLoss), clamped between 20 and 99.4
    const rawAccuracy = 100 * Math.exp(-0.0038 * avgCentipawnLoss);
    const accuracy = Math.min(99.4, Math.max(25.0, Math.round(rawAccuracy * 10) / 10));

    return {
      accuracy,
      totalMoves,
      brilliant,
      great,
      best,
      excellent,
      good,
      inaccuracies,
      mistakes,
      blunders,
      missedWins,
      avgCentipawnLoss,
      openingBlunders,
      middlegameBlunders,
      endgameBlunders,
      avgThinkTimeSeconds,
      longThinksCount,
    };
  }

  public destroy() {
    for (const slot of this.workers) {
      try {
        slot.worker.terminate();
      } catch {
        // ignore
      }
    }
    this.workers = [];
    this.taskQueue = [];
  }
}

export const stockfishService = new StockfishService();
