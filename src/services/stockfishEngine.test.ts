import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockfishService, defaultWorkerCount, searchTimeLimitMs } from './stockfishEngine';

// Positions outside of the opening book and not game over
const FEN_A = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const FEN_B = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
const FEN_C = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
const FEN_BLACK_TO_MOVE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R b KQkq - 0 1';

type Listener = (event: unknown) => void;

/** Minimal UCI worker: `go depth N` answers with an info line then a bestmove after `searchMs`. */
class FakeWorker {
  sent: string[] = [];
  terminated = false;
  onerror: ((event: Event) => void) | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private pendingSearch: ReturnType<typeof setTimeout> | null = null;
  private searching = false;

  constructor(
    readonly script: string,
    private readonly behavior: {
      searchMs: number;
      /** Moves reported by successive searches (cycled). */
      bestMoves: string[];
      /** When true the worker never finishes a search on its own and only answers `stop`. */
      endless?: boolean;
      /** When false the worker ignores `stop` (a stuck engine). */
      answersStop?: boolean;
      /** Delay between `stop` and the bestmove line. */
      stopMs?: number;
    },
    private readonly counter: { searches: number }
  ) {}

  postMessage(command: string) {
    this.sent.push(command);
    if (command.startsWith('go depth')) {
      const depth = Number(command.split(' ')[2]);
      const move = this.behavior.bestMoves[this.counter.searches++ % this.behavior.bestMoves.length];
      this.searching = true;
      this.emit(`info depth ${Math.max(1, depth - 2)} score cp 30 pv ${move}`);
      if (!this.behavior.endless) {
        this.pendingSearch = setTimeout(() => this.finish(depth, move), this.behavior.searchMs);
      }
      this.currentMove = move;
    } else if (command === 'stop' && this.searching && this.behavior.answersStop !== false) {
      if (this.pendingSearch) clearTimeout(this.pendingSearch);
      const move = this.currentMove;
      this.pendingSearch = setTimeout(() => this.finish(0, move), this.behavior.stopMs ?? 50);
    }
  }

  private currentMove = '';

