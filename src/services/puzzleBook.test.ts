import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePuzzle, type Puzzle, type PuzzleIndex } from '../utils/puzzleData';
import {
  loadBand,
  loadPuzzleIndex,
  loadPuzzles,
  matchesFilter,
  ratingCount,
  resetPuzzleBook,
  themeCount,
} from './puzzleBook';

const make = (id: string, rating: number, themes: string[]): Puzzle => ({
  id,
  fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  moves: ['e2e4', 'e7e5'],
  rating,
  themes,
});

const shards: Record<string, unknown> = {
  'puzzles/1000.json': {
    band: 1000,
    puzzles: [make('a', 1010, ['fork']), make('b', 1150, ['pin', 'fork']), 'damaged'].map((p) =>
      typeof p === 'string' ? p : encodePuzzle(p)
    ),
  },
  'puzzles/1200.json': { band: 1200, puzzles: [encodePuzzle(make('c', 1250, ['pin']))] },
};

const index: PuzzleIndex = {
  version: 1,
  total: 3,
  bandWidth: 200,
  bands: { 1000: 2, 1200: 1 },
  themes: { fork: { 1000: 2 }, pin: { 1000: 1, 1200: 1 } },
};

beforeEach(() => resetPuzzleBook());

describe('loadBand', () => {
  it('reads the puzzles of a band and leaves out the damaged records', async () => {
    const load = vi.fn(async (path: string) => shards[path]);
    const puzzles = await loadBand(1000, load);
    expect(puzzles.map((puzzle) => puzzle.id)).toEqual(['a', 'b']);
  });

  it('loads a band once', async () => {
    const load = vi.fn(async (path: string) => shards[path]);
    await loadBand(1000, load);
    await loadBand(1000, load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('tries again after a failure', async () => {
    const load = vi
      .fn<(path: string) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(shards['puzzles/1000.json']);
    await expect(loadBand(1000, load)).rejects.toThrow('offline');
    expect(await loadBand(1000, load)).toHaveLength(2);
  });

  it('refuses a file that is not a shard', async () => {
    await expect(loadBand(1000, async () => ({ nothing: true }))).rejects.toThrow('unexpected content');
  });
});

describe('loadPuzzleIndex', () => {
  it('loads the index once', async () => {
    const load = vi.fn(async () => index);
    expect(await loadPuzzleIndex(load)).toBe(index);
    await loadPuzzleIndex(load);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('matchesFilter', () => {
  const pin = make('p', 1100, ['pin', 'fork']);
  const base = { minRating: 1000, maxRating: 1200, themes: [], match: 'any' as const };

  it('keeps the ratings in the range, the ends included', () => {
    expect(matchesFilter(pin, base)).toBe(true);
    expect(matchesFilter(make('x', 1200, []), base)).toBe(true);
    expect(matchesFilter(make('x', 1201, []), base)).toBe(false);
    expect(matchesFilter(make('x', 999, []), base)).toBe(false);
  });

  it('wants one of the themes, or all of them', () => {
    expect(matchesFilter(pin, { ...base, themes: ['fork', 'skewer'] })).toBe(true);
    expect(matchesFilter(pin, { ...base, themes: ['fork', 'skewer'], match: 'all' })).toBe(false);
    expect(matchesFilter(pin, { ...base, themes: ['fork', 'pin'], match: 'all' })).toBe(true);
  });
});

describe('loadPuzzles', () => {
  it('loads the bands of the range only and filters on the rating and the themes', async () => {
    const load = vi.fn(async (path: string) => shards[path]);
    const puzzles = await loadPuzzles({ minRating: 1100, maxRating: 1300, themes: ['pin'], match: 'any' }, load);
    expect(puzzles.map((puzzle) => puzzle.id)).toEqual(['b', 'c']);
    expect(load.mock.calls.map(([path]) => path).sort()).toEqual(['puzzles/1000.json', 'puzzles/1200.json']);
  });
});

describe('counts of the index', () => {
  it('counts a theme and a range of ratings, to the band', () => {
    expect(themeCount(index, 'pin', 1000, 1300)).toBe(2);
    expect(themeCount(index, 'fork', 1200, 1300)).toBe(0);
    expect(themeCount(index, 'unknown', 1000, 1300)).toBe(0);
    expect(ratingCount(index, 1000, 1300)).toBe(3);
  });
});
