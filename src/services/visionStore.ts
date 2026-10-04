import {
  applyRun,
  isVisionRecord,
  mergeRecords,
  sameRecord,
  type RunOutcome,
  type VisionRecord,
} from '../utils/vision';
import { recordPractice } from './practiceStore';

/**
 * The records of the vision exercises (one per exercise and level), kept in the browser in their own IndexedDB
 * database: they ride along in the backups as `visionRecords`. Best effort, like the other stores: when IndexedDB is
 * unavailable every function resolves with "nothing stored" instead of throwing.
 */

const DB_NAME = 'echiquier-ia-vision';
const STORE = 'records';

type Listener = () => void;
const changeListeners = new Set<Listener>();

/** Calls `listener` after a record was written here (not for a silent restore). */
export function onVisionChanged(listener: Listener): () => void {
  changeListeners.add(listener);
  return () => void changeListeners.delete(listener);
}

function notifyVisionChanged(): void {
  for (const listener of [...changeListeners]) {
    try {
      listener();
    } catch (err) {
      console.warn('A listener of the vision records failed:', err);
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
      request.result.createObjectStore(STORE, { keyPath: 'key' });
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

/** Every record, for the screens and for a backup. */
export async function exportVisionRecords(): Promise<VisionRecord[]> {
  try {
    return await inTransaction<VisionRecord[]>('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done((request.result as unknown[]).filter(isVisionRecord));
    });
  } catch (err) {
    console.warn('Could not read the vision records:', err);
    return [];
  }
}

/**
 * Notes a finished round: one more round at that level, and a new best score when `score` beats it. It counts as
 * practice for the day. Resolves with what changed, or null when it could not be written. Never rejects.
 */
export async function recordVisionRun(
  key: string,
  score: number,
  now: number = Date.now()
): Promise<RunOutcome | null> {
  try {
    const outcome = await inTransaction<RunOutcome>('readwrite', (store, done) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const existing: unknown = request.result;
        const next = applyRun(isVisionRecord(existing) ? existing : undefined, key, score, now);
        store.put(next.record);
        done(next);
      };
    });
    void recordPractice(now);
    notifyVisionChanged();
    return outcome;
  } catch (err) {
    console.warn('Could not note the vision round:', err);
    return null;
  }
}

export interface VisionMergeReport {
  added: number;
  /** Records where the copy had a better score, or more rounds, than here. */
  replaced: number;
}

/**
 * Adds records (a backup being restored): one known on both sides keeps the better score. Resolves with null when it
 * could not be written (nothing is then changed).
 */
export async function mergeVisionRecords(
  records: VisionRecord[],
  { silent }: { silent?: boolean } = {}
): Promise<VisionMergeReport | null> {
  const incoming = new Map<string, VisionRecord>();
  for (const record of records) {
    if (!isVisionRecord(record)) continue;
    const known = incoming.get(record.key);
    incoming.set(record.key, known ? mergeRecords(known, record) : record);
  }
  const report: VisionMergeReport = { added: 0, replaced: 0 };
  if (incoming.size === 0) return report;
  try {
    await inTransaction<void>('readwrite', (store) => {
      for (const [key, record] of incoming) {
        const request = store.get(key);
        request.onsuccess = () => {
          const existing: unknown = request.result;
          if (!isVisionRecord(existing)) {
            store.put(record);
            report.added += 1;
            return;
          }
          const merged = mergeRecords(existing, record);
          if (!sameRecord(merged, existing)) {
            store.put(merged);
            report.replaced += 1;
          }
        };
      }
    });
    if (!silent && report.added + report.replaced > 0) notifyVisionChanged();
    return report;
  } catch (err) {
    console.warn('Could not restore the vision records:', err);
    return null;
  }
}
