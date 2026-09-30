import { Chess } from 'chess.js';
import { MoveAnalysis, PlayerStats } from '../types/chess';
import { calculateWinPercentage, classifyMove, computePlayerStats } from '../utils/moveAnalysis';
import { extractGameClocks } from '../utils/clockUtils';
import {
  getOpeningBookEvaluation,
  checkIsTheoreticalMove,
  identifyGameOpening,
  ensureOpeningBookLoaded,
} from './openingBook';
import { toFrenchSan } from '../utils/chessNotation';
import { LruCache } from '../utils/lruCache';

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
  /** Script the worker was started from (kept to restart it with the same engine). */
  script: string;
  busy: boolean;
  failed: boolean;
}

interface QueuedTask {
  fen: string;
  depth: number;
  resolve: (evaluation: EngineEvaluation) => void;
  reject: (err: unknown) => void;
}

interface CachedEvaluation {
  evaluation: EngineEvaluation;
  /** Depth the search reached: a cached entry only answers requests for this depth or less. */
  depth: number;
}

/** Above this the extra workers bring little and each one costs memory (hash table + wasm instance). */
const MAX_WORKERS = 6;
const DEFAULT_WORKERS = 2;
/** Evaluations kept in memory (one game needs about 2 x its plies). */
const CACHE_CAPACITY = 2000;
/** How long a stopped worker has to report its `bestmove` before it is restarted. */
const STOP_GRACE_MS = 1500;

/**
 * Number of engine workers for a machine: all logical cores but one (the page keeps a core),
 * between 1 and MAX_WORKERS. Unknown core count: 2.
 */
export function defaultWorkerCount(hardwareConcurrency?: number): number {
  if (!hardwareConcurrency || !Number.isFinite(hardwareConcurrency) || hardwareConcurrency < 1) {
    return DEFAULT_WORKERS;
  }
  return Math.min(MAX_WORKERS, Math.max(1, Math.floor(hardwareConcurrency) - 1));
}

/**
 * Wall-clock limit of one position search. Up to depth 12 it stays at 3.5 s, then it grows by 50% per
 * extra ply (capped at 30 s) so that a deeper analysis is not silently cut back to a shallow one.
 */
export function searchTimeLimitMs(depth: number): number {
  const base = 3500;
  const extraPlies = Math.max(0, depth - 12);
  return Math.min(30_000, Math.round(base * Math.pow(1.5, extraPlies)));
}

export interface StockfishServiceOptions {
  /** Number of workers (default: derived from `navigator.hardwareConcurrency`). */
  workerCount?: number;
  /** Creates the worker running `script` (default: `new Worker(script)`). */
  createWorker?: (script: string) => Worker;
  /** Maximum number of cached evaluations. */
  cacheCapacity?: number;
}

/** Keeps a worker error from reaching the console/window: the service recovers with its own fallbacks. */
function swallowEvent(e: Event) {
  try {
    e.preventDefault();
    e.stopPropagation();
  } catch {
    // Not cancelable
  }
}

export class StockfishService {
  private workers: WorkerSlot[] = [];
  private taskQueue: QueuedTask[] = [];
  private cache: LruCache<string, CachedEvaluation>;
  private workerScript = '/stockfish-19.js#stockfish-19.wasm';

  constructor(private readonly options: StockfishServiceOptions = {}) {
    this.cache = new LruCache(options.cacheCapacity ?? CACHE_CAPACITY);
    this.initWorkers();
  }

