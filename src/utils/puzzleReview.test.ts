import { describe, expect, it } from 'vitest';
import type { Puzzle } from './puzzleData';
import { REVIEW_SIZE, pickReview, recordPuzzle, summarizeEntries, type PuzzleEntry } from './puzzleReview';
import { DAY_MS, MASTERED_LEVEL } from './spacedRepetition';

const NOW = 1_000 * DAY_MS;

const puzzle = (id: string): Puzzle => ({
  id,
  fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  moves: ['e2e4', 'e7e5'],
  rating: 1000,
  themes: ['fork'],
});

const entry = (id: string, level: number, dueAt: number, lastSeen = NOW - DAY_MS): PuzzleEntry => ({
  id,
  puzzle: puzzle(id),
  card: { id, level, dueAt, lastSeen, attempts: 1, failures: 1 },
});

describe('recordPuzzle', () => {
  it('keeps nothing of a puzzle solved that was never missed', () => {
    expect(recordPuzzle(undefined, puzzle('a'), true, NOW)).toBeNull();
  });

  it('keeps a missed puzzle, to come back the next day', () => {
    const result = recordPuzzle(undefined, puzzle('a'), false, NOW)!;
    expect(result.puzzle.id).toBe('a');
    expect(result.card).toMatchObject({ id: 'a', level: 0, dueAt: NOW + DAY_MS, attempts: 1, failures: 1 });
  });

  it('moves a missed puzzle on when it is found again, and starts it over when it is missed again', () => {
    const missed = entry('a', 1, NOW - 1);
    expect(recordPuzzle(missed, puzzle('a'), true, NOW)!.card.level).toBe(2);
    expect(recordPuzzle(missed, puzzle('a'), false, NOW)!.card).toMatchObject({ level: 0, failures: 2 });
  });

  it('retires a puzzle found often enough in a row', () => {
    const almost = entry('a', MASTERED_LEVEL - 1, NOW - 1);
    expect(recordPuzzle(almost, puzzle('a'), true, NOW)!.card.level).toBe(MASTERED_LEVEL);
  });
});

describe('summarizeEntries', () => {
  it('counts what is due, waiting and retired', () => {
    const summary = summarizeEntries(
      [
        entry('due', 1, NOW - 5),
        entry('later', 1, NOW + 3 * DAY_MS),
        entry('soon', 2, NOW + DAY_MS),
        entry('done', MASTERED_LEVEL, Number.MAX_SAFE_INTEGER),
      ],
      NOW
    );
    expect(summary).toEqual({ due: 1, scheduled: 2, mastered: 1, nextDueAt: NOW + DAY_MS });
  });

  it('has no next date when nothing is waiting', () => {
    expect(summarizeEntries([], NOW)).toEqual({ due: 0, scheduled: 0, mastered: 0, nextDueAt: null });
  });
});

describe('pickReview', () => {
  const entries = [
    entry('b', 1, NOW - 1 * DAY_MS),
    entry('a', 1, NOW - 3 * DAY_MS),
    entry('later', 1, NOW + 2 * DAY_MS),
    entry('done', MASTERED_LEVEL, Number.MAX_SAFE_INTEGER),
  ];

  it('takes the puzzles due, the longest overdue first', () => {
    expect(pickReview(entries, NOW).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('adds the ones due soonest when asked, never the retired ones', () => {
    expect(pickReview(entries, NOW, { includeUpcoming: true }).map((p) => p.id)).toEqual(['a', 'b', 'later']);
  });

  it('is limited to the size of a session', () => {
    const many = Array.from({ length: REVIEW_SIZE + 5 }, (_, i) => entry(`p${String(i).padStart(2, '0')}`, 1, NOW - i));
    expect(pickReview(many, NOW)).toHaveLength(REVIEW_SIZE);
    expect(pickReview(many, NOW, { size: 3 })).toHaveLength(3);
  });
});
