import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Puzzle } from '../utils/puzzleData';
import type { PuzzleEntry } from '../utils/puzzleReview';
import {
  clearPuzzleEntries,
  isPuzzleEntry,
  loadPuzzleEntries,
  mergePuzzleEntries,
  savePuzzleEntry,
} from './puzzleStore';

const puzzle = (id: string): Puzzle => ({
  id,
  fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  moves: ['e2e4', 'e7e5'],
  rating: 1000,
  themes: ['fork'],
});

const entry = (id: string, card: Partial<PuzzleEntry['card']> = {}): PuzzleEntry => ({
  id,
  puzzle: puzzle(id),
  card: { id, level: 0, dueAt: 1000, lastSeen: 10, attempts: 1, failures: 1, ...card },
});

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isPuzzleEntry', () => {
  it('accepts an entry and refuses damaged ones', () => {
    expect(isPuzzleEntry(entry('a'))).toBe(true);
    expect(isPuzzleEntry(null)).toBe(false);
    expect(isPuzzleEntry({ ...entry('a'), puzzle: { ...puzzle('a'), moves: ['e2e4'] } })).toBe(false);
    expect(isPuzzleEntry({ ...entry('a'), card: { id: 'a' } })).toBe(false);
    expect(isPuzzleEntry({ ...entry('a'), id: 'b' })).toBe(false);
  });
});

describe('the store', () => {
  it('has nothing at first', async () => {
    expect((await loadPuzzleEntries()).size).toBe(0);
  });

  it('keeps the entries that were saved, and replaces one saved again', async () => {
    expect(await savePuzzleEntry(entry('a'))).toBe(true);
    await savePuzzleEntry(entry('b'));
    await savePuzzleEntry(entry('a', { level: 2 }));
    const entries = await loadPuzzleEntries();
    expect([...entries.keys()].sort()).toEqual(['a', 'b']);
    expect(entries.get('a')!.card.level).toBe(2);
    expect(entries.get('a')!.puzzle.moves).toEqual(['e2e4', 'e7e5']);
  });

  it('forgets everything on request', async () => {
    await savePuzzleEntry(entry('a'));
    await clearPuzzleEntries();
    expect((await loadPuzzleEntries()).size).toBe(0);
  });

  it('leaves out a damaged entry', async () => {
    await savePuzzleEntry(entry('a'));
    await savePuzzleEntry({ id: 'bad' } as unknown as PuzzleEntry);
    expect([...(await loadPuzzleEntries()).keys()]).toEqual(['a']);
  });

  it('does not throw when IndexedDB is unavailable', async () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    expect((await loadPuzzleEntries()).size).toBe(0);
    expect(await savePuzzleEntry(entry('a'))).toBe(false);
  });
});

describe('mergePuzzleEntries', () => {
  it('adds what is new and keeps the entry worked on last', async () => {
    await savePuzzleEntry(entry('a', { lastSeen: 50, level: 3 }));
    await savePuzzleEntry(entry('b', { lastSeen: 10 }));
    const report = await mergePuzzleEntries([
      entry('a', { lastSeen: 20 }),
      entry('b', { lastSeen: 30, level: 2 }),
      entry('c'),
    ]);
    expect(report).toEqual({ added: 1, replaced: 1, kept: 1 });
    const entries = await loadPuzzleEntries();
    expect(entries.get('a')!.card.level).toBe(3);
    expect(entries.get('b')!.card.level).toBe(2);
    expect(entries.has('c')).toBe(true);
  });

  it('counts an entry twice in the file once', async () => {
    const report = await mergePuzzleEntries([entry('a', { lastSeen: 1 }), entry('a', { lastSeen: 2, level: 1 })]);
    expect(report).toEqual({ added: 1, replaced: 0, kept: 0 });
    expect((await loadPuzzleEntries()).get('a')!.card.level).toBe(1);
  });

  it('ignores damaged entries', async () => {
    const report = await mergePuzzleEntries([{ id: 'x' } as unknown as PuzzleEntry]);
    expect(report).toEqual({ added: 0, replaced: 0, kept: 0 });
  });
});
