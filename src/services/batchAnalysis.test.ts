import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult } from '../types/chess';
import {
  MAX_BATCH_JOBS,
  clearSnapshot,
  createSnapshot,
  jobsFromGames,
  loadSnapshot,
  pendingJobs,
  runBatch,
  saveSnapshot,
  type BatchDeps,
  type BatchJob,
  type BatchProgress,
  type BatchSnapshot,
} from './batchAnalysis';
import type { GameAnalysisOutput } from './stockfishEngine';

const pgnOf = (white: string, black: string) => `[White "${white}"]\n[Black "${black}"]\n\n1. e4 e5 *`;
const job = (id: string, white = 'Alice', black = 'Bob'): BatchJob => ({
  id,
  pgn: pgnOf(white, black),
  label: `contre ${black} (${id})`,
});
const OUTPUT = { moves: [], statsWhite: {}, statsBlack: {}, detectedOpening: null } as unknown as GameAnalysisOutput;

/** In-memory `Storage` (the service only needs these three methods). */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

function fakeDeps(overrides: Partial<BatchDeps> = {}) {
  const saved: Array<{ pgn: string; depth: number; result: GameAnalysisResult }> = [];
  const deps: BatchDeps = {
    analyze: vi.fn(async () => OUTPUT),
    isStored: vi.fn(async () => false),
    save: vi.fn(async (game) => void saved.push(game)),
    ...overrides,
  };
  return { deps, saved };
}

const abortError = () => new DOMException('Aborted', 'AbortError');

afterEach(() => vi.restoreAllMocks());

describe('createSnapshot', () => {
  it('starts with nothing done, drops repeated games and keeps the order', () => {
    const snapshot = createSnapshot([job('a'), job('b'), job('a'), job('c')], 14, 'Alice');
    expect(snapshot.jobs.map((j) => j.id)).toEqual(['a', 'b', 'c']);
    expect(snapshot).toMatchObject({ version: 1, depth: 14, userPseudo: 'Alice', doneIds: [], failedIds: [] });
  });

  it('is bounded: the queue is kept in the browser with the PGN of each game', () => {
    const jobs = Array.from({ length: MAX_BATCH_JOBS + 5 }, (_, i) => job(`g${i}`));
    expect(createSnapshot(jobs, 12, 'Alice').jobs).toHaveLength(MAX_BATCH_JOBS);
  });
});

describe('jobsFromGames', () => {
  const detail = { speed: 'blitz', timeControl: '5+3', playedAt: new Date(2020, 9, 3, 12).getTime() } as const;
  const listed = [
    { source: 'chesscom', id: 'new', pgn: 'N', white: 'me', black: 'Opp1', userColor: 'w', outcome: 'win', ...detail },
    { source: 'chesscom', id: 'mid', pgn: 'M', white: 'Opp2', black: 'me', userColor: 'b', outcome: 'loss', ...detail },
    { source: 'lichess', id: 'old', pgn: 'O', white: 'me', black: 'Opp3', userColor: 'w', outcome: 'draw', ...detail },
  ] as const;

  it('puts the oldest game first (the list is newest first)', () => {
    expect(jobsFromGames([...listed]).map((j) => j.pgn)).toEqual(['O', 'M', 'N']);
  });

  it('names each game after the opponent of the user, whichever side they played', () => {
    const opponents = jobsFromGames([...listed]).map((j) => j.label.split(' · ')[0]);
    expect(opponents).toEqual(['contre Opp3', 'contre Opp2', 'contre Opp1']);
  });

  it('tells the result from the point of view of the user, the time control and the date', () => {
    expect(jobsFromGames([...listed]).map((j) => j.label)).toEqual([
      'contre Opp3 · Nulle · Blitz 5+3 · 3 oct. 2020',
      'contre Opp2 · Défaite · Blitz 5+3 · 3 oct. 2020',
      'contre Opp1 · Victoire · Blitz 5+3 · 3 oct. 2020',
    ]);
  });

  it('identifies a game by its site and its id, so that two sites cannot clash', () => {
    const jobs = jobsFromGames([listed[0], { ...listed[0], source: 'lichess' }]);
    expect(jobs.map((j) => j.id)).toEqual(['lichess:new', 'chesscom:new']);
  });

  it('does not change the list it is given', () => {
    const games = [...listed];
    jobsFromGames(games);
    expect(games.map((g) => g.id)).toEqual(['new', 'mid', 'old']);
  });
});

describe('pendingJobs', () => {
  it('leaves out the games done and the games that failed', () => {
    const snapshot = {
      ...createSnapshot([job('a'), job('b'), job('c')], 12, 'Alice'),
      doneIds: ['a'],
      failedIds: ['c'],
    };
    expect(pendingJobs(snapshot).map((j) => j.id)).toEqual(['b']);
  });
});

