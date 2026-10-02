import { BAND_WIDTH, MAX_BAND, MIN_BAND, bandOf } from './puzzleData';
import type { PuzzleFilter } from '../services/puzzleBook';

/**
 * What a puzzle session is made of: the range of ratings the player chooses (whole bands of 200, the upper end
 * excluded: "from 1000 to 1400" is the bands 1000 and 1200), the order of the puzzles, the length of a timed run.
 */

export interface EloRange {
  /** Lowest rating, a multiple of 200. */
  from: number;
  /** Upper end, excluded, a multiple of 200; `MAX_BAND + BAND_WIDTH` means "and above". */
  to: number;
}

export const TOP_END = MAX_BAND + BAND_WIDTH;
export const DEFAULT_RANGE: EloRange = { from: 1000, to: 1600 };

/** Durations of a timed run, in minutes (null: no limit). */
export const TIMER_OPTIONS: ReadonlyArray<number | null> = [null, 3, 5, 10, 15];

/** The values a range end can take. */
export const RANGE_FROM_VALUES: number[] = Array.from(
  { length: (MAX_BAND - MIN_BAND) / BAND_WIDTH + 1 },
  (_, i) => MIN_BAND + i * BAND_WIDTH
);
export const RANGE_TO_VALUES: number[] = RANGE_FROM_VALUES.map((from) => from + BAND_WIDTH);

/** Puts a range in order and inside the bands that exist: at least one band, `from` below `to`. */
export function normalizeRange({ from, to }: EloRange): EloRange {
  const low = Math.min(MAX_BAND, Math.max(MIN_BAND, Math.round(from / BAND_WIDTH) * BAND_WIDTH));
  const high = Math.min(TOP_END, Math.max(low + BAND_WIDTH, Math.round(to / BAND_WIDTH) * BAND_WIDTH));
  return { from: low, to: high };
}

export function rangeLabel({ from, to }: EloRange): string {
  return to >= TOP_END ? `${from} et plus` : `de ${from} à ${to}`;
}

/** The filter of puzzles for a range and themes. The top of the range takes everything above. */
export function toFilter(range: EloRange, themes: readonly string[], match: 'any' | 'all'): PuzzleFilter {
  return {
    minRating: range.from,
    maxRating: range.to >= TOP_END ? Number.POSITIVE_INFINITY : range.to - 1,
    themes: [...themes],
    match,
  };
}

/** The middle value of a list (the average of the two middle ones for an even number), null when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** A range of three bands around the player's rating in games (the puzzles of Lichess are rated on their own scale). */
export function suggestRange(elo: number): EloRange {
  const from = bandOf(elo - BAND_WIDTH);
  return normalizeRange({ from, to: from + 3 * BAND_WIDTH });
}

/** The puzzles in a random order (Fisher-Yates); `random` is injectable for the tests. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** "3:05", "12:00": a duration in milliseconds, rounded up to the second (a timer reads as it counts down). */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
