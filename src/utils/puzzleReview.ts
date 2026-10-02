import type { Puzzle } from './puzzleData';
import { review, statusOf, type Card } from './spacedRepetition';

/**
 * The puzzles the player missed, and their spaced repetition (the cards of `spacedRepetition`: a puzzle found again
 * comes back after 1, 3 then 7 days, a puzzle missed again starts over).
 *
 * A puzzle is only kept once it has been missed: one solved at the first try is not worth a card. The whole puzzle
 * is stored with its card, so that a new selection of puzzles in the app does not make it disappear.
 */

export interface PuzzleEntry {
  /** The id of the puzzle (and of its card). */
  id: string;
  puzzle: Puzzle;
  card: Card;
}

/** Puzzles in a review session. */
export const REVIEW_SIZE = 20;

/**
 * The entry after a puzzle was played: a missed puzzle gets a card (or starts over), a solved one moves on if it
 * already has a card. Null for a puzzle solved that was never missed: nothing to keep.
 */
export function recordPuzzle(
  previous: PuzzleEntry | undefined,
  puzzle: Puzzle,
  isSuccess: boolean,
  now: number
): PuzzleEntry | null {
  if (!previous && isSuccess) return null;
  return { id: puzzle.id, puzzle, card: review(puzzle.id, previous?.card, isSuccess, now) };
}

export interface PuzzleReviewSummary {
  /** Missed before and due again now. */
  due: number;
  /** Waiting for their next day. */
  scheduled: number;
  mastered: number;
  /** When the first scheduled puzzle is due, null without any. */
  nextDueAt: number | null;
}

export function summarizeEntries(entries: Iterable<PuzzleEntry>, now: number): PuzzleReviewSummary {
  const summary: PuzzleReviewSummary = { due: 0, scheduled: 0, mastered: 0, nextDueAt: null };
  for (const { card } of entries) {
    switch (statusOf(card, now)) {
      case 'due':
        summary.due += 1;
        break;
      case 'mastered':
        summary.mastered += 1;
        break;
      case 'scheduled':
        summary.scheduled += 1;
        summary.nextDueAt = Math.min(summary.nextDueAt ?? Infinity, card.dueAt);
        break;
    }
  }
  return summary;
}

/** The puzzles of a review: the ones due, the longest overdue first, then, if asked, the ones due soonest. */
export function pickReview(
  entries: Iterable<PuzzleEntry>,
  now: number,
  { size = REVIEW_SIZE, includeUpcoming = false }: { size?: number; includeUpcoming?: boolean } = {}
): Puzzle[] {
  const due: PuzzleEntry[] = [];
  const upcoming: PuzzleEntry[] = [];
  for (const entry of entries) {
    const status = statusOf(entry.card, now);
    if (status === 'due') due.push(entry);
    else if (status === 'scheduled') upcoming.push(entry);
  }
  const byDate = (a: PuzzleEntry, b: PuzzleEntry) => a.card.dueAt - b.card.dueAt || (a.id < b.id ? -1 : 1);
  due.sort(byDate);
  upcoming.sort(byDate);
  return [...due, ...(includeUpcoming ? upcoming : [])].slice(0, size).map((entry) => entry.puzzle);
}
