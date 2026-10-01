import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { computePlayerStats } from '../utils/moveAnalysis';
import {
  MAX_GAMES,
  SCHEMA_VERSION,
  clearGames,
  deleteGame,
  gameId,
  listGames,
  loadGame,
  loadLatestGame,
  normalizePgn,
  saveGame,
  type StoredGame,
} from './gameStore';

const PGN = '[White "A"]\n[Black "B"]\n\n1. e4 e5 2. Nf3 Nc6 *';

function makeResult(label = 'a'): GameAnalysisResult {
  const move = {
    san: 'e4',
    fenBefore: 'start',
    ply: 0,
    color: 'w',
    classification: 'best',
    centipawnLoss: 0,
    evalBefore: 0,
    evalAfter: 20,
  } as MoveAnalysis;
  return {
    metadata: { white: label, black: 'B' },
    moves: [move],
    statsWhite: computePlayerStats([move]),
    statsBlack: computePlayerStats([]),
    userColor: 'w',
    userPseudo: label,
  };
}

function useFreshDatabase() {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
}

/** Writes a record as is, bypassing `saveGame` (to simulate old or damaged data). */
async function rawPut(record: unknown): Promise<void> {
  await clearGames(); // creates the database and its store
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('echiquier-ia', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function stored(overrides: Partial<StoredGame> & { id: string }): StoredGame {
  return {
    pgn: PGN,
    depth: 12,
    savedAt: 1,
    schemaVersion: SCHEMA_VERSION,
    result: makeResult(),
    ...overrides,
  };
}

beforeEach(() => {
  useFreshDatabase();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('gameId / normalizePgn', () => {
  it('ignores line endings and spacing', () => {
    expect(normalizePgn(`  ${PGN.replace(/\n/g, '\r\n')}  `)).toBe(normalizePgn(PGN));
    expect(gameId(PGN.replace(/ /g, '  '))).toBe(gameId(PGN));
  });

  it('differs between games', () => {
    expect(gameId(PGN)).not.toBe(gameId(PGN.replace('e5', 'c5')));
  });
});

describe('saveGame / loadGame', () => {
  it('returns what was saved, with its depth', async () => {
    const result = makeResult();
    await saveGame({ pgn: PGN, depth: 14, result });
    const found = await loadGame(PGN);
    expect(found?.depth).toBe(14);
    expect(found?.result).toEqual(result);
  });

  it('finds the game again when the pasted text only differs by spacing', async () => {
    await saveGame({ pgn: PGN, depth: 12, result: makeResult() });
    expect(await loadGame(`\r\n${PGN.replace(/\n/g, '\r\n')}  `)).not.toBeNull();
  });

  it('returns null for a game that was never saved', async () => {
    expect(await loadGame(PGN)).toBeNull();
  });

  it('replaces the previous analysis of the same game', async () => {
    await saveGame({ pgn: PGN, depth: 10, result: makeResult('old') });
    await saveGame({ pgn: PGN, depth: 16, result: makeResult('new') });
    const found = await loadGame(PGN);
    expect(found?.depth).toBe(16);
    expect(found?.result.userPseudo).toBe('new');
  });

  it('does not return a record whose PGN differs from the one asked for (key collision)', async () => {
    await rawPut(stored({ id: gameId(PGN), pgn: normalizePgn('1. d4 d5 *') }));
    expect(await loadGame(PGN)).toBeNull();
  });

  it('keeps at most MAX_GAMES games and drops the oldest first', async () => {
    const now = vi.spyOn(Date, 'now');
    for (let i = 0; i < MAX_GAMES + 3; i++) {
      now.mockReturnValue(1000 + i);
      await saveGame({ pgn: `1. a3 *\n; game ${i}`, depth: 12, result: makeResult(String(i)) });
    }
    for (let i = 0; i < 3; i++) expect(await loadGame(`1. a3 *\n; game ${i}`)).toBeNull();
    for (let i = 3; i < MAX_GAMES + 3; i++) expect(await loadGame(`1. a3 *\n; game ${i}`)).not.toBeNull();
  });
});

describe('statistics of games saved by an older version', () => {
  const staleResult = () => {
    const result = makeResult();
    return {
      ...result,
      statsWhite: { ...result.statsWhite, accuracy: 25 },
      statsBlack: { ...result.statsBlack, accuracy: 25 },
    };
  };

  it('are recomputed from the moves by loadGame, loadLatestGame and listGames', async () => {
    const fresh = makeResult().statsWhite.accuracy;
    expect(fresh).not.toBe(25);
    await rawPut(stored({ id: gameId(PGN), result: staleResult() }));

    expect((await loadGame(PGN))?.result.statsWhite.accuracy).toBe(fresh);
    expect((await loadLatestGame())?.result.statsWhite.accuracy).toBe(fresh);
    expect((await listGames())[0].result.statsWhite.accuracy).toBe(fresh);
    expect((await loadGame(PGN))?.result.statsBlack).toEqual(makeResult().statsBlack);
  });
});

describe('best moves of games saved by an older version', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const withBest = (bestMoveSan: string, bestMoveUci: string, fenBefore = START) => {
    const result = makeResult();
    return { ...result, moves: [{ ...result.moves[0], fenBefore, bestMoveSan, bestMoveUci }] };
  };
  const loaded = async (result: GameAnalysisResult) => {
    await rawPut(stored({ id: gameId(PGN), result }));
    return (await loadGame(PGN))?.result.moves[0].bestMoveSan;
  };

  it('are read in English SAN, rebuilt from the UCI move', async () => {
    expect(await loaded(withBest('Cf3', 'g1f3'))).toBe('Nf3');
  });

  it('turns a French king move back into a king move, not a rook move', async () => {
    const afterE4 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(await loaded(withBest('Re2', 'e1e2', afterE4))).toBe('Ke2');
  });

  it('keeps pawn moves, English moves and unreadable ones as they are', async () => {
    expect(await loaded(withBest('e4', 'e2e4'))).toBe('e4');
    expect(await loaded(withBest('Nf3', 'g1f3'))).toBe('Nf3');
    expect(await loaded(withBest('Cf3', 'zzzz', 'not a fen'))).toBe('Cf3');
  });
});

describe('loadLatestGame', () => {
  it('is null when nothing is stored', async () => {
    expect(await loadLatestGame()).toBeNull();
  });

  it('returns the most recently saved game, and saving an older game again makes it the latest', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1);
    await saveGame({ pgn: '1. e4 *', depth: 12, result: makeResult('first') });
    now.mockReturnValue(2);
    await saveGame({ pgn: '1. d4 *', depth: 12, result: makeResult('second') });
    expect((await loadLatestGame())?.result.userPseudo).toBe('second');

    now.mockReturnValue(3);
    await saveGame({ pgn: '1. e4 *', depth: 12, result: makeResult('first') });
    expect((await loadLatestGame())?.result.userPseudo).toBe('first');
  });

  it('skips entries from another schema version and damaged ones', async () => {
    await rawPut(stored({ id: 'good', savedAt: 1, result: makeResult('good') }));
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('echiquier-ia', 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('games', 'readwrite');
      const store = tx.objectStore('games');
      store.put(stored({ id: 'old-schema', savedAt: 2, schemaVersion: SCHEMA_VERSION - 1 }));
      store.put({ ...stored({ id: 'no-moves', savedAt: 3 }), result: { ...makeResult(), moves: [] } });
      store.put({ id: 'garbage', savedAt: 4, schemaVersion: SCHEMA_VERSION });
      tx.oncomplete = () => resolve();
    });
    db.close();
    expect((await loadLatestGame())?.id).toBe('good');
  });
});

