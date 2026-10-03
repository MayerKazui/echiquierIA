import { Chess } from 'chess.js';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { FAULT_KINDS_VERSION, withFaultKinds, withFaultKindsSliced } from '../utils/faultKinds';
import { computePlayerStats } from '../utils/moveAnalysis';

/**
 * Analysed games kept in the browser (IndexedDB), so that reloading the page or analysing the same PGN again
 * does not run Stockfish a second time. Everything here is best effort: when IndexedDB is unavailable (private
 * mode, blocked storage, quota) every function resolves with "nothing stored" instead of throwing.
 */

export interface StoredGame {
  id: string;
  /** PGN as it was analysed. */
  pgn: string;
  /** Stockfish search depth of the analysis. */
  depth: number;
  savedAt: number;
  schemaVersion: number;
  /**
   * `summary`: an old game, reduced to what the statistics need (see `toSummary`); it cannot be shown on the board
   * again without analysing it anew. Absent or `full`: the complete analysis.
   */
  detail?: 'full' | 'summary';
  result: GameAnalysisResult;
}

export const isFullGame = (game: Pick<StoredGame, 'detail'>): boolean => game.detail !== 'summary';

const DB_NAME = 'echiquier-ia';
const STORE = 'games';
const SAVED_AT_INDEX = 'savedAt';
/** Traces of the games the user deleted (see `Deletion`). Added in version 2 of the database. */
const DELETIONS = 'deletions';
const DELETED_AT_INDEX = 'deletedAt';
const DB_VERSION = 2;
/** Bump when `GameAnalysisResult` changes shape: older entries are then ignored (and replaced on the next save). */
export const SCHEMA_VERSION = 1;
/** Number of games kept; the least recently saved ones are dropped first. */
export const MAX_GAMES = 500;
/**
 * Number of most recent games kept with their complete analysis. The older ones are reduced to a summary (about a
 * third lighter: no variations, no AI explanations, positions only before a fault), which bounds what a long
 * history keeps and leaves the statistics, the evaluations and the faults.
 */
export const MAX_FULL_GAMES = 50;
/** Traces of deleted games kept (a few dozen bytes each); the oldest are forgotten beyond this. */
export const MAX_DELETIONS = 5000;

/**
 * The trace of a game the user deleted. It lets a deletion reach the other devices of a synced history: a game
 * saved at or before `deletedAt` is dropped wherever it turns up, a game saved after (analysed again) stays.
 */
export interface Deletion {
  id: string;
  deletedAt: number;
}

export const isDeletion = (value: unknown): value is Deletion =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Deletion).id === 'string' &&
  (value as Deletion).id !== '' &&
  typeof (value as Deletion).deletedAt === 'number' &&
  Number.isFinite((value as Deletion).deletedAt);

type Listener = () => void;
const changeListeners = new Set<Listener>();

/** Calls `listener` after the games were added, replaced or deleted here (not for a silent restore). */
export function onGamesChanged(listener: Listener): () => void {
  changeListeners.add(listener);
  return () => void changeListeners.delete(listener);
}

function notifyGamesChanged(): void {
  for (const listener of [...changeListeners]) {
    try {
      listener();
    } catch (err) {
      console.warn('A listener of the games failed:', err);
    }
  }
}

/** Same game whatever the line endings or the spacing of the pasted text. */
export function normalizePgn(pgn: string): string {
  return pgn
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/[ \t]+/g, ' ');
}

