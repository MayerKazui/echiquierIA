import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import type { Card } from '../utils/spacedRepetition';
import { computePlayerStats } from '../utils/moveAnalysis';
import {
  BACKUP_APP,
  BACKUP_FORMAT,
  MAX_BACKUP_CHARS,
  PREFERENCE_KEYS,
  backupFileName,
  createBackup,
  parseBackup,
  readPreferences,
  restoreBackup,
  serializeBackup,
  type Backup,
} from './backup';
import { deleteGame, gameId, listGames, loadGame, onGamesChanged, saveGame } from './gameStore';
import { loadPuzzleEntries, savePuzzleEntry } from './puzzleStore';
import { clearPuzzleHistory, loadPuzzleHistory, savePuzzleAttempt, savePuzzleSession } from './puzzleHistoryStore';
import { loadWoodpecker, loadWoodpeckerArchive, retireWoodpecker, saveWoodpecker } from './woodpeckerStore';
import { beginCycle, createSet } from '../utils/woodpecker';
import { loadCards, saveCard } from './trainingStore';
import { exportNotes, loadNotes, saveNote } from './gameNoteStore';
import { exportPracticeDays, recordPractice } from './practiceStore';
import { exportVisionRecords, recordVisionRun } from './visionStore';
import { deletePlayedGames, exportPlayedGames, listPlayedGames, savePlayedGame } from './playedGameStore';
import { makePlayedGame } from '../utils/playedGames';
import { replay } from '../utils/playGame';
import type { GameNote } from '../utils/gameNotes';
import { deleteStudy, listStudies, listStudyDeletions, saveStudy, STUDY_SCHEMA_VERSION } from './studyStore';
import { createChapter } from '../utils/studyTree';
import { drillId } from '../utils/openingDrill';
import { endgameCardId } from '../utils/endgameDrill';
import type { Study } from '../types/study';
import type { PuzzleEntry } from '../utils/puzzleReview';

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

const result = (white: string): GameAnalysisResult => ({
  metadata: { white, black: 'B' },
  moves: [move],
  statsWhite: computePlayerStats([move]),
  statsBlack: computePlayerStats([]),
  userColor: 'w',
  userPseudo: white,
});

const puzzleEntry = (id: string, over: Partial<Card> = {}): PuzzleEntry => ({
  id,
  puzzle: { id, fen: '8/8/8/8/8/8/8/8 w - - 0 1', moves: ['e2e4', 'e7e5'], rating: 1000, themes: ['fork'] },
  card: card(id, { level: 0, failures: 1, ...over }),
});

const card = (id: string, over: Partial<Card> = {}): Card => ({
  id,
  level: 1,
  dueAt: 1000,
  lastSeen: 10,
  attempts: 1,
  failures: 0,
  ...over,
});

/** A storage that behaves like localStorage. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const freshDatabase = () =>
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });

beforeEach(() => {
  freshDatabase();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/** A valid backup file as an object, with one game and one card. */
async function sampleBackup(): Promise<Backup> {
  await saveGame({ pgn: '1. e4 *', depth: 14, result: result('Alice') });
  await saveCard(card('p1'));
  return createBackup(Date.UTC(2026, 9, 1, 12), fakeStorage({ chess_coach_user_pseudo: 'Alice' }));
}

describe('readPreferences', () => {
  it('reads the settings of the app, and only those', () => {
    const storage = fakeStorage({
      chess_coach_user_pseudo: 'Alice',
      chess_board_theme: 'wood',
      chess_batch_analysis: '{"jobs":[]}', // the queue of a batch is transient
      something_else: 'x',
    });
    expect(readPreferences(storage)).toEqual({ chess_coach_user_pseudo: 'Alice', chess_board_theme: 'wood' });
  });

  it('leaves out a setting the app could not have written (too long)', () => {
    expect(readPreferences(fakeStorage({ chess_coach_user_pseudo: 'x'.repeat(501) }))).toEqual({});
    expect(readPreferences(fakeStorage({ chess_coach_user_pseudo: 'x'.repeat(500) }))).toHaveProperty(
      'chess_coach_user_pseudo'
    );
  });

  it('is empty when the storage is unavailable or throws', () => {
    expect(readPreferences(undefined)).toEqual({});
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readPreferences(throwing)).toEqual({});
  });

  it('covers the settings the app keeps', () => {
    expect(PREFERENCE_KEYS).toContain('chess_coach_user_pseudo');
    expect(PREFERENCE_KEYS).toContain('chess_board_theme');
    expect(PREFERENCE_KEYS).not.toContain('chess_batch_analysis');
  });
});

describe('createBackup', () => {
  it('holds the games, the training cards and the settings, with the date of the export', async () => {
    const backup = await sampleBackup();
    expect(backup).toMatchObject({ app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: '2026-10-01T12:00:00.000Z' });
    expect(backup.games.map((g) => g.pgn)).toEqual(['1. e4 *']);
    expect(backup.cards.map((c) => c.id)).toEqual(['p1']);
    expect(backup.preferences).toEqual({ chess_coach_user_pseudo: 'Alice' });
  });

  it('is valid with nothing stored', async () => {
    const backup = await createBackup(0, fakeStorage());
    expect(backup).toMatchObject({ games: [], cards: [], deletions: [], preferences: {} });
  });

  it('holds the traces of the games deleted', async () => {
    await saveGame({ pgn: '1. e4 *', depth: 14, result: result('Alice') });
    await deleteGame(gameId('1. e4 *'));
    const backup = await createBackup(0, fakeStorage());
    expect(backup.games).toEqual([]);
    expect(backup.deletions).toEqual([{ id: gameId('1. e4 *'), deletedAt: expect.any(Number) }]);
  });

  it('holds the missed puzzles', async () => {
    await savePuzzleEntry(puzzleEntry('p1'));
    const backup = await createBackup(0, fakeStorage());
    expect(backup.puzzles.map((entry) => entry.id)).toEqual(['p1']);
  });

  it('is of format 10', () => {
    expect(BACKUP_FORMAT).toBe(10);
  });
});

