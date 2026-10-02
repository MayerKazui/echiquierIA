import type { Study, StudyChapter, StudyNode } from '../types/study';

/**
 * The player's studies, kept in the browser in their own IndexedDB database (they depend neither on the games nor
 * on the training progress). Best effort, like the other stores: when IndexedDB is unavailable every function
 * resolves with "nothing stored" instead of throwing.
 */

const DB_NAME = 'echiquier-ia-studies';
const STORE = 'studies';
/** Bump when `Study` changes shape: older entries are then ignored. */
export const STUDY_SCHEMA_VERSION = 1;

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
    return true;
  } catch (err) {
    console.warn('Could not save the study:', err);
    return false;
  }
}

export async function deleteStudy(id: string): Promise<boolean> {
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.delete(id);
    });
    return true;
  } catch (err) {
    console.warn('Could not delete the study:', err);
    return false;
  }
}