/** Short stable key for a PGN (cyrb53 hash of the normalised text). */
export function gameId(pgn: string): string {
  const text = normalizePgn(pgn);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Cheap structural check: stored data can come from an older or damaged version of the app. */
export function isStoredGame(value: unknown): value is StoredGame {
  if (!isObject(value) || value.schemaVersion !== SCHEMA_VERSION) return false;
  if (typeof value.id !== 'string' || typeof value.pgn !== 'string') return false;
  if (typeof value.depth !== 'number' || typeof value.savedAt !== 'number') return false;
  const result = value.result;
  if (!isObject(result) || !isObject(result.metadata) || !isObject(result.statsWhite) || !isObject(result.statsBlack)) {
    return false;
  }
  if (value.detail !== undefined && value.detail !== 'full' && value.detail !== 'summary') return false;
  const moves = result.moves;
  if (!Array.isArray(moves) || moves.length === 0) return false;
  const first: unknown = moves[0];
  return isObject(first) && typeof first.san === 'string' && typeof first.fenBefore === 'string';
}

const FAULTS: ReadonlySet<MoveAnalysis['classification']> = new Set(['mistake', 'blunder', 'missedWin']);

/**
 * An old game reduced to what the statistics need: each move keeps its evaluations, classification, clock and best
 * move; the positions (the two FEN strings, kept only before a fault, to be able to replay it), the variation and
 * the AI explanations are dropped.
 */
export function toSummary(game: StoredGame): StoredGame {
  const moves = game.result.moves.map((move) => {
    const light: MoveAnalysis = {
      ...move,
      fenBefore: FAULTS.has(move.classification) ? move.fenBefore : '',
      fenAfter: '',
      pv: [],
    };
    delete light.aiExplanation;
    return light;
  });
  return { ...game, detail: 'summary', result: { ...game.result, moves } };
}

/**
 * The engine's best move as English SAN, rebuilt from its UCI move. Games saved by an earlier version
 * kept it in French ("Cf3"), which then did not match the played move ("Nf3").
 */
function bestMoveInEnglish(move: MoveAnalysis): string {
  const uci = move.bestMoveUci;
  // Cheap test first: only a move starting with D, T, F, C (or R: a king in French) can be in French
  if (!/^[DTFCR]|=[DTFC]/.test(move.bestMoveSan ?? '') || !uci || uci.length < 4) return move.bestMoveSan;
  try {
    const played = new Chess(move.fenBefore).move({
      from: uci.substring(0, 2),
      to: uci.substring(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return played.san;
  } catch {
    return move.bestMoveSan;
  }
}

/**
 * Brings a stored game up to date when it is read: the statistics are recomputed from the moves (a change
 * in the way they are computed must not leave the old values) and the best moves are written in English SAN.
 */
function withFreshStats(game: StoredGame): StoredGame {
  const moves = game.result.moves.map((m) => ({ ...m, bestMoveSan: bestMoveInEnglish(m) }));
  return {
    ...game,
    result: {
      ...game.result,
      moves,
      statsWhite: computePlayerStats(moves.filter((m) => m.color === 'w')),
      statsBlack: computePlayerStats(moves.filter((m) => m.color === 'b')),
    },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex(SAVED_AT_INDEX, 'savedAt');
      }
      if (!db.objectStoreNames.contains(DELETIONS)) {
        db.createObjectStore(DELETIONS, { keyPath: 'id' }).createIndex(DELETED_AT_INDEX, 'deletedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked'));
  });
}

/** Runs `work` in a transaction and resolves once the transaction has been committed. */
async function inTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, done: (value: T) => void, deletions: IDBObjectStore) => void
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction([STORE, DELETIONS], mode);
      let value: T | undefined;
      work(
        tx.objectStore(STORE),
        (v) => {
          value = v;
        },
        tx.objectStore(DELETIONS)
      );
      tx.oncomplete = () => resolve(value as T);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

/**
 * Reduces to a summary the games that are older than the `keepFull` most recent ones, then calls `done`. After a
 * `saveGame` the games beyond the recent ones are already summaries from the first one on (`isSorted`), so the
 * walk stops there; after a bulk write nothing is known of the order, and the walk goes to the end.
 */
function compactOld(store: IDBObjectStore, keepFull: number, done: () => void, isSorted = true): void {
  const request = store.index(SAVED_AT_INDEX).openCursor(null, 'prev');
  let skipped = false;
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return done();
    if (!skipped) {
      skipped = true;
      cursor.advance(keepFull); // the most recent ones stay as they are
      return;
    }
    // Every write goes through `saveGame`, so what is beyond the recent ones is already a summary from the first
    // summary on: there is no need to read the whole history at each save
    if (!isStoredGame(cursor.value) || !isFullGame(cursor.value)) {
      if (isSorted) return done();
    } else {
      cursor.update(toSummary(cursor.value));
    }
    cursor.continue();
  };
}

