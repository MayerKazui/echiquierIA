import { decodePuzzle, encodePuzzle, type Puzzle, type PuzzleRecord } from './puzzleData';
import type { EloRange } from './puzzleRun';

/**
 * The Woodpecker method: a lot of puzzles, fixed once and for all, solved again and again, each cycle faster than the
 * one before. Here the lot is drawn once with a seed and kept whole (a new selection of puzzles in the app must not
 * change it); a cycle ends when every puzzle of the lot is solved, the ones missed coming back at the end of the
 * queue (their retries count in the cycle and in its time); the time is the player's, paused time excluded.
 */

/** Sizes of a lot the player can choose. */
export const LOT_SIZES: readonly number[] = [20, 50, 100, 200, 500];
export const DEFAULT_LOT_SIZE = 50;

export interface WoodpeckerCycle {
  /** 1 for the first cycle of the lot. */
  number: number;
  startedAt: number;
  finishedAt: number;
  /** Time spent on the cycle, in milliseconds (the pauses are not counted). */
  totalMs: number;
  /** Puzzles of the lot. */
  size: number;
  /** Puzzles solved at the first try, the others having come back at the end of the queue. */
  firstTry: number;
}

/** A cycle begun and not finished: it resumes where it was. */
export interface WoodpeckerProgress {
  number: number;
  startedAt: number;
  /** Time spent so far, in milliseconds. */
  elapsedMs: number;
  /** The ids of the puzzles still to solve, in the order they come. The first is the one on the board. */
  queue: string[];
  /** The ids of the puzzles missed at least once in this cycle. */
  missed: string[];
}

export interface WoodpeckerSet {
  /** The seed the lot was drawn with. */
  seed: number;
  createdAt: number;
  /** Last change (for the merge of two copies of a backup). */
  updatedAt: number;
  range: EloRange;
  /** The lot, in the order of every cycle. */
  puzzles: Puzzle[];
  cycles: WoodpeckerCycle[];
  progress: WoodpeckerProgress | null;
}

/** A small seeded generator (mulberry32): the same seed always gives the same numbers. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A lot of `size` puzzles out of `pool` (fewer if the pool is smaller): the same pool and seed give the same lot. */
export function drawLot(pool: readonly Puzzle[], size: number, seed: number): Puzzle[] {
  // Sorted first, so that the order the shards were read in does not change the lot
  const lot = [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const random = seededRandom(seed);
  const count = Math.min(size, lot.length);
  // Partial Fisher-Yates: only the first `count` places are needed
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (lot.length - i));
    [lot[i], lot[j]] = [lot[j], lot[i]];
  }
  return lot.slice(0, count);
}

export function createSet(puzzles: Puzzle[], range: EloRange, seed: number, now: number): WoodpeckerSet {
  return { seed, createdAt: now, updatedAt: now, range, puzzles, cycles: [], progress: null };
}

/** The cycle the next one to play is. */
export const nextCycleNumber = (set: WoodpeckerSet): number => set.progress?.number ?? set.cycles.length + 1;

/** The set with its cycle begun (or the cycle already begun, which resumes). */
export function beginCycle(set: WoodpeckerSet, now: number): WoodpeckerSet {
  if (set.progress) return set;
  const progress: WoodpeckerProgress = {
    number: set.cycles.length + 1,
    startedAt: now,
    elapsedMs: 0,
    queue: set.puzzles.map((puzzle) => puzzle.id),
    missed: [],
  };
  return { ...set, updatedAt: now, progress };
}

/**
 * What the player did with the puzzle on the board (the first of the queue): solved, it leaves the queue; missed, it
 * goes to the end of it, to be played again. `null`: the puzzle could not be played, it leaves the queue.
 */
export function settle(progress: WoodpeckerProgress, isSuccess: boolean | null): WoodpeckerProgress {
  const [current, ...rest] = progress.queue;
  if (current === undefined) return progress;
  if (isSuccess === false) {
    return {
      ...progress,
      queue: [...rest, current],
      missed: progress.missed.includes(current) ? progress.missed : [...progress.missed, current],
    };
  }
  return { ...progress, queue: rest };
}

export const isCycleDone = (progress: WoodpeckerProgress): boolean => progress.queue.length === 0;

/** The set with the cycle in progress finished: it becomes a cycle of the history. */
export function finishCycle(set: WoodpeckerSet, progress: WoodpeckerProgress, now: number): WoodpeckerSet {
  const cycle: WoodpeckerCycle = {
    number: progress.number,
    startedAt: progress.startedAt,
    finishedAt: now,
    totalMs: Math.round(progress.elapsedMs),
    size: set.puzzles.length,
    firstTry: Math.max(0, set.puzzles.length - progress.missed.length),
  };
  return { ...set, updatedAt: now, cycles: [...set.cycles, cycle], progress: null };
}

/** The set with the time of the cycle in progress and where it stands, kept. */
export function saveProgress(set: WoodpeckerSet, progress: WoodpeckerProgress, now: number): WoodpeckerSet {
  return { ...set, updatedAt: now, progress };
}

