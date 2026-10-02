import { isCard } from './trainingStore';
import { isPuzzle } from '../utils/puzzleData';
import type { PuzzleEntry } from '../utils/puzzleReview';

/**
 * The puzzles the player missed, with their card of spaced repetition (see `utils/puzzleReview`), kept in the
 * browser in their own IndexedDB database. Best effort, like the other stores: when IndexedDB is unavailable every
 * function resolves with "nothing stored" instead of throwing.
 */

const DB_NAME = 'echiquier-ia-puzzles';
const STORE = 'entries';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
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

/** Cheap structural check of an entry read from storage or from a backup. */
export function isPuzzleEntry(value: unknown): value is PuzzleEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    isPuzzle(entry.puzzle) &&
    isCard(entry.card) &&
    entry.puzzle.id === entry.id &&
    entry.card.id === entry.id
  );
}

/** Every readable entry, by puzzle id. */
export async function loadPuzzleEntries(): Promise<Map<string, PuzzleEntry>> {
  try {
    return await inTransaction<Map<string, PuzzleEntry>>('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = new Map<string, PuzzleEntry>();
        for (const value of request.result as unknown[]) if (isPuzzleEntry(value)) entries.set(value.id, value);
        done(entries);
      };
    });
  } catch (err) {
    console.warn('Could not read the missed puzzles:', err);
    return new Map();
  }
}

/** Saves (or replaces) an entry. Resolves with false when it could not be written. */
export async function savePuzzleEntry(entry: PuzzleEntry): Promise<boolean> {
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.put(entry);
    });
    return true;
  } catch (err) {
    console.warn('Could not save the missed puzzle:', err);
    return false;
  }
}

/** Forgets every missed puzzle. */
export async function clearPuzzleEntries(): Promise<void> {
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.clear();
    });
  } catch (err) {
    console.warn('Could not clear the missed puzzles:', err);
  }
}

export interface PuzzleMergeReport {
  added: number;
  /** Entries replaced by a more recent version of the same puzzle. */
  replaced: number;
  kept: number;
}

/** Whether `incoming` is further along than `existing`: worked on later, or at the same time but more often. */
const isFurther = (incoming: PuzzleEntry, existing: PuzzleEntry): boolean =>
  incoming.card.lastSeen > existing.card.lastSeen ||
  (incoming.card.lastSeen === existing.card.lastSeen && incoming.card.attempts > existing.card.attempts);

/**
 * Adds entries to the missed puzzles (a backup being restored): a puzzle already there keeps the entry that was
 * worked on last. Resolves with null when it could not be written (nothing is then changed).
 */
export async function mergePuzzleEntries(entries: PuzzleEntry[]): Promise<PuzzleMergeReport | null> {
  // An entry twice in the file counts once: the one worked on last
  const latest = new Map<string, PuzzleEntry>();
  for (const entry of entries) {
    const known = latest.get(entry.id);
    if (isPuzzleEntry(entry) && (!known || isFurther(entry, known))) latest.set(entry.id, entry);
  }
  const valid = [...latest.values()];
  const report: PuzzleMergeReport = { added: 0, replaced: 0, kept: 0 };
  if (valid.length === 0) return report;
  try {
    await inTransaction<void>('readwrite', (store) => {
      for (const entry of valid) {
        const request = store.get(entry.id);
        request.onsuccess = () => {
          const existing: unknown = request.result;
          if (!isPuzzleEntry(existing)) {
            store.put(entry);
            report.added += 1;
          } else if (isFurther(entry, existing)) {
            store.put(entry);
            report.replaced += 1;
          } else {
            report.kept += 1;
          }
        };
      }
    });
    return report;
  } catch (err) {
    console.warn('Could not restore the missed puzzles:', err);
    return null;
  }
}
