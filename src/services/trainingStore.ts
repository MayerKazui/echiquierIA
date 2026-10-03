import type { Card } from '../utils/spacedRepetition';

/**
 * Progress on the replayed positions (one card per position, see `spacedRepetition`), kept in the browser in its
 * own IndexedDB database. The positions are those of the errors (`game id:ply`), those of the training on the
 * repertoire (ids starting with `repertoire:`, see `openingDrill`) and the theoretical endgames (`finale:`, see
 * `endgameDrill`): all ride along in the backups as `cards`.
 * The store does not depend on the games store, and a game removed from the history does not take what was
 * learned with it. Best effort, like the games store: when IndexedDB is unavailable every function
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
export function isCard(value: unknown): value is Card {
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

export interface CardMergeReport {
  added: number;
  /** Cards replaced by a more recent version of the same card. */
  replaced: number;
  kept: number;
}

/** Whether `incoming` is further along than `existing`: worked on later, or at the same time but more often. */
const isFurther = (incoming: Card, existing: Card): boolean =>
  incoming.lastSeen > existing.lastSeen ||
  (incoming.lastSeen === existing.lastSeen && incoming.attempts > existing.attempts);

/**
 * Adds cards to the progress (a backup being restored): a position already worked on keeps the card that was
 * worked on last. Resolves with null when it could not be written (nothing is then changed).
 */
export async function mergeCards(cards: Card[]): Promise<CardMergeReport | null> {
  // A card twice in the file counts once: the one worked on last
  const latest = new Map<string, Card>();
  for (const card of cards) {
    const known = latest.get(card.id);
    if (isCard(card) && (!known || isFurther(card, known))) latest.set(card.id, card);
  }
  const valid = [...latest.values()];
  const report: CardMergeReport = { added: 0, replaced: 0, kept: 0 };
  if (valid.length === 0) return report;
  try {
    await inTransaction<void>('readwrite', (store) => {
      for (const card of valid) {
        const request = store.get(card.id);
        request.onsuccess = () => {
          const existing: unknown = request.result;
          if (!isCard(existing)) {
            store.put(card);
            report.added += 1;
          } else if (isFurther(card, existing)) {
            store.put(card);
            report.replaced += 1;
          } else {
            report.kept += 1;
          }
        };
      }
    });
    return report;
  } catch (err) {
    console.warn('Could not restore the training progress:', err);
    return null;
  }
}
