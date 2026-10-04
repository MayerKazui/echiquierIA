import { ENGINE_SCRIPT } from './stockfishEngine';
import { parseInfoLine, type AnalysisLine } from '../utils/positionAnalysis';

/** What the engine thinks of a position so far; it is sent again, deeper, as the search goes on. */
export interface LiveAnalysis {
  fen: string;
  /** The depth of the best line. */
  depth: number;
  /** Positions searched per second, when the engine says. */
  nps: number | null;
  /** The best lines, best first (fewer than asked when the position has fewer legal moves). */
  lines: AnalysisLine[];
}

export interface LiveRequest {
  fen: string;
  /** How many lines to search (the engine's `MultiPV`). */
  lines: number;
  /** Called with the analysis so far, at most every `UPDATE_INTERVAL_MS`. */
  onUpdate: (analysis: LiveAnalysis) => void;
  /** Called once when the search has ended by itself (the depth limit, a forced mate found). */
  onDone?: (analysis: LiveAnalysis) => void;
  /** Called when the engine cannot run; the next request starts a new worker. */
  onError?: (error: Error) => void;
}

export interface AnalysisEngineOptions {
  /** Creates the worker running `script` (default: `new Worker(script)`). */
  createWorker?: (script: string) => Worker;
}

/** Time between two reports: the engine prints hundreds of lines a second at the start of a search. */
export const UPDATE_INTERVAL_MS = 100;
/** How long a stopped search has to print its `bestmove` before the worker is replaced. */
const STOP_GRACE_MS = 1500;
/** The search stops by itself at this depth (it takes minutes in the middle of the game, and seconds in a simple ending). */
export const MAX_DEPTH = 40;
export const MAX_LINES = 5;

export class AnalysisUnavailableError extends Error {
  constructor(message = 'The engine is not available') {
    super(message);
    this.name = 'AnalysisUnavailableError';
  }
}

/**
 * The engine that analyses a position while the player looks at it. It has a worker of its own, apart from the
 * analysis of games and the engine the player faces: it searches until it is asked for another position or stopped,
 * and shows its best lines as it finds them.
 *
 * One search at a time. A new request does not start before the search it replaces has printed its `bestmove`
 * (UCI answers a `stop` that way): its late lines would otherwise be taken for the new position's.
 */
export class AnalysisEngine {
  private worker: Worker | null = null;
  /** The search that should be running (null: none). */
  private wanted: LiveRequest | null = null;
  /** The search sent to the engine last. */
  private running: LiveRequest | null = null;
  /** A `go` was sent and its `bestmove` has not come yet. */
  private searching = false;
  private stopping = false;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private lastFlush = 0;
  private lines: Array<AnalysisLine | undefined> = [];
  private nps: number | null = null;
  private whiteToMove = true;
  private dirty = false;

  constructor(private readonly options: AnalysisEngineOptions = {}) {}

  /** Searches the position of the request, and stops what was searched before. */
  public analyze(request: LiveRequest): void {
    this.wanted = request;
    this.pump();
  }

  /** Stops the search (the worker stays for the next one). */
  public stop(): void {
    this.wanted = null;
    this.pump();
  }

  /** Stops the search and releases the worker. */
  public dispose(): void {
    this.wanted = null;
    this.running = null;
    this.dropWorker();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (!this.options.createWorker && typeof Worker === 'undefined') throw new AnalysisUnavailableError();
    const worker = this.options.createWorker ? this.options.createWorker(ENGINE_SCRIPT) : new Worker(ENGINE_SCRIPT);
    worker.onmessage = (event: MessageEvent) => this.onMessage(event);
    worker.onerror = (event: ErrorEvent | Event) => {
      try {
        event.preventDefault();
      } catch {
        // Not cancelable
      }
      this.fail(new AnalysisUnavailableError('The engine stopped'));
    };
    worker.postMessage('uci');
    worker.postMessage('setoption name Threads value 1');
    worker.postMessage('setoption name Hash value 32');
    this.worker = worker;
    return worker;
  }

