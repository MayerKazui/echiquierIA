import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_LOG,
  MAX_SESSIONS,
  attemptKey,
  type PuzzleAttempt,
  type PuzzleSession,
  type SeenPuzzle,
} from '../utils/puzzleHistory';
import {
  clearPuzzleHistory,
  exportPuzzleHistory,
  isHistoryEmpty,
  isPuzzleAttempt,
  isPuzzleSession,
  isSeenPuzzle,
  loadPuzzleHistory,
  mergePuzzleHistory,
  savePuzzleAttempt,
  savePuzzleSession,
} from './puzzleHistoryStore';

const seen = (id: string, over: Partial<SeenPuzzle> = {}): SeenPuzzle => ({
  id,
  plays: 1,
  wins: 1,
  lastAt: 10,
  ...over,
});
const attempt = (at: number, id = 'a', over: Partial<PuzzleAttempt> = {}): PuzzleAttempt => ({
  at,
  id,
  ok: true,
  rating: 1100,
  themes: ['fork'],
  ...over,
});
const session = (at: number, over: Partial<PuzzleSession> = {}): PuzzleSession => ({
  at,
  mode: 'free',
  solved: 3,
  total: 4,
  elapsedMs: 60_000,
  minutes: null,
  ...over,
});

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('the validators', () => {
  it('accept what the store writes', () => {
    expect(isSeenPuzzle(seen('a'))).toBe(true);
    expect(isPuzzleAttempt(attempt(1))).toBe(true);
    expect(isPuzzleSession(session(1))).toBe(true);
    expect(isPuzzleSession(session(1, { minutes: 5 }))).toBe(true);
  });

  it('refuse what is not', () => {
    expect(isSeenPuzzle({ ...seen('a'), wins: 3, plays: 1 })).toBe(false);
    expect(isSeenPuzzle({ ...seen('a'), plays: -1 })).toBe(false);
    expect(isSeenPuzzle(null)).toBe(false);
    expect(isPuzzleAttempt({ ...attempt(1), themes: [3] })).toBe(false);
    expect(isPuzzleAttempt({ ...attempt(1), ok: 'yes' })).toBe(false);
    expect(isPuzzleSession({ ...session(1), mode: 'woodpecker' })).toBe(false);
    expect(isPuzzleSession({ ...session(1), solved: 9, total: 4 })).toBe(false);
  });
});

describe('the store', () => {
  it('has nothing at first', async () => {
    const history = await loadPuzzleHistory();
    expect(history.seen.size).toBe(0);
    expect(history.log).toEqual([]);
    expect(history.sessions).toEqual([]);
  });

  it('keeps a puzzle played, the attempt and the session, and reads them back in order', async () => {
    expect(await savePuzzleAttempt(seen('b', { lastAt: 20 }), attempt(20, 'b'))).toBe(true);
    await savePuzzleAttempt(seen('a'), attempt(10, 'a'));
    await savePuzzleSession(session(30));
    await savePuzzleSession(session(25, { mode: 'review' }));
    const history = await loadPuzzleHistory();
    expect([...history.seen.keys()].sort()).toEqual(['a', 'b']);
    expect(history.log.map((a) => a.id)).toEqual(['a', 'b']);
    expect(history.sessions.map((s) => s.at)).toEqual([25, 30]);
  });

  it('replaces the record of a puzzle played again', async () => {
    await savePuzzleAttempt(seen('a', { plays: 1 }), attempt(10, 'a'));
    await savePuzzleAttempt(seen('a', { plays: 2, lastAt: 20 }), attempt(20, 'a'));
    const history = await loadPuzzleHistory();
    expect(history.seen.get('a')).toMatchObject({ plays: 2, lastAt: 20 });
    expect(history.log).toHaveLength(2);
  });

  it('keeps the latest attempts and sessions only', async () => {
    for (let i = 1; i <= MAX_SESSIONS + 3; i++) await savePuzzleSession(session(i));
    expect((await loadPuzzleHistory()).sessions[0].at).toBe(4);
    await savePuzzleAttempt(seen('a'), attempt(1));
    // The attempts are many: put them in one go, then one write trims them
    const db = await new Promise<IDBDatabase>((resolve) => {
      const open = indexedDB.open('echiquier-ia-puzzle-history');
      open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('log', 'readwrite');
      for (let i = 2; i <= MAX_LOG + 5; i++) tx.objectStore('log').put(attempt(i), attemptKey(attempt(i)));
      tx.oncomplete = () => resolve();
    });
    db.close();
    await savePuzzleAttempt(seen('a'), attempt(MAX_LOG + 10));
    const log = (await loadPuzzleHistory()).log;
    expect(log).toHaveLength(MAX_LOG);
    expect(log[0].at).toBe(7);
    expect(log.at(-1)?.at).toBe(MAX_LOG + 10);
  });

  it('leaves out a record that cannot be read', async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const open = indexedDB.open('echiquier-ia-puzzle-history', 1);
      open.onupgradeneeded = () => {
        for (const name of ['seen', 'log', 'sessions']) open.result.createObjectStore(name);
      };
      open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction(['seen', 'log'], 'readwrite');
      tx.objectStore('seen').put({ nonsense: true }, 'x');
      tx.objectStore('log').put({ at: 'x' }, 'y');
      tx.objectStore('seen').put(seen('ok'), 'ok');
      tx.oncomplete = () => resolve();
    });
    db.close();
    const history = await loadPuzzleHistory();
    expect([...history.seen.keys()]).toEqual(['ok']);
    expect(history.log).toEqual([]);
  });

  it('resolves with "nothing stored" when IndexedDB is not there', async () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    expect((await loadPuzzleHistory()).log).toEqual([]);
    expect(await savePuzzleAttempt(seen('a'), attempt(1))).toBe(false);
    expect(await savePuzzleSession(session(1))).toBe(false);
    expect(await mergePuzzleHistory({ seen: [seen('a')], log: [], sessions: [], clearedAt: 0 })).toBeNull();
  });
});

