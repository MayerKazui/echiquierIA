import type { Study, StudyChapter, StudyNode } from '../types/study';

/**
 * The player's studies, kept in the browser in their own IndexedDB database (they depend neither on the games nor
 * on the training progress). Best effort, like the other stores: when IndexedDB is unavailable every function
 * resolves with "nothing stored" instead of throwing.
 */

const DB_NAME = 'echiquier-ia-studies';
const STORE = 'studies';
/** Traces of the studies the user deleted (see `StudyDeletion`). Added in version 2 of the database. */
const DELETIONS = 'deletions';
const DB_VERSION = 2;
/** Traces of deleted studies kept; the oldest are forgotten beyond this. */
export const MAX_STUDY_DELETIONS = 1000;
/** Bump when `Study` changes shape: older entries are then ignored. */
export const STUDY_SCHEMA_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DELETIONS)) db.createObjectStore(DELETIONS, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked'));
  });
}

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNode(value: unknown): value is StudyNode {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.san === 'string' &&
    typeof value.fen === 'string' &&
    Array.isArray(value.children) &&
    value.children.every(isNode)
  );
}

function isChapter(value: unknown): value is StudyChapter {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.orientation === 'w' || value.orientation === 'b') &&
    isNode(value.root)
  );
}

/** Cheap structural check: the data can come from another version of the app or be damaged. */
export function isStudy(value: unknown): value is Study {
  return (
    isObject(value) &&
    value.schemaVersion === STUDY_SCHEMA_VERSION &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    Array.isArray(value.chapters) &&
    value.chapters.every(isChapter)
  );
}

type Listener = () => void;
const changeListeners = new Set<Listener>();

/** Calls `listener` after the studies were saved, deleted or merged here (not for a silent restore). */
export function onStudiesChanged(listener: Listener): () => void {
  changeListeners.add(listener);
  return () => void changeListeners.delete(listener);
}

function notifyStudiesChanged(): void {
  for (const listener of [...changeListeners]) {
    try {
      listener();
    } catch (err) {
      console.warn('A listener of the studies failed:', err);
    }
  }
}

/**
 * The trace of a study the user deleted. It lets a deletion reach the other devices of a synced copy: a study
 * last changed at or before `deletedAt` is dropped wherever it turns up, one changed after (edited elsewhere
 * since) stays.
 */
export interface StudyDeletion {
  id: string;
  deletedAt: number;
}

export const isStudyDeletion = (value: unknown): value is StudyDeletion =>
  isObject(value) &&
  typeof value.id === 'string' &&
  value.id !== '' &&
  typeof value.deletedAt === 'number' &&
  Number.isFinite(value.deletedAt);

/** Forgets the oldest traces of deletions beyond `MAX_STUDY_DELETIONS`. */
function pruneDeletions(deletions: IDBObjectStore): void {
  const request = deletions.getAll();
  request.onsuccess = () => {
    const all = (request.result as unknown[]).filter(isStudyDeletion).sort((a, b) => a.deletedAt - b.deletedAt);
    for (const old of all.slice(0, Math.max(0, all.length - MAX_STUDY_DELETIONS))) deletions.delete(old.id);
  };
}

/** The moment a study is deleted: now, but never before its last change (a clock set back). */
const deletionTime = (updatedAt: unknown): number =>
  typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? Math.max(Date.now(), updatedAt) : Date.now();

/** The readable studies, the most recently changed first. */
export async function listStudies(): Promise<Study[]> {
  try {
    const all = await inTransaction<Study[]>('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done((request.result as unknown[]).filter(isStudy));
    });
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.warn('Could not read the studies:', err);
    return [];
  }
}

/** Saves (or replaces) a study, stamping the time of the change. Resolves with false when it could not be written. */
export async function saveStudy(study: Study): Promise<boolean> {
  try {
    const record: Study = { ...study, updatedAt: Date.now(), schemaVersion: STUDY_SCHEMA_VERSION };
    await inTransaction<void>('readwrite', (store) => {
      store.put(record);
    });
    notifyStudiesChanged();
    return true;
  } catch (err) {
    console.warn('Could not save the study:', err);
    return false;
  }
}

/** Deletes a study, leaving a trace of it so that a synced copy loses it too. */
export async function deleteStudy(id: string): Promise<boolean> {
  try {
    await inTransaction<void>('readwrite', (store, _done, deletions) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const existing: unknown = request.result;
        if (existing === undefined) return;
        deletions.put({ id, deletedAt: deletionTime(isObject(existing) ? existing.updatedAt : 0) });
        store.delete(id);
        pruneDeletions(deletions);
      };
    });
    notifyStudiesChanged();
    return true;
  } catch (err) {
    console.warn('Could not delete the study:', err);
    return false;
  }
}