describe('backupFileName', () => {
  it('carries the date', () => {
    expect(backupFileName(Date.UTC(2026, 9, 1, 23, 59))).toBe('echiquier-ia-sauvegarde-2026-10-01.json');
  });
});

describe('parseBackup', () => {
  it('reads what serializeBackup wrote, a mastered position included', async () => {
    await saveCard(card('m', { level: 4, dueAt: Number.MAX_SAFE_INTEGER }));
    const backup = await createBackup(0, fakeStorage());
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.cards[0].dueAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(parsed.rejected).toEqual({ games: 0, cards: 0, studies: 0, puzzles: 0, notes: 0 });
  });

  describe('refuses a file that is not a backup', () => {
    it('not JSON', () => {
      expect(parseBackup('not json')).toEqual({ ok: false, error: "Ce fichier n'est pas un fichier JSON lisible." });
    });

    it.each([
      ['an array', '[]'],
      ['null', 'null'],
      ['a number', '3'],
      ['another app', JSON.stringify({ app: 'other', format: 1, games: [] })],
      ['no app', JSON.stringify({ format: 1, games: [] })],
      ['no format', JSON.stringify({ app: BACKUP_APP })],
      ['a format that is not a number', JSON.stringify({ app: BACKUP_APP, format: '1' })],
      ['format 0', JSON.stringify({ app: BACKUP_APP, format: 0 })],
    ])('%s', (_, text) => {
      expect(parseBackup(text)).toEqual({ ok: false, error: "Ce fichier n'est pas une sauvegarde d'Échiquier IA." });
    });

    it('a file that is too large, without reading it', () => {
      const parse = vi.spyOn(JSON, 'parse');
      expect(parseBackup('x'.repeat(MAX_BACKUP_CHARS + 1))).toMatchObject({
        ok: false,
        error: expect.stringContaining('trop volumineux'),
      });
      expect(parse).not.toHaveBeenCalled();
    });
  });

  it('refuses a backup made by a more recent version, and says so', () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, format: BACKUP_FORMAT + 1, games: [] }));
    expect(parsed).toEqual({
      ok: false,
      error: `Cette sauvegarde vient d'une version plus récente de l'application (format ${BACKUP_FORMAT + 1}) : mettez l'application à jour.`,
    });
  });

  it('refuses a backup that claims too many items', () => {
    const cards = Array.from({ length: 20_001 }, (_, i) => card(`c${i}`));
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 1, cards }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('trop de données'),
    });
  });

  it('accepts 20 000 items', () => {
    const cards = Array.from({ length: 20_000 }, (_, i) => card(`c${i}`));
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 1, cards })).ok).toBe(true);
  });

  it('refuses a backup with nothing to restore', () => {
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 1, games: [], cards: [], preferences: {} }))).toEqual({
      ok: false,
      error: 'Cette sauvegarde ne contient rien à restaurer.',
    });
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 1 }))).toMatchObject({ ok: false });
  });

  it('reads a backup of format 1 (no deletions)', () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 1, cards: [card('a')] }));
    expect(parsed.ok && parsed.backup.deletions).toEqual([]);
  });

  it('reads the traces of deleted games, and leaves out the ones that are not valid', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        format: 2,
        deletions: [{ id: 'a', deletedAt: 5 }, { id: 'b' }, 'x', { id: 'c', deletedAt: 7 }],
      })
    );
    expect(parsed.ok && parsed.backup.deletions).toEqual([
      { id: 'a', deletedAt: 5 },
      { id: 'c', deletedAt: 7 },
    ]);
  });

  it('accepts a backup that only records deletions', () => {
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 2, deletions: [{ id: 'a', deletedAt: 5 }] })).ok).toBe(
      true
    );
  });

  it('refuses a backup that claims too many deletions', () => {
    const deletions = Array.from({ length: 20_001 }, (_, i) => ({ id: `d${i}`, deletedAt: i }));
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 2, deletions }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('trop de données'),
    });
  });

  it('accepts a backup with only some of the parts', () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 1, cards: [card('a')] }));
    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) expect(parsed.backup).toMatchObject({ games: [], preferences: {} });
  });

  it('leaves out, and counts, the games and the cards that are not valid', async () => {
    const backup = await sampleBackup();
    const text = JSON.stringify({
      ...backup,
      games: [...backup.games, { id: 'broken' }, { ...backup.games[0], schemaVersion: 0 }],
      cards: [...backup.cards, { id: 'c' }, 'nope', { ...card('d'), level: 'x' }],
    });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.games).toHaveLength(1);
    expect(parsed.backup.cards).toHaveLength(1);
    expect(parsed.rejected).toEqual({ games: 2, cards: 3, studies: 0, puzzles: 0, notes: 0 });
  });

  it('keeps only the settings of the app, with sane values', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        format: 1,
        preferences: {
          chess_board_theme: 'blue',
          chess_batch_analysis: '{}',
          evil_key: 'x',
          chess_sound_enabled: 3,
          chess_import_source: 'x'.repeat(501),
        },
      })
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.backup.preferences).toEqual({ chess_board_theme: 'blue' });
  });

  it('ignores a date of export that is not text', () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 1, exportedAt: 5, cards: [card('a')] }));
    if (parsed.ok) expect(parsed.backup.exportedAt).toBe('');
    else throw new Error('should be valid');
  });
});