  private dropWorker() {
    clearTimeout(this.stopTimer);
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    try {
      this.worker?.terminate();
    } catch {
      // Already terminated
    }
    this.worker = null;
    this.searching = false;
    this.stopping = false;
  }

  /** The engine is gone: whoever waits is told, and the next request starts afresh. */
  private fail(error: Error) {
    const request = this.wanted;
    this.wanted = null;
    this.running = null;
    this.dropWorker();
    request?.onError?.(error);
  }

  /** Brings the engine to the search that is wanted: stops the one that is not, then starts it. */
  private pump() {
    if (this.searching) {
      if (this.running !== this.wanted && !this.stopping) this.sendStop();
      return; // the `bestmove` of the search in progress calls this again
    }
    const request = this.wanted;
    if (!request || request === this.running) return;
    this.start(request);
  }

  private sendStop() {
    const worker = this.worker;
    if (!worker) return;
    this.stopping = true;
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    // A search that stays silent after `stop` is dead: a new worker takes over
    this.stopTimer = setTimeout(() => {
      const next = this.wanted;
      this.running = null;
      this.dropWorker();
      if (next) this.pump();
    }, STOP_GRACE_MS);
    try {
      worker.postMessage('stop');
    } catch {
      this.fail(new AnalysisUnavailableError());
    }
  }

  private start(request: LiveRequest) {
    let worker: Worker;
    try {
      worker = this.ensureWorker();
    } catch (error) {
      this.wanted = null;
      request.onError?.(error instanceof Error ? error : new AnalysisUnavailableError());
      return;
    }
    this.running = request;
    this.lines = [];
    this.nps = null;
    this.dirty = false;
    this.lastFlush = 0;
    this.whiteToMove = request.fen.split(' ')[1] !== 'b';
    const count = Math.min(MAX_LINES, Math.max(1, Math.floor(request.lines)));
    try {
      worker.postMessage(`setoption name MultiPV value ${count}`);
      worker.postMessage(`position fen ${request.fen}`);
      worker.postMessage(`go depth ${MAX_DEPTH}`);
      this.searching = true;
    } catch {
      this.fail(new AnalysisUnavailableError());
    }
  }

  private snapshot(request: LiveRequest): LiveAnalysis {
    const lines = this.lines.filter((line): line is AnalysisLine => line !== undefined);
    return { fen: request.fen, depth: lines[0]?.depth ?? 0, nps: this.nps, lines };
  }

  private flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    const request = this.running;
    if (!request || !this.dirty || this.stopping || request !== this.wanted) return;
    this.dirty = false;
    this.lastFlush = Date.now();
    request.onUpdate(this.snapshot(request));
  }

  private onMessage(event: MessageEvent) {
    const line = typeof event.data === 'string' ? event.data : '';

    if (line.startsWith('bestmove')) {
      clearTimeout(this.stopTimer);
      const finished = this.running;
      const wasStopping = this.stopping;
      this.searching = false;
      this.stopping = false;
      if (finished && !wasStopping && finished === this.wanted) {
        // The search ended by itself: what it found is final
        this.dirty = true;
        this.flush();
        finished.onDone?.(this.snapshot(finished));
      } else {
        this.pump();
      }
      return;
    }

    // The lines that come after a `stop` belong to the search that is ending, not to the next one
    if (!this.searching || this.stopping || !this.running || this.running !== this.wanted) return;
    const info = parseInfoLine(line, this.whiteToMove);
    if (!info || info.rank > MAX_LINES) return;
    this.lines[info.rank - 1] = { rank: info.rank, depth: info.depth, cp: info.cp, mate: info.mate, pv: info.pv };
    if (info.nps !== undefined) this.nps = info.nps;
    this.dirty = true;

    const wait = this.lastFlush + UPDATE_INTERVAL_MS - Date.now();
    if (wait <= 0) this.flush();
    else this.flushTimer ??= setTimeout(() => this.flush(), wait);
  }
}

export const analysisEngine = new AnalysisEngine();
