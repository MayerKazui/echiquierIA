import { ENGINE_SCRIPT } from './stockfishEngine';
import { levelCommands, type PlayLevel } from '../utils/playLevels';

export interface ChooseMoveRequest {
  /** The position the game started from, and the moves played since (UCI): the engine sees the repetitions. */
  startFen: string;
  moves: readonly string[];
  level: PlayLevel;
  /** Thinking time (ms) when it is shorter than the level's own: a clock leaves the engine less time. */
  moveTimeMs?: number;
  /** Aborting it stops the search; the promise rejects with an AbortError. */
  signal?: AbortSignal;
}

export interface EnginePlayerOptions {
  /** Creates the worker running `script` (default: `new Worker(script)`). */
  createWorker?: (script: string) => Worker;
}

/** Longer than any thinking time of a level: a search that has not answered by then is dead. */
const ANSWER_GRACE_MS = 8000;

export class EngineUnavailableError extends Error {
  constructor(message = 'The engine is not available') {
    super(message);
    this.name = 'EngineUnavailableError';
  }
}

function abortError(): Error {
  const err = new Error('The search was cancelled');
  err.name = 'AbortError';
  return err;
}

/**
 * The engine the player faces. It has a worker of its own, apart from the analysis pool: a game is one search at a
 * time, and the analysis of the player's games must not wait for it (nor it for them). The worker starts with the
 * first move asked for.
 */
export class EnginePlayer {
  private worker: Worker | null = null;
  /** Searches that were stopped and have not printed their `bestmove` yet: those answers are for nobody. */
  private stale = 0;
  private current: { resolve: (uci: string) => void; reject: (err: unknown) => void } | null = null;

  constructor(private readonly options: EnginePlayerOptions = {}) {}

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (!this.options.createWorker && typeof Worker === 'undefined') throw new EngineUnavailableError();
    const worker = this.options.createWorker ? this.options.createWorker(ENGINE_SCRIPT) : new Worker(ENGINE_SCRIPT);
    worker.onmessage = (event: MessageEvent) => this.onMessage(event);
    worker.onerror = (event: ErrorEvent | Event) => {
      try {
        event.preventDefault();
      } catch {
        // Not cancelable
      }
      this.reset(new EngineUnavailableError('The engine stopped'));
    };
    worker.postMessage('uci');
    worker.postMessage('setoption name Threads value 1');
    worker.postMessage('setoption name Hash value 16');
    this.worker = worker;
    return worker;
  }

  private onMessage(event: MessageEvent) {
    const line = typeof event.data === 'string' ? event.data : '';
    if (!line.startsWith('bestmove')) return;
    if (this.stale > 0) {
      this.stale -= 1;
      return;
    }
    const pending = this.current;
    this.current = null;
    if (!pending) return;
    const move = line.split(' ')[1];
    if (!move || move === '(none)') pending.reject(new Error('The engine has no move'));
    else pending.resolve(move);
  }

  /** Drops the worker (it is started again by the next request) and fails the search in progress. */
  private reset(reason: unknown) {
    const pending = this.current;
    this.current = null;
    this.stale = 0;
    try {
      this.worker?.terminate();
    } catch {
      // Already terminated
    }
    this.worker = null;
    pending?.reject(reason);
  }

  /** The engine's move (UCI) in the position reached by `moves` from `startFen`, at the level asked for. */
  public chooseMove({ startFen, moves, level, moveTimeMs, signal }: ChooseMoveRequest): Promise<string> {
    if (signal?.aborted) return Promise.reject(abortError());
    const thinkMs = Math.min(level.moveTimeMs, moveTimeMs ?? level.moveTimeMs);
    let worker: Worker;
    try {
      worker = this.ensureWorker();
    } catch (err) {
      return Promise.reject(err);
    }

    // One search at a time: a new request replaces the one in progress
    this.cancelCurrent(worker);

    return new Promise<string>((resolve, reject) => {
      const finish = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      const entry = {
        resolve: (uci: string) => {
          finish();
          resolve(uci);
        },
        reject: (err: unknown) => {
          finish();
          reject(err);
        },
      };
      const onAbort = () => {
        if (this.current !== entry) return;
        this.cancelCurrent(worker);
      };
      this.current = entry;
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => {
        if (this.current === entry) this.reset(new EngineUnavailableError('The engine did not answer'));
      }, thinkMs + ANSWER_GRACE_MS);

      try {
        for (const command of levelCommands(level)) worker.postMessage(command);
        worker.postMessage('isready');
        worker.postMessage(`position fen ${startFen}${moves.length > 0 ? ` moves ${moves.join(' ')}` : ''}`);
        worker.postMessage(`go movetime ${thinkMs}`);
      } catch {
        this.reset(new EngineUnavailableError());
      }
    });
  }

  private cancelCurrent(worker: Worker) {
    const pending = this.current;
    if (!pending) return;
    this.current = null;
    this.stale += 1;
    try {
      worker.postMessage('stop');
    } catch {
      // The worker is gone: the next request starts another
      this.worker = null;
      this.stale = 0;
    }
    pending.reject(abortError());
  }

  /** Stops what is running and releases the worker. */
  public dispose() {
    this.reset(abortError());
  }
}

export const enginePlayer = new EnginePlayer();