describe('restoreBackup and deletions', () => {
  const withDeletion = async (): Promise<Backup> => {
    await saveGame({ pgn: '1. e4 *', depth: 14, result: result('Alice') });
    const id = gameId('1. e4 *');
    const backup = await createBackup(0, fakeStorage());
    return { ...backup, games: [], deletions: [{ id, deletedAt: Date.now() + 10_000 }] };
  };

  it('a synced copy applies the deletions it records', async () => {
    const backup = await withDeletion();
    const report = await restoreBackup(backup, fakeStorage(), { mode: 'sync' });
    expect(report.games?.deleted).toBe(1);
    expect(await listGames()).toEqual([]);
  });

  it('a file the user imports does not apply them', async () => {
    const backup = await withDeletion();
    const report = await restoreBackup(backup, fakeStorage());
    expect(report.games?.deleted).toBe(0);
    expect(await listGames()).toHaveLength(1);
  });

  it('a file the user imports brings back what was deleted here', async () => {
    const backup = await sampleBackup();
    await deleteGame(gameId('1. e4 *'));
    expect(await listGames()).toEqual([]);
    const report = await restoreBackup(backup, fakeStorage());
    expect(report.games).toMatchObject({ added: 1 });
    expect(await listGames()).toHaveLength(1);
  });

  it('a synced copy does not bring back what was deleted here', async () => {
    const backup = await sampleBackup();
    await deleteGame(gameId('1. e4 *'));
    const report = await restoreBackup(backup, fakeStorage(), { mode: 'sync' });
    expect(report.games).toMatchObject({ added: 0 });
    expect(await listGames()).toEqual([]);
  });

  it('does not tell the listeners of the games when it is silent', async () => {
    const backup = await sampleBackup();
    const listener = vi.fn();
    const stop = onGamesChanged(listener);
    freshDatabase();
    await restoreBackup(backup, fakeStorage(), { mode: 'sync', silent: true });
    expect(listener).not.toHaveBeenCalled();
    await restoreBackup({ ...backup, games: [{ ...backup.games[0], id: 'other' }] }, fakeStorage());
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe('restoreBackup', () => {
  it('puts games, cards and settings back after the browser lost them', async () => {
    const backup = await sampleBackup();
    freshDatabase(); // a cleared browser
    const storage = fakeStorage();
    const report = await restoreBackup(backup, storage);

    expect(report.games).toMatchObject({ added: 1 });
    expect(report.cards).toMatchObject({ added: 1 });
    expect(report.preferencesApplied).toBe(1);
    expect((await loadGame('1. e4 *'))?.depth).toBe(14);
    expect((await loadCards()).has('p1')).toBe(true);
    expect(storage.data.get('chess_coach_user_pseudo')).toBe('Alice');
  });

  it('is a faithful round trip through the file', async () => {
    const backup = await sampleBackup();
    const before = await listGames();
    const parsed = parseBackup(serializeBackup(backup));
    if (!parsed.ok) throw new Error('should be valid');
    freshDatabase(); // a browser that lost its data (a deletion here would leave a trace)
    await restoreBackup(parsed.backup, fakeStorage());
    expect(await listGames()).toEqual(before);
  });

  it('carries the progress of the training on the repertoire, whose positions are named by the position itself', async () => {
    const id = drillId('r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4');
    await saveCard(card(id, { level: 2, attempts: 3 }));
    const backup = await createBackup(Date.parse('2026-10-01T12:00:00Z'), fakeStorage());
    expect(backup.cards.map((c) => c.id)).toContain(id);

    const parsed = parseBackup(serializeBackup(backup));
    if (!parsed.ok) throw new Error('should be valid');
    expect(parsed.rejected.cards).toBe(0);
    freshDatabase(); // a browser that lost its data
    const report = await restoreBackup(parsed.backup, fakeStorage());
    expect(report.cards).toMatchObject({ added: 1 });
    expect((await loadCards()).get(id)).toMatchObject({ level: 2, attempts: 3 });
  });

  it('carries the progress on the theoretical endgames, whose cards are named by the endgame', async () => {
    const id = endgameCardId({ id: 'lucena-b' });
    await saveCard(card(id, { level: 1, attempts: 2 }));
    const backup = await createBackup(Date.parse('2026-10-01T12:00:00Z'), fakeStorage());
    expect(backup.cards.map((c) => c.id)).toContain(id);

    const parsed = parseBackup(serializeBackup(backup));
    if (!parsed.ok) throw new Error('should be valid');
    expect(parsed.rejected.cards).toBe(0);
    freshDatabase();
    const report = await restoreBackup(parsed.backup, fakeStorage());
    expect(report.cards).toMatchObject({ added: 1 });
    expect((await loadCards()).get(id)).toMatchObject({ level: 1, attempts: 2 });
  });

  it('does not overwrite a setting chosen in this browser', async () => {
    const backup = await sampleBackup();
    const storage = fakeStorage({ chess_coach_user_pseudo: 'Bob' });
    const report = await restoreBackup(backup, storage);
    expect(report.preferencesApplied).toBe(0);
    expect(storage.data.get('chess_coach_user_pseudo')).toBe('Bob');
  });

  it('merges with what is there: a more recent game stays', async () => {
    const backup = await sampleBackup();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
    await saveGame({ pgn: '1. e4 *', depth: 20, result: result('Alice') });
    const report = await restoreBackup(backup, fakeStorage());
    expect(report.games).toMatchObject({ added: 0, kept: 1 });
    expect((await loadGame('1. e4 *'))?.depth).toBe(20);
  });

  it('restores the settings that can be written when another one fails', async () => {
    const backup: Backup = {
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      exportedAt: '',
      games: [],
      cards: [],
      deletions: [],
      studies: [],
      studyDeletions: [],
      puzzles: [],
      woodpecker: null,
      woodpeckerArchive: [],
      puzzleHistory: { seen: [], log: [], sessions: [], clearedAt: 0 },
      gameNotes: [],
      practiceDays: [],
      visionRecords: [],
      playedGames: [],
      preferences: { chess_board_theme: 'wood', chess_sound_enabled: 'false' },
    };
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === 'chess_board_theme') throw new Error('quota');
        data.set(key, value);
      },
    };
    const report = await restoreBackup(backup, storage);
    expect(report.preferencesApplied).toBe(1);
    expect(data.get('chess_sound_enabled')).toBe('false');
  });

  it('tells which part could not be written', async () => {
    const backup = await sampleBackup();
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    const report = await restoreBackup(backup, fakeStorage());
    expect(report.games).toBeNull();
    expect(report.cards).toBeNull();
  });

  it('works without a storage for the settings', async () => {
    const backup = await sampleBackup();
    expect((await restoreBackup(backup, undefined)).preferencesApplied).toBe(0);
  });
});

const studyOf = (id: string, name = 'Italienne', updatedAt = 10): Study => ({
  id,
  name,
  description: 'Intro',
  chapters: [createChapter('Chapitre 1')],
  createdAt: 1,
  updatedAt,
  schemaVersion: STUDY_SCHEMA_VERSION,
});

describe('backup of the studies', () => {
  it('holds the studies and the traces of the deleted ones, and reads them back', async () => {
    await saveStudy(studyOf('kept'));
    await saveStudy(studyOf('gone'));
    await deleteStudy('gone');
    const backup = await createBackup(0, fakeStorage());
    expect(backup.studies.map((s) => s.id)).toEqual(['kept']);
    expect(backup.studyDeletions.map((d) => d.id)).toEqual(['gone']);

    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.studies[0].chapters[0].name).toBe('Chapitre 1');
    expect(parsed.backup.studyDeletions).toEqual(backup.studyDeletions);
  });

  it('reads a file of format 2, which has no studies', () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 2, cards: [card('a')] }));
    expect(parsed.ok && parsed.backup).toMatchObject({ studies: [], studyDeletions: [] });
  });

  it('is not empty when it holds only studies or only traces of deleted ones', () => {
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 3, studies: [studyOf('a')] })).ok).toBe(true);
    expect(
      parseBackup(JSON.stringify({ app: BACKUP_APP, format: 3, studyDeletions: [{ id: 'a', deletedAt: 5 }] })).ok
    ).toBe(true);
  });

  it('leaves out, and counts, the studies that are not valid', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        format: 3,
        studies: [studyOf('ok'), { id: 'x' }, 3, { ...studyOf('old'), schemaVersion: 0 }],
      })
    );
    expect(parsed.ok && parsed.backup.studies.map((s) => s.id)).toEqual(['ok']);
    expect(parsed.ok && parsed.rejected.studies).toBe(3);
  });

  it('reads a file from before the missed puzzles as having none', () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 3, cards: [card('a')] }));
    expect(parsed.ok && parsed.backup.puzzles).toEqual([]);
  });

  it('is not empty when it holds only missed puzzles', () => {
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 4, puzzles: [puzzleEntry('a')] })).ok).toBe(true);
  });

  it('leaves out, and counts, the missed puzzles that are not valid', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        format: 4,
        puzzles: [puzzleEntry('ok'), { id: 'x' }, 3, { ...puzzleEntry('bad'), puzzle: { id: 'bad' } }],
      })
    );
    expect(parsed.ok && parsed.backup.puzzles.map((entry) => entry.id)).toEqual(['ok']);
    expect(parsed.ok && parsed.rejected.puzzles).toBe(3);
  });

  it('refuses a file with too many missed puzzles', () => {
    const puzzles = Array.from({ length: 20_001 }, () => 0);
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 4, puzzles })).ok).toBe(false);
  });

  it('puts the missed puzzles back, keeping the entry worked on last', async () => {
    await savePuzzleEntry(puzzleEntry('here', { lastSeen: 50, level: 3 }));
    const backup: Backup = {
      ...(await createBackup(0, fakeStorage())),
      puzzles: [puzzleEntry('here', { lastSeen: 20 }), puzzleEntry('new')],
    };
    const report = await restoreBackup(backup, fakeStorage());
    expect(report.puzzles).toEqual({ added: 1, replaced: 0, kept: 1 });
    const entries = await loadPuzzleEntries();
    expect(entries.get('here')?.card.level).toBe(3);
    expect(entries.has('new')).toBe(true);
  });

  describe('the history of the puzzles', () => {
    const played = (id: string, at: number) =>
      savePuzzleAttempt({ id, plays: 1, wins: 1, lastAt: at }, { at, id, ok: true, rating: 1100, themes: ['fork'] });
    const sessionAt = (at: number) => ({
      at,
      mode: 'free' as const,
      solved: 2,
      total: 3,
      elapsedMs: 5000,
      minutes: null,
    });

    it('is held by the backup, and survives the file', async () => {
      expect((await createBackup(0, fakeStorage())).puzzleHistory).toEqual({
        seen: [],
        log: [],
        sessions: [],
        clearedAt: 0,
      });
      await played('a', 10);
      await savePuzzleSession(sessionAt(20));
      const text = serializeBackup(await createBackup(0, fakeStorage()));
      Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
      const parsed = parseBackup(text);
      if (!parsed.ok) throw new Error('unreadable');
      expect(parsed.backup.puzzleHistory.log).toHaveLength(1);
      const report = await restoreBackup(parsed.backup, fakeStorage());
      expect(report.puzzleHistory).toEqual({ added: 3, cleared: false });
      const history = await loadPuzzleHistory();
      expect([history.seen.size, history.log.length, history.sessions.length]).toEqual([1, 1, 1]);
    });

    it('is not empty when it holds only a history', () => {
      const puzzleHistory = { seen: [{ id: 'a', plays: 1, wins: 0, lastAt: 1 }], log: [], sessions: [] };
      expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 6, puzzleHistory })).ok).toBe(true);
    });

    it('reads a file from before the history as having none', () => {
      const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 5, puzzles: [puzzleEntry('a')] }));
      expect(parsed.ok && parsed.backup.puzzleHistory).toEqual({ seen: [], log: [], sessions: [], clearedAt: 0 });
    });

    it('leaves out, and counts, the records that are not valid', () => {
      const parsed = parseBackup(
        JSON.stringify({
          app: BACKUP_APP,
          format: 6,
          puzzleHistory: {
            seen: [{ id: 'a', plays: 1, wins: 0, lastAt: 1 }, { id: 3 }],
            log: [{ at: 1, id: 'a', ok: true, rating: 1000, themes: [] }, { at: 'x' }],
            sessions: [7],
          },
        })
      );
      expect(parsed.ok && parsed.backup.puzzleHistory.seen).toHaveLength(1);
      expect(parsed.ok && parsed.backup.puzzleHistory.log).toHaveLength(1);
      expect(parsed.ok && parsed.backup.puzzleHistory.sessions).toHaveLength(0);
      expect(parsed.ok && parsed.rejected.puzzles).toBe(3);
    });

    it('carries the date of a clear, and is not empty with only that', async () => {
      await clearPuzzleHistory(500);
      const backup = await createBackup(0, fakeStorage());
      expect(backup.puzzleHistory).toEqual({ seen: [], log: [], sessions: [], clearedAt: 500 });
      const parsed = parseBackup(serializeBackup(backup));
      expect(parsed.ok && parsed.backup.puzzleHistory.clearedAt).toBe(500);
      expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 6, puzzleHistory: { clearedAt: 'x' } })).ok).toBe(
        false
      );
    });

    it('applies a clear of the copy in Drive in a sync, and not when importing a file', async () => {
      await played('old', 10);
      const base = await createBackup(0, fakeStorage());
      const cleared = { ...base, puzzleHistory: { seen: [], log: [], sessions: [], clearedAt: 500 } };
      expect((await restoreBackup(cleared, fakeStorage())).puzzleHistory).toEqual({ added: 0, cleared: false });
      expect((await loadPuzzleHistory()).log).toHaveLength(1);
      const report = await restoreBackup(cleared, fakeStorage(), { mode: 'sync', silent: true });
      expect(report.puzzleHistory).toEqual({ added: 0, cleared: true });
      expect((await loadPuzzleHistory()).log).toEqual([]);
    });

    it('refuses a file with too many records', () => {
      const log = Array.from({ length: 20_001 }, () => 0);
      expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 6, puzzleHistory: { log } })).ok).toBe(false);
    });

    it('unites the history of the file and the one here', async () => {
      await played('here', 10);
      const backup = {
        ...(await createBackup(0, fakeStorage())),
        puzzleHistory: {
          seen: [
            { id: 'here', plays: 1, wins: 1, lastAt: 10 },
            { id: 'there', plays: 1, wins: 0, lastAt: 30 },
          ],
          log: [
            { at: 10, id: 'here', ok: true, rating: 1100, themes: ['fork'] },
            { at: 30, id: 'there', ok: false, rating: 1100, themes: ['pin'] },
          ],
          sessions: [],
          clearedAt: 0,
        },
      };
      expect((await restoreBackup(backup, fakeStorage())).puzzleHistory).toEqual({ added: 2, cleared: false });
      expect((await loadPuzzleHistory()).log.map((a) => a.id)).toEqual(['here', 'there']);
    });
  });

  describe('the lots left in the Woodpecker', () => {
    const withCycle = (createdAt: number) => ({
      ...beginCycle(createSet([puzzleEntry('a').puzzle], { from: 1000, to: 1200 }, 3, createdAt), 60),
      createdAt,
      cycles: [{ number: 1, startedAt: 1, finishedAt: 2, totalMs: 9000, size: 1, firstTry: 1 }],
    });

    it('are held by the backup, and survive the file', async () => {
      await saveWoodpecker(withCycle(10));
      await retireWoodpecker((await loadWoodpecker())!, 500);
      const text = serializeBackup(await createBackup(0, fakeStorage()));
      Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
      const parsed = parseBackup(text);
      if (!parsed.ok) throw new Error('unreadable');
      expect(parsed.backup.woodpeckerArchive).toHaveLength(1);
      await restoreBackup(parsed.backup, fakeStorage());
      expect((await loadWoodpeckerArchive()).map((lot) => lot.createdAt)).toEqual([10]);
    });

    it('make a file that is not empty on their own, and are read as none before format 7', () => {
      const lot = { createdAt: 1, retiredAt: 2, range: { from: 1000, to: 1200 }, size: 5, cycles: [] };
      expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 7, woodpeckerArchive: [lot] })).ok).toBe(true);
      const old = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 6, puzzles: [puzzleEntry('a')] }));
      expect(old.ok && old.backup.woodpeckerArchive).toEqual([]);
    });

    it('leave out, and count, what is not valid', () => {
      const lot = { createdAt: 1, retiredAt: 2, range: { from: 1000, to: 1200 }, size: 5, cycles: [] };
      const parsed = parseBackup(
        JSON.stringify({ app: BACKUP_APP, format: 7, woodpeckerArchive: [lot, { createdAt: 'x' }] })
      );
      expect(parsed.ok && parsed.backup.woodpeckerArchive).toHaveLength(1);
      expect(parsed.ok && parsed.rejected.puzzles).toBe(1);
    });

    it('stop a lot that was left from coming back from the copy of another device', async () => {
      await saveWoodpecker(withCycle(10));
      const stale = await createBackup(0, fakeStorage()); // another device, still on lot 10
      await retireWoodpecker((await loadWoodpecker())!, Date.now() + 1000);
      const report = await restoreBackup(stale, fakeStorage(), { mode: 'sync', silent: true });
      expect(report.woodpecker).toBe('kept');
      expect(await loadWoodpecker()).toBeNull();
    });
  });

  describe('the Woodpecker lot', () => {
    const lot = (updatedAt = 100, ids = ['a', 'b']) => ({
      ...beginCycle(
        createSet(
          ids.map((id) => puzzleEntry(id).puzzle),
          { from: 1000, to: 1200 },
          3,
          50
        ),
        60
      ),
      updatedAt,
    });

    it('is held by the backup, with its cycle in progress', async () => {
      expect((await createBackup(0, fakeStorage())).woodpecker).toBeNull();
      await saveWoodpecker(lot());
      const backup = await createBackup(0, fakeStorage());
      expect(backup.woodpecker?.puzzles.map((p) => p.id)).toEqual(['a', 'b']);
      expect(backup.woodpecker?.progress?.queue).toEqual(['a', 'b']);
    });

    it('survives the file: written, read and put back in a browser that has none', async () => {
      await saveWoodpecker(lot());
      const text = serializeBackup(await createBackup(0, fakeStorage()));
      Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
      const parsed = parseBackup(text);
      expect(parsed.ok && parsed.backup.woodpecker?.seed).toBe(3);
      if (!parsed.ok) throw new Error('unreadable');
      const report = await restoreBackup(parsed.backup, fakeStorage());
      expect(report.woodpecker).toBe('added');
      expect((await loadWoodpecker())?.progress?.queue).toEqual(['a', 'b']);
    });

    it('is not empty when it holds only a lot', () => {
      expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 5, woodpecker: lot() })).ok).toBe(true);
    });

    it('reads a file from before the Woodpecker as having none', () => {
      const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 4, puzzles: [puzzleEntry('a')] }));
      expect(parsed.ok && parsed.backup.woodpecker).toBeNull();
      expect(parsed.ok && parsed.rejected.puzzles).toBe(0);
    });

    it('leaves out, and counts, a lot that is damaged', () => {
      const parsed = parseBackup(
        JSON.stringify({ app: BACKUP_APP, format: 5, puzzles: [puzzleEntry('a')], woodpecker: { seed: 1 } })
      );
      expect(parsed.ok && parsed.backup.woodpecker).toBeNull();
      expect(parsed.ok && parsed.backup.puzzles).toHaveLength(1);
      expect(parsed.ok && parsed.rejected.puzzles).toBe(1);
    });

    it('keeps the lot worked on last, not mixing two', async () => {
      await saveWoodpecker(lot(500, ['here']));
      const older = { ...(await createBackup(0, fakeStorage())), woodpecker: lot(100, ['other']) };
      expect((await restoreBackup(older, fakeStorage())).woodpecker).toBe('kept');
      expect((await loadWoodpecker())?.puzzles[0].id).toBe('here');
      const newer = { ...older, woodpecker: lot(900, ['other']) };
      expect((await restoreBackup(newer, fakeStorage())).woodpecker).toBe('replaced');
      expect((await loadWoodpecker())?.puzzles[0].id).toBe('other');
    });
  });

  it('refuses a file with too many studies', () => {
    const studies = Array.from({ length: 20_001 }, () => 0);
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 3, studies })).ok).toBe(false);
  });

  it('puts the studies of a file the user chose back, even one deleted here since, and keeps a newer local one', async () => {
    await saveStudy(studyOf('deleted', 'Locale'));
    await deleteStudy('deleted');
    await saveStudy({ ...studyOf('local', 'Récente'), updatedAt: 0 }); // stamped now by the save
    const backup: Backup = {
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      exportedAt: '',
      games: [],
      cards: [],
      deletions: [],
      studies: [studyOf('deleted', 'Du fichier'), studyOf('local', 'Ancienne', 1), studyOf('new', 'Nouvelle')],
      studyDeletions: [{ id: 'new', deletedAt: 999_999_999_999_999 }], // ignored when importing a file
      puzzles: [],
      woodpecker: null,
      woodpeckerArchive: [],
      puzzleHistory: { seen: [], log: [], sessions: [], clearedAt: 0 },
      gameNotes: [],
      practiceDays: [],
      visionRecords: [],
      playedGames: [],
      preferences: {},
    };
    const report = await restoreBackup(backup, fakeStorage());
    expect(report.studies).toMatchObject({ added: 2, kept: 1 });
    const names = (await listStudies()).map((s) => s.name).sort();
    expect(names).toEqual(['Du fichier', 'Nouvelle', 'Récente']);
  });

  it('applies the deletions of another device in a sync, and does not take back a study deleted here', async () => {
    await saveStudy(studyOf('here'));
    const [{ updatedAt }] = await listStudies();
    await saveStudy(studyOf('deleted-here'));
    await deleteStudy('deleted-here');
    const backup: Backup = {
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      exportedAt: '',
      games: [],
      cards: [],
      deletions: [],
      studies: [studyOf('deleted-here', 'Revenue', 1)],
      studyDeletions: [{ id: 'here', deletedAt: updatedAt }],
      puzzles: [],
      woodpecker: null,
      woodpeckerArchive: [],
      puzzleHistory: { seen: [], log: [], sessions: [], clearedAt: 0 },
      gameNotes: [],
      practiceDays: [],
      visionRecords: [],
      playedGames: [],
      preferences: {},
    };
    const report = await restoreBackup(backup, fakeStorage(), { mode: 'sync', silent: true });
    expect(report.studies).toMatchObject({ added: 0, deleted: 1 });
    expect(await listStudies()).toEqual([]);
    expect((await listStudyDeletions()).map((d) => d.id).sort()).toEqual(['deleted-here', 'here']);
  });
});