describe('export and merge', () => {
  it('exports what is kept, and tells when there is nothing', async () => {
    expect(isHistoryEmpty(await exportPuzzleHistory())).toBe(true);
    await savePuzzleAttempt(seen('a'), attempt(1));
    await savePuzzleSession(session(2));
    const data = await exportPuzzleHistory();
    expect(isHistoryEmpty(data)).toBe(false);
    expect([data.seen.length, data.log.length, data.sessions.length]).toEqual([1, 1, 1]);
  });

  it('adds what the browser does not have, and counts each record once', async () => {
    await savePuzzleAttempt(seen('a'), attempt(1, 'a'));
    const report = await mergePuzzleHistory({
      seen: [seen('a'), seen('b')],
      log: [attempt(1, 'a'), attempt(2, 'b')],
      sessions: [session(5), session(5)],
      clearedAt: 0,
    });
    expect(report).toEqual({ added: 3, cleared: false });
    const history = await loadPuzzleHistory();
    expect(history.log).toHaveLength(2);
    expect(history.sessions).toHaveLength(1);
    expect(history.seen.size).toBe(2);
  });

  it('keeps, for a puzzle played in both places, the record of the one played last', async () => {
    await savePuzzleAttempt(seen('a', { plays: 5, lastAt: 50 }), attempt(50, 'a'));
    await mergePuzzleHistory({ seen: [seen('a', { plays: 2, lastAt: 20 })], log: [], sessions: [], clearedAt: 0 });
    expect((await loadPuzzleHistory()).seen.get('a')?.plays).toBe(5);
    await mergePuzzleHistory({ seen: [seen('a', { plays: 9, lastAt: 90 })], log: [], sessions: [], clearedAt: 0 });
    expect((await loadPuzzleHistory()).seen.get('a')?.plays).toBe(9);
  });

  it('skips the records that are not valid, and has nothing to do with nothing', async () => {
    expect(await mergePuzzleHistory({ seen: [], log: [], sessions: [], clearedAt: 0 })).toEqual({
      added: 0,
      cleared: false,
    });
    const report = await mergePuzzleHistory({
      seen: [{ id: 3 } as never],
      log: [attempt(1), { at: 'x' } as never],
      sessions: [],
      clearedAt: 0,
    });
    expect(report).toEqual({ added: 1, cleared: false });
  });
});

