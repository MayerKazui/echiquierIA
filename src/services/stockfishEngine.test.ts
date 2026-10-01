import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOpeningsFromDisk } from '../test/openings';
import { ensureOpeningBookLoaded } from './openingBook';
import {
  PARTIAL_INTERVAL_MS,
  StockfishService,
  defaultWorkerCount,
  isAbortError,
  searchTimeLimitMs,
  type GameAnalysisOutput,
} from './stockfishEngine';

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
      /** Duration of a search; a function gets the index of the search (0 for the first one). */
      searchMs: number | ((searchIndex: number) => number);
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
      const searchIndex = this.counter.searches++;
      const move = this.behavior.bestMoves[searchIndex % this.behavior.bestMoves.length];
      const { searchMs } = this.behavior;
      const duration = typeof searchMs === 'function' ? searchMs(searchIndex) : searchMs;
      this.searching = true;
      this.emit(`info depth ${Math.max(1, depth - 2)} score cp 30 pv ${move}`);
      if (!this.behavior.endless) {
        this.pendingSearch = setTimeout(() => this.finish(depth, move), duration);
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
  service.warmUp(); // the tests look at the workers right away; laziness has its own tests
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

describe('lazy start', () => {
  function lazyService() {
    const created: string[] = [];
    const service = new StockfishService({
      workerCount: 2,
      createWorker: (script) => {
        created.push(script);
        return new FakeWorker(script, { searchMs: 100, bestMoves: ['e2a6'] }, { searches: 0 }) as unknown as Worker;
      },
    });
    return { service, created };
  }

  it('creates no worker (and downloads no engine) until it is needed', () => {
    const { created } = lazyService();
    expect(created).toHaveLength(0);
  });

  it('does not start the workers for positions answered without the engine', async () => {
    const { service, created } = lazyService();
    await service.evaluatePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); // start position
    await service.evaluatePosition('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'); // checkmate
    expect(created).toHaveLength(0);
  });

  it('starts them at the first search that needs the engine', () => {
    const { service, created } = lazyService();
    service.evaluatePosition(FEN_A, 10);
    expect(created).toHaveLength(2);
  });

  it('warmUp() starts them ahead of time, once', () => {
    const { service, created } = lazyService();
    service.warmUp();
    service.warmUp();
    expect(created).toHaveLength(2);
    service.evaluatePosition(FEN_A, 10);
    expect(created).toHaveLength(2);
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
  it('returns the engine evaluation from White’s point of view, with an English SAN (translated only for display)', async () => {
    const { service } = setup({ workerCount: 1 });
    const whiteToMove = service.evaluatePosition(FEN_A, 10);
    await vi.advanceTimersByTimeAsync(100);
    const white = await whiteToMove;
    expect(white.cp).toBe(30);
    expect(white.bestMoveUci).toBe('e2a6');
    expect(white.bestMoveSan).toBe('Bxa6');
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

describe('cancelling an evaluation', () => {
  it('rejects at once, without searching, when the signal is already aborted', async () => {
    const { service, workers } = setup({ workerCount: 1 });
    const controller = new AbortController();
    controller.abort();
    const result = await service.evaluatePosition(FEN_A, 10, controller.signal).catch((e) => e);
    expect(isAbortError(result)).toBe(true);
    expect(searches(workers)).toBe(0);
  });

  it('drops a queued position: it never reaches a worker, the others carry on', async () => {
    const { service, workers } = setup({ workerCount: 1 });
    const controller = new AbortController();
    const running = service.evaluatePosition(FEN_A, 10);
    const queued = service.evaluatePosition(FEN_B, 10, controller.signal).catch((e) => e);
    controller.abort();
    expect(isAbortError(await queued)).toBe(true);

    await vi.advanceTimersByTimeAsync(500);
    await expect(running).resolves.toMatchObject({ bestMoveUci: 'e2a6' });
    expect(searches(workers)).toBe(1);
  });

  it('stops the search that is running, and the next position is not given its stale bestmove', async () => {
    const { service, workers } = setup({ workerCount: 1 }, { bestMoves: ['a2a3', 'h2h3'] });
    const controller = new AbortController();
    const cancelled = service.evaluatePosition(FEN_A, 10, controller.signal).catch((e) => e);
    const next = service.evaluatePosition(FEN_B, 10);
    await vi.advanceTimersByTimeAsync(10); // the first search is under way
    controller.abort();

    expect(isAbortError(await cancelled)).toBe(true);
    expect(workers[0].sent).toContain('stop');
    expect(searches(workers)).toBe(1); // the worker is still finishing the interrupted search

    await vi.advanceTimersByTimeAsync(500);
    // The second search's own answer, not the 'a2a3' of the interrupted one
    await expect(next).resolves.toMatchObject({ bestMoveUci: 'h2h3' });
    expect(searches(workers)).toBe(2);
  });

  it('does not cache the result of a cancelled search', async () => {
    const { service, workers } = setup({ workerCount: 1 });
    const controller = new AbortController();
    const cancelled = service.evaluatePosition(FEN_A, 10, controller.signal).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await cancelled;
    await vi.advanceTimersByTimeAsync(500);

    const again = service.evaluatePosition(FEN_A, 10);
    await vi.advanceTimersByTimeAsync(500);
    await again;
    expect(searches(workers)).toBe(2);
  });

  it('ignores an abort that comes after the answer', async () => {
    const { service, workers } = setup({ workerCount: 1 });
    const controller = new AbortController();
    const evaluation = service.evaluatePosition(FEN_A, 10, controller.signal);
    await vi.advanceTimersByTimeAsync(500);
    await expect(evaluation).resolves.toMatchObject({ bestMoveUci: 'e2a6' });

    controller.abort();
    expect(workers[0].sent).not.toContain('stop');
  });
});

describe('analyzeFullGame', () => {
  // Unusual moves: most positions are outside the opening book, so they go to the workers
  const PGN = '1. a3 a6 2. b3 b6 3. c3 c6 4. d3 d6 5. e3 e6 6. f3 f6 *';
  const TOTAL_PLIES = 12;

  beforeAll(async () => {
    await ensureOpeningBookLoaded(loadOpeningsFromDisk);
  });

  /** Lets the fake workers answer: they take 100 ms per position. */
  const run = (ms: number) => vi.advanceTimersByTimeAsync(ms);

  it('returns every ply, reports its progress and keeps working without options', async () => {
    const { service } = setup({ workerCount: 3 });
    const progress: Array<[number, number]> = [];
    const analysis = service.analyzeFullGame(PGN, 10, (done, total) => progress.push([done, total]));
    await run(5000);
    const result = await analysis;

    expect(result.moves).toHaveLength(TOTAL_PLIES);
    expect(result.moves.map((m) => m.ply)).toEqual([...Array(TOTAL_PLIES).keys()]);
    expect(progress.at(-1)![0]).toBe(progress.at(-1)![1]);
  });

  it("reads the players' ratings from the PGN headers: the same evaluation is worth more to a stronger player", async () => {
    const analyseWithRating = async (elo: string) => {
      const { service } = setup({ workerCount: 3 });
      const analysis = service.analyzeFullGame(`[WhiteElo "${elo}"]\n[BlackElo "${elo}"]\n\n${PGN}`, 10);
      await run(5000);
      return analysis;
    };
    const strong = await analyseWithRating('2800');
    const weak = await analyseWithRating('100');
    // Every evaluation of the fake engine is +30 cp for the side to move: White's first position
    expect(strong.moves[0].winPercentBefore).toBeGreaterThan(weak.moves[0].winPercentBefore);
    // ...and so is the slip it is then measured against: the statistics use the ratings too
    expect(strong.statsWhite.accuracy).toBeLessThan(weak.statsWhite.accuracy);
    expect(strong.statsBlack.accuracy).toBeLessThan(weak.statsBlack.accuracy);
  });

  it('analyses a game without ratings (default curve)', async () => {
    const { service } = setup({ workerCount: 3 });
    const analysis = service.analyzeFullGame(PGN, 10);
    await run(5000);
    const { moves } = await analysis;
    expect(moves[0].winPercentBefore).toBeGreaterThan(50);
  });

  it('sends the plies analysed so far, in order, and they match the final result', async () => {
    const { service } = setup({ workerCount: 2 });
    const partials: Array<{ output: GameAnalysisOutput; total: number }> = [];
    const analysis = service.analyzeFullGame(PGN, 10, undefined, {
      onPartial: (output, total) => partials.push({ output, total }),
    });
    await run(10_000);
    const final = await analysis;

    expect(partials.length).toBeGreaterThan(0);
    let previous = 0;
    for (const { output, total } of partials) {
      expect(total).toBe(TOTAL_PLIES);
      expect(output.moves.length).toBeGreaterThan(previous); // grows, never repeats
      expect(output.moves.length).toBeLessThan(TOTAL_PLIES); // the complete game is the return value
      expect(output.moves.map((m) => m.ply)).toEqual([...Array(output.moves.length).keys()]);
      expect(output.moves).toEqual(final.moves.slice(0, output.moves.length));
      expect(output.statsWhite.accuracy).toBeGreaterThan(0); // statistics cover the plies sent
      previous = output.moves.length;
    }
  });

  it('does not flood its caller: at most one partial result per interval', async () => {
    const { service } = setup({ workerCount: 3 }, { searchMs: 5 });
    const times: number[] = [];
    const analysis = service.analyzeFullGame(PGN, 10, undefined, { onPartial: () => times.push(Date.now()) });
    await run(5000);
    await analysis;

    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(PARTIAL_INTERVAL_MS);
    }
  });

  it('delivers the latest partial result even when nothing else completes for a while', async () => {
    // The first positions are answered at once, the last one takes 5 s: the plies that are ready
    // must be sent after the throttling delay, not only when the last position completes.
    const { service } = setup({ workerCount: 1 }, { searchMs: 5 });
    const sizes: number[] = [];
    const analysis = service.analyzeFullGame(PGN, 10, undefined, { onPartial: (o) => sizes.push(o.moves.length) });
    await run(PARTIAL_INTERVAL_MS * 3);
    await run(5000);
    await analysis;
    expect(sizes.length).toBeGreaterThan(0);
  });

  it('never sends the complete game as a partial result, even when every position takes a while', async () => {
    const { service } = setup({ workerCount: 1 }, { searchMs: PARTIAL_INTERVAL_MS + 100 });
    const sizes: number[] = [];
    const analysis = service.analyzeFullGame(PGN, 10, undefined, { onPartial: (o) => sizes.push(o.moves.length) });
    await run(60_000);
    const final = await analysis;

    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThan(final.moves.length);
  });

  it('sends the plies that became ready after the interval, without waiting for the next position', async () => {
    // Searches take 100 ms, 50 ms, then very long: the second result arrives while the first partial result
    // is still inside its throttling interval, and nothing completes for a long time afterwards
    const { service } = setup({ workerCount: 1 }, { searchMs: (i) => (i === 0 ? 100 : i === 1 ? 50 : 20_000) });
    const controller = new AbortController();
    const sizes: number[] = [];
    const analysis = service
      .analyzeFullGame(PGN, 10, undefined, { signal: controller.signal, onPartial: (o) => sizes.push(o.moves.length) })
      .catch(() => undefined);
    await run(PARTIAL_INTERVAL_MS * 3);

    expect(sizes.length).toBeGreaterThanOrEqual(2);
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
    controller.abort();
    await analysis;
  });

  it('rejects with an abort error when cancelled, stops the searches and stops reporting', async () => {
    const { service, workers } = setup({ workerCount: 2 });
    const controller = new AbortController();
    const onPartial = vi.fn();
    const analysis = service.analyzeFullGame(PGN, 10, undefined, { signal: controller.signal, onPartial });
    const outcome = analysis.catch((e) => e);

    await run(250); // some positions done, others running or waiting
    controller.abort();
    expect(isAbortError(await outcome)).toBe(true);

    const partialsAtAbort = onPartial.mock.calls.length;
    const searchesAtAbort = searches(workers);
    await run(10_000);
    expect(onPartial.mock.calls.length).toBe(partialsAtAbort);
    expect(searches(workers)).toBe(searchesAtAbort); // the queue was emptied: nothing new starts
    expect(workers.some((w) => w.sent.includes('stop'))).toBe(true);
  });

  it('rejects without searching when the signal is already aborted', async () => {
    const { service, workers } = setup({ workerCount: 2 });
    const controller = new AbortController();
    controller.abort();
    const outcome = await service.analyzeFullGame(PGN, 10, undefined, { signal: controller.signal }).catch((e) => e);
    expect(isAbortError(outcome)).toBe(true);
    expect(searches(workers)).toBe(0);
  });
});
