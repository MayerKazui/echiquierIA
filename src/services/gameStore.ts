import { Chess } from 'chess.js';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { computePlayerStats } from '../utils/moveAnalysis';

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
  /**
   * `summary`: an old game, reduced to what the statistics need (see `toSummary`); it cannot be shown on the board
   * again without analysing it anew. Absent or `full`: the complete analysis.
   */
  detail?: 'full' | 'summary';
  result: GameAnalysisResult;
}

export const isFullGame = (game: Pick<StoredGame, 'detail'>): boolean => game.detail !== 'summary';

const DB_NAME = 'echiquier-ia';
const STORE = 'games';
const SAVED_AT_INDEX = 'savedAt';
/** Bump when `GameAnalysisResult` changes shape: older entries are then ignored (and replaced on the next save). */
export const SCHEMA_VERSION = 1;
/** Number of games kept; the least recently saved ones are dropped first. */
export const MAX_GAMES = 500;
/**
 * Number of most recent games kept with their complete analysis (about 70 KB each). The older ones are reduced to a
 * summary of about a quarter of that size, so that a long history stays light.
 */
export const MAX_FULL_GAMES = 50;

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
  if (value.detail !== undefined && value.detail !== 'full' && value.detail !== 'summary') return false;
  const moves = result.moves;
  if (!Array.isArray(moves) || moves.length === 0) return false;
  const first: unknown = moves[0];
  return isObject(first) && typeof first.san === 'string' && typeof first.fenBefore === 'string';
}

const FAULTS: ReadonlySet<MoveAnalysis['classification']> = new Set(['mistake', 'blunder', 'missedWin']);

/**
 * An old game reduced to what the statistics need: each move keeps its evaluations, classification, clock and best
 * move; the positions (the two FEN strings, kept only before a fault, to be able to replay it), the variation and
 * the AI explanations are dropped.
 */
export function toSummary(game: StoredGame): StoredGame {
  const moves = game.result.moves.map((move) => {
    const light: MoveAnalysis = {
      ...move,
      fenBefore: FAULTS.has(move.classification) ? move.fenBefore : '',
      fenAfter: '',
      pv: [],
    };
    delete light.aiExplanation;
    return light;
  });
  return { ...game, detail: 'summary', result: { ...game.result, moves } };
}

/**
 * The engine's best move as English SAN, rebuilt from its UCI move. Games saved by an earlier version
 * kept it in French ("Cf3"), which then did not match the played move ("Nf3").
 */
