import {
  EMPTY_HISTORY,
  MAX_LOG,
  MAX_SEEN,
  MAX_SESSIONS,
  attemptKey,
  type PuzzleAttempt,
  type PuzzleHistory,
  type PuzzleSession,
  type SeenPuzzle,
} from '../utils/puzzleHistory';

/**
 * The history of the puzzles played (see `utils/puzzleHistory`), kept in the browser in its own IndexedDB database.
 * Best effort, like the other stores: when IndexedDB is unavailable every function resolves with "nothing stored"
 * instead of throwing.
 */

const DB_NAME = 'echiquier-ia-puzzle-history';
const SEEN = 'seen';
const LOG = 'log';
const SESSIONS = 'sessions';
type StoreName = typeof SEEN | typeof LOG | typeof SESSIONS;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      for (const name of [SEEN, LOG, SESSIONS]) request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked'));
  });
}

async function inTransaction<T>(
  mode: IDBTransactionMode,
  work: (stores: Record<StoreName, IDBObjectStore>, done: (value: T) => void) => void
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction([SEEN, LOG, SESSIONS], mode);
      let value: T | undefined;
      work({ seen: tx.objectStore(SEEN), log: tx.objectStore(LOG), sessions: tx.objectStore(SESSIONS) }, (v) => {
        value = v;
      });
      tx.oncomplete = () => resolve(value as T);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function isSeenPuzzle(value: unknown): value is SeenPuzzle {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    isCount(value.plays) &&
    isCount(value.wins) &&
    value.wins <= value.plays &&
    isTime(value.lastAt)
  );
}

export function isPuzzleAttempt(value: unknown): value is PuzzleAttempt {
  return (
    isObject(value) &&
    isTime(value.at) &&
    typeof value.id === 'string' &&
    typeof value.ok === 'boolean' &&
    isTime(value.rating) &&
    Array.isArray(value.themes) &&
    value.themes.every((theme) => typeof theme === 'string')
  );
}

export function isPuzzleSession(value: unknown): value is PuzzleSession {
  return (
    isObject(value) &&
    isTime(value.at) &&
    (value.mode === 'free' || value.mode === 'review') &&
    isCount(value.solved) &&
    isCount(value.total) &&
    value.solved <= value.total &&
    isCount(value.elapsedMs) &&
    (value.minutes === null || isCount(value.minutes))
  );
}

/** Deletes the oldest records of a store keyed in chronological order, down to `max`. */
function trimOldest(store: IDBObjectStore, max: number): void {
  const count = store.count();
  count.onsuccess = () => {
    let extra = count.result - max;
    if (extra <= 0) return;
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current || extra <= 0) return;
      current.delete();
      extra -= 1;
      current.continue();
    };
  };
}

/** Forgets the puzzles played longest ago, down to `max`. */
function trimSeen(store: IDBObjectStore, max: number): void {
  const count = store.count();
  count.onsuccess = () => {
    const extra = count.result - max;
    if (extra <= 0) return;
    const all = store.getAll();
    all.onsuccess = () => {
      const oldest = (all.result as SeenPuzzle[]).sort((a, b) => a.lastAt - b.lastAt).slice(0, extra);
      for (const { id } of oldest) store.delete(id);
    };
  };
}

/** Everything that is kept, the records that cannot be read left out. */
export async function loadPuzzleHistory(): Promise<PuzzleHistory> {
  try {
    return await inTransaction<PuzzleHistory>('readonly', (stores, done) => {
      const seen = stores.seen.getAll();
      const log = stores.log.getAll();
      const sessions = stores.sessions.getAll();
      sessions.onsuccess = () =>
        done({
          seen: new Map((seen.result as unknown[]).filter(isSeenPuzzle).map((s) => [s.id, s])),
          log: (log.result as unknown[]).filter(isPuzzleAttempt).slice(-MAX_LOG),
          sessions: (sessions.result as unknown[]).filter(isPuzzleSession).slice(-MAX_SESSIONS),
        });
    });
  } catch (err) {
    console.warn('Could not read the history of the puzzles:', err);
    return EMPTY_HISTORY;
  }
}