/** Drops the `excess` least recently saved games. */
function dropOldest(store: IDBObjectStore, excess: number): void {
  let left = excess;
  // Oldest first: the index is ordered by savedAt
  const cursor = store.index(SAVED_AT_INDEX).openKeyCursor();
  cursor.onsuccess = () => {
    const current = cursor.result;
    if (!current || left <= 0) return;
    store.delete(current.primaryKey);
    left -= 1;
    current.continue();
  };
}

/** Forgets the oldest traces of deletions beyond `MAX_DELETIONS`. */
function pruneDeletions(deletions: IDBObjectStore): void {
  const count = deletions.count();
  count.onsuccess = () => {
    let left = count.result - MAX_DELETIONS;
    if (left <= 0) return;
    const cursor = deletions.index(DELETED_AT_INDEX).openKeyCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current || left <= 0) return;
      deletions.delete(current.primaryKey);
      left -= 1;
      current.continue();
    };
  };
}

/**
 * The result with the kind of each of the user's faults filled in (the profile counts them), if the side is known.
 * A result stamped with older rules (`faultKindsVersion`) is classified again and stamped with the current ones. A
 * result that carries kinds but no stamp comes from an older version of the app: its kinds are kept as they are, and
 * left unstamped so that `reclassifyStoredGames` redoes them.
 */
function withKinds(result: GameAnalysisResult): GameAnalysisResult {
  const color = result.userColor;
  if (color !== 'w' && color !== 'b') return result;
  const stamp = result.faultKindsVersion;
  const hasKinds = result.moves.some((m) => m.color === color && m.faultKind);
  const isStale = stamp !== undefined && stamp !== FAULT_KINDS_VERSION;
  const moves = withFaultKinds(result.moves, color, isStale);
  const isCurrent = stamp === FAULT_KINDS_VERSION || isStale || !hasKinds;
  if (moves === result.moves && (stamp === FAULT_KINDS_VERSION || !isCurrent)) return result;
  return { ...result, moves, ...(isCurrent && { faultKindsVersion: FAULT_KINDS_VERSION }) };
}

/** How many games are kept complete, and how many in all (the defaults are the app's; tests use smaller ones). */
export interface StoreLimits {
  full: number;
  total: number;
}
const DEFAULT_LIMITS: StoreLimits = { full: MAX_FULL_GAMES, total: MAX_GAMES };

/**
 * Saves (or replaces) an analysed game. Beyond the `MAX_FULL_GAMES` most recent ones the games are reduced to a
 * summary, and beyond `MAX_GAMES` the oldest are dropped.
 */
export async function saveGame(
  game: { pgn: string; depth: number; result: GameAnalysisResult },
  limits: StoreLimits = DEFAULT_LIMITS
): Promise<void> {
  const record: StoredGame = {
    id: gameId(game.pgn),
    pgn: normalizePgn(game.pgn),
    depth: game.depth,
    savedAt: Date.now(),
    schemaVersion: SCHEMA_VERSION,
    detail: 'full',
    result: withKinds(game.result),
  };
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.put(record);
      const count = store.count();
      count.onsuccess = () => {
        const total = count.result;
        if (total <= limits.full) return;
        compactOld(store, limits.full, () => {
          if (total > limits.total) dropOldest(store, total - limits.total);
        });
      };
    });
    notifyGamesChanged();
  } catch (err) {
    console.warn('Could not save the analysed game:', err);
  }
}

/** The stored analysis of exactly this PGN (ignoring spacing), or null. */
export async function loadGame(pgn: string): Promise<StoredGame | null> {
  try {
    const found = await inTransaction<unknown>('readonly', (store, done) => {
      const request = store.get(gameId(pgn));
      request.onsuccess = () => done(request.result);
    });
    return isStoredGame(found) && found.pgn === normalizePgn(pgn) ? withFreshStats(found) : null;
  } catch (err) {
    console.warn('Could not read the analysed game:', err);
    return null;
  }
}

/** The stored game with this id (what a training position names), or null. */
export async function loadGameById(id: string): Promise<StoredGame | null> {
  try {
    const found = await inTransaction<unknown>('readonly', (store, done) => {
      const request = store.get(id);
      request.onsuccess = () => done(request.result);
    });
    return isStoredGame(found) && found.id === id ? withFreshStats(found) : null;
  } catch (err) {
    console.warn('Could not read the stored game:', err);
    return null;
  }
}

