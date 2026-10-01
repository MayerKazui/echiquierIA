import type { Card } from '../utils/spacedRepetition';

/**
 * Progress on the replayed positions (one card per position, see `spacedRepetition`), kept in the browser in its
 * own IndexedDB database: it does not depend on the games store, and a game removed from the history does not take
 * what was learned with it. Best effort, like the games store: when IndexedDB is unavailable every function
 * resolves with "nothing stored" instead of throwing.
 */

const DB_NAME = 'echiquier-ia-training';
const STORE = 'cards';

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

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Cheap structural check: the data can come from another version of the app or be damaged. */
function isCard(value: unknown): value is Card {
  if (typeof value !== 'object' || value === null) return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.id === 'string' &&
    isNumber(card.level) &&
    isNumber(card.dueAt) &&
    isNumber(card.lastSeen) &&
    isNumber(card.attempts) &&
    isNumber(card.failures)
  );
}

/** Every readable card, by position id. */
export async function loadCards(): Promise<Map<string, Card>> {
  try {
    return await inTransaction<Map<string, Card>>('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const cards = new Map<string, Card>();
        for (const value of request.result as unknown[]) if (isCard(value)) cards.set(value.id, value);
        done(cards);
      };
    });
  } catch (err) {
    console.warn('Could not read the training progress:', err);
    return new Map();
  }
}

/** Saves (or replaces) the card of a position. Resolves with false when it could not be written. */
export async function saveCard(card: Card): Promise<boolean> {
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.put(card);
    });
    return true;
  } catch (err) {
    console.warn('Could not save the training progress:', err);
    return false;
  }
}

/** Forgets all the progress. */
export async function clearCards(): Promise<void> {
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.clear();
    });
  } catch (err) {
    console.warn('Could not clear the training progress:', err);
  }
}