describe('backup of the notes of the games', () => {
  const gameNote = (id: string, note: string, tags: string[] = [], updatedAt = 5): GameNote => ({
    id,
    note,
    tags,
    updatedAt,
  });

  it('holds the notes, an emptied one included, and is read back by parseBackup', async () => {
    await saveNote(gameNote('a', 'à revoir', ['finale']));
    await saveNote(gameNote('b', '', [], 9));
    const backup = await createBackup(0, fakeStorage());
    expect(backup.gameNotes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok && parsed.backup.gameNotes).toEqual(backup.gameNotes);
  });

  it('is a file worth restoring on its own, and counts the notes that are not valid', () => {
    const text = JSON.stringify({
      app: BACKUP_APP,
      format: 8,
      gameNotes: [gameNote('a', 'x'), { id: 'b', note: 5, tags: [], updatedAt: 1 }, 'nope'],
    });
    const parsed = parseBackup(text);
    expect(parsed.ok && parsed.backup.gameNotes).toEqual([gameNote('a', 'x')]);
    expect(parsed.ok && parsed.rejected.notes).toBe(2);
  });

  it('reads a file of format 7, which has no notes', () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 7, cards: [card('a')] }));
    expect(parsed.ok && parsed.backup.gameNotes).toEqual([]);
  });

  it('refuses a file with too many notes', () => {
    const notes = Array.from({ length: 20_001 }, (_, i) => gameNote(`n${i}`, 'x'));
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 8, gameNotes: notes })).ok).toBe(false);
  });

  it('puts the notes back, the one changed last winning, in an import and in a sync', async () => {
    await saveNote(gameNote('local', 'ici', [], 100));
    const backup = await sampleBackup();
    const withNotes: Backup = {
      ...backup,
      gameNotes: [gameNote('local', 'ailleurs', [], 50), gameNote('remote', 'neuve', ['x'], 60)],
    };
    const report = await restoreBackup(withNotes, fakeStorage(), { mode: 'sync', silent: true });
    expect(report.gameNotes).toEqual({ added: 1, replaced: 0, kept: 1 });
    const notes = await loadNotes();
    expect(notes.get('local')?.note).toBe('ici');
    expect(notes.get('remote')?.tags).toEqual(['x']);
  });

  it('carries the deletion of a note: an emptied note replaces the older one', async () => {
    await saveNote(gameNote('a', 'x', ['t'], 1));
    const backup = await sampleBackup();
    await restoreBackup({ ...backup, gameNotes: [gameNote('a', '', [], 2)] }, fakeStorage());
    expect((await loadNotes()).size).toBe(0);
    expect(await exportNotes()).toEqual([gameNote('a', '', [], 2)]);
  });
});