/** The most recently saved game that is still readable and complete (a summary cannot be shown), or null. */
export async function loadLatestGame(): Promise<StoredGame | null> {
  try {
    return await inTransaction<StoredGame | null>('readonly', (store, done) => {
      done(null);
      const cursor = store.index(SAVED_AT_INDEX).openCursor(null, 'prev');
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        if (isStoredGame(current.value) && isFullGame(current.value)) done(withFreshStats(current.value));
        else current.continue(); // Skip summaries, entries from an older schema and damaged ones
      };
    });
  } catch (err) {
    console.warn('Could not read the latest analysed game:', err);
    return null;
  }
}

/** The moment a game is deleted: now, but never before the game itself was saved (a clock set back). */
const deletionTime = (savedAt: unknown): number =>
  typeof savedAt === 'number' && Number.isFinite(savedAt) ? Math.max(Date.now(), savedAt) : Date.now();

/** Removes every stored game (leaving a trace of each, so that a synced history loses them too). */
export async function clearGames(): Promise<void> {
  try {
    await inTransaction<void>('readwrite', (store, _done, deletions) => {
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) {
          store.clear();
          pruneDeletions(deletions);
          return;
        }
        const value: unknown = current.value;
        const savedAt = typeof value === 'object' && value !== null ? (value as { savedAt?: unknown }).savedAt : 0;
        deletions.put({ id: String(current.primaryKey), deletedAt: deletionTime(savedAt) });
        current.continue();
      };
    });
    notifyGamesChanged();
  } catch (err) {
    console.warn('Could not clear the stored games:', err);
  }
}

/** Every readable stored game, the most recently saved first (older formats and damaged entries are left out). */
export async function listGames(): Promise<StoredGame[]> {
  try {
    return await inTransaction<StoredGame[]>('readonly', (store, done) => {
      const games: StoredGame[] = [];
      done(games);
      const cursor = store.index(SAVED_AT_INDEX).openCursor(null, 'prev');
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        if (isStoredGame(current.value)) games.push(withFreshStats(current.value));
        current.continue();
      };
    });
  } catch (err) {
    console.warn('Could not list the analysed games:', err);
    return [];
  }
}

/** Keys (`gameId`) of every stored game: cheap, nothing is read but the keys. Empty when storage is unavailable. */
export async function listGameIds(): Promise<Set<string>> {
  try {
    return await inTransaction<Set<string>>('readonly', (store, done) => {
      const request = store.getAllKeys();
      request.onsuccess = () => done(new Set(request.result.map(String)));
    });
  } catch (err) {
    console.warn('Could not list the analysed games:', err);
    return new Set();
  }
}

/** Every stored game as it is kept (nothing recomputed), the most recently saved first: for a backup. */
export async function exportGames(): Promise<StoredGame[]> {
  try {
    return await inTransaction<StoredGame[]>('readonly', (store, done) => {
      const games: StoredGame[] = [];
      done(games);
      const cursor = store.index(SAVED_AT_INDEX).openCursor(null, 'prev');
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        if (isStoredGame(current.value)) games.push(current.value);
        current.continue();
      };
    });
  } catch (err) {
    console.warn('Could not read the games for a backup:', err);
    return [];
  }
}

export interface MergeReport {
  /** Games that were not there. */
  added: number;
  /** Games replaced by a more recent version of the same game. */
  replaced: number;
  /** Games already there that are as recent or more. */
  kept: number;
  /** Oldest games dropped to stay within the limit. */
  trimmed: number;
  /** Games removed here because they were deleted elsewhere. */
  deleted: number;
}

export interface MergeOptions {
  /** Do not tell the listeners of `onGamesChanged` (the sync itself restores, it must not trigger a sync). */
  silent?: boolean;
  /**
   * The games come back whatever the traces of deletions here say (a backup file the user chose to import after
   * deleting games): one that a trace covers is saved again, just after the deletion, so that it wins elsewhere too.
   */
  override?: boolean;
}

