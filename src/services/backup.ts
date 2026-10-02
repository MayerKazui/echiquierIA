import type { Card } from '../utils/spacedRepetition';
import {
  exportGames,
  isDeletion,
  isStoredGame,
  listDeletions,
  mergeGames,
  type Deletion,
  type MergeReport,
  type StoredGame,
} from './gameStore';
import {
  isStudy,
  isStudyDeletion,
  listStudies,
  listStudyDeletions,
  mergeStudies,
  type StudyDeletion,
  type StudyMergeReport,
} from './studyStore';
import type { Study } from '../types/study';
import { isPuzzleEntry, loadPuzzleEntries, mergePuzzleEntries, type PuzzleMergeReport } from './puzzleStore';
import { isCard, loadCards, mergeCards, type CardMergeReport } from './trainingStore';
import type { PuzzleEntry } from '../utils/puzzleReview';

/**
 * A backup of everything the app keeps in the browser, as one JSON file the player can save and bring back (a
 * cleared cache or another browser would otherwise lose the games, the training progress and the settings).
 *
 * The file holds the analysed games (as stored, light versions included), the training cards, the studies, the
 * missed puzzles and the settings; it does not hold the queue of a running batch analysis (it is transient). It is plain text: anyone who has it can
 * read the games and the pseudo.
 */

export const BACKUP_APP = 'echiquier-ia';
/**
 * 2 added the traces of deleted games (`deletions`). An application of format 1 refuses a format 2 file ("update
 * the application") instead of reading it without the deletions and sending them away.
 */
/**
 * 3 added the studies and the traces of deleted studies (`studies`, `studyDeletions`), for the same reason: an
 * application of format 2 would send back a copy without them and overwrite the studies kept in Drive.
 */
/**
 * 4 added the puzzles the player missed (`puzzles`), for the same reason: an application of format 3 would send back
 * a copy without them and overwrite the ones kept in Drive.
 */
export const BACKUP_FORMAT = 4;

/** The settings kept in the backup (localStorage keys): nothing else is read or written there. */
export const PREFERENCE_KEYS = [
  'chess_coach_user_pseudo',
  'chess_board_theme',
  'chess_sound_enabled',
  'chess_pause_on_errors',
  'chess_playback_speed',
  'chess_analysis_depth',
  'chess_import_source',
  'chess_import_user_chesscom',
  'chess_import_user_lichess',
  'chess_import_speed',
  'chess_batch_size',
  'chess_profile_window',
] as const;

/** A setting longer than this is not one the app wrote: it is ignored. */
const MAX_PREFERENCE_LENGTH = 500;
/** A backup larger than this (characters) is refused before it is read: it cannot be one. */
export const MAX_BACKUP_CHARS = 250_000_000;
/** A file claiming more items than this is refused. */
const MAX_ITEMS = 20_000;

/** Said by `parseBackup` for a file that is a backup but holds nothing. */
export const EMPTY_BACKUP_ERROR = 'Cette sauvegarde ne contient rien à restaurer.';

export interface Backup {
  app: typeof BACKUP_APP;
  format: typeof BACKUP_FORMAT;
  /** ISO date of the export. */
  exportedAt: string;
  games: StoredGame[];
  cards: Card[];
  /** Traces of the games deleted (empty in a format 1 file). */
  deletions: Deletion[];
  /** The studies, each one whole (empty before format 3). */
  studies: Study[];
  /** Traces of the studies deleted (empty before format 3). */
  studyDeletions: StudyDeletion[];
  /** The puzzles missed, each with its card of spaced repetition (empty before format 4). */
  puzzles: PuzzleEntry[];
  preferences: Record<string, string>;
}

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** The settings that are set, by key. */
export function readPreferences(storage: ReadableStorage | undefined = defaultStorage()): Record<string, string> {
  const preferences: Record<string, string> = {};
  for (const key of PREFERENCE_KEYS) {
    try {
      const value = storage?.getItem(key);
      if (typeof value === 'string' && value.length <= MAX_PREFERENCE_LENGTH) preferences[key] = value;
    } catch {
      // Storage unavailable: no settings in the backup
    }
  }
  return preferences;
}

/** Everything the app keeps, as a backup. */
export async function createBackup(
  now: number = Date.now(),
  storage: ReadableStorage | undefined = defaultStorage()
): Promise<Backup> {
  const [games, cards, deletions, studies, studyDeletions, puzzles] = await Promise.all([
    exportGames(),
    loadCards(),
    listDeletions(),
    listStudies(),
    listStudyDeletions(),
    loadPuzzleEntries(),
  ]);
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: new Date(now).toISOString(),
    games,
    cards: [...cards.values()],
    deletions,
    studies,
    studyDeletions,
    puzzles: [...puzzles.values()],
    preferences: readPreferences(storage),
  };
}

/** The text of the file. */
export const serializeBackup = (backup: Backup): string => JSON.stringify(backup);

/** `echiquier-ia-sauvegarde-2026-10-01.json` */
export function backupFileName(now: number = Date.now()): string {
  return `echiquier-ia-sauvegarde-${new Date(now).toISOString().slice(0, 10)}.json`;
}

