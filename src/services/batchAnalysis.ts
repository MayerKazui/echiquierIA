import type { GameAnalysisResult } from '../types/chess';
import type { PlayerColor } from '../types/ui';
import { buildGameResult } from './gameResult';
import type { ImportedGame } from './gameImport';
import { isAbortError, type GameAnalysisOutput } from './stockfishEngine';

/**
 * Analysing several games one after the other, in the background, with a queue that is kept in the browser:
 * closing the tab does not lose it, the next visit can resume it.
 */

/** One game of the queue. `id` is unique in a queue (`source:id` of the imported game). */
export interface BatchJob {
  id: string;
  pgn: string;
  /** For display: "contre Opponent · 3 oct.". */
  label: string;
}

export interface BatchSnapshot {
  version: 1;
  depth: number;
  /** The player's pseudo on the site the games come from: it tells which side the user played. */
  userPseudo: string;
  jobs: BatchJob[];
  doneIds: string[];
  failedIds: string[];
}

const STORAGE_KEY = 'chess_batch_analysis';
/** A queue is bounded: the history keeps this many games, so more would only push out the first ones. */
export const MAX_BATCH_JOBS = 20;
const MAX_PGN_LENGTH = 200_000;

export const pendingJobs = (snapshot: BatchSnapshot): BatchJob[] => {
  const settled = new Set([...snapshot.doneIds, ...snapshot.failedIds]);
  return snapshot.jobs.filter((job) => !settled.has(job.id));
};

/**
 * The queue for the games of an online list (newest first, as listed): the oldest is analysed first, so that the
 * history (most recently saved on top) ends up in the order of the games, and the newest is the one reopened
 * after a reload.
 */
export function jobsFromGames(
  games: Array<Pick<ImportedGame, 'source' | 'id' | 'pgn' | 'white' | 'black' | 'userColor'>>
): BatchJob[] {
  return [...games].reverse().map((game) => ({
    id: `${game.source}:${game.id}`,
    pgn: game.pgn,
    label: `contre ${game.userColor === 'w' ? game.black : game.white}`,
  }));
}

export function createSnapshot(jobs: BatchJob[], depth: number, userPseudo: string): BatchSnapshot {
  const seen = new Set<string>();
  const unique = jobs.filter((job) => !seen.has(job.id) && seen.add(job.id));
  return { version: 1, depth, userPseudo, jobs: unique.slice(0, MAX_BATCH_JOBS), doneIds: [], failedIds: [] };
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** The queue kept by the last visit, or null (nothing stored, damaged or unreadable data). */
export function loadSnapshot(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): BatchSnapshot | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const { version, depth, userPseudo, jobs, doneIds, failedIds } = data as Record<string, unknown>;
    if (version !== 1 || typeof depth !== 'number' || !Number.isFinite(depth) || typeof userPseudo !== 'string') {
      return null;
    }
    if (!Array.isArray(jobs) || jobs.length === 0 || jobs.length > MAX_BATCH_JOBS) return null;
    if (!isStringArray(doneIds) || !isStringArray(failedIds)) return null;
    const valid = jobs.every(
      (job): job is BatchJob =>
        typeof job === 'object' &&
        job !== null &&
        typeof job.id === 'string' &&
        typeof job.label === 'string' &&
        typeof job.pgn === 'string' &&
        job.pgn.length > 0 &&
        job.pgn.length <= MAX_PGN_LENGTH
    );
    return valid ? { version: 1, depth, userPseudo, jobs, doneIds, failedIds } : null;
  } catch {
    return null;
  }
}

/** Best effort: without storage (private mode, quota) the queue still runs, it is just not resumable. */
export function saveSnapshot(snapshot: BatchSnapshot, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore
  }
}

export function clearSnapshot(storage: Pick<Storage, 'removeItem'> | undefined = safeStorage()) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** What the queue needs from the rest of the app (replaced in tests). */
export interface BatchDeps {
  /** Runs the engine on one game; `onProgress` gets the part done (0 to 1). */
  analyze(
    pgn: string,
    depth: number,
    onProgress: (fraction: number) => void,
    signal: AbortSignal
  ): Promise<GameAnalysisOutput>;
  /** True when the game is already stored, analysed at least this deep. */
  isStored(pgn: string, depth: number): Promise<boolean>;
  save(game: { pgn: string; depth: number; result: GameAnalysisResult }): Promise<void>;
}

export interface BatchProgress {
  snapshot: BatchSnapshot;
  /** The game being analysed, null once the queue is done. */
  current: BatchJob | null;
  /** Part of the current game done (0 to 1). */
  fraction: number;
}

export interface BatchRunOptions {
  signal: AbortSignal;
  /** Side assumed when the PGN does not name the user. */
  userColor?: PlayerColor;
  onProgress?: (progress: BatchProgress) => void;
  /** The queue changed (a game is done or failed): keep it. */
  onChange?: (snapshot: BatchSnapshot) => void;
}

export interface BatchRunResult {
  outcome: 'completed' | 'aborted';
  snapshot: BatchSnapshot;
}

/**
 * Analyses the games still to do, oldest first, one at a time. A game that is already stored (as deep) is
 * skipped; one that fails is recorded and the others go on. An abort stops at once and keeps everything done so
 * far: running the same snapshot again continues where it stopped.
 */
export async function runBatch(
  initial: BatchSnapshot,
  deps: BatchDeps,
  { signal, userColor = 'w', onProgress, onChange }: BatchRunOptions
): Promise<BatchRunResult> {
  let snapshot = initial;
  const settle = (key: 'doneIds' | 'failedIds', id: string) => {
    snapshot = { ...snapshot, [key]: [...snapshot[key], id] };
    onChange?.(snapshot);
  };

  for (const job of pendingJobs(initial)) {
    if (signal.aborted) return { outcome: 'aborted', snapshot };
    onProgress?.({ snapshot, current: job, fraction: 0 });
    try {
      if (!(await deps.isStored(job.pgn, snapshot.depth))) {
        const output = await deps.analyze(
          job.pgn,
          snapshot.depth,
          (fraction) => onProgress?.({ snapshot, current: job, fraction: Math.min(1, Math.max(0, fraction)) }),
          signal
        );
        if (signal.aborted) return { outcome: 'aborted', snapshot };
        const result = buildGameResult(job.pgn, output, snapshot.userPseudo, userColor);
        await deps.save({ pgn: job.pgn, depth: snapshot.depth, result });
      }
      settle('doneIds', job.id);
    } catch (err) {
      if (signal.aborted || isAbortError(err)) return { outcome: 'aborted', snapshot };
      console.warn(`Batch analysis: ${job.label} failed`, err);
      settle('failedIds', job.id);
    }
  }
  onProgress?.({ snapshot, current: null, fraction: 1 });
  return { outcome: 'completed', snapshot };
}
