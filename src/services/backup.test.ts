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
import { loadCards, saveCard } from './trainingStore';
import { deleteStudy, listStudies, listStudyDeletions, saveStudy, STUDY_SCHEMA_VERSION } from './studyStore';
import { createChapter } from '../utils/studyTree';
import type { Study } from '../types/study';

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

  it('is of format 3', () => {
    expect(BACKUP_FORMAT).toBe(3);
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
    expect(parsed.rejected).toEqual({ games: 0, cards: 0, studies: 0 });
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
    expect(parsed.rejected).toEqual({ games: 2, cards: 3, studies: 0 });
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
      preferences: {},
    };
    const report = await restoreBackup(backup, fakeStorage(), { mode: 'sync', silent: true });
    expect(report.studies).toMatchObject({ added: 0, deleted: 1 });
    expect(await listStudies()).toEqual([]);
    expect((await listStudyDeletions()).map((d) => d.id).sort()).toEqual(['deleted-here', 'here']);
  });
});