export type ParsedBackup =
  | {
      ok: true;
      backup: Backup;
      /** Items of the file that were not valid (damaged, or from an older format): they are left out. */
      rejected: { games: number; cards: number; studies: number; puzzles: number };
    }
  | { ok: false; error: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Reads and checks the text of a backup file. A damaged item is left out and counted; a damaged file is refused. */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_CHARS)
    return { ok: false, error: 'Ce fichier est trop volumineux pour être une sauvegarde.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Ce fichier n'est pas un fichier JSON lisible." };
  }
  if (!isObject(data) || data.app !== BACKUP_APP) {
    return { ok: false, error: "Ce fichier n'est pas une sauvegarde d'Échiquier IA." };
  }
  if (typeof data.format !== 'number' || data.format < 1) {
    return { ok: false, error: "Ce fichier n'est pas une sauvegarde d'Échiquier IA." };
  }
  if (data.format > BACKUP_FORMAT) {
    return {
      ok: false,
      error: `Cette sauvegarde vient d'une version plus récente de l'application (format ${data.format}) : mettez l'application à jour.`,
    };
  }
  const games: unknown[] = Array.isArray(data.games) ? data.games : [];
  const cards: unknown[] = Array.isArray(data.cards) ? data.cards : [];
  const deletions: unknown[] = Array.isArray(data.deletions) ? data.deletions : [];
  const studies: unknown[] = Array.isArray(data.studies) ? data.studies : [];
  const studyDeletions: unknown[] = Array.isArray(data.studyDeletions) ? data.studyDeletions : [];
  const puzzles: unknown[] = Array.isArray(data.puzzles) ? data.puzzles : [];
  if (
    games.length > MAX_ITEMS ||
    cards.length > MAX_ITEMS ||
    deletions.length > MAX_ITEMS ||
    studies.length > MAX_ITEMS ||
    studyDeletions.length > MAX_ITEMS ||
    puzzles.length > MAX_ITEMS
  ) {
    return { ok: false, error: 'Cette sauvegarde contient trop de données pour être valide.' };
  }
  const validGames = games.filter(isStoredGame);
  const validCards = cards.filter(isCard);
  const validDeletions = deletions.filter(isDeletion);
  const validStudies = studies.filter(isStudy);
  const validStudyDeletions = studyDeletions.filter(isStudyDeletion);
  const validPuzzles = puzzles.filter(isPuzzleEntry);

  const preferences: Record<string, string> = {};
  if (isObject(data.preferences)) {
    for (const key of PREFERENCE_KEYS) {
      const value = data.preferences[key];
      if (typeof value === 'string' && value.length <= MAX_PREFERENCE_LENGTH) preferences[key] = value;
    }
  }

  if (
    validGames.length === 0 &&
    validCards.length === 0 &&
    validDeletions.length === 0 &&
    validStudies.length === 0 &&
    validStudyDeletions.length === 0 &&
    validPuzzles.length === 0 &&
    Object.keys(preferences).length === 0
  ) {
    return { ok: false, error: EMPTY_BACKUP_ERROR };
  }
  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      games: validGames,
      cards: validCards,
      deletions: validDeletions,
      studies: validStudies,
      studyDeletions: validStudyDeletions,
      puzzles: validPuzzles,
      preferences,
    },
    rejected: {
      games: games.length - validGames.length,
      cards: cards.length - validCards.length,
      studies: studies.length - validStudies.length,
      puzzles: puzzles.length - validPuzzles.length,
    },
  };
}

export interface RestoreReport {
  /** Null when the games could not be written (the browser refused the storage). */
  games: MergeReport | null;
  cards: CardMergeReport | null;
  /** Null when the studies could not be written. */
  studies: StudyMergeReport | null;
  /** Null when the missed puzzles could not be written. */
  puzzles: PuzzleMergeReport | null;
  /** Settings written: the ones the browser did not have yet (the settings chosen here are not overwritten). */
  preferencesApplied: number;
}

export interface RestoreOptions {
  /**
   * `import` (default): a file the user chose. It only adds: its games come back even if they were deleted here
   * since, and the deletions it records are not applied. `sync`: the copy kept in Drive. The deletions it records
   * are applied, and its games deleted here since are not taken back.
   */
  mode?: 'import' | 'sync';
  /** Do not tell the listeners of `onGamesChanged` (the sync itself restores, it must not trigger a sync). */
  silent?: boolean;
}

/** Puts a backup back into the browser, merging with what is there. */
export async function restoreBackup(
  backup: Backup,
  storage: WritableStorage | undefined = defaultStorage(),
  { mode = 'import', silent }: RestoreOptions = {}
): Promise<RestoreReport> {
  const [games, cards, studies, puzzles] = await Promise.all([
    mode === 'sync'
      ? mergeGames(backup.games, undefined, backup.deletions, { silent })
      : mergeGames(backup.games, undefined, [], { silent, override: true }),
    mergeCards(backup.cards),
    mode === 'sync'
      ? mergeStudies(backup.studies, backup.studyDeletions, { silent })
      : mergeStudies(backup.studies, [], { silent, override: true }),
    mergePuzzleEntries(backup.puzzles),
  ]);
  let preferencesApplied = 0;
  for (const key of PREFERENCE_KEYS) {
    const value = backup.preferences[key];
    if (value === undefined) continue;
    try {
      if (storage && storage.getItem(key) === null) {
        storage.setItem(key, value);
        preferencesApplied += 1;
      }
    } catch {
      // Storage unavailable or full: this setting is not restored
    }
  }
  return { games, cards, studies, puzzles, preferencesApplied };
}