  private initWorkers() {
    if (!this.options.createWorker && typeof window === 'undefined') return;

    try {
      // Test wasm support
      const wasmSupported =
        typeof WebAssembly === 'object' &&
        WebAssembly.validate(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));

      this.workerScript = wasmSupported ? '/stockfish-19.js#stockfish-19.wasm' : '/stockfish.js';

      const numWorkers =
        this.options.workerCount ??
        defaultWorkerCount(typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined);

      for (let i = 0; i < numWorkers; i++) {
        this.createWorkerSlot(i, this.workerScript);
      }
    } catch (err) {
      console.warn('Could not instantiate Stockfish Web Workers:', err);
    }
  }

  /** Number of workers currently able to run a search. */
  public get activeWorkerCount(): number {
    return this.workers.filter((w) => !w.failed).length;
  }

  private createWorkerSlot(id: number, script?: string) {
    const targetScript = script || this.workerScript;
    try {
      const worker = this.options.createWorker ? this.options.createWorker(targetScript) : new Worker(targetScript);
      const slot: WorkerSlot = {
        id,
        worker,
        script: targetScript,
        busy: false,
        failed: false,
      };

      worker.onerror = (e: ErrorEvent | Event) => {
        swallowEvent(e);
        console.warn(`Stockfish Worker #${id} (${targetScript}) error intercepted:`, e);

        // Cascading resilient fallbacks: Stockfish 19 -> Stockfish classic JS -> Heuristic
        if (targetScript.includes('stockfish-19')) {
          console.info(`Attempting fallback to Stockfish classic for Worker #${id}...`);
          try {
            worker.terminate();
          } catch {
            // Already terminated
          }
          this.createWorkerSlot(id, '/stockfish.js');
          return;
        }

        slot.failed = true;
        slot.busy = false;
        this.processQueue();
      };

      worker.postMessage('uci');
      // /stockfish-19.js is the lite single-threaded build (no SharedArrayBuffer, so no COOP/COEP headers
      // needed): parallelism comes from running one search per worker on different positions.
      worker.postMessage('setoption name Threads value 1');
      worker.postMessage('setoption name Hash value 16');
      worker.postMessage('isready');

      const existingIdx = this.workers.findIndex((w) => w.id === id);
      if (existingIdx !== -1) {
        this.workers[existingIdx] = slot;
      } else {
        this.workers.push(slot);
      }
    } catch (e) {
      console.warn(`Failed creating worker #${id} with script ${targetScript}`, e);
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

  /** Replaces a worker by a fresh one running the same engine (used when it stops answering). */
  private restartWorker(slot: WorkerSlot) {
    try {
      slot.worker.terminate();
    } catch {
      // Already terminated
    }
    this.createWorkerSlot(slot.id, slot.script);
    this.processQueue();
  }

  /**
   * After a search was interrupted (timeout), the worker still has to print the `bestmove` of that
   * search. Keeping the slot busy until then matters: otherwise the stale `bestmove` would complete the
   * next task started on this worker. A worker that stays silent is restarted.
   */
  private releaseAfterStop(slot: WorkerSlot) {
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data === 'string' && event.data.startsWith('bestmove')) release();
    };
    const release = () => {
      clearTimeout(guard);
      slot.worker.removeEventListener('message', onMessage);
      slot.busy = false;
      this.processQueue();
    };
    const guard = setTimeout(() => {
      slot.worker.removeEventListener('message', onMessage);
      this.restartWorker(slot);
    }, STOP_GRACE_MS);

    slot.worker.addEventListener('message', onMessage);
    try {
      slot.worker.postMessage('stop');
    } catch {
      clearTimeout(guard);
      slot.worker.removeEventListener('message', onMessage);
      this.restartWorker(slot);
    }
  }

  private runWorkerTask(slot: WorkerSlot, task: QueuedTask) {
    const { fen, depth, resolve } = task;
    const chess = new Chess(fen);
    const isBlackTurn = chess.turn() === 'b';

    const currentEval: EngineEvaluation = {
      cp: 0,
      mate: null,
      bestMoveUci: '',
      bestMoveSan: '',
      pv: [],
    };
    let reachedDepth = 0;
    let completed = false;

    /** Resolves the task once. Only evaluations that come from the engine are cached. */
    const settle = (evaluation: EngineEvaluation, cachedDepth: number | null) => {
      if (completed) return false;
      completed = true;
      cleanup();
      if (cachedDepth !== null) this.cache.set(fen, { evaluation, depth: cachedDepth });
      resolve(evaluation);
      return true;
    };

    // Partial result of an interrupted search: usable once the engine has a move, else the heuristic
    const partialResult = () =>
      currentEval.bestMoveUci ? settle(currentEval, reachedDepth) : settle(this.evaluateHeuristic(fen), null);

    const timeoutId = setTimeout(() => {
      if (!partialResult()) return;
      this.releaseAfterStop(slot); // the slot stays busy until the interrupted search has ended
    }, searchTimeLimitMs(depth));

    const onMessage = (event: MessageEvent) => {
      const line = typeof event.data === 'string' ? event.data : '';

      // info depth X score cp/mate ... pv ...
      if (line.startsWith('info') && line.includes('score')) {
        const parts = line.split(' ');

        const depthIdx = parts.indexOf('depth');
        if (depthIdx !== -1) {
          const reported = parseInt(parts[depthIdx + 1], 10);
          if (!isNaN(reported)) reachedDepth = Math.max(reachedDepth, reported);
        }

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
      if (line.startsWith('bestmove') && !completed) {
        const bestMove = line.split(' ')[1];
        if (bestMove && bestMove !== '(none)') {
          currentEval.bestMoveUci = bestMove;
          try {
            const moveObj = chess.move({
              from: bestMove.substring(0, 2),
              to: bestMove.substring(2, 4),
              promotion: bestMove.length > 4 ? bestMove[4] : undefined,
            });
            if (moveObj) {
              currentEval.bestMoveSan = toFrenchSan(moveObj.san);
            }
          } catch {
            currentEval.bestMoveSan = bestMove;
          }
        }

        settle(currentEval, depth);
        slot.busy = false;
        this.processQueue();
      }
    };

    const onTaskError = (errEv: ErrorEvent | Event) => {
      swallowEvent(errEv);
      if (!partialResult()) return;
      slot.busy = false;
      this.processQueue();
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      try {
        slot.worker.removeEventListener('message', onMessage);
        slot.worker.removeEventListener('error', onTaskError);
      } catch {
        // Worker already gone
      }
    };

    slot.worker.addEventListener('message', onMessage);
    slot.worker.addEventListener('error', onTaskError);

    try {
      slot.worker.postMessage(`position fen ${fen}`);
      slot.worker.postMessage(`go depth ${depth}`);
    } catch {
      settle(this.evaluateHeuristic(fen), null);
      slot.busy = false;
      this.processQueue();
    }
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

    // 2. Evaluation cache (instant): only valid if the stored search was at least as deep as requested
    const cached = this.cache.get(fen);
    if (cached && cached.depth >= depth) {
      return cached.evaluation;
    }

    // 3. Opening Book lookup (instant 0 ms theoretical cache)
    const bookEval = getOpeningBookEvaluation(fen);
    if (bookEval) {
      return bookEval;
    }

    // 4. Terminal game-over positions (instant 0 ms resolution)
    try {
      const chess = new Chess(fen);
      if (chess.isGameOver()) {
        return this.evaluateHeuristic(fen);
      }

      // 5. Forced single moves: if only 1 legal move exists, depth 4 is instantaneous
      const legalMoves = chess.moves({ verbose: true });
      const effectiveDepth = legalMoves.length === 1 ? Math.min(4, depth) : depth;

      // 6. Queue to parallel worker pool (never rejects, always resolves with heuristic on failure)
      return new Promise<EngineEvaluation>((resolve) => {
        this.taskQueue.push({
          fen,
          depth: effectiveDepth,
          resolve,
          reject: (err) => {
            console.warn('Worker task error, resolving with heuristic:', err);
            resolve(this.evaluateHeuristic(fen));
          },
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
          else if (r >= 2 && r <= 5 && c >= 2 && c <= 5) posBonus += 10;
        } else if (piece.type === 'n') {
          if (r >= 2 && r <= 5 && c >= 2 && c <= 5) posBonus += 20;
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

    // Ensure full theoretical openings dataset (7,800+ lines) is loaded into cache
    await ensureOpeningBookLoaded();

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
    let inBook = true;
    // Last opening named so far: book moves on an unnamed position keep showing it
    let currentOpening: { eco?: string; name?: string } = {};
    for (let ply = 0; ply < totalPlies; ply++) {
      const move = history[ply];
      const isWhite = move.color === 'w';
      const fenBefore = fensBefore[ply];
      const fenAfter = fensAfter[ply];

      const evalBeforeRes = evalCache.get(fenBefore) || this.evaluateHeuristic(fenBefore);
      const evalAfterRes = evalCache.get(fenAfter) || this.evaluateHeuristic(fenAfter);

      const evalBefore = evalBeforeRes.cp;
      const evalAfter = evalAfterRes.cp;

      const winPctBefore = calculateWinPercentage(evalBefore);
      const winPctAfter = calculateWinPercentage(evalAfter);

      // Check if played move is recognized in the official theoretical opening book (7,800+ lines)
      let bookCheck: { isBook: boolean; eco?: string; name?: string } = { isBook: false };
      if (inBook && ply < 35) {
        bookCheck = checkIsTheoreticalMove(fenBefore, move.san, fenAfter);
        if (!bookCheck.isBook) {
          inBook = false; // Player moved away from recognized theoretical lines
        }
      } else if (ply < 35) {
        // Transposition check: if game transposes back into an established named opening variation
        const transposeCheck = checkIsTheoreticalMove(fenBefore, move.san, fenAfter);
        if (transposeCheck.isBook && transposeCheck.name) {
          bookCheck = transposeCheck;
          inBook = true;
        }
      }
      if (bookCheck.isBook) {
        if (bookCheck.name) currentOpening = { eco: bookCheck.eco, name: bookCheck.name };
        else bookCheck = { ...bookCheck, ...currentOpening };
      }

      // Centipawn loss and win% drop from moving player's point of view
      let cpLoss = isWhite ? evalBefore - evalAfter : evalAfter - evalBefore;
      if (cpLoss < 0 || bookCheck.isBook) cpLoss = 0;

      let winPctDrop = isWhite ? winPctBefore - winPctAfter : winPctAfter - winPctBefore;
      if (winPctDrop < 0 || bookCheck.isBook) winPctDrop = 0;

      // Check if played move was a piece sacrifice
      const pieceType = move.piece;
      const isSacrifice =
        (pieceType === 'q' || pieceType === 'r' || pieceType === 'b' || pieceType === 'n') &&
        move.captured === undefined &&
        evalAfterRes.cp * (isWhite ? 1 : -1) > 100;

      // When a move is theoretical, it is ALWAYS designated as 'book' in the notation and badge,
      // even if it also happens to be the engine's #1 move!
      const classification = bookCheck.isBook
        ? 'book'
        : classifyMove(
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
      const isRushed = Boolean(
        clockInfo?.thinkTimeSeconds !== undefined &&
        clockInfo.thinkTimeSeconds <= 3 &&
        ['inaccuracy', 'mistake', 'blunder', 'missedWin'].includes(classification) &&
        classification !== 'book'
      );

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
        openingName: bookCheck.name,
        eco: bookCheck.eco,
        clock: clockInfo?.clock,
        thinkTimeSeconds: clockInfo?.thinkTimeSeconds,
        thinkTimeFormatted: clockInfo?.thinkTimeFormatted,
        isLongThink: clockInfo?.isLongThink,
        isRushed,
        thinkRatioToAverage: clockInfo?.thinkRatioToAverage,
      });
    }

    // Identify the official Lichess opening name & ECO
    const detectedOpening = identifyGameOpening(fensAfter);

    // Compute stats for White and Black
    const statsWhite = computePlayerStats(movesAnalysis.filter((m) => m.color === 'w'));
    const statsBlack = computePlayerStats(movesAnalysis.filter((m) => m.color === 'b'));

    return {
      moves: movesAnalysis,
      statsWhite,
      statsBlack,
      detectedOpening,
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
    // Nothing will run these searches any more: answer them so callers do not wait forever
    for (const task of this.taskQueue) task.resolve(this.evaluateHeuristic(task.fen));
    this.taskQueue = [];
    this.cache.clear();
  }
}

export const stockfishService = new StockfishService();
