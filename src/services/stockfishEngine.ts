import { Chess, type Move } from 'chess.js';
import { MoveAnalysis, PlayerStats } from '../types/chess';
import { classifyMove, computePlayerStats, winPercentOfEvaluation } from '../utils/moveAnalysis';
import { moveContext } from '../utils/moveContext';
import { phasesOfPositions } from '../utils/gamePhase';
import { extractGameClocks } from '../utils/clockUtils';
import { assetUrl } from '../utils/siteUrl';
import {
  getOpeningBookEvaluation,
  checkIsTheoreticalMove,
  identifyGameOpening,
  ensureOpeningBookLoaded,
} from './openingBook';
import { LruCache } from '../utils/lruCache';

export interface EngineEvaluation {
  cp: number; // centipawns from White's perspective (+ White, - Black)
  mate: number | null; // mate in N moves (+ White wins, - Black wins)
  bestMoveUci: string;
  bestMoveSan: string;
  pv: string[];
  /**
   * The engine's second choice (the search runs with MultiPV 2), when the position has a second legal move:
   * the gap with the best move tells an only move from a position with several good ones.
   */
  second?: { cp: number; mate: number | null; moveUci: string };
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
  reject: (err: unknown) => void;
  /** Set once the task runs on a worker: stops its search and frees the worker (used when cancelled). */
  interrupt?: () => void;
}

/** What an analysis produces; the same shape is used for the partial results sent while it runs. */
export interface GameAnalysisOutput {
  moves: MoveAnalysis[];
  statsWhite: PlayerStats;
  statsBlack: PlayerStats;
  detectedOpening?: { eco: string; name: string } | null;
}

export interface AnalyzeOptions {
  /** Aborting it stops the analysis: pending positions are dropped, the running searches are stopped, and the
   * returned promise rejects with an AbortError. */
  signal?: AbortSignal;
  /**
   * Called while the analysis runs with the moves analysed so far (the first plies of the game, in order,
   * as soon as both of their positions are evaluated), at most every PARTIAL_INTERVAL_MS. Not called for the
   * complete result: that is what the promise returns.
   */
  onPartial?: (partial: GameAnalysisOutput, totalPlies: number) => void;
}

/** Minimum delay between two partial results (each one makes the interface re-render the game). */
export const PARTIAL_INTERVAL_MS = 200;

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The analysis was cancelled', 'AbortError');
}