describe('backup of the days practised', () => {
  it('holds the days and reads them back', async () => {
    await recordPractice(new Date(2026, 9, 3, 12).getTime());
    await recordPractice(new Date(2026, 9, 3, 18).getTime());
    const backup = await createBackup(0, fakeStorage());
    expect(backup.practiceDays).toEqual([{ day: '2026-10-03', count: 2 }]);
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok && parsed.backup.practiceDays).toEqual(backup.practiceDays);
  });

  it('keeps the larger count of a day when restoring (the same practice seen twice is not added up)', async () => {
    await recordPractice(new Date(2026, 9, 3, 12).getTime());
    const backup = await sampleBackup();
    const report = await restoreBackup(
      {
        ...backup,
        practiceDays: [
          { day: '2026-10-03', count: 4 },
          { day: '2026-10-02', count: 1 },
        ],
      },
      fakeStorage(),
      { mode: 'sync', silent: true }
    );
    expect(report.practiceDays).toEqual({ added: 1, replaced: 1 });
    expect(await exportPracticeDays()).toEqual(
      expect.arrayContaining([
        { day: '2026-10-03', count: 4 },
        { day: '2026-10-02', count: 1 },
      ])
    );
  });

  it('counts the days that are not valid with the unreadable items, and reads a format 7 file without any', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        format: 8,
        practiceDays: [
          { day: '2026-10-03', count: 1 },
          { day: 'hier', count: 1 },
        ],
      })
    );
    expect(parsed.ok && parsed.backup.practiceDays).toEqual([{ day: '2026-10-03', count: 1 }]);
    expect(parsed.ok && parsed.rejected.notes).toBe(1);
    const old = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 7, cards: [card('a')] }));
    expect(old.ok && old.backup.practiceDays).toEqual([]);
  });
});

