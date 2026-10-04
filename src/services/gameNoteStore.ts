import { isGameNote, makeNote, type GameNote } from '../utils/gameNotes';

/**
 * The tags and notes of the games (see `utils/gameNotes`), kept in the browser in their own IndexedDB database: they
 * ride along in the backups as `gameNotes`. Best effort, like the other stores: when IndexedDB is unavailable every
 * function resolves with "nothing stored" instead of throwing.
 *
 * A note the player emptied (or whose game they deleted) is kept as an empty record with its date, so that the
 * deletion reaches the other devices of a synced history instead of the old note coming back.
 */

const DB_NAME = 'echiquier-ia-notes';
const STORE = 'notes';

type Listener = () => void;
const changeListeners = new Set<Listener>();

/** Calls `listener` after a note was written here (not for a silent restore). */
export function onNotesChanged(listener: Listener): () => void {
  changeListeners.add(listener);
  return () => void changeListeners.delete(listener);
}

function notifyNotesChanged(): void {
  for (const listener of [...changeListeners]) {
    try {
      listener();
    } catch (err) {
      console.warn('A listener of the notes failed:', err);
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

/** Every readable record, emptied ones included (they are what a backup carries). */
export async function exportNotes(): Promise<GameNote[]> {
  try {
    return await inTransaction<GameNote[]>('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done((request.result as unknown[]).filter(isGameNote));
    });
  } catch (err) {
    console.warn('Could not read the notes:', err);
    return [];
  }
}

/** The notes that say something, by game id. */
export async function loadNotes(): Promise<Map<string, GameNote>> {
  const notes = new Map<string, GameNote>();
  for (const note of await exportNotes()) {
    if (note.note !== '' || note.tags.length > 0) notes.set(note.id, note);
  }
  return notes;
}

/** Saves (or replaces) the note of a game. Resolves with false when it could not be written. */
export async function saveNote(note: GameNote): Promise<boolean> {
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.put(note);
    });
    notifyNotesChanged();
    return true;
  } catch (err) {
    console.warn('Could not save the note:', err);
    return false;
  }
}

/** Writes what the player typed as the note of a game; resolves with the note kept, or null when it could not be written. */
export async function writeNote(
  id: string,
  text: string,
  tags: readonly string[],
  now: number = Date.now()
): Promise<GameNote | null> {
  const note = makeNote(id, text, tags, now);
  return (await saveNote(note)) ? note : null;
}

/** Empties the notes of these games (the player deleted the games), leaving the trace of the change. */
export async function clearNotesOf(ids: readonly string[], now: number = Date.now()): Promise<void> {
  if (ids.length === 0) return;
  try {
    await inTransaction<void>('readwrite', (store) => {
      for (const id of ids) {
        const request = store.get(id);
        request.onsuccess = () => {
          const existing: unknown = request.result;
          if (!isGameNote(existing) || (existing.note === '' && existing.tags.length === 0)) return;
          store.put({ id, note: '', tags: [], updatedAt: Math.max(now, existing.updatedAt + 1) });
        };
      }
    });
    notifyNotesChanged();
  } catch (err) {
    console.warn('Could not clear the notes:', err);
  }
}

export interface NoteMergeReport {
  added: number;
  /** Notes replaced by a more recent version of the same note. */
  replaced: number;
  kept: number;
}

/**
 * Adds notes (a backup being restored): of two versions of the same note, the one changed last wins, an emptied
 * one included. Resolves with null when it could not be written (nothing is then changed).
 */
export async function mergeNotes(
  notes: GameNote[],
  { silent }: { silent?: boolean } = {}
): Promise<NoteMergeReport | null> {
  const latest = new Map<string, GameNote>();
  for (const note of notes) {
    const known = latest.get(note.id);
    if (isGameNote(note) && (!known || note.updatedAt > known.updatedAt)) latest.set(note.id, note);
  }
  const report: NoteMergeReport = { added: 0, replaced: 0, kept: 0 };
  if (latest.size === 0) return report;
  try {
    await inTransaction<void>('readwrite', (store) => {
      for (const note of latest.values()) {
        const request = store.get(note.id);
        request.onsuccess = () => {
          const existing: unknown = request.result;
          if (!isGameNote(existing)) {
            store.put(note);
            report.added += 1;
          } else if (note.updatedAt > existing.updatedAt) {
            store.put(note);
            report.replaced += 1;
          } else {
            report.kept += 1;
          }
        };
      }
    });
    if (!silent && report.added + report.replaced > 0) notifyNotesChanged();
    return report;
  } catch (err) {
    console.warn('Could not restore the notes:', err);
    return null;
  }
}