function bestMoveInEnglish(move: MoveAnalysis): string {
  const uci = move.bestMoveUci;
  // Cheap test first: only a move starting with D, T, F, C (or R: a king in French) can be in French
  if (!/^[DTFCR]|=[DTFC]/.test(move.bestMoveSan ?? '') || !uci || uci.length < 4) return move.bestMoveSan;
  try {
    const played = new Chess(move.fenBefore).move({
      from: uci.substring(0, 2),
      to: uci.substring(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return played.san;
  } catch {
    return move.bestMoveSan;
  }
}

/**
 * Brings a stored game up to date when it is read: the statistics are recomputed from the moves (a change
 * in the way they are computed must not leave the old values) and the best moves are written in English SAN.
 */
function withFreshStats(game: StoredGame): StoredGame {
  const moves = game.result.moves.map((m) => ({ ...m, bestMoveSan: bestMoveInEnglish(m) }));
  return {
    ...game,
    result: {
      ...game.result,
      moves,
      statsWhite: computePlayerStats(moves.filter((m) => m.color === 'w')),
      statsBlack: computePlayerStats(moves.filter((m) => m.color === 'b')),
    },
  };
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

/** Reduces to a summary the games that are older than the `keepFull` most recent ones, then calls `done`. */
function compactOld(store: IDBObjectStore, keepFull: number, done: () => void): void {
  const request = store.index(SAVED_AT_INDEX).openCursor(null, 'prev');
  let skipped = false;
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return done();
    if (!skipped) {
      skipped = true;
      cursor.advance(keepFull); // the most recent ones stay as they are
      return;
    }
    // Every write goes through `saveGame`, so what is beyond the recent ones is already a summary from the first
    // summary on: there is no need to read the whole history at each save
    if (!isStoredGame(cursor.value) || !isFullGame(cursor.value)) return done();
    cursor.update(toSummary(cursor.value));
    cursor.continue();
  };
}

/** Drops the `excess` least recently saved games. */
function dropOldest(store: IDBObjectStore, excess: number): void {
  let left = excess;
  // Oldest first: the index is ordered by savedAt
  const cursor = store.index(SAVED_AT_INDEX).openKeyCursor();
  cursor.onsuccess = () => {
    const current = cursor.result;
    if (!current || left <= 0) return;
    store.delete(current.primaryKey);
    left -= 1;
    current.continue();
  };
}

/** How many games are kept complete, and how many in all (the defaults are the app's; tests use smaller ones). */
export interface StoreLimits {
  full: number;
  total: number;
}
const DEFAULT_LIMITS: StoreLimits = { full: MAX_FULL_GAMES, total: MAX_GAMES };

/**
 * Saves (or replaces) an analysed game. Beyond the `MAX_FULL_GAMES` most recent ones the games are reduced to a
 * summary, and beyond `MAX_GAMES` the oldest are dropped.
 */
export async function saveGame(
  game: { pgn: string; depth: number; result: GameAnalysisResult },
  limits: StoreLimits = DEFAULT_LIMITS
): Promise<void> {
  const record: StoredGame = {
    id: gameId(game.pgn),
    pgn: normalizePgn(game.pgn),
    depth: game.depth,
    savedAt: Date.now(),
    schemaVersion: SCHEMA_VERSION,
    detail: 'full',
    result: game.result,
  };
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.put(record);
      const count = store.count();
      count.onsuccess = () => {
        const total = count.result;
        if (total <= limits.full) return;
        compactOld(store, limits.full, () => {
          if (total > limits.total) dropOldest(store, total - limits.total);
        });
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
    return isStoredGame(found) && found.pgn === normalizePgn(pgn) ? withFreshStats(found) : null;
  } catch (err) {
    console.warn('Could not read the analysed game:', err);
    return null;
  }
}

/** The most recently saved game that is still readable and complete (a summary cannot be shown), or null. */
export async function loadLatestGame(): Promise<StoredGame | null> {
  try {
    return await inTransaction<StoredGame | null>('readonly', (store, done) => {
      done(null);
      const cursor = store.index(SAVED_AT_INDEX).openCursor(null, 'prev');
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        if (isStoredGame(current.value) && isFullGame(current.value)) done(withFreshStats(current.value));
        else current.continue(); // Skip summaries, entries from an older schema and damaged ones
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

/** Every readable stored game, the most recently saved first (older formats and damaged entries are left out). */
export async function listGames(): Promise<StoredGame[]> {
  try {
    return await inTransaction<StoredGame[]>('readonly', (store, done) => {
      const games: StoredGame[] = [];
      done(games);
      const cursor = store.index(SAVED_AT_INDEX).openCursor(null, 'prev');
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        if (isStoredGame(current.value)) games.push(withFreshStats(current.value));
        current.continue();
      };
    });
  } catch (err) {
    console.warn('Could not list the analysed games:', err);
    return [];
  }
}

/** Keys (`gameId`) of every stored game: cheap, nothing is read but the keys. Empty when storage is unavailable. */
export async function listGameIds(): Promise<Set<string>> {
  try {
    return await inTransaction<Set<string>>('readonly', (store, done) => {
      const request = store.getAllKeys();
      request.onsuccess = () => done(new Set(request.result.map(String)));
    });
  } catch (err) {
    console.warn('Could not list the analysed games:', err);
    return new Set();
  }
}

/** Removes one stored game (nothing happens if it is not there). */
export async function deleteGame(id: string): Promise<void> {
  try {
    await inTransaction<void>('readwrite', (store) => {
      store.delete(id);
    });
  } catch (err) {
    console.warn('Could not delete the analysed game:', err);
  }
}
