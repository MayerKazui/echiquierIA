import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Puzzle } from '../utils/puzzleData';
import { beginCycle, createSet, type WoodpeckerSet } from '../utils/woodpecker';
import {
  MAX_LOT,
  isArchivedLot,
  loadWoodpeckerArchive,
  retireWoodpecker,
  isWoodpeckerSet,
  loadWoodpecker,
  mergeWoodpecker,
  saveWoodpecker,
} from './woodpeckerStore';

const puzzle = (id: string): Puzzle => ({
  id,
  fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  moves: ['e2e4', 'e7e5'],
  rating: 1000,
  themes: ['fork'],
});
const set = (updatedAt = 100, ids = ['a', 'b']): WoodpeckerSet => ({
  ...createSet(ids.map(puzzle), { from: 1000, to: 1200 }, 5, 50),
  updatedAt,
});

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('isWoodpeckerSet', () => {
  it('accepts a lot, with or without a cycle in progress', () => {
    expect(isWoodpeckerSet(set())).toBe(true);
    expect(isWoodpeckerSet(beginCycle(set(), 10))).toBe(true);
  });

  it('refuses what is not a lot', () => {
    expect(isWoodpeckerSet(null)).toBe(false);
    expect(isWoodpeckerSet({})).toBe(false);
    expect(isWoodpeckerSet({ ...set(), puzzles: [] })).toBe(false);
    expect(isWoodpeckerSet({ ...set(), puzzles: [{ id: 'x' }] })).toBe(false);
    expect(isWoodpeckerSet({ ...set(), seed: 'a' })).toBe(false);
    expect(isWoodpeckerSet({ ...set(), range: null })).toBe(false);
    expect(isWoodpeckerSet({ ...set(), cycles: [{ number: 1 }] })).toBe(false);
  });

  it('refuses a lot that is too large or has a puzzle twice', () => {
    const ids = Array.from({ length: MAX_LOT + 1 }, (_, i) => `p${i}`);
    expect(isWoodpeckerSet(set(1, ids))).toBe(false);
    expect(isWoodpeckerSet(set(1, ['a', 'a']))).toBe(false);
  });

  it('refuses a progress that names a puzzle the lot does not have', () => {
    const begun = beginCycle(set(), 10);
    expect(isWoodpeckerSet({ ...begun, progress: { ...begun.progress!, queue: ['zzz'] } })).toBe(false);
    expect(isWoodpeckerSet({ ...begun, progress: { ...begun.progress!, elapsedMs: -1 } })).toBe(false);
  });
});

describe('the store', () => {
  it('has no lot at first', async () => {
    expect(await loadWoodpecker()).toBeNull();
  });

  it('saves a lot with its progress, and reads it back', async () => {
    const begun = beginCycle(set(), 10);
    expect(await saveWoodpecker(begun)).toBe(true);
    expect(await loadWoodpecker()).toEqual(begun);
  });

  it('replaces the lot, and forgets it', async () => {
    await saveWoodpecker(set(1, ['a']));
    await saveWoodpecker(set(2, ['b', 'c']));
    expect((await loadWoodpecker())?.puzzles.map((p) => p.id)).toEqual(['b', 'c']);
    await retireWoodpecker((await loadWoodpecker())!, 99);
    expect(await loadWoodpecker()).toBeNull();
  });

  it('ignores a record that is not a lot', async () => {
    await saveWoodpecker({ nonsense: true } as unknown as WoodpeckerSet);
    expect(await loadWoodpecker()).toBeNull();
  });

  it('resolves with "nothing stored" when IndexedDB is not there', async () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    expect(await loadWoodpecker()).toBeNull();
    expect(await saveWoodpecker(set())).toBe(false);
    expect(await retireWoodpecker(set(), 5)).toBeNull();
    expect(await loadWoodpeckerArchive()).toEqual([]);
    expect(await mergeWoodpecker(set())).toBeNull();
  });
});

