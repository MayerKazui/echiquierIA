import { isPuzzle } from '../utils/puzzleData';
import type { WoodpeckerCycle, WoodpeckerProgress, WoodpeckerSet } from '../utils/woodpecker';

/**
 * The Woodpecker lot, its cycles and the cycle in progress (see `utils/woodpecker`), kept in the browser in their own
 * IndexedDB database: one record, the lot the player is working on. Best effort, like the other stores: when
 * IndexedDB is unavailable every function resolves with "nothing stored" instead of throwing.
 */

const DB_NAME = 'echiquier-ia-woodpecker';
const STORE = 'sets';
const KEY = 'current';
/** A lot larger than this is not one the app made. */
export const MAX_LOT = 1000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
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

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function isCycle(value: unknown): value is WoodpeckerCycle {
  if (typeof value !== 'object' || value === null) return false;
  const cycle = value as Record<string, unknown>;
  return (
    isFiniteNumber(cycle.number) &&
    isFiniteNumber(cycle.startedAt) &&
    isFiniteNumber(cycle.finishedAt) &&
    isFiniteNumber(cycle.totalMs) &&
    cycle.totalMs >= 0 &&
    isFiniteNumber(cycle.size) &&
    isFiniteNumber(cycle.firstTry)
  );
}

function isProgress(value: unknown, ids: ReadonlySet<string>): value is WoodpeckerProgress {
  if (typeof value !== 'object' || value === null) return false;
  const progress = value as Record<string, unknown>;
  return (
    isFiniteNumber(progress.number) &&
    isFiniteNumber(progress.startedAt) &&
    isFiniteNumber(progress.elapsedMs) &&
    progress.elapsedMs >= 0 &&
    isStringArray(progress.queue) &&
    progress.queue.every((id) => ids.has(id)) &&
    isStringArray(progress.missed)
  );
}

/** Cheap structural check of a lot read from storage or from a backup. */
export function isWoodpeckerSet(value: unknown): value is WoodpeckerSet {
  if (typeof value !== 'object' || value === null) return false;
  const set = value as Record<string, unknown>;
  const range = set.range as Record<string, unknown> | null;
  if (
    !isFiniteNumber(set.seed) ||
    !isFiniteNumber(set.createdAt) ||
    !isFiniteNumber(set.updatedAt) ||
    typeof range !== 'object' ||
    range === null ||
    !isFiniteNumber(range.from) ||
    !isFiniteNumber(range.to) ||
    !Array.isArray(set.puzzles) ||
    set.puzzles.length === 0 ||
    set.puzzles.length > MAX_LOT ||
    !set.puzzles.every(isPuzzle) ||
    !Array.isArray(set.cycles) ||
    !set.cycles.every(isCycle)
  ) {
    return false;
  }
  const ids = new Set((set.puzzles as Array<{ id: string }>).map((puzzle) => puzzle.id));
  return ids.size === set.puzzles.length && (set.progress === null || isProgress(set.progress, ids));
}

/** The lot, or null when there is none (or it cannot be read). */
export async function loadWoodpecker(): Promise<WoodpeckerSet | null> {
  try {
    return await inTransaction<WoodpeckerSet | null>('readonly', (store, done) => {
      const request = store.get(KEY);
      request.onsuccess = () => done(isWoodpeckerSet(request.result) ? request.result : null);
    });
  } catch (err) {
    console.warn('Could not read the Woodpecker lot:', err);
    return null;
  }
}

/** Saves (or replaces) the lot. Resolves with false when it could not be written. */
export async function saveWoodpecker(set: WoodpeckerSet): Promise<boolean> {
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.put(set, KEY);
    });
    return true;
  } catch (err) {
    console.warn('Could not save the Woodpecker lot:', err);
    return false;
  }
}

/** Forgets the lot and its cycles. */
export async function clearWoodpecker(): Promise<void> {
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.delete(KEY);
    });
  } catch (err) {
    console.warn('Could not clear the Woodpecker lot:', err);
  }
}

export type WoodpeckerMergeReport = 'added' | 'replaced' | 'kept';

/**
 * Brings a lot from a backup: there is only one lot, the one worked on last wins (two lots are not mixed: the
 * cycles of one are not comparable with the cycles of another). Resolves with null when it could not be written.
 */
export async function mergeWoodpecker(incoming: WoodpeckerSet | null): Promise<WoodpeckerMergeReport | null> {
  if (!incoming || !isWoodpeckerSet(incoming)) return 'kept';
  try {
    return await inTransaction<WoodpeckerMergeReport>('readwrite', (store, done) => {
      const request = store.get(KEY);
      request.onsuccess = () => {
        const existing: unknown = request.result;
        if (!isWoodpeckerSet(existing)) {
          store.put(incoming, KEY);
          done('added');
        } else if (incoming.updatedAt > existing.updatedAt) {
          store.put(incoming, KEY);
          done('replaced');
        } else {
          done('kept');
        }
      };
    });
  } catch (err) {
    console.warn('Could not restore the Woodpecker lot:', err);
    return null;
  }
}