/** Every trace of a deleted study, for a backup. Empty when storage is unavailable. */
export async function listStudyDeletions(): Promise<StudyDeletion[]> {
  try {
    return await inTransaction<StudyDeletion[]>('readonly', (_store, done, deletions) => {
      const request = deletions.getAll();
      request.onsuccess = () => done((request.result as unknown[]).filter(isStudyDeletion));
    });
  } catch (err) {
    console.warn('Could not read the deleted studies:', err);
    return [];
  }
}

export interface StudyMergeReport {
  /** Studies that were not there. */
  added: number;
  /** Studies replaced by a more recent version of the same study. */
  replaced: number;
  /** Studies already there that are as recent or more. */
  kept: number;
  /** Studies removed here because they were deleted elsewhere. */
  deleted: number;
}

export interface StudyMergeOptions {
  /** Do not tell the listeners of `onStudiesChanged` (the sync itself restores, it must not trigger a sync). */
  silent?: boolean;
  /**
   * The studies come back whatever the traces of deletions here say (a backup file the user chose to import after
   * deleting studies): one that a trace covers is saved again, just after the deletion, so that it wins elsewhere too.
   */
  override?: boolean;
}

/**
 * Adds studies (a backup being restored): a study already there is replaced only by a version of it changed more
 * recently, as a whole (two devices that edited different chapters of one study keep the more recent device's).
 * `deletions` (traces of studies deleted elsewhere) are kept, remove the studies here last changed at or before the
 * deletion, and keep such studies out of `records`. Resolves with null when it could not be written (nothing is
 * then changed).
 */
export async function mergeStudies(
  records: Study[],
  deletions: StudyDeletion[] = [],
  options: StudyMergeOptions = {}
): Promise<StudyMergeReport | null> {
  // A study twice in the file counts once: the most recent version
  const latest = new Map<string, Study>();
  for (const record of records) {
    const known = latest.get(record.id);
    if (isStudy(record) && (!known || record.updatedAt > known.updatedAt)) latest.set(record.id, record);
  }
  const valid = [...latest.values()];
  // A deletion twice counts once: the latest
  const incoming = new Map<string, number>();
  for (const deletion of deletions) {
    if (isStudyDeletion(deletion) && deletion.deletedAt > (incoming.get(deletion.id) ?? -Infinity)) {
      incoming.set(deletion.id, deletion.deletedAt);
    }
  }
  const report: StudyMergeReport = { added: 0, replaced: 0, kept: 0, deleted: 0 };
  let tracesChanged = false;
  try {
    await inTransaction<void>('readwrite', (store, _done, deletionStore) => {
      const traces = deletionStore.getAll();
      traces.onsuccess = () => {
        const known = new Map<string, number>();
        for (const trace of traces.result as unknown[])
          if (isStudyDeletion(trace)) known.set(trace.id, trace.deletedAt);
        // The traces this browser did not have yet (or only older ones)
        const fresh: StudyDeletion[] = [];
        for (const [id, deletedAt] of incoming) {
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

        // A study deleted after its last change is not taken (unless the user asked for a restore)
        const covered = (record: Study) => {
          const deletedAt = known.get(record.id);
          return deletedAt !== undefined && record.updatedAt <= deletedAt;
        };
        // The studies a trace covers are saved again just after their deletion (they would be deleted again at the
        // next sync otherwise)
        const toMerge = options.override
          ? valid.map((record) =>
              covered(record) ? { ...record, updatedAt: (known.get(record.id) ?? 0) + 1 } : record
            )
          : valid.filter((record) => !covered(record));

        for (const trace of fresh) {
          const request = store.get(trace.id);
          request.onsuccess = () => {
            const existing: unknown = request.result;
            if (existing !== undefined) {
              const updatedAt = isObject(existing) ? existing.updatedAt : undefined;
              if (typeof updatedAt !== 'number' || updatedAt <= trace.deletedAt) {
                store.delete(trace.id);
                report.deleted += 1;
              }
            }
          };
        }
        for (const record of toMerge) {
          const request = store.get(record.id);
          request.onsuccess = () => {
            const existing: unknown = request.result;
            if (!isStudy(existing)) {
              store.put(record);
              report.added += 1;
            } else if (record.updatedAt > existing.updatedAt) {
              store.put(record);
              report.replaced += 1;
            } else {
              report.kept += 1;
            }
          };
        }
      };
    });
    if (!options.silent && (report.added + report.replaced + report.deleted > 0 || tracesChanged)) {
      notifyStudiesChanged();
    }
    return report;
  } catch (err) {
    console.warn('Could not restore the studies:', err);
    return null;
  }
}