  private finish(depth: number, move: string) {
    this.searching = false;
    if (depth) this.emit(`info depth ${depth} score cp 30 pv ${move}`);
    this.emit(`bestmove ${move}`);
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(line: string) {
    for (const listener of [...(this.listeners.get('message') ?? [])]) listener({ data: line });
  }

  fail() {
    const event = new Event('error');
    this.onerror?.(event);
    for (const listener of [...(this.listeners.get('error') ?? [])]) listener(event);
  }

  terminate() {
    this.terminated = true;
  }

  get searchesStarted() {
    return this.sent.filter((c) => c.startsWith('go depth')).length;
  }
}

function setup(
  options: { workerCount?: number; cacheCapacity?: number },
  behavior: Partial<ConstructorParameters<typeof FakeWorker>[1]> = {}
) {
  const workers: FakeWorker[] = [];
  const counter = { searches: 0 };
  const service = new StockfishService({
    ...options,
    createWorker: (script) => {
      const worker = new FakeWorker(script, { searchMs: 100, bestMoves: ['e2a6'], ...behavior }, counter);
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });
  return { service, workers };
}

const searches = (workers: FakeWorker[]) => workers.reduce((sum, w) => sum + w.searchesStarted, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('defaultWorkerCount', () => {
  it.each<[number | undefined, number]>([
    [undefined, 2],
    [0, 2],
    [NaN, 2],
    [1, 1],
    [2, 1],
    [4, 3],
    [8, 6],
    [16, 6],
    [128, 6],
  ])('%s logical cores -> %s workers', (cores, expected) => {
    expect(defaultWorkerCount(cores)).toBe(expected);
  });
});

describe('searchTimeLimitMs', () => {
  it('keeps 3.5 s up to depth 12, then grows and is capped', () => {
    expect(searchTimeLimitMs(8)).toBe(3500);
    expect(searchTimeLimitMs(12)).toBe(3500);
    expect(searchTimeLimitMs(14)).toBeGreaterThan(searchTimeLimitMs(13));
    expect(searchTimeLimitMs(13)).toBeGreaterThan(3500);
    expect(searchTimeLimitMs(40)).toBe(30_000);
  });
});

describe('worker pool', () => {
  it('starts the requested number of workers and configures each engine', () => {
    const { workers } = setup({ workerCount: 3 });
    expect(workers).toHaveLength(3);
    for (const worker of workers) {
      expect(worker.script).toBe('/stockfish-19.js#stockfish-19.wasm'); // the only engine
      expect(worker.sent).toEqual(['uci', 'setoption name Threads value 1', 'setoption name Hash value 16', 'isready']);
    }
  });

  it('runs as many searches in parallel as there are workers, then feeds the queue', async () => {
    const { service, workers } = setup({ workerCount: 2 });
    const results = [
      service.evaluatePosition(FEN_A, 10),
      service.evaluatePosition(FEN_B, 10),
      service.evaluatePosition(FEN_C, 10),
    ];

    expect(workers.map((w) => w.searchesStarted)).toEqual([1, 1]); // the third position waits
    await vi.advanceTimersByTimeAsync(100);
    expect(searches(workers)).toBe(3);
    await vi.advanceTimersByTimeAsync(100);
    const [a, b, c] = await Promise.all(results);
    expect([a.bestMoveUci, b.bestMoveUci, c.bestMoveUci]).toEqual(['e2a6', 'e2a6', 'e2a6']);
  });
});

describe('evaluatePosition', () => {
  it('returns the engine evaluation from White’s point of view, with a French SAN', async () => {
    const { service } = setup({ workerCount: 1 });
    const whiteToMove = service.evaluatePosition(FEN_A, 10);
    await vi.advanceTimersByTimeAsync(100);
    const white = await whiteToMove;
    expect(white.cp).toBe(30);
    expect(white.bestMoveUci).toBe('e2a6');
    expect(white.bestMoveSan).toBe('Fxa6');
    expect(white.pv).toEqual(['e2a6']);

    // The engine scores from the side to move: Black to move flips the sign
    const blackToMove = service.evaluatePosition(FEN_BLACK_TO_MOVE, 10);
    await vi.advanceTimersByTimeAsync(100);
    expect((await blackToMove).cp).toBe(-30);
  });

  it('answers the start position and opening book positions without the engine', async () => {
    const { service, workers } = setup({ workerCount: 1 });
    const start = await service.evaluatePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(start.bestMoveSan).toBe('e4');
    const book = await service.evaluatePosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(book.bestMoveSan).toBeTruthy();
    expect(searches(workers)).toBe(0);
  });

  it('resolves checkmate and stalemate positions without the engine', async () => {
    const { service, workers } = setup({ workerCount: 1 });
    const mate = await service.evaluatePosition('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    expect(Math.abs(mate.cp)).toBeGreaterThan(1000);
    expect(searches(workers)).toBe(0);
  });

  describe('cache', () => {
    it('does not search the same position twice', async () => {
      const { service, workers } = setup({ workerCount: 1 });
      const first = service.evaluatePosition(FEN_A, 10);
      await vi.advanceTimersByTimeAsync(100);
      await first;

      await expect(service.evaluatePosition(FEN_A, 10)).resolves.toMatchObject({ bestMoveUci: 'e2a6' });
      await expect(service.evaluatePosition(FEN_A, 8)).resolves.toMatchObject({ bestMoveUci: 'e2a6' });
      expect(searches(workers)).toBe(1);
    });

    it('searches again when a deeper analysis is requested', async () => {
      const { service, workers } = setup({ workerCount: 1 });
      const shallow = service.evaluatePosition(FEN_A, 8);
      await vi.advanceTimersByTimeAsync(100);
      await shallow;

      const deep = service.evaluatePosition(FEN_A, 14);
      await vi.advanceTimersByTimeAsync(100);
      await deep;
      expect(searches(workers)).toBe(2);
      expect(workers[0].sent).toContain('go depth 14');

      // The deeper result now answers shallower requests
      await service.evaluatePosition(FEN_A, 10);
      expect(searches(workers)).toBe(2);
    });

    it('stays bounded: the least recently used position is evicted', async () => {
      const { service, workers } = setup({ workerCount: 1, cacheCapacity: 2 });
      for (const fen of [FEN_A, FEN_B, FEN_C]) {
        const pending = service.evaluatePosition(fen, 10);
        await vi.advanceTimersByTimeAsync(100);
        await pending;
      }
      expect(searches(workers)).toBe(3);

      await service.evaluatePosition(FEN_C, 10); // still cached
      await service.evaluatePosition(FEN_B, 10); // still cached
      expect(searches(workers)).toBe(3);

      const evicted = service.evaluatePosition(FEN_A, 10); // was evicted
      await vi.advanceTimersByTimeAsync(100);
      await evicted;
      expect(searches(workers)).toBe(4);
    });
  });

  describe('timeout', () => {
    it('returns the best line found so far when the search does not end in time', async () => {
      const { service, workers } = setup({ workerCount: 1 }, { endless: true });
      const pending = service.evaluatePosition(FEN_A, 12);
      await vi.advanceTimersByTimeAsync(searchTimeLimitMs(12) - 1);
      expect(workers[0].sent).not.toContain('stop');

      await vi.advanceTimersByTimeAsync(1);
      const result = await pending;
      expect(result.bestMoveUci).toBe('e2a6');
      expect(result.cp).toBe(30);
      expect(workers[0].sent).toContain('stop');
    });

    it('waits longer for a deeper search before giving up', async () => {
      const { service, workers } = setup({ workerCount: 1 }, { endless: true });
      service.evaluatePosition(FEN_A, 16);
      await vi.advanceTimersByTimeAsync(searchTimeLimitMs(12) + 1000);
      expect(workers[0].sent).not.toContain('stop');
      await vi.advanceTimersByTimeAsync(searchTimeLimitMs(16));
      expect(workers[0].sent).toContain('stop');
    });

    it('does not let the interrupted search complete the next task', async () => {
      const { service, workers } = setup(
        { workerCount: 1 },
        { endless: true, bestMoves: ['e2a6', 'b4b5'], stopMs: 200 }
      );
      const first = service.evaluatePosition(FEN_A, 12);
      const second = service.evaluatePosition(FEN_B, 12);

      await vi.advanceTimersByTimeAsync(searchTimeLimitMs(12));
      expect((await first).bestMoveUci).toBe('e2a6');

      // `stop` was sent but the worker has not printed its bestmove yet: the second search must wait
      expect(workers[0].sent.filter((c) => c.startsWith('position fen'))).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(200); // the stale bestmove arrives, the worker is released
      expect(workers[0].sent.filter((c) => c.startsWith('position fen'))).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(searchTimeLimitMs(12));
      const result = await second;
      expect(result.bestMoveUci).toBe('b4b5'); // its own search, not the stale 'e2a6'
    });

    it('restarts a worker that does not answer `stop`', async () => {
      const { service, workers } = setup(
        { workerCount: 1 },
        { endless: true, answersStop: false, bestMoves: ['e2a6', 'b4b5'] }
      );
      const first = service.evaluatePosition(FEN_A, 12);
      const second = service.evaluatePosition(FEN_B, 12);

      await vi.advanceTimersByTimeAsync(searchTimeLimitMs(12));
      await first;
      expect(workers).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1500);
      expect(workers).toHaveLength(2);
      expect(workers[0].terminated).toBe(true);
      expect(workers[1].sent).toContain(`position fen ${FEN_B}`);

      await vi.advanceTimersByTimeAsync(searchTimeLimitMs(12));
      expect((await second).bestMoveUci).toBe('b4b5');
    });

    it('caches an interrupted result only for the depth it reached', async () => {
      // Depth 14 requested: the fake engine reports depth 12 before being stopped
      const { service, workers } = setup({ workerCount: 1 }, { endless: true });
      const first = service.evaluatePosition(FEN_A, 14);
      await vi.advanceTimersByTimeAsync(searchTimeLimitMs(14));
      await first;
      await vi.advanceTimersByTimeAsync(50); // stopped worker prints its bestmove

      await service.evaluatePosition(FEN_A, 12); // served from the cache
      expect(searches(workers)).toBe(1);

      const again = service.evaluatePosition(FEN_A, 14); // more than what was reached: search again
      await vi.advanceTimersByTimeAsync(searchTimeLimitMs(14));
      await again;
      expect(searches(workers)).toBe(2);
    });
  });

  describe('failures', () => {
    it('falls back to the heuristic, without caching it, when the worker errors', async () => {
      const { service, workers } = setup({ workerCount: 1 }, { searchMs: 500 });
      const pending = service.evaluatePosition(FEN_A, 10);
      workers[0].fail();
      const result = await pending;
      expect(Number.isFinite(result.cp)).toBe(true);
      expect(console.warn).toHaveBeenCalled();
    });

    it('takes a failing worker out of the pool and keeps searching on the others', async () => {
      const { service, workers } = setup({ workerCount: 2 });
      workers[0].fail();
      expect(workers[0].terminated).toBe(true);
      expect(service.activeWorkerCount).toBe(1);

      const pending = service.evaluatePosition(FEN_A, 10);
      await vi.advanceTimersByTimeAsync(100);
      await expect(pending).resolves.toMatchObject({ bestMoveUci: 'e2a6' });
      expect(workers[0].searchesStarted).toBe(0);
      expect(workers[1].searchesStarted).toBe(1);
    });

    it('does not start any other engine when the only one fails', () => {
      const { workers } = setup({ workerCount: 1 });
      workers[0].fail();
      expect(workers).toHaveLength(1); // no replacement engine is loaded
    });

    it('answers every search with the heuristic once all workers failed', async () => {
      const { service, workers } = setup({ workerCount: 2 });
      workers.forEach((worker) => worker.fail());
      expect(service.activeWorkerCount).toBe(0);
      const result = await service.evaluatePosition(FEN_A, 10);
      expect(Number.isFinite(result.cp)).toBe(true);
      expect(searches(workers)).toBe(0);
    });

    it('answers a search already waiting in the queue when the last worker fails', async () => {
      const { service, workers } = setup({ workerCount: 1 }, { searchMs: 10_000 });
      service.evaluatePosition(FEN_A, 10);
      const queued = service.evaluatePosition(FEN_B, 10);
      workers[0].fail();
      expect(Number.isFinite((await queued).cp)).toBe(true);
    });

    it('uses the heuristic, without any worker, when WebAssembly is unavailable', async () => {
      vi.stubGlobal('WebAssembly', undefined);
      try {
        const { service, workers } = setup({ workerCount: 2 });
        expect(workers).toHaveLength(0);
        const result = await service.evaluatePosition(FEN_A, 10);
        expect(Number.isFinite(result.cp)).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  it('destroy() terminates the workers and answers the queued searches', async () => {
    const { service, workers } = setup({ workerCount: 1 }, { searchMs: 10_000 });
    service.evaluatePosition(FEN_A, 10);
    const queued = service.evaluatePosition(FEN_B, 10);
    service.destroy();
    expect(workers[0].terminated).toBe(true);
    expect(Number.isFinite((await queued).cp)).toBe(true);
  });
});
