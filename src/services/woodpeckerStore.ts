import { isPuzzle } from '../utils/puzzleData';
import {
  archiveLot,
  isRetired,
  mergeArchives,
  type ArchivedLot,
  type WoodpeckerCycle,
  type WoodpeckerProgress,
  type WoodpeckerSet,
} from '../utils/woodpecker';

/**
 * The Woodpecker lot, its cycles and the cycle in progress (see `utils/woodpecker`), kept in the browser in their own
 * IndexedDB database: one record, the lot the player is working on. Best effort, like the other stores: when
 * IndexedDB is unavailable every function resolves with "nothing stored" instead of throwing.
 */

const DB_NAME = 'echiquier-ia-woodpecker';
const STORE = 'sets';
const KEY = 'current';
const ARCHIVE_KEY = 'archive';
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

/** Cheap structural check of an archived lot read from storage or from a backup. */
export function isArchivedLot(value: unknown): value is ArchivedLot {
  if (typeof value !== 'object' || value === null) return false;
  const lot = value as Record<string, unknown>;
  const range = lot.range as Record<string, unknown> | null;
  return (
    isFiniteNumber(lot.createdAt) &&
    isFiniteNumber(lot.retiredAt) &&
    typeof range === 'object' &&
    range !== null &&
    isFiniteNumber(range.from) &&
    isFiniteNumber(range.to) &&
    isFiniteNumber(lot.size) &&
    Array.isArray(lot.cycles) &&
    lot.cycles.every(isCycle) &&
    (lot.seed === undefined || isFiniteNumber(lot.seed)) &&
    // The puzzles are checked when the lot is taken up again: damaged, they only make that impossible
    (lot.puzzles === undefined || (Array.isArray(lot.puzzles) && lot.puzzles.length <= MAX_LOT))
  );
}

const readArchive = (value: unknown): ArchivedLot[] => (Array.isArray(value) ? value.filter(isArchivedLot) : []);

/** The lots the player left, with their cycles, the lot left last at the end. */
export async function loadWoodpeckerArchive(): Promise<ArchivedLot[]> {
  try {
    return await inTransaction<ArchivedLot[]>('readonly', (store, done) => {
      const request = store.get(ARCHIVE_KEY);
      request.onsuccess = () => done(readArchive(request.result));
    });
  } catch (err) {
    console.warn('Could not read the Woodpecker lots left:', err);
    return [];
  }
}

/**
 * The player leaves the lot for another: what is kept of it (its cycles) goes to the archive, and the lot goes. A lot
 * without any cycle finished leaves nothing. Resolves with the archive, null when it could not be written.
 */
export async function retireWoodpecker(set: WoodpeckerSet, now: number): Promise<ArchivedLot[] | null> {
  try {
    return await inTransaction<ArchivedLot[]>('readwrite', (store, done) => {
      const request = store.get(ARCHIVE_KEY);
      request.onsuccess = () => {
        const lot = archiveLot(set, now);
        const archive = lot ? mergeArchives(readArchive(request.result), [lot]) : readArchive(request.result);
        store.put(archive, ARCHIVE_KEY);
        store.delete(KEY);
        done(archive);
      };
    });
  } catch (err) {
    console.warn('Could not retire the Woodpecker lot:', err);
    return null;
  }
}

export type WoodpeckerMergeReport = 'added' | 'replaced' | 'kept';

/**
 * Brings a lot, and the lots left, from a backup. The archives are united. There is only one lot, the one worked on
 * last wins (two lots are not mixed: the cycles of one are not comparable with the cycles of another), and a lot that
 * the archives say was left, here or there, is not kept nor taken back. Resolves with null when it could not be
 * written.
 */
export async function mergeWoodpecker(
  incoming: WoodpeckerSet | null,
  incomingArchive: readonly ArchivedLot[] = []
): Promise<WoodpeckerMergeReport | null> {
  const lot = incoming && isWoodpeckerSet(incoming) ? incoming : null;
  const left = incomingArchive.filter(isArchivedLot);
  if (!lot && left.length === 0) return 'kept';
  try {
    return await inTransaction<WoodpeckerMergeReport>('readwrite', (store, done) => {
      const current = store.get(KEY);
      const stored = store.get(ARCHIVE_KEY);
      stored.onsuccess = () => {
        const archive = mergeArchives(readArchive(stored.result), left);
        store.put(archive, ARCHIVE_KEY);
        const existing: unknown = current.result;
        let here = isWoodpeckerSet(existing) ? existing : null;
        if (here && isRetired(here, archive)) {
          store.delete(KEY);
          here = null;
        }
        if (!lot || isRetired(lot, archive)) done('kept');
        else if (!here) {
          store.put(lot, KEY);
          done('added');
        } else if (lot.updatedAt > here.updatedAt) {
          store.put(lot, KEY);
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