/** Keeps one puzzle played: its record and the attempt. Resolves with false when it could not be written. */
export async function savePuzzleAttempt(seen: SeenPuzzle, attempt: PuzzleAttempt): Promise<boolean> {
  try {
    await inTransaction<void>('readwrite', (stores) => {
      stores.seen.put(seen, seen.id);
      stores.log.put(attempt, attemptKey(attempt));
      trimOldest(stores.log, MAX_LOG);
      trimSeen(stores.seen, MAX_SEEN);
    });
    return true;
  } catch (err) {
    console.warn('Could not save the puzzle played:', err);
    return false;
  }
}

export async function savePuzzleSession(session: PuzzleSession): Promise<boolean> {
  try {
    await inTransaction<void>('readwrite', (stores) => {
      stores.sessions.put(session, session.at);
      trimOldest(stores.sessions, MAX_SESSIONS);
    });
    return true;
  } catch (err) {
    console.warn('Could not save the puzzle session:', err);
    return false;
  }
}

export interface PuzzleHistoryMergeReport {
  /** Records the browser did not have (a puzzle played further along there counts as replaced, not added). */
  added: number;
}

/** What a backup holds of the history. */
export interface PuzzleHistoryData {
  seen: SeenPuzzle[];
  log: PuzzleAttempt[];
  sessions: PuzzleSession[];
}

export const isHistoryEmpty = (data: PuzzleHistoryData): boolean =>
  data.seen.length === 0 && data.log.length === 0 && data.sessions.length === 0;

/** The history as a backup holds it. */
export async function exportPuzzleHistory(): Promise<PuzzleHistoryData> {
  const history = await loadPuzzleHistory();
  return { seen: [...history.seen.values()], log: [...history.log], sessions: [...history.sessions] };
}

/**
 * Adds the history of a backup to the one here: the attempts and the sessions are united (each counts once), a puzzle
 * played at both places keeps the record of the one played last. The caps are applied after. Resolves with null when
 * it could not be written (nothing is then changed).
 */
export async function mergePuzzleHistory(incoming: PuzzleHistoryData): Promise<PuzzleHistoryMergeReport | null> {
  // A record twice in the file counts once
  const seen = [...new Map(incoming.seen.filter(isSeenPuzzle).map((s) => [s.id, s])).values()];
  const log = [...new Map(incoming.log.filter(isPuzzleAttempt).map((a) => [attemptKey(a), a])).values()];
  const sessions = [...new Map(incoming.sessions.filter(isPuzzleSession).map((s) => [s.at, s])).values()];
  const report: PuzzleHistoryMergeReport = { added: 0 };
  if (seen.length + log.length + sessions.length === 0) return report;
  try {
    await inTransaction<void>('readwrite', (stores) => {
      for (const record of seen) {
        const request = stores.seen.get(record.id);
        request.onsuccess = () => {
          const existing: unknown = request.result;
          if (!isSeenPuzzle(existing)) {
            stores.seen.put(record, record.id);
            report.added += 1;
          } else if (record.lastAt > existing.lastAt) {
            stores.seen.put(record, record.id);
          }
        };
      }
      for (const attempt of log) {
        const key = attemptKey(attempt);
        const request = stores.log.count(key);
        request.onsuccess = () => {
          if (request.result === 0) {
            stores.log.put(attempt, key);
            report.added += 1;
          }
        };
      }
      for (const session of sessions) {
        const request = stores.sessions.count(session.at);
        request.onsuccess = () => {
          if (request.result === 0) {
            stores.sessions.put(session, session.at);
            report.added += 1;
          }
        };
      }
      // These count before the writes above land: a merge that goes over a cap is trimmed by the next write
      trimOldest(stores.log, MAX_LOG);
      trimOldest(stores.sessions, MAX_SESSIONS);
      trimSeen(stores.seen, MAX_SEEN);
    });
    return report;
  } catch (err) {
    console.warn('Could not restore the history of the puzzles:', err);
    return null;
  }
}