export interface CycleComparison {
  /** Time of this cycle minus the time of the previous one: negative when faster. */
  deltaMs: number;
  /** The same as a share of the previous time (-0.15: 15 % faster). */
  ratio: number;
  isBest: boolean;
}

/** A cycle against the one just before it; null for the first. */
export function compareCycle(cycles: readonly WoodpeckerCycle[], number: number): CycleComparison | null {
  const at = cycles.findIndex((cycle) => cycle.number === number);
  if (at <= 0) return null;
  const current = cycles[at];
  const previous = cycles[at - 1];
  const earlier = cycles.slice(0, at);
  return {
    deltaMs: current.totalMs - previous.totalMs,
    ratio: previous.totalMs > 0 ? (current.totalMs - previous.totalMs) / previous.totalMs : 0,
    isBest: earlier.every((cycle) => current.totalMs < cycle.totalMs),
  };
}

/** The fastest cycle of the history, null without any. */
export function bestCycle(cycles: readonly WoodpeckerCycle[]): WoodpeckerCycle | null {
  return cycles.reduce<WoodpeckerCycle | null>(
    (best, cycle) => (!best || cycle.totalMs < best.totalMs ? cycle : best),
    null
  );
}

/** "1 h 05 min", "12 min 05 s", "45 s": a duration in milliseconds for the screen. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  if (minutes > 0) return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
  return `${seconds} s`;
}

/** The stopwatch of the cycle: "1:05:09" over an hour, "12:05" otherwise. */
export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * A lot the player left, with the cycles done on it: what is kept of it when they take a new lot. The latest lots
 * also keep their puzzles (in the compact form of the data), so that one can be taken up again. It also says the lot
 * was retired, so that a copy elsewhere that still has it as current cannot bring it back.
 */
export interface ArchivedLot {
  /** When the lot was drawn: it identifies the lot. */
  createdAt: number;
  /** When the player left it. */
  retiredAt: number;
  range: EloRange;
  /** Puzzles in the lot. */
  size: number;
  cycles: WoodpeckerCycle[];
  /** The seed the lot was drawn with (kept with the puzzles). */
  seed?: number;
  /** The puzzles of the lot, kept only for the latest lots left. */
  puzzles?: PuzzleRecord[];
}

/** Lots remembered: the ones left longest ago are forgotten first. */
export const MAX_ARCHIVE = 20;
/** Lots left that still hold their puzzles (the older ones keep their times only: a lot of 500 puzzles is 60 KB). */
export const MAX_ARCHIVE_PUZZLES = 5;

/** The lot as it is archived, null when no cycle was finished on it (there is nothing to remember). */
export function archiveLot(set: WoodpeckerSet, now: number): ArchivedLot | null {
  if (set.cycles.length === 0) return null;
  return {
    createdAt: set.createdAt,
    retiredAt: now,
    range: set.range,
    size: set.puzzles.length,
    cycles: set.cycles,
    seed: set.seed,
    puzzles: set.puzzles.map(encodePuzzle),
  };
}

/** The archives of two copies united (a lot in both counts once, the later retirement winning), oldest retirement first. */
export function mergeArchives(a: readonly ArchivedLot[], b: readonly ArchivedLot[]): ArchivedLot[] {
  const byLot = new Map<number, ArchivedLot>();
  for (const lot of [...a, ...b]) {
    const known = byLot.get(lot.createdAt);
    if (!known || lot.retiredAt > known.retiredAt) byLot.set(lot.createdAt, lot);
  }
  const lots = [...byLot.values()].sort((x, y) => x.retiredAt - y.retiredAt).slice(-MAX_ARCHIVE);
  // Only the latest lots keep their puzzles
  return lots.map((lot, i) => {
    if (i >= lots.length - MAX_ARCHIVE_PUZZLES || !lot.puzzles) return lot;
    const { puzzles: _dropped, ...times } = lot;
    return times;
  });
}

/**
 * The lot taken up again from the archive, with its cycles, ready to be played as it was (the same puzzles in the same
 * order). Null when the archive no longer holds its puzzles, or they are damaged. It counts as worked on now, so that
 * the date it was left on does not make it look left.
 */
export function resumeLot(lot: ArchivedLot, now: number): WoodpeckerSet | null {
  if (!lot.puzzles || lot.puzzles.length === 0) return null;
  const puzzles = lot.puzzles.map(decodePuzzle);
  if (puzzles.some((puzzle) => puzzle === null)) return null;
  return {
    seed: lot.seed ?? 0,
    createdAt: lot.createdAt,
    updatedAt: now,
    range: lot.range,
    puzzles: puzzles as Puzzle[],
    cycles: lot.cycles,
    progress: null,
  };
}

/** Whether a lot was left (and so is not to be taken back): its archive says so, and it was not worked on since. */
export const isRetired = (
  set: Pick<WoodpeckerSet, 'createdAt' | 'updatedAt'>,
  archive: readonly ArchivedLot[]
): boolean => archive.some((lot) => lot.createdAt === set.createdAt && set.updatedAt <= lot.retiredAt);