describe('mergeWoodpecker', () => {
  it('takes the lot when there is none', async () => {
    expect(await mergeWoodpecker(set(100))).toBe('added');
    expect((await loadWoodpecker())?.updatedAt).toBe(100);
  });

  it('keeps the lot worked on last', async () => {
    await saveWoodpecker(set(100, ['a']));
    expect(await mergeWoodpecker(set(200, ['b']))).toBe('replaced');
    expect((await loadWoodpecker())?.puzzles[0].id).toBe('b');
    expect(await mergeWoodpecker(set(150, ['c']))).toBe('kept');
    expect((await loadWoodpecker())?.puzzles[0].id).toBe('b');
  });

  it('has nothing to do with no lot or a damaged one', async () => {
    await saveWoodpecker(set(100));
    expect(await mergeWoodpecker(null)).toBe('kept');
    expect(await mergeWoodpecker({ nope: 1 } as unknown as WoodpeckerSet)).toBe('kept');
    expect((await loadWoodpecker())?.updatedAt).toBe(100);
  });
});

const withCycles = (createdAt: number, updatedAt: number, ids = ['a', 'b']): WoodpeckerSet => ({
  ...set(updatedAt, ids),
  createdAt,
  cycles: [
    { number: 1, startedAt: 1, finishedAt: 2, totalMs: 9000, size: ids.length, firstTry: ids.length },
    { number: 2, startedAt: 3, finishedAt: 4, totalMs: 7000, size: ids.length, firstTry: ids.length },
  ],
});

describe('the lots left', () => {
  it('keeps the cycles of the lot that is left, and the lot goes', async () => {
    const lot = withCycles(10, 100);
    await saveWoodpecker(lot);
    const archive = await retireWoodpecker(lot, 500);
    expect(archive).toEqual([{ createdAt: 10, retiredAt: 500, range: lot.range, size: 2, cycles: lot.cycles }]);
    expect(await loadWoodpecker()).toBeNull();
    expect(await loadWoodpeckerArchive()).toEqual(archive);
  });

  it('keeps nothing of a lot on which no cycle was finished', async () => {
    const lot = set(100);
    await saveWoodpecker(lot);
    expect(await retireWoodpecker(lot, 500)).toEqual([]);
    expect(await loadWoodpecker()).toBeNull();
  });

  it('adds lot after lot, the one left last at the end', async () => {
    await retireWoodpecker(withCycles(10, 100), 500);
    await retireWoodpecker(withCycles(20, 600), 700);
    expect((await loadWoodpeckerArchive()).map((lot) => lot.createdAt)).toEqual([10, 20]);
  });

  it('validates what it reads', () => {
    const lot = { createdAt: 1, retiredAt: 2, range: { from: 1000, to: 1200 }, size: 5, cycles: [] };
    expect(isArchivedLot(lot)).toBe(true);
    expect(isArchivedLot({ ...lot, range: null })).toBe(false);
    expect(isArchivedLot({ ...lot, cycles: [{ number: 1 }] })).toBe(false);
    expect(isArchivedLot(null)).toBe(false);
  });
});

describe('merging the lots left', () => {
  const left = (createdAt: number, retiredAt: number) => {
    const lot = withCycles(createdAt, retiredAt - 1);
    return { createdAt, retiredAt, range: lot.range, size: 2, cycles: lot.cycles };
  };

  it('unites the archives, a lot in both counting once', async () => {
    await retireWoodpecker(withCycles(10, 100), 500);
    expect(await mergeWoodpecker(null, [left(10, 500), left(20, 800)])).toBe('kept');
    expect((await loadWoodpeckerArchive()).map((lot) => lot.createdAt)).toEqual([10, 20]);
  });

  it('does not bring back a lot that the archives say was left', async () => {
    const old = withCycles(10, 100);
    expect(await mergeWoodpecker(old, [left(10, 500)])).toBe('kept');
    expect(await loadWoodpecker()).toBeNull();
  });

  it('drops the lot kept here when the archive of the other copy says it was left', async () => {
    await saveWoodpecker(withCycles(10, 100));
    await mergeWoodpecker(null, [left(10, 500)]);
    expect(await loadWoodpecker()).toBeNull();
    expect((await loadWoodpeckerArchive()).map((lot) => lot.createdAt)).toEqual([10]);
  });

  it('keeps a lot worked on after it was left elsewhere', async () => {
    await saveWoodpecker(withCycles(10, 900));
    await mergeWoodpecker(null, [left(10, 500)]);
    expect((await loadWoodpecker())?.createdAt).toBe(10);
  });

  it('takes the new lot of the other copy beside the lots left', async () => {
    await saveWoodpecker(withCycles(10, 100));
    expect(await mergeWoodpecker(withCycles(30, 900), [left(10, 500)])).toBe('added');
    expect((await loadWoodpecker())?.createdAt).toBe(30);
  });
});