describe('backup of the vision records', () => {
  it('holds the records and reads them back', async () => {
    await recordVisionRun('coordinates:white', 22, 1000);
    await recordVisionRun('blind:long', 4, 2000);
    const backup = await createBackup(0, fakeStorage());
    expect(backup.visionRecords).toEqual([
      { key: 'blind:long', best: 4, bestAt: 2000, runs: 1, history: [{ at: 2000, score: 4 }] },
      { key: 'coordinates:white', best: 22, bestAt: 1000, runs: 1, history: [{ at: 1000, score: 22 }] },
    ]);
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok && parsed.backup.visionRecords).toEqual(backup.visionRecords);
  });

  it('is a file worth restoring on its own, and counts the records that are not valid', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        format: 9,
        visionRecords: [
          { key: 'lines:short', best: 3, bestAt: 5, runs: 2 },
          { key: 'lines:short', best: -3, bestAt: 5, runs: 2 },
          'nope',
        ],
      })
    );
    expect(parsed.ok && parsed.backup.visionRecords).toEqual([{ key: 'lines:short', best: 3, bestAt: 5, runs: 2 }]);
    expect(parsed.ok && parsed.rejected.notes).toBe(2);
  });

  it('reads a file of format 8, which has no records', () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 8, cards: [card('a')] }));
    expect(parsed.ok && parsed.backup.visionRecords).toEqual([]);
  });

  it('refuses a file with too many records', () => {
    const records = Array.from({ length: 20_001 }, () => ({ key: 'blind:short', best: 1, bestAt: 1, runs: 1 }));
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 9, visionRecords: records })).ok).toBe(false);
  });

  it('keeps the better score of a record when restoring, in an import and in a sync', async () => {
    await recordVisionRun('coordinates:white', 20, 1000);
    const backup = await sampleBackup();
    const report = await restoreBackup(
      {
        ...backup,
        visionRecords: [
          { key: 'coordinates:white', best: 15, bestAt: 5, runs: 1 },
          { key: 'lines:long', best: 5, bestAt: 6, runs: 3 },
        ],
      },
      fakeStorage(),
      { mode: 'sync', silent: true }
    );
    expect(report.visionRecords).toEqual({ added: 1, replaced: 0 });
    expect(await exportVisionRecords()).toEqual([
      { key: 'coordinates:white', best: 20, bestAt: 1000, runs: 1, history: [{ at: 1000, score: 20 }] },
      { key: 'lines:long', best: 5, bestAt: 6, runs: 3 },
    ]);
  });

  it('keeps the rounds of both sides when restoring, and counts the record as changed for them alone', async () => {
    await recordVisionRun('coordinates:white', 20, 1000);
    const backup = await sampleBackup();
    const incoming = [{ key: 'coordinates:white', best: 15, bestAt: 500, runs: 2, history: [{ at: 500, score: 15 }] }];
    const report = await restoreBackup({ ...backup, visionRecords: incoming }, fakeStorage(), {
      mode: 'sync',
      silent: true,
    });
    expect(report.visionRecords).toEqual({ added: 0, replaced: 1 });
    expect(await exportVisionRecords()).toEqual([
      {
        key: 'coordinates:white',
        best: 20,
        bestAt: 1000,
        runs: 2,
        history: [
          { at: 500, score: 15 },
          { at: 1000, score: 20 },
        ],
      },
    ]);
    // The same copy again changes nothing
    const again = await restoreBackup({ ...backup, visionRecords: incoming }, fakeStorage(), {
      mode: 'sync',
      silent: true,
    });
    expect(again.visionRecords).toEqual({ added: 0, replaced: 0 });
  });

  it('keeps the rounds of a record in the file, and drops a record whose rounds are not valid', () => {
    const good = { key: 'game:club', best: 2, bestAt: 5, runs: 1, history: [{ at: 5, score: 2 }] };
    const bad = { key: 'game:expert', best: 2, bestAt: 5, runs: 1, history: [{ at: 5, score: 'win' }] };
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 9, visionRecords: [good, bad] }));
    expect(parsed.ok && parsed.backup.visionRecords).toEqual([good]);
    expect(parsed.ok && parsed.rejected.notes).toBe(1);
  });
});

