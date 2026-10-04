import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayedGame } from '../utils/playedGames';
import {
  MAX_PLAYED_GAMES,
  MAX_TOMBSTONES,
  deletePlayedGames,
  exportPlayedGames,
  listPlayedGames,
  mergePlayedGames,
  onPlayedGamesChanged,
  savePlayedGame,
} from './playedGameStore';

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
});

const game = (id: string, at: number, over: Partial<PlayedGame> = {}): PlayedGame => ({
  id,
  pgn: '1. e4 e5 *',
  analysable: true,
  sans: ['e4', 'e5'],
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  label: 'Partie complète',
  color: 'w',
  levelId: 'club',
  levelLabel: 'Club',
  elo: 1600,
  userName: 'Alice',
  result: '1-0',
  ending: 'resigned',
  hints: 0,
  evals: 0,
  finishedAt: at,
  updatedAt: at,
  ...over,
});

const ids = async () => (await listPlayedGames()).map((g) => g.id);

describe('playedGameStore', () => {
  it('saves a game and lists the games, the most recently finished first', async () => {
    expect(await savePlayedGame(game('a', 1))).toBe(true);
    await savePlayedGame(game('b', 3));
    await savePlayedGame(game('c', 2));
    expect(await ids()).toEqual(['b', 'c', 'a']);
  });

  it('replaces a game saved again', async () => {
    await savePlayedGame(game('a', 1, { hints: 0 }));
    await savePlayedGame(game('a', 1, { hints: 2 }));
    expect((await listPlayedGames()).map((g) => g.hints)).toEqual([2]);
  });

  it('deletes games and keeps a tombstone of each, dated after the game', async () => {
    await savePlayedGame(game('a', 100));
    await savePlayedGame(game('b', 200));
    await deletePlayedGames(['a'], 50);
    expect(await ids()).toEqual(['b']);
    const records = await exportPlayedGames();
    expect(records.find((r) => r.id === 'a')).toEqual({ id: 'a', deleted: true, updatedAt: 101 });
  });

  it('ignores the deletion of a game that is not there, or already deleted, without a notification', async () => {
    await savePlayedGame(game('a', 1));
    await deletePlayedGames(['a']);
    const listener = vi.fn();
    onPlayedGamesChanged(listener);
    await deletePlayedGames(['a', 'missing']);
    await deletePlayedGames([]);
    expect(listener).not.toHaveBeenCalled();
    expect(await exportPlayedGames()).toHaveLength(1);
  });

  it('brings a game back when it is saved again after its deletion', async () => {
    await savePlayedGame(game('a', 100));
    await deletePlayedGames(['a'], 500);
    await savePlayedGame(game('a', 100));
    expect(await ids()).toEqual(['a']);
    const [record] = await exportPlayedGames();
    expect(record.updatedAt).toBeGreaterThan(500);
  });

  it('keeps the newest games and tombstones the others beyond the limit', async () => {
    for (let i = 0; i < MAX_PLAYED_GAMES + 3; i += 1) await savePlayedGame(game(`g${i}`, i + 1000), 9_000_000);
    const kept = await ids();
    expect(kept).toHaveLength(MAX_PLAYED_GAMES);
    expect(kept[0]).toBe(`g${MAX_PLAYED_GAMES + 2}`);
    expect(kept).not.toContain('g0');
    const gone = (await exportPlayedGames()).filter((r) => 'deleted' in r);
    expect(gone.map((r) => r.id).sort()).toEqual(['g0', 'g1', 'g2']);
  });

  it('forgets the oldest tombstones beyond their limit', async () => {
    const tombstones = Array.from({ length: MAX_TOMBSTONES + 2 }, (_, i) => ({
      id: `t${i}`,
      deleted: true as const,
      updatedAt: i + 1,
    }));
    await mergePlayedGames(tombstones);
    const left = await exportPlayedGames();
    expect(left).toHaveLength(MAX_TOMBSTONES);
    expect(left.map((r) => r.id)).not.toContain('t0');
    expect(left.map((r) => r.id)).toContain(`t${MAX_TOMBSTONES + 1}`);
  });

  it('tells the listeners about a change', async () => {
    const listener = vi.fn();
    const off = onPlayedGamesChanged(listener);
    await savePlayedGame(game('a', 1));
    expect(listener).toHaveBeenCalledTimes(1);
    await deletePlayedGames(['a']);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    await savePlayedGame(game('b', 2));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('resolves with nothing stored when the storage is unavailable', async () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await savePlayedGame(game('a', 1))).toBe(false);
    expect(await listPlayedGames()).toEqual([]);
    expect(await mergePlayedGames([game('a', 1)])).toBeNull();
  });
});

describe('mergePlayedGames', () => {
  it('adds the games that are not there and keeps the more recent copy of the others', async () => {
    await savePlayedGame(game('a', 1, { updatedAt: 10, hints: 1 }));
    const report = await mergePlayedGames([
      game('a', 1, { updatedAt: 5, hints: 9 }),
      game('b', 2),
      game('b', 2, { updatedAt: 99, hints: 3 }),
    ]);
    expect(report).toEqual({ added: 1, replaced: 0, kept: 1 });
    expect((await listPlayedGames()).map((g) => [g.id, g.hints])).toEqual([
      ['b', 3],
      ['a', 1],
    ]);
  });

  it('replaces a game by a more recent copy, and by a tombstone that is more recent', async () => {
    await savePlayedGame(game('a', 1, { updatedAt: 10 }));
    await savePlayedGame(game('b', 2, { updatedAt: 10 }));
    const report = await mergePlayedGames([
      game('a', 1, { updatedAt: 20, hints: 4 }),
      { id: 'b', deleted: true, updatedAt: 30 },
    ]);
    expect(report).toEqual({ added: 0, replaced: 2, kept: 0 });
    expect((await listPlayedGames()).map((g) => [g.id, g.hints])).toEqual([['a', 4]]);
  });

  it('does not bring back a game that a more recent tombstone covers', async () => {
    await mergePlayedGames([{ id: 'a', deleted: true, updatedAt: 30 }]);
    const report = await mergePlayedGames([game('a', 1, { updatedAt: 20 })]);
    expect(report).toEqual({ added: 0, replaced: 0, kept: 1 });
    expect(await ids()).toEqual([]);
  });

  it('does not tell the listeners when it is silent, nor when nothing changed', async () => {
    const listener = vi.fn();
    onPlayedGamesChanged(listener);
    await mergePlayedGames([game('a', 1)], { silent: true });
    expect(listener).not.toHaveBeenCalled();
    await mergePlayedGames([game('a', 1)]);
    expect(listener).not.toHaveBeenCalled();
    await mergePlayedGames([game('b', 2)]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