/** True for the error an aborted analysis rejects with. */
export function isAbortError(err: unknown): boolean {
  // By name only: a DOMException is not an `Error` in every environment
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

interface CachedEvaluation {
  evaluation: EngineEvaluation;
  /** Depth the search reached: a cached entry only answers requests for this depth or less. */
  depth: number;
}

/**
 * Engine loaded by every worker: Stockfish 19, lite single-threaded WebAssembly build. The files come from
 * the `stockfish` package (see vite/stockfishPlugin.ts); the `#` part tells the loader where its .wasm is.
 * There is no other engine: when it cannot run, positions are evaluated by the built-in heuristic.
 */
const ENGINE_SCRIPT = `${assetUrl('stockfish-19.js')}#stockfish-19.wasm`;

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

  private started = false;

  constructor(private readonly options: StockfishServiceOptions = {}) {
    this.cache = new LruCache(options.cacheCapacity ?? CACHE_CAPACITY);
  }

  /**
   * Starts the workers (each one downloads the ~1.8 MB engine). Nothing starts at import time, so the page
   * is not slowed down at load: the app calls this when the browser is idle, and the first search that needs
   * the engine calls it too. Calling it again does nothing.
   */
  public warmUp() {
    if (this.started) return;
    this.started = true;
    this.initWorkers();
  }

  private initWorkers() {
    if (!this.options.createWorker && typeof window === 'undefined') return;

    try {
      const wasmSupported =
        typeof WebAssembly === 'object' &&
        WebAssembly.validate(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
      if (!wasmSupported) {
        console.warn('WebAssembly is not available: positions are evaluated with the built-in heuristic.');
        return;
      }

      const numWorkers =
        this.options.workerCount ??
        defaultWorkerCount(typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined);

      for (let i = 0; i < numWorkers; i++) {
        this.createWorkerSlot(i);
      }
    } catch (err) {
      console.warn('Could not instantiate Stockfish Web Workers:', err);
    }
  }

  /** Number of workers currently able to run a search. */
  public get activeWorkerCount(): number {
    return this.workers.filter((w) => !w.failed).length;
  }

  private createWorkerSlot(id: number) {
    try {
      const worker = this.options.createWorker ? this.options.createWorker(ENGINE_SCRIPT) : new Worker(ENGINE_SCRIPT);
      const slot: WorkerSlot = {
        id,
        worker,
        busy: false,
        failed: false,
      };

      worker.onerror = (e: ErrorEvent | Event) => {
        swallowEvent(e);
        console.warn(`Stockfish Worker #${id} error intercepted:`, e);

        // No other engine to fall back on: this worker is out, and once every worker is, searches are
        // answered by the heuristic evaluation (see processQueue)
        try {
          worker.terminate();
        } catch {
          // Already terminated
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
      // Two lines per position: the best move and the second one (see `EngineEvaluation.second`)
      worker.postMessage('setoption name MultiPV value 2');
      worker.postMessage('isready');

      const existingIdx = this.workers.findIndex((w) => w.id === id);
      if (existingIdx !== -1) {
        this.workers[existingIdx] = slot;
      } else {
        this.workers.push(slot);
      }
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

  /** Replaces a worker by a fresh one (used when it stops answering). */
  private restartWorker(slot: WorkerSlot) {
    try {
      slot.worker.terminate();
    } catch {
      // Already terminated
    }
    this.createWorkerSlot(slot.id);
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

        // With MultiPV the engine prints one line per move at each depth: `multipv 1` is the best, `multipv 2` the next
        const multipvIdx = parts.indexOf('multipv');
        const lineNumber = multipvIdx !== -1 ? parseInt(parts[multipvIdx + 1], 10) : 1;

        const scoreIdx = parts.indexOf('score');
        let cp: number | null = null;
        let mate: number | null = null;
        if (scoreIdx !== -1) {
          const type = parts[scoreIdx + 1];
          const val = parseInt(parts[scoreIdx + 2], 10);

          if (type === 'cp' && !isNaN(val)) {
            cp = isBlackTurn ? -val : val;
          } else if (type === 'mate' && !isNaN(val)) {
            mate = isBlackTurn ? -val : val;
            cp = (mate > 0 ? 10000 : -10000) - mate * 10;
          }
        }

        const pvIdx = parts.indexOf('pv');
        const moves = pvIdx !== -1 ? parts.slice(pvIdx + 1) : [];

        if (lineNumber === 2) {
          if (cp !== null && moves[0]) currentEval.second = { cp, mate, moveUci: moves[0] };
        } else {
          if (cp !== null) {
            currentEval.cp = cp;
            currentEval.mate = mate;
          }
          if (pvIdx !== -1) {
            currentEval.pv = moves;
            if (moves[0]) {
              currentEval.bestMoveUci = moves[0];
            }
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
              currentEval.bestMoveSan = moveObj.san;
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

    task.interrupt = () => {
      if (completed) return;
      completed = true; // nobody waits for this search any more: its result is dropped
      cleanup();
      this.releaseAfterStop(slot); // the slot stays busy until the interrupted search has ended
    };

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
  public async evaluatePosition(fen: string, depth = 12, signal?: AbortSignal): Promise<EngineEvaluation> {
    if (signal?.aborted) throw abortReason(signal);

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
      this.warmUp();
      return new Promise<EngineEvaluation>((resolve, reject) => {
        const onAbort = () => {
          const index = this.taskQueue.indexOf(task);
          if (index !== -1) this.taskQueue.splice(index, 1);
          else task.interrupt?.();
          reject(abortReason(signal!));
        };
        const task: QueuedTask = {
          fen,
          depth: effectiveDepth,
          resolve: (evaluation) => {
            signal?.removeEventListener('abort', onAbort);
            resolve(evaluation);
          },
          reject: (err) => {
            signal?.removeEventListener('abort', onAbort);
            console.warn('Worker task error, resolving with heuristic:', err);
            resolve(this.evaluateHeuristic(fen));
          },
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        this.taskQueue.push(task);
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

  /** The analysis of the first `count` plies, from positions that are already evaluated (`evalCache`). */
  private buildMoves(
    history: Move[],
    fensBefore: string[],
    fensAfter: string[],
    moveClocks: ReturnType<typeof extractGameClocks>['moveClocks'],
    evalCache: Map<string, EngineEvaluation>,
    count: number
  ): MoveAnalysis[] {
    const movesAnalysis: MoveAnalysis[] = [];
    let inBook = true;
    // Last opening named so far: book moves on an unnamed position keep showing it
    let currentOpening: { eco?: string; name?: string } = {};
    // Win% the previous move (the opponent's) gave away: a mistake it makes is a chance for the next move to miss
    let previousDrop = 0;
    const phases = phasesOfPositions(fensBefore.slice(0, count));
    for (let ply = 0; ply < count; ply++) {
      const move = history[ply];
      const isWhite = move.color === 'w';
      const fenBefore = fensBefore[ply];
      const fenAfter = fensAfter[ply];

      const evalBeforeRes = evalCache.get(fenBefore) || this.evaluateHeuristic(fenBefore);
      const evalAfterRes = evalCache.get(fenAfter) || this.evaluateHeuristic(fenAfter);

      const evalBefore = evalBeforeRes.cp;
      const evalAfter = evalAfterRes.cp;

      const winPctBefore = winPercentOfEvaluation(evalBefore, evalBeforeRes.mate);
      const winPctAfter = winPercentOfEvaluation(evalAfter, evalAfterRes.mate);

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

      // What the position says about the move beyond the Win% it gave away
      const context = bookCheck.isBook
        ? {}
        : moveContext({
            move,
            previous: history[ply - 1],
            fenBefore,
            before: evalBeforeRes,
            after: evalAfterRes,
            winPctBefore,
            winPctDrop,
            previousOpponentDrop: previousDrop,
          });

      // When a move is theoretical, it is ALWAYS designated as 'book' in the notation and badge,
      // even if it also happens to be the engine's #1 move!
      const classification = bookCheck.isBook
        ? 'book'
        : classifyMove(move.san, evalBeforeRes.bestMoveSan, winPctDrop, context);
      previousDrop = winPctDrop; // what the next move (the opponent's) is measured against

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
        phase: phases[ply],
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
    return movesAnalysis;
  }

  /** Moves, statistics and opening of the first `count` plies. */
  private summarize(
    history: Move[],
    fensBefore: string[],
    fensAfter: string[],
    moveClocks: ReturnType<typeof extractGameClocks>['moveClocks'],
    evalCache: Map<string, EngineEvaluation>,
    count: number
  ): GameAnalysisOutput {
    const moves = this.buildMoves(history, fensBefore, fensAfter, moveClocks, evalCache, count);
    return {
      moves,
      statsWhite: computePlayerStats(moves.filter((m) => m.color === 'w')),
      statsBlack: computePlayerStats(moves.filter((m) => m.color === 'b')),
      // Identify the official Lichess opening name & ECO
      detectedOpening: identifyGameOpening(fensAfter.slice(0, count)),
    };
  }

  /**
   * Full Game Analysis
   * Parses moves, runs Stockfish at given depth, classifies moves and aggregates statistics.
   * See `AnalyzeOptions` for cancelling it and for receiving the moves as they are analysed.
   */
  public async analyzeFullGame(
    pgn: string,
    depth = 12,
    onProgress?: (current: number, total: number) => void,
    options: AnalyzeOptions = {}
  ): Promise<GameAnalysisOutput> {
    const { signal, onPartial } = options;
    if (signal?.aborted) throw abortReason(signal);

    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    const totalPlies = history.length;

    // Ensure full theoretical openings dataset (7,800+ lines) is loaded into cache
    await ensureOpeningBookLoaded();
    if (signal?.aborted) throw abortReason(signal);

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
    const evalCache = new Map<string, EngineEvaluation>();

    // Partial results: the plies, in order, whose two positions are evaluated
    let readyPlies = 0;
    let sentPlies = 0;
    let lastSentAt = 0;
    let trailingTimer: ReturnType<typeof setTimeout> | undefined;
    // A position that completes right before the end (or the cancellation) can still run its continuation
    // afterwards: nothing may be reported, or scheduled, from then on.
    let finished = false;
    const sendPartial = () => {
      trailingTimer = undefined;
      if (finished) return;
      while (readyPlies < totalPlies && evalCache.has(fensBefore[readyPlies]) && evalCache.has(fensAfter[readyPlies])) {
        readyPlies++;
      }
      // The complete result is the return value, not a partial one
      if (!onPartial || readyPlies === 0 || readyPlies === sentPlies || readyPlies === totalPlies) return;
      const wait = lastSentAt + PARTIAL_INTERVAL_MS - Date.now();
      if (wait > 0) {
        trailingTimer ??= setTimeout(sendPartial, wait); // not lost if no other position completes soon
        return;
      }
      sentPlies = readyPlies;
      lastSentAt = Date.now();
      onPartial(this.summarize(history, fensBefore, fensAfter, moveClocks, evalCache, readyPlies), totalPlies);
    };

    try {
      // Concurrent evaluation of all unique positions with the parallel worker pool & opening book
      await Promise.all(
        allUniqueFens.map(async (fen) => {
          evalCache.set(fen, await this.evaluatePosition(fen, depth, signal));
          completedPositions++;
          onProgress?.(completedPositions, totalPositions);
          sendPartial();
        })
      );
    } finally {
      finished = true;
      clearTimeout(trailingTimer);
      trailingTimer = undefined;
    }

    return this.summarize(history, fensBefore, fensAfter, moveClocks, evalCache, totalPlies);
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
