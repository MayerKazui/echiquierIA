import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { computePlayerStats } from '../utils/moveAnalysis';
import {
  MAX_DELETIONS,
  SCHEMA_VERSION,
  clearGames,
  deleteGame,
  gameId,
  isDeletion,
  listDeletions,
  listGames,
  mergeGames,
  normalizePgn,
  onGamesChanged,
  saveGame,
  type StoredGame,
} from './gameStore';

const move = {
  san: 'e4',
  fenBefore: 'start',
  ply: 0,
  color: 'w',
  classification: 'best',
  centipawnLoss: 0,
} as MoveAnalysis;

const result = (white = 'A'): GameAnalysisResult => ({
  metadata: { white, black: 'B' },
  moves: [move],
  statsWhite: computePlayerStats([move]),
  statsBlack: computePlayerStats([]),
  userColor: 'w',
  userPseudo: white,
});

const pgnOf = (n: number) => `1. a3 *\n; ${n}`;
const idOf = (n: number) => gameId(pgnOf(n));
const record = (n: number, savedAt = n * 1000): StoredGame => ({
  id: idOf(n),
  pgn: normalizePgn(pgnOf(n)),
  depth: 12,
  savedAt,
  schemaVersion: SCHEMA_VERSION,
  detail: 'full',
  result: result(`g${n}`),
});

const ids = async () => (await listGames()).map((g) => g.id).sort();

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isDeletion', () => {
  it('accepts an id and a date, nothing else', () => {
    expect(isDeletion({ id: 'a', deletedAt: 5 })).toBe(true);
    expect(isDeletion({ id: '', deletedAt: 5 })).toBe(false);
    expect(isDeletion({ id: 'a', deletedAt: '5' })).toBe(false);
    expect(isDeletion({ id: 'a', deletedAt: NaN })).toBe(false);
    expect(isDeletion({ id: 'a', deletedAt: Infinity })).toBe(false);
    expect(isDeletion({ id: 3, deletedAt: 5 })).toBe(false);
    expect(isDeletion({ deletedAt: 5 })).toBe(false);
    expect(isDeletion(null)).toBe(false);
    expect(isDeletion('x')).toBe(false);
  });
});

describe('deleteGame', () => {
  it('leaves a trace of the deletion', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    await saveGame({ pgn: pgnOf(1), depth: 12, result: result() });
    vi.spyOn(Date, 'now').mockReturnValue(9000);
    await deleteGame(idOf(1));
    expect(await listGames()).toEqual([]);
    expect(await listDeletions()).toEqual([{ id: idOf(1), deletedAt: 9000 }]);
  });

  it('never dates the deletion before the game was saved (a clock set back)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(9000);
    await saveGame({ pgn: pgnOf(1), depth: 12, result: result() });
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    await deleteGame(idOf(1));
    expect(await listDeletions()).toEqual([{ id: idOf(1), deletedAt: 9000 }]);
  });

  it('leaves no trace for a game that is not there', async () => {
    await deleteGame('nothing');
    expect(await listDeletions()).toEqual([]);
  });

  it('keeps one trace for a game deleted twice (the latest)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await saveGame({ pgn: pgnOf(1), depth: 12, result: result() });
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    await deleteGame(idOf(1));
    vi.spyOn(Date, 'now').mockReturnValue(3000);
    await saveGame({ pgn: pgnOf(1), depth: 12, result: result() });
    vi.spyOn(Date, 'now').mockReturnValue(4000);
    await deleteGame(idOf(1));
    expect(await listDeletions()).toEqual([{ id: idOf(1), deletedAt: 4000 }]);
  });
});

describe('clearGames', () => {
  it('leaves a trace of every game it removes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await saveGame({ pgn: pgnOf(1), depth: 12, result: result() });
    await saveGame({ pgn: pgnOf(2), depth: 12, result: result() });
    vi.spyOn(Date, 'now').mockReturnValue(7000);
    await clearGames();
    expect(await listGames()).toEqual([]);
    const traces = await listDeletions();
    expect(traces.map((t) => t.id).sort()).toEqual([idOf(1), idOf(2)].sort());
    expect(traces.every((t) => t.deletedAt === 7000)).toBe(true);
  });

  it('leaves nothing when there was nothing', async () => {
    await clearGames();
    expect(await listDeletions()).toEqual([]);
  });
});