describe('clearGames', () => {
  it('removes everything', async () => {
    await saveGame({ pgn: PGN, depth: 12, result: makeResult() });
    await clearGames();
    expect(await loadGame(PGN)).toBeNull();
    expect(await loadLatestGame()).toBeNull();
  });
});

describe('when IndexedDB is not available', () => {
  beforeEach(() => {
    Reflect.deleteProperty(globalThis, 'indexedDB');
  });

  it('never throws: nothing is saved and nothing is found', async () => {
    await expect(saveGame({ pgn: PGN, depth: 12, result: makeResult() })).resolves.toBeUndefined();
    await expect(loadGame(PGN)).resolves.toBeNull();
    await expect(loadLatestGame()).resolves.toBeNull();
    await expect(clearGames()).resolves.toBeUndefined();
  });
});

describe('listGames', () => {
  it('is empty when nothing is stored', async () => {
    expect(await listGames()).toEqual([]);
  });

  it('lists the games from the most recently saved to the oldest', async () => {
    const now = vi.spyOn(Date, 'now');
    for (const [time, pgn] of [
      [1, '1. e4 *'],
      [3, '1. d4 *'],
      [2, '1. c4 *'],
    ] as const) {
      now.mockReturnValue(time);
      await saveGame({ pgn, depth: 12, result: makeResult(pgn) });
    }
    expect((await listGames()).map((g) => g.pgn)).toEqual(['1. d4 *', '1. c4 *', '1. e4 *']);
  });

  it('leaves out entries of another schema version and damaged ones', async () => {
    await rawPut(stored({ id: 'old', schemaVersion: SCHEMA_VERSION - 1, savedAt: 5 }));
    await saveGame({ pgn: '1. e4 *', depth: 12, result: makeResult('ok') });
    const games = await listGames();
    expect(games).toHaveLength(1);
    expect(games[0].result.userPseudo).toBe('ok');
  });

  it('is empty, without throwing, when IndexedDB is unavailable', async () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    expect(await listGames()).toEqual([]);
  });
});

describe('deleteGame', () => {
  it('removes only the given game', async () => {
    await saveGame({ pgn: '1. e4 *', depth: 12, result: makeResult('a') });
    await saveGame({ pgn: '1. d4 *', depth: 12, result: makeResult('b') });
    await deleteGame(gameId('1. e4 *'));
    expect(await loadGame('1. e4 *')).toBeNull();
    expect(await loadGame('1. d4 *')).not.toBeNull();
  });

  it('ignores an unknown id and an unavailable database', async () => {
    await expect(deleteGame('nope')).resolves.toBeUndefined();
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    await expect(deleteGame('nope')).resolves.toBeUndefined();
  });
});