describe('backup of the games played against the engine', () => {
  const finished = (now: number, ...moves: string[]) => {
    const played = replay(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moves.length ? moves : ['e2e4', 'e7e5']
    );
    return makePlayedGame({
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      prefix: [],
      label: 'Partie complète',
      moves: played.moves,
      outcome: { kind: 'resigned', winner: 'b' },
      color: 'w',
      level: { id: 'club', label: 'Club', elo: 1600 },
      userName: 'Alice',
      hints: 1,
      evals: 0,
      now,
    });
  };

  it('holds the games, the deleted ones as tombstones, and reads them back', async () => {
    const kept = finished(1000);
    const gone = finished(2000, 'd2d4', 'd7d5');
    await savePlayedGame(kept);
    await savePlayedGame(gone);
    await deletePlayedGames([gone.id], 3000);
    const backup = await createBackup(0, fakeStorage());
    expect(backup.playedGames.map((record) => record.id).sort()).toEqual([kept.id, gone.id].sort());
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok && parsed.backup.playedGames).toEqual(backup.playedGames);
  });

  it('is a file worth restoring on its own, and counts the records that are not valid', () => {
    const good = finished(1000);
    const parsed = parseBackup(
      JSON.stringify({ app: BACKUP_APP, format: 10, playedGames: [good, { ...good, id: 'x', result: '2-0' }, 'nope'] })
    );
    expect(parsed.ok && parsed.backup.playedGames).toEqual([good]);
    expect(parsed.ok && parsed.rejected.notes).toBe(2);
  });

  it('reads a file of format 9, which has none', () => {
    const parsed = parseBackup(JSON.stringify({ app: BACKUP_APP, format: 9, cards: [card('a')] }));
    expect(parsed.ok && parsed.backup.playedGames).toEqual([]);
  });

  it('restores the games, and a deletion made elsewhere wins over an older copy', async () => {
    const game = finished(1000);
    await savePlayedGame(game);
    const backup = await sampleBackup();
    const report = await restoreBackup(
      {
        ...backup,
        playedGames: [{ id: game.id, deleted: true, updatedAt: 5000 }, finished(2000, 'c2c4', 'e7e5')],
      },
      fakeStorage(),
      { mode: 'sync', silent: true }
    );
    expect(report.playedGames).toEqual({ added: 1, replaced: 1, kept: 0 });
    expect((await listPlayedGames()).map((g) => g.sans)).toEqual([['c4', 'e5']]);
    expect((await exportPlayedGames()).length).toBe(2);
  });
});