describe('saving the queue', () => {
  it('gives back what was saved', () => {
    const storage = memoryStorage();
    const snapshot = { ...createSnapshot([job('a'), job('b')], 16, 'Alice'), doneIds: ['a'] };
    saveSnapshot(snapshot, storage);
    expect(loadSnapshot(storage)).toEqual(snapshot);
  });

  it('is empty once cleared, or when nothing was saved', () => {
    const storage = memoryStorage();
    expect(loadSnapshot(storage)).toBeNull();
    saveSnapshot(createSnapshot([job('a')], 12, 'Alice'), storage);
    clearSnapshot(storage);
    expect(loadSnapshot(storage)).toBeNull();
  });

  it('ignores damaged or foreign data instead of failing', () => {
    const valid = createSnapshot([job('a')], 12, 'Alice');
    const store = (value: unknown) =>
      memoryStorage({ chess_batch_analysis: typeof value === 'string' ? value : JSON.stringify(value) });
    const cases: unknown[] = [
      'not json',
      '"a string"',
      'null',
      { ...valid, version: 2 },
      { ...valid, depth: 'deep' },
      { ...valid, userPseudo: 3 },
      { ...valid, jobs: [] },
      { ...valid, jobs: [{ id: 'a', label: 'x' }] },
      { ...valid, jobs: [{ id: 'a', label: 'x', pgn: '' }] },
      { ...valid, jobs: Array.from({ length: MAX_BATCH_JOBS + 1 }, (_, i) => job(`g${i}`)) },
      { ...valid, doneIds: [1] },
      { ...valid, failedIds: 'a' },
    ];
    for (const data of cases) expect(loadSnapshot(store(data)), JSON.stringify(data)).toBeNull();
    expect(loadSnapshot(store(valid))).toEqual(valid);
  });

  it('never throws when the storage is unavailable or full', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSnapshot(broken)).toBeNull();
    expect(() => saveSnapshot(createSnapshot([job('a')], 12, 'Alice'), broken)).not.toThrow();
    expect(() => clearSnapshot(broken)).not.toThrow();
  });
});

