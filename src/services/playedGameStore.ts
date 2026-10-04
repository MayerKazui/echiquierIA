import {
  isPlayedGame,
  isPlayedRecord,
  isTombstone,
  type PlayedGame,
  type PlayedRecord,
  type PlayedTombstone,
} from '../utils/playedGames';

/**
 * The games against the engine that were played to the end, kept in the browser in their own IndexedDB database
 * (see `PlayedGame`): they ride along in the backups as `playedGames`. Best effort, like the other stores: when
 * IndexedDB is unavailable every function resolves with "nothing stored" instead of throwing.
 *
 * A game the player deletes is kept as a tombstone with its date, so that the deletion reaches the other devices of
 * a synced history instead of the game coming back; of two copies of a record the one changed last wins.
 */

const DB_NAME = 'echiquier-ia-played';
const STORE = 'played';

/** Games kept; the least recent ones are deleted (tombstoned) beyond this. */
export const MAX_PLAYED_GAMES = 300;
/** Tombstones kept (a few dozen bytes each); the oldest are forgotten beyond this. */
export const MAX_TOMBSTONES = 1000;

type Listener = () => void;
const changeListeners = new Set<Listener>();

/** Calls `listener` after a game was saved or deleted here (not for a silent restore). */
export function onPlayedGamesChanged(listener: Listener): () => void {
  changeListeners.add(listener);
  return () => void changeListeners.delete(listener);
}

function notifyChanged(): void {
  for (const listener of [...changeListeners]) {
    try {
      listener();
    } catch (err) {
      console.warn('A listener of the played games failed:', err);
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

/** Every readable record, tombstones included (they are what a backup carries). */
export async function exportPlayedGames(): Promise<PlayedRecord[]> {
  try {
    return await inTransaction<PlayedRecord[]>('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done((request.result as unknown[]).filter(isPlayedRecord));
    });
  } catch (err) {
    console.warn('Could not read the played games:', err);
    return [];
  }
}

/** The games kept, the most recently finished first. */
export async function listPlayedGames(): Promise<PlayedGame[]> {
  return (await exportPlayedGames()).filter(isPlayedGame).sort((a, b) => b.finishedAt - a.finishedAt);
}

/**
 * Keeps the newest `MAX_PLAYED_GAMES` games (the others become tombstones, dated `now`) and forgets the oldest
 * tombstones beyond `MAX_TOMBSTONES`. `records` is what the store holds, as it will be once the work in progress is
 * written.
 */
function enforceLimits(store: IDBObjectStore, records: Map<string, PlayedRecord>, now: number): void {
  const games = [...records.values()].filter(isPlayedGame).sort((a, b) => b.finishedAt - a.finishedAt);
  for (const old of games.slice(MAX_PLAYED_GAMES)) {
    const tombstone: PlayedTombstone = { id: old.id, deleted: true, updatedAt: Math.max(now, old.updatedAt + 1) };
    records.set(old.id, tombstone);
    store.put(tombstone);
  }
  const tombstones = [...records.values()].filter(isTombstone).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const forgotten of tombstones.slice(MAX_TOMBSTONES)) {
    records.delete(forgotten.id);
    store.delete(forgotten.id);
  }
}

/** Reads every record of the store into a map (inside the transaction), then calls `then`. */
function withRecords(store: IDBObjectStore, then: (records: Map<string, PlayedRecord>) => void): void {
  const request = store.getAll();
  request.onsuccess = () => {
    const records = new Map<string, PlayedRecord>();
    for (const record of request.result as unknown[]) if (isPlayedRecord(record)) records.set(record.id, record);
    then(records);
  };
}

/** Saves (or replaces) a game that has just ended. Resolves with false when it could not be written. */
export async function savePlayedGame(game: PlayedGame, now: number = Date.now()): Promise<boolean> {
  try {
    await inTransaction<void>('readwrite', (store) => {
      withRecords(store, (records) => {
        // A game saved again after it was deleted comes back, dated after the deletion
        const known = records.get(game.id);
        const record = { ...game, updatedAt: Math.max(game.updatedAt, known ? known.updatedAt + 1 : 0) };
        records.set(game.id, record);
        store.put(record);
        enforceLimits(store, records, now);
      });
    });
    notifyChanged();
    return true;
  } catch (err) {
    console.warn('Could not save the played game:', err);
    return false;
  }
}

/** Deletes games, leaving a tombstone for each (nothing happens for one that is not there). */
export async function deletePlayedGames(ids: readonly string[], now: number = Date.now()): Promise<void> {
  if (ids.length === 0) return;
  let changed = false;
  try {
    await inTransaction<void>('readwrite', (store) => {
      withRecords(store, (records) => {
        for (const id of ids) {
          const known = records.get(id);
          if (!known || isTombstone(known)) continue;
          const tombstone: PlayedTombstone = { id, deleted: true, updatedAt: Math.max(now, known.updatedAt + 1) };
          records.set(id, tombstone);
          store.put(tombstone);
          changed = true;
        }
        enforceLimits(store, records, now);
      });
    });
    if (changed) notifyChanged();
  } catch (err) {
    console.warn('Could not delete the played games:', err);
  }
}

export interface PlayedMergeReport {
  added: number;
  /** Records replaced by a more recent version of the same record (a deletion included). */
  replaced: number;
  kept: number;
}

/**
 * Adds records (a backup being restored): of two versions of the same record, the one changed last wins, a
 * tombstone included. Resolves with null when it could not be written (nothing is then changed).
 */
export async function mergePlayedGames(
  incoming: PlayedRecord[],
  { silent }: { silent?: boolean } = {},
  now: number = Date.now()
): Promise<PlayedMergeReport | null> {
  const latest = new Map<string, PlayedRecord>();
  for (const record of incoming) {
    const known = latest.get(record.id);
    if (isPlayedRecord(record) && (!known || record.updatedAt > known.updatedAt)) latest.set(record.id, record);
  }
  const report: PlayedMergeReport = { added: 0, replaced: 0, kept: 0 };
  if (latest.size === 0) return report;
  try {
    await inTransaction<void>('readwrite', (store) => {
      withRecords(store, (records) => {
        for (const record of latest.values()) {
          const existing = records.get(record.id);
          if (!existing) {
            report.added += 1;
          } else if (record.updatedAt > existing.updatedAt) {
            report.replaced += 1;
          } else {
            report.kept += 1;
            continue;
          }
          records.set(record.id, record);
          store.put(record);
        }
        enforceLimits(store, records, now);
      });
    });
    if (!silent && report.added + report.replaced > 0) notifyChanged();
    return report;
  } catch (err) {
    console.warn('Could not restore the played games:', err);
    return null;
  }
}