describe('clearing the history', () => {
  const played = async (id: string, at: number) => {
    await savePuzzleAttempt(seen(id, { lastAt: at }), attempt(at, id));
    await savePuzzleSession(session(at));
  };
  const data = (over: Partial<Parameters<typeof mergePuzzleHistory>[0]> = {}) => ({
    seen: [],
    log: [],
    sessions: [],
    clearedAt: 0,
    ...over,
  });

  it('forgets everything played, and notes when', async () => {
    await played('a', 10);
    expect(await clearPuzzleHistory(50)).toBe(true);
    const history = await loadPuzzleHistory();
    expect(history.seen.size).toBe(0);
    expect(history.log).toEqual([]);
    expect(history.sessions).toEqual([]);
    expect(history.clearedAt).toBe(50);
    // What is played after counts
    await played('b', 60);
    expect((await loadPuzzleHistory()).log.map((a) => a.id)).toEqual(['b']);
    expect((await loadPuzzleHistory()).clearedAt).toBe(50);
  });

  it('is exported, and is not an empty history even with nothing left in it', async () => {
    await clearPuzzleHistory(50);
    const exported = await exportPuzzleHistory();
    expect(exported.clearedAt).toBe(50);
    expect(isHistoryEmpty(exported)).toBe(false);
  });

  it('is applied by a sync that carries a later clear: what was played before is dropped here', async () => {
    await played('old', 10);
    await played('kept', 80);
    const report = await mergePuzzleHistory(data({ clearedAt: 50 }), { mode: 'sync' });
    expect(report).toEqual({ added: 0, cleared: true });
    const history = await loadPuzzleHistory();
    expect(history.log.map((a) => a.id)).toEqual(['kept']);
    expect([...history.seen.keys()]).toEqual(['kept']);
    expect(history.sessions.map((s) => s.at)).toEqual([80]);
    expect(history.clearedAt).toBe(50);
  });

  it('keeps a copy that still has the old records from bringing them back after a clear here', async () => {
    await clearPuzzleHistory(50);
    const report = await mergePuzzleHistory(
      data({
        seen: [seen('old', { lastAt: 10 }), seen('new', { lastAt: 70 })],
        log: [attempt(10, 'old'), attempt(70, 'new')],
        sessions: [session(10), session(70)],
      }),
      { mode: 'sync' }
    );
    expect(report).toEqual({ added: 3, cleared: false });
    const history = await loadPuzzleHistory();
    expect(history.log.map((a) => a.id)).toEqual(['new']);
    expect(history.sessions.map((s) => s.at)).toEqual([70]);
  });

  it('ignores an earlier clear, and takes the later of the two', async () => {
    await clearPuzzleHistory(100);
    await mergePuzzleHistory(data({ clearedAt: 40 }), { mode: 'sync' });
    expect((await loadPuzzleHistory()).clearedAt).toBe(100);
    await mergePuzzleHistory(data({ clearedAt: 300 }), { mode: 'sync' });
    expect((await loadPuzzleHistory()).clearedAt).toBe(300);
  });

  it('is not applied when importing a file: the file only adds', async () => {
    await played('here', 10);
    await clearPuzzleHistory(50);
    await played('here2', 60);
    const report = await mergePuzzleHistory(
      data({ log: [attempt(10, 'old')], seen: [seen('old', { lastAt: 10 })], clearedAt: 500 }),
      { mode: 'import' }
    );
    expect(report).toEqual({ added: 2, cleared: false });
    const history = await loadPuzzleHistory();
    expect(history.clearedAt).toBe(50);
    expect(history.log.map((a) => a.id).sort()).toEqual(['here2', 'old']);
  });

  it('survives a database made before the date of the clear existed', async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const open = indexedDB.open('echiquier-ia-puzzle-history', 1);
      open.onupgradeneeded = () => {
        for (const name of ['seen', 'log', 'sessions']) open.result.createObjectStore(name);
      };
      open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('seen', 'readwrite');
      tx.objectStore('seen').put(seen('before'), 'before');
      tx.oncomplete = () => resolve();
    });
    db.close();
    const history = await loadPuzzleHistory();
    expect([...history.seen.keys()]).toEqual(['before']);
    expect(history.clearedAt).toBe(0);
    expect(await clearPuzzleHistory(5)).toBe(true);
  });
});
