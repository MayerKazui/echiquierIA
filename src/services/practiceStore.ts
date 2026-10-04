import { MAX_PRACTICE_DAYS, dayKey, isPracticeDay, type PracticeDay } from '../utils/practiceDays';

/**
 * The days the player practised and how many times (see `utils/practiceDays`), kept in the browser in their own
 * IndexedDB database: they ride along in the backups as `practiceDays`. Best effort, like the other stores: when
 * IndexedDB is unavailable every function resolves with "nothing stored" instead of throwing.
 */

const DB_NAME = 'echiquier-ia-practice';
const STORE = 'days';

type Listener = () => void;
const changeListeners = new Set<Listener>();

/** Calls `listener` after something was practised here (not for a silent restore). */
export function onPracticeChanged(listener: Listener): () => void {
  changeListeners.add(listener);
  return () => void changeListeners.delete(listener);
}

function notifyPracticeChanged(): void {
  for (const listener of [...changeListeners]) {
    try {
      listener();
    } catch (err) {
      console.warn('A listener of the practice failed:', err);
    }
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'day' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked'));
  });
}

async function inTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, done: (value: T) => void) => void
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let value: T | undefined;
      work(tx.objectStore(STORE), (v) => {
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

/** Forgets the oldest days beyond `MAX_PRACTICE_DAYS` (the keys are `yyyy-mm-dd`, so they sort by date). */
function pruneOldest(store: IDBObjectStore): void {
  const count = store.count();
  count.onsuccess = () => {
    let extra = count.result - MAX_PRACTICE_DAYS;
    if (extra <= 0) return;
    const cursor = store.openKeyCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current || extra <= 0) return;
      store.delete(current.primaryKey);
      extra -= 1;
      current.continue();
    };
  };
}

/** Every day practised, for the calendar and for a backup. */
export async function exportPracticeDays(): Promise<PracticeDay[]> {
  try {
    return await inTransaction<PracticeDay[]>('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done((request.result as unknown[]).filter(isPracticeDay));
    });
  } catch (err) {
    console.warn('Could not read the days practised:', err);
    return [];
  }
}

/** Notes one more thing practised at `now` (a position replayed, a puzzle played). Never rejects. */
export async function recordPractice(now: number = Date.now()): Promise<void> {
  const day = dayKey(now);
  try {
    await inTransaction<void>('readwrite', (store) => {
      const request = store.get(day);
      request.onsuccess = () => {
        const existing: unknown = request.result;
        const count = isPracticeDay(existing) ? existing.count + 1 : 1;
        store.put({ day, count });
        if (count === 1) pruneOldest(store);
      };
    });
    notifyPracticeChanged();
  } catch (err) {
    console.warn('Could not note the practice:', err);
  }
}

export interface PracticeMergeReport {
  added: number;
  /** Days where the copy had more practice than here. */
  replaced: number;
}

/**
 * Adds days (a backup being restored): a day known on both sides keeps the larger count (the same practice seen
 * twice must not be added up). Resolves with null when it could not be written (nothing is then changed).
 */
export async function mergePracticeDays(
  days: PracticeDay[],
  { silent }: { silent?: boolean } = {}
): Promise<PracticeMergeReport | null> {
  const latest = new Map<string, number>();
  for (const entry of days) {
    if (isPracticeDay(entry)) latest.set(entry.day, Math.max(latest.get(entry.day) ?? 0, entry.count));
  }
  const report: PracticeMergeReport = { added: 0, replaced: 0 };
  if (latest.size === 0) return report;
  try {
    await inTransaction<void>('readwrite', (store) => {
      for (const [day, count] of latest) {
        const request = store.get(day);
        request.onsuccess = () => {
          const existing: unknown = request.result;
          if (!isPracticeDay(existing)) {
            store.put({ day, count });
            report.added += 1;
          } else if (count > existing.count) {
            store.put({ day, count });
            report.replaced += 1;
          }
        };
      }
      pruneOldest(store);
    });
    if (!silent && report.added + report.replaced > 0) notifyPracticeChanged();
    return report;
  } catch (err) {
    console.warn('Could not restore the days practised:', err);
    return null;
  }
}