describe('runBatch', () => {
  const run = (snapshot: BatchSnapshot, deps: BatchDeps, extra: Partial<Parameters<typeof runBatch>[2]> = {}) =>
    runBatch(snapshot, deps, { signal: new AbortController().signal, ...extra });

  it('analyses every game in order, at the chosen depth, and saves each one', async () => {
    const { deps, saved } = fakeDeps();
    const snapshot = createSnapshot([job('a'), job('b'), job('c')], 15, 'Alice');
    const { outcome, snapshot: final } = await run(snapshot, deps);

    expect(outcome).toBe('completed');
    expect(final.doneIds).toEqual(['a', 'b', 'c']);
    expect(saved.map((g) => g.pgn)).toEqual(snapshot.jobs.map((j) => j.pgn));
    expect(saved.every((g) => g.depth === 15)).toBe(true);
    expect(vi.mocked(deps.analyze).mock.calls.map((call) => call[1])).toEqual([15, 15, 15]);
  });

  it('records the side the user played from the pseudo of the site', async () => {
    const { deps, saved } = fakeDeps();
    const snapshot = createSnapshot([job('a', 'Alice', 'Bob'), job('b', 'Bob', 'Alice')], 12, 'Alice');
    await run(snapshot, deps);
    expect(saved.map((g) => g.result.userColor)).toEqual(['w', 'b']);
    expect(saved.every((g) => g.result.userPseudo === 'Alice')).toBe(true);
    expect(saved[0].result.metadata.white).toBe('Alice');
  });

  it('skips a game that is already stored, without running the engine', async () => {
    const first = job('a', 'A1', 'B1');
    const second = job('b', 'A2', 'B2');
    const { deps, saved } = fakeDeps({ isStored: vi.fn(async (pgn: string) => pgn === first.pgn) });
    const { snapshot } = await run(createSnapshot([first, second], 12, 'x'), deps);
    expect(deps.analyze).toHaveBeenCalledTimes(1);
    expect(saved.map((g) => g.pgn)).toEqual([second.pgn]);
    expect(snapshot.doneIds).toEqual(['a', 'b']);
  });

  it('asks the store about the depth that was requested', async () => {
    const { deps } = fakeDeps();
    await run(createSnapshot([job('a')], 18, 'x'), deps);
    expect(deps.isStored).toHaveBeenCalledWith(job('a').pgn, 18);
  });

  it('records a game that fails and goes on with the others', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps, saved } = fakeDeps({
      analyze: vi.fn(async (pgn: string) => {
        if (pgn === job('b').pgn) throw new Error('boom');
        return OUTPUT;
      }),
    });
    const { outcome, snapshot } = await run(
      createSnapshot([job('a', 'A1', 'B1'), job('b'), job('c', 'A3', 'B3')], 12, 'x'),
      deps
    );
    expect(outcome).toBe('completed');
    expect(snapshot.doneIds).toEqual(['a', 'c']);
    expect(snapshot.failedIds).toEqual(['b']);
    expect(saved).toHaveLength(2);
  });

  it('counts a game that could not be saved as failed, not as done', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps } = fakeDeps({ save: vi.fn(async () => Promise.reject(new Error('disk full'))) });
    const { snapshot } = await run(createSnapshot([job('a')], 12, 'x'), deps);
    expect(snapshot.failedIds).toEqual(['a']);
    expect(snapshot.doneIds).toEqual([]);
  });

  it('stops at once when aborted during a game, and keeps that game pending', async () => {
    const controller = new AbortController();
    const { deps, saved } = fakeDeps({
      analyze: vi.fn((pgn: string, _depth: number, _progress: unknown, signal: AbortSignal) =>
        pgn === job('b').pgn
          ? new Promise<GameAnalysisOutput>((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(abortError()));
              controller.abort();
            })
          : Promise.resolve(OUTPUT)
      ),
    });
    const snapshot = createSnapshot([job('a', 'A1', 'B1'), job('b'), job('c', 'A3', 'B3')], 12, 'x');
    const result = await runBatch(snapshot, deps, { signal: controller.signal });

    expect(result.outcome).toBe('aborted');
    expect(result.snapshot.doneIds).toEqual(['a']);
    expect(result.snapshot.failedIds).toEqual([]);
    expect(pendingJobs(result.snapshot).map((j) => j.id)).toEqual(['b', 'c']);
    expect(saved).toHaveLength(1);
  });

  it('does not save a game whose analysis finished after the abort', async () => {
    const controller = new AbortController();
    const { deps, saved } = fakeDeps({
      analyze: vi.fn(async () => {
        controller.abort(); // the engine answered anyway
        return OUTPUT;
      }),
    });
    const result = await runBatch(createSnapshot([job('a')], 12, 'x'), deps, { signal: controller.signal });
    expect(result.outcome).toBe('aborted');
    expect(saved).toEqual([]);
    expect(pendingJobs(result.snapshot)).toHaveLength(1);
  });

  it('does nothing when it is aborted before it starts', async () => {
    const controller = new AbortController();
    controller.abort();
    const { deps } = fakeDeps();
    const result = await runBatch(createSnapshot([job('a')], 12, 'x'), deps, { signal: controller.signal });
    expect(result.outcome).toBe('aborted');
    expect(deps.isStored).not.toHaveBeenCalled();
    expect(deps.analyze).not.toHaveBeenCalled();
  });

  it('continues where an interrupted queue stopped', async () => {
    const { deps } = fakeDeps();
    const snapshot = {
      ...createSnapshot([job('a', 'A1', 'B1'), job('b', 'A2', 'B2'), job('c', 'A3', 'B3')], 12, 'x'),
      doneIds: ['a'],
    };
    const { outcome, snapshot: final } = await run(snapshot, deps);
    expect(outcome).toBe('completed');
    expect(deps.analyze).toHaveBeenCalledTimes(2);
    expect(final.doneIds).toEqual(['a', 'b', 'c']);
  });

  it('reports every change of the queue as it happens', async () => {
    const { deps } = fakeDeps();
    const changes: string[][] = [];
    await run(createSnapshot([job('a', 'A1', 'B1'), job('b', 'A2', 'B2')], 12, 'x'), deps, {
      onChange: (s) => changes.push([...s.doneIds]),
    });
    expect(changes).toEqual([['a'], ['a', 'b']]);
  });

  it('reports the game in progress, how far it is, and the end', async () => {
    const { deps } = fakeDeps({
      analyze: vi.fn(async (_pgn: string, _depth: number, onProgress: (fraction: number) => void) => {
        onProgress(0.5);
        onProgress(7); // out of range: clamped
        return OUTPUT;
      }),
    });
    const seen: Array<Pick<BatchProgress, 'fraction'> & { current: string | null }> = [];
    await run(createSnapshot([job('a')], 12, 'x'), deps, {
      onProgress: (p) => seen.push({ current: p.current?.id ?? null, fraction: p.fraction }),
    });
    expect(seen).toEqual([
      { current: 'a', fraction: 0 },
      { current: 'a', fraction: 0.5 },
      { current: 'a', fraction: 1 },
      { current: null, fraction: 1 },
    ]);
  });
});