/** Whether `incoming` should replace `existing`: it was saved later, or at the same time but is the complete one. */
const isNewer = (incoming: StoredGame, existing: StoredGame): boolean =>
  incoming.savedAt > existing.savedAt ||
  (incoming.savedAt === existing.savedAt && isFullGame(incoming) && !isFullGame(existing));

/**
 * Adds games to the history (a backup being restored): a game already there is replaced only by a more recent
 * version of it. `deletions` (traces of games deleted elsewhere) are kept, remove the games here saved at or before
 * the deletion, and keep such games out of `records`. The limits then apply as after a save. Resolves with null
 * when it could not be written (nothing is then changed).
 */
export async function mergeGames(
  records: StoredGame[],
  limits: StoreLimits = DEFAULT_LIMITS,
  deletions: Deletion[] = [],
  options: MergeOptions = {}
): Promise<MergeReport | null> {
  // A game twice in the file counts once: the most recent version
  const latest = new Map<string, StoredGame>();
  for (const record of records) {
    const known = latest.get(record.id);
    if (isStoredGame(record) && (!known || isNewer(record, known))) latest.set(record.id, record);
  }
  const valid = [...latest.values()];
  // A deletion twice counts once: the latest
  const incomingDeletions = new Map<string, number>();
  for (const deletion of deletions) {
    if (isDeletion(deletion) && deletion.deletedAt > (incomingDeletions.get(deletion.id) ?? -Infinity)) {
      incomingDeletions.set(deletion.id, deletion.deletedAt);
    }
  }
  const report: MergeReport = { added: 0, replaced: 0, kept: 0, trimmed: 0, deleted: 0 };
  let tracesChanged = false;
  try {
    await inTransaction<void>('readwrite', (store, _done, deletionStore) => {
      const traces = deletionStore.getAll();
      traces.onsuccess = () => {
        const known = new Map<string, number>();
        for (const trace of traces.result as unknown[]) if (isDeletion(trace)) known.set(trace.id, trace.deletedAt);
        // The traces this browser did not have yet (or only older ones)
        const fresh: Deletion[] = [];
        for (const [id, deletedAt] of incomingDeletions) {
          const had = known.get(id);
          if (had === undefined || deletedAt > had) {
            fresh.push({ id, deletedAt });
            known.set(id, deletedAt);
          }
        }
        for (const trace of fresh) deletionStore.put(trace);
        if (fresh.length > 0) {
          tracesChanged = true;
          pruneDeletions(deletionStore);
        }
        // A game deleted after it was saved is not taken (unless the user asked for a restore)
        const covered = (record: StoredGame) => {
          const deletedAt = known.get(record.id);
          return deletedAt !== undefined && record.savedAt <= deletedAt;
        };
        let toMerge: StoredGame[];
        if (options.override) {
          // The games a trace covers are saved again just after their deletion (they would be deleted again at the
          // next sync otherwise), keeping their order among themselves
          const blocked = valid.filter(covered);
          const base = Math.max(...blocked.map((record) => known.get(record.id) ?? 0)) + 1;
          const origin = Math.min(...blocked.map((record) => record.savedAt));
          toMerge = valid.map((record) =>
            covered(record) ? { ...record, savedAt: base + (record.savedAt - origin) } : record
          );
        } else {
          toMerge = valid.filter((record) => !covered(record));
        }

        let pending = toMerge.length + fresh.length;
        const finish = () => {
          const count = store.count();
          count.onsuccess = () => {
            const total = count.result;
            const trim = () => {
              if (total <= limits.total) return;
              report.trimmed = total - limits.total;
              dropOldest(store, report.trimmed);
            };
            if (total <= limits.full) return trim();
            compactOld(store, limits.full, trim, false);
          };
        };
        const settled = () => {
          pending -= 1;
          if (pending === 0) finish();
        };
        if (pending === 0) return finish();

        for (const trace of fresh) {
          const request = store.get(trace.id);
          request.onsuccess = () => {
            const existing: unknown = request.result;
            if (existing !== undefined) {
              const savedAt = (existing as { savedAt?: unknown }).savedAt;
              if (typeof savedAt !== 'number' || savedAt <= trace.deletedAt) {
                store.delete(trace.id);
                report.deleted += 1;
              }
            }
            settled();
          };
        }
        for (const record of toMerge) {
          const request = store.get(record.id);
          request.onsuccess = () => {
            const existing: unknown = request.result;
            if (!isStoredGame(existing)) {
              store.put(record);
              report.added += 1;
            } else if (isNewer(record, existing)) {
              store.put(record);
              report.replaced += 1;
            } else {
              report.kept += 1;
            }
            settled();
          };
        }
      };
    });
    if (!options.silent && (report.added + report.replaced + report.deleted > 0 || tracesChanged)) {
      notifyGamesChanged();
    }
    return report;
  } catch (err) {
    console.warn('Could not restore the games:', err);
    return null;
  }
}

