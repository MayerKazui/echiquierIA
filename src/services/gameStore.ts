import type { GameAnalysisResult } from '../types/chess';

/**
 * Analysed games kept in the browser (IndexedDB), so that reloading the page or analysing the same PGN again
 * does not run Stockfish a second time. Everything here is best effort: when IndexedDB is unavailable (private
 * mode, blocked storage, quota) every function resolves with "nothing stored" instead of throwing.
 */

export interface StoredGame {
  id: string;
  /** PGN as it was analysed. */
  pgn: string;
  /** Stockfish search depth of the analysis. */
  depth: number;
  savedAt: number;
  schemaVersion: number;
  result: GameAnalysisResult;
}

const DB_NAME = 'echiquier-ia';
const STORE = 'games';
const SAVED_AT_INDEX = 'savedAt';
/** Bump when `GameAnalysisResult` changes shape: older entries are then ignored (and replaced on the next save). */
export const SCHEMA_VERSION = 1;
/** Number of games kept; the least recently saved ones are dropped first. */
export const MAX_GAMES = 20;

/** Same game whatever the line endings or the spacing of the pasted text. */
export function normalizePgn(pgn: string): string {
  return pgn
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/[ \t]+/g, ' ');
}

/** Short stable key for a PGN (cyrb53 hash of the normalised text). */
export function gameId(pgn: string): string {
  const text = normalizePgn(pgn);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Cheap structural check: stored data can come from an older or damaged version of the app. */
function isStoredGame(value: unknown): value is StoredGame {
  if (!isObject(value) || value.schemaVersion !== SCHEMA_VERSION) return false;
  if (typeof value.id !== 'string' || typeof value.pgn !== 'string') return false;
  if (typeof value.depth !== 'number' || typeof value.savedAt !== 'number') return false;
  const result = value.result;
  if (!isObject(result) || !isObject(result.metadata) || !isObject(result.statsWhite) || !isObject(result.statsBlack)) {
    return false;
  }
  const moves = result.moves;
  if (!Array.isArray(moves) || moves.length === 0) return false;
  const first: unknown = moves[0];
  return isObject(first) && typeof first.san === 'string' && typeof first.fenBefore === 'string';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex(SAVED_AT_INDEX, 'savedAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked'));
  });
}

/** Runs `work` in a transaction and resolves once the transaction has been committed. */
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

/** Saves (or replaces) an analysed game, then drops the oldest ones beyond `MAX_GAMES`. */
export async function saveGame(game: { pgn: string; depth: number; result: GameAnalysisResult }): Promise<void> {
  const record: StoredGame = {
    id: gameId(game.pgn),
    pgn: normalizePgn(game.pgn),
    depth: game.depth,
    savedAt: Date.now(),
    schemaVersion: SCHEMA_VERSION,
    result: game.result,
  };
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.put(record);
      const count = store.count();
      count.onsuccess = () => {
        let excess = count.result - MAX_GAMES;
        if (excess <= 0) return;
        // Oldest first: the index is ordered by savedAt
        const cursor = store.index(SAVED_AT_INDEX).openKeyCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current || excess <= 0) return;
          store.delete(current.primaryKey);
          excess -= 1;
          current.continue();
        };
      };
    });
  } catch (err) {
    console.warn('Could not save the analysed game:', err);
  }
}

/** The stored analysis of exactly this PGN (ignoring spacing), or null. */
export async function loadGame(pgn: string): Promise<StoredGame | null> {
  try {
    const found = await inTransaction<unknown>('readonly', (store, done) => {
      const request = store.get(gameId(pgn));
      request.onsuccess = () => done(request.result);
    });
    return isStoredGame(found) && found.pgn === normalizePgn(pgn) ? found : null;
  } catch (err) {
    console.warn('Could not read the analysed game:', err);
    return null;
  }
}

/** The most recently saved game that is still readable, or null. */
export async function loadLatestGame(): Promise<StoredGame | null> {
  try {
    return await inTransaction<StoredGame | null>('readonly', (store, done) => {
      done(null);
      const cursor = store.index(SAVED_AT_INDEX).openCursor(null, 'prev');
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        if (isStoredGame(current.value)) done(current.value);
        else current.continue(); // Skip entries from an older schema or damaged ones
      };
    });
  } catch (err) {
    console.warn('Could not read the latest analysed game:', err);
    return null;
  }
}

/** Removes every stored game. */
export async function clearGames(): Promise<void> {
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.clear();
    });
  } catch (err) {
    console.warn('Could not clear the stored games:', err);
  }
}