describe('mergeGames with deletions', () => {
  it('removes the games here that were deleted elsewhere after they were saved', async () => {
    await mergeGames([record(1, 1000), record(2, 2000)]);
    const report = await mergeGames([], undefined, [{ id: idOf(1), deletedAt: 5000 }]);
    expect(report).toMatchObject({ deleted: 1, added: 0 });
    expect(await ids()).toEqual([idOf(2)]);
    expect(await listDeletions()).toEqual([{ id: idOf(1), deletedAt: 5000 }]);
  });

  it('removes a game saved exactly when it was deleted', async () => {
    await mergeGames([record(1, 5000)]);
    const report = await mergeGames([], undefined, [{ id: idOf(1), deletedAt: 5000 }]);
    expect(report?.deleted).toBe(1);
    expect(await ids()).toEqual([]);
  });

  it('keeps a game that was analysed again after the deletion', async () => {
    await mergeGames([record(1, 6000)]);
    const report = await mergeGames([], undefined, [{ id: idOf(1), deletedAt: 5000 }]);
    expect(report?.deleted).toBe(0);
    expect(await ids()).toEqual([idOf(1)]);
  });

  it('does not take back a game that was deleted here after it was saved elsewhere', async () => {
    await mergeGames([record(1, 1000)]);
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    await deleteGame(idOf(1));
    const report = await mergeGames([record(1, 1000), record(2, 2000)]);
    expect(report).toMatchObject({ added: 1 });
    expect(await ids()).toEqual([idOf(2)]);
  });

  it('takes back a game analysed again after it was deleted here', async () => {
    await mergeGames([record(1, 1000)]);
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    await deleteGame(idOf(1));
    const report = await mergeGames([record(1, 5001)]);
    expect(report).toMatchObject({ added: 1 });
    expect(await ids()).toEqual([idOf(1)]);
  });

  it('does not take back a game saved exactly when it was deleted here', async () => {
    await mergeGames([record(1, 1000)]);
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    await deleteGame(idOf(1));
    expect(await mergeGames([record(1, 5000)])).toMatchObject({ added: 0 });
  });

  it('blocks a game of the same call that is covered by a deletion of the same call', async () => {
    const report = await mergeGames([record(1, 1000), record(2, 2000)], undefined, [{ id: idOf(1), deletedAt: 1500 }]);
    expect(report).toMatchObject({ added: 1, deleted: 0 });
    expect(await ids()).toEqual([idOf(2)]);
  });

  it('keeps the latest of the traces of one game', async () => {
    await mergeGames([], undefined, [
      { id: 'x', deletedAt: 3000 },
      { id: 'x', deletedAt: 9000 },
      { id: 'x', deletedAt: 1000 },
    ]);
    expect(await listDeletions()).toEqual([{ id: 'x', deletedAt: 9000 }]);
  });

  it('keeps the more recent trace when two differ', async () => {
    await mergeGames([], undefined, [{ id: 'x', deletedAt: 9000 }]);
    await mergeGames([], undefined, [{ id: 'x', deletedAt: 3000 }]);
    expect(await listDeletions()).toEqual([{ id: 'x', deletedAt: 9000 }]);
    await mergeGames([], undefined, [{ id: 'x', deletedAt: 12000 }]);
    expect(await listDeletions()).toEqual([{ id: 'x', deletedAt: 12000 }]);
  });

  it('ignores what is not a trace', async () => {
    await mergeGames([record(1, 1000)], undefined, [{ id: '', deletedAt: 5 }, { deletedAt: 5 }, 'x', null] as never);
    expect(await listDeletions()).toEqual([]);
    expect(await ids()).toEqual([idOf(1)]);
  });

  it('removes a damaged entry (no date) that a deletion names', async () => {
    await clearGames(); // creates the database
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('echiquier-ia', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('games', 'readwrite');
      tx.objectStore('games').put({ id: 'damaged' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const report = await mergeGames([], undefined, [{ id: 'damaged', deletedAt: 5000 }]);
    expect(report?.deleted).toBe(1);
  });

  it('does not count a deletion of a game that is not here', async () => {
    const report = await mergeGames([], undefined, [{ id: 'unknown', deletedAt: 5000 }]);
    expect(report?.deleted).toBe(0);
    expect(await listDeletions()).toEqual([{ id: 'unknown', deletedAt: 5000 }]);
  });

  it('forgets the oldest traces beyond the limit', async () => {
    const many = Array.from({ length: MAX_DELETIONS + 3 }, (_, i) => ({ id: `d${i}`, deletedAt: 1000 + i }));
    await mergeGames([], undefined, many);
    const kept = await listDeletions();
    expect(kept).toHaveLength(MAX_DELETIONS);
    const ages = kept.map((t) => t.deletedAt);
    expect(Math.min(...ages)).toBe(1003);
    expect(Math.max(...ages)).toBe(1000 + MAX_DELETIONS + 2);
  });

  it('forgets the oldest traces of deleted games beyond the limit too', async () => {
    const many = Array.from({ length: MAX_DELETIONS }, (_, i) => ({ id: `d${i}`, deletedAt: 1000 + i }));
    await mergeGames([], undefined, many);
    vi.spyOn(Date, 'now').mockReturnValue(900_000);
    await saveGame({ pgn: pgnOf(1), depth: 12, result: result() });
    await deleteGame(idOf(1));
    const kept = await listDeletions();
    expect(kept).toHaveLength(MAX_DELETIONS);
    expect(kept.some((t) => t.id === idOf(1))).toBe(true);
    expect(kept.some((t) => t.id === 'd0')).toBe(false);
  });
});

describe('mergeGames restoring over deletions (a file the user imports)', () => {
  it('brings back games deleted here since, just after their deletion', async () => {
    await mergeGames([record(1, 1000), record(2, 2000)]);
    vi.spyOn(Date, 'now').mockReturnValue(8000);
    await clearGames();
    const report = await mergeGames([record(1, 1000), record(2, 2000)], undefined, [], { override: true });
    expect(report).toMatchObject({ added: 2 });
    const games = await listGames();
    expect(games.map((g) => g.id)).toEqual([idOf(2), idOf(1)]); // the order between them is kept
    expect(games.every((g) => g.savedAt > 8000)).toBe(true);
    expect(games[0].savedAt - games[1].savedAt).toBe(1000);
  });

  it('keeps the date of a game no deletion covers', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(8000);
    await mergeGames([record(1, 1000)], undefined, [], { override: true });
    expect((await listGames())[0].savedAt).toBe(1000);
  });

  it('ignores the deletions that the file records', async () => {
    await mergeGames([record(1, 1000)], undefined, [{ id: idOf(1), deletedAt: 5000 }], { override: true });
    expect(await ids()).toEqual([idOf(1)]);
  });

  it('a game restored that way is not deleted by the next sync of the same trace', async () => {
    await mergeGames([record(1, 1000)]);
    vi.spyOn(Date, 'now').mockReturnValue(8000);
    await deleteGame(idOf(1));
    await mergeGames([record(1, 1000)], undefined, [], { override: true });
    // Drive still holds the trace of the first deletion
    const report = await mergeGames([], undefined, [{ id: idOf(1), deletedAt: 8000 }]);
    expect(report?.deleted).toBe(0);
    expect(await ids()).toEqual([idOf(1)]);
  });
});

describe('onGamesChanged', () => {
  const calls = () => {
    const listener = vi.fn();
    const stop = onGamesChanged(listener);
    return { listener, stop };
  };

  it('tells when a game is saved, deleted, or the history cleared', async () => {
    const { listener, stop } = calls();
    await saveGame({ pgn: pgnOf(1), depth: 12, result: result() });
    expect(listener).toHaveBeenCalledTimes(1);
    await deleteGame(idOf(1));
    expect(listener).toHaveBeenCalledTimes(2);
    await clearGames();
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
  });

  it('does not tell when deleting a game that is not there', async () => {
    const { listener, stop } = calls();
    await deleteGame('nothing');
    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it('tells when a merge changed the games or the traces, not otherwise', async () => {
    const { listener, stop } = calls();
    await mergeGames([record(1, 1000)]);
    expect(listener).toHaveBeenCalledTimes(1);
    await mergeGames([record(1, 1000)]); // already there
    expect(listener).toHaveBeenCalledTimes(1);
    await mergeGames([], undefined, [{ id: 'x', deletedAt: 1 }]);
    expect(listener).toHaveBeenCalledTimes(2);
    await mergeGames([], undefined, [{ id: 'x', deletedAt: 1 }]); // already known
    expect(listener).toHaveBeenCalledTimes(2);
    await mergeGames([record(2, 2000)], undefined, [], { override: true });
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
  });

  it('is silent when asked (the sync restores without starting a sync)', async () => {
    const { listener, stop } = calls();
    await mergeGames([record(1, 1000)], undefined, [{ id: 'x', deletedAt: 1 }], { silent: true });
    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it('stops telling once unsubscribed, and a failing listener does not stop the others', async () => {
    const first = vi.fn(() => {
      throw new Error('boom');
    });
    const second = vi.fn();
    const stopFirst = onGamesChanged(first);
    const stopSecond = onGamesChanged(second);
    await saveGame({ pgn: pgnOf(1), depth: 12, result: result() });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    stopFirst();
    await saveGame({ pgn: pgnOf(2), depth: 12, result: result() });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    stopSecond();
  });
});