/** Every trace of a deleted game, for a backup. Empty when storage is unavailable. */
export async function listDeletions(): Promise<Deletion[]> {
  try {
    return await inTransaction<Deletion[]>('readonly', (_store, done, deletions) => {
      const request = deletions.getAll();
      request.onsuccess = () => done((request.result as unknown[]).filter(isDeletion));
    });
  } catch (err) {
    console.warn('Could not read the deleted games:', err);
    return [];
  }
}

/** Removes one stored game, leaving a trace of it (nothing happens if it is not there). */
export async function deleteGame(id: string): Promise<void> {
  try {
    const wasThere = await inTransaction<boolean>('readwrite', (store, done, deletions) => {
      done(false);
      const request = store.get(id);
      request.onsuccess = () => {
        const existing: unknown = request.result;
        if (existing === undefined) return;
        const savedAt =
          typeof existing === 'object' && existing !== null ? (existing as { savedAt?: unknown }).savedAt : 0;
        deletions.put({ id, deletedAt: deletionTime(savedAt) });
        store.delete(id);
        pruneDeletions(deletions);
        done(true);
      };
    });
    if (wasThere) notifyGamesChanged();
  } catch (err) {
    console.warn('Could not delete the analysed game:', err);
  }
}

/** Ids of the games whose faults were classified under older rules, the most recently saved first. */
async function gamesToReclassify(): Promise<string[]> {
  return inTransaction<string[]>('readonly', (store, done) => {
    const ids: string[] = [];
    done(ids);
    const cursor = store.index(SAVED_AT_INDEX).openCursor(null, 'prev');
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      const value: unknown = current.value;
      if (isStoredGame(value) && isOutdatedKinds(value)) ids.push(value.id);
      current.continue();
    };
  });
}

const isOutdatedKinds = (game: StoredGame) =>
  (game.result.userColor === 'w' || game.result.userColor === 'b') &&
  game.result.faultKindsVersion !== FAULT_KINDS_VERSION;

let reclassifying: Promise<number> | null = null;

/**
 * Classifies again the faults of the stored games whose kinds come from older rules (see `FAULT_KINDS_VERSION`), the
 * most recent games first. It is slow (a few tens of ms per fault), so it is cut into short slices, and each game
 * is written back as soon as it is done, with its date unchanged: it is derived data, not a new save, and it does
 * not make the other devices of a synced history see a newer game. A game saved meanwhile is left as it is.
 * Resolves with the number of games upgraded; only one run goes on at a time.
 */
export function reclassifyStoredGames(options: { yieldToUi?: () => Promise<void> } = {}): Promise<number> {
  reclassifying ??= (async () => {
    let upgraded = 0;
    try {
      for (const id of await gamesToReclassify()) {
        const record = await inTransaction<unknown>('readonly', (store, done) => {
          const request = store.get(id);
          request.onsuccess = () => done(request.result);
        });
        if (!isStoredGame(record) || !isOutdatedKinds(record)) continue;
        const moves = await withFaultKindsSliced(record.result.moves, record.result.userColor as 'w' | 'b', options);
        await inTransaction<void>('readwrite', (store) => {
          const request = store.get(id);
          request.onsuccess = () => {
            const current: unknown = request.result;
            if (!isStoredGame(current) || current.savedAt !== record.savedAt) return;
            store.put({ ...current, result: { ...current.result, moves, faultKindsVersion: FAULT_KINDS_VERSION } });
            upgraded += 1;
          };
        });
      }
    } catch (err) {
      console.warn('Could not classify the faults of the stored games again:', err);
    } finally {
      reclassifying = null;
    }
    return upgraded;
  })();
  return reclassifying;
}
