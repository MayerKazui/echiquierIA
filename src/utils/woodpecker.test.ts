import { describe, expect, it } from 'vitest';
import type { Puzzle } from './puzzleData';
import {
  beginCycle,
  bestCycle,
  compareCycle,
  createSet,
  drawLot,
  finishCycle,
  formatDuration,
  formatStopwatch,
  isCycleDone,
  nextCycleNumber,
  saveProgress,
  seededRandom,
  settle,
  type WoodpeckerCycle,
} from './woodpecker';

const puzzle = (id: string): Puzzle => ({
  id,
  fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  moves: ['e2e4', 'e7e5'],
  rating: 1000,
  themes: [],
});
const pool = (count: number) => Array.from({ length: count }, (_, i) => puzzle(`p${String(i).padStart(3, '0')}`));
const RANGE = { from: 1000, to: 1200 };
const cycle = (number: number, totalMs: number): WoodpeckerCycle => ({
  number,
  startedAt: 0,
  finishedAt: totalMs,
  totalMs,
  size: 10,
  firstTry: 8,
});

describe('seededRandom', () => {
  it('gives the same numbers for the same seed, in [0, 1)', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const values = Array.from({ length: 5 }, () => a());
    expect(values).toEqual(Array.from({ length: 5 }, () => b()));
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(values).not.toEqual(Array.from({ length: 5 }, seededRandom(43)));
  });
});

describe('drawLot', () => {
  it('draws the same lot from the same pool and seed, whatever the order of the pool', () => {
    const puzzles = pool(100);
    const lot = drawLot(puzzles, 20, 7);
    expect(drawLot([...puzzles].reverse(), 20, 7)).toEqual(lot);
  });

  it('draws another lot with another seed', () => {
    const puzzles = pool(100);
    expect(drawLot(puzzles, 20, 7).map((p) => p.id)).not.toEqual(drawLot(puzzles, 20, 8).map((p) => p.id));
  });

  it('draws each puzzle once, and no more than the pool has', () => {
    const lot = drawLot(pool(30), 20, 1);
    expect(new Set(lot.map((p) => p.id)).size).toBe(20);
    expect(drawLot(pool(5), 20, 1)).toHaveLength(5);
    expect(drawLot([], 20, 1)).toEqual([]);
  });

  it('does not touch the pool', () => {
    const puzzles = pool(10);
    const copy = [...puzzles];
    drawLot(puzzles, 5, 3);
    expect(puzzles).toEqual(copy);
  });
});

describe('a cycle', () => {
  const set = createSet(pool(3), RANGE, 1, 100);

  it('starts with every puzzle of the lot, in order, and resumes instead of starting again', () => {
    const begun = beginCycle(set, 200);
    expect(begun.progress).toEqual({
      number: 1,
      startedAt: 200,
      elapsedMs: 0,
      queue: ['p000', 'p001', 'p002'],
      missed: [],
    });
    expect(nextCycleNumber(set)).toBe(1);
    expect(beginCycle(begun, 999)).toBe(begun);
  });

  it('drops a puzzle solved from the queue', () => {
    const { progress } = beginCycle(set, 0);
    expect(settle(progress!, true).queue).toEqual(['p001', 'p002']);
  });

  it('sends a puzzle missed to the end of the queue, and remembers it once', () => {
    const { progress } = beginCycle(set, 0);
    const missed = settle(progress!, false);
    expect(missed.queue).toEqual(['p001', 'p002', 'p000']);
    expect(missed.missed).toEqual(['p000']);
    // Missed again after its turn came back: still one miss
    const again = settle(settle(settle(missed, true), true), false);
    expect(again.queue).toEqual(['p000']);
    expect(again.missed).toEqual(['p000']);
  });

  it('drops a puzzle that could not be played without counting it as missed', () => {
    const { progress } = beginCycle(set, 0);
    const skipped = settle(progress!, null);
    expect(skipped.queue).toEqual(['p001', 'p002']);
    expect(skipped.missed).toEqual([]);
  });

  it('is done when the queue is empty, the retries included', () => {
    let progress = beginCycle(set, 0).progress!;
    progress = settle(progress, false);
    progress = settle(settle(progress, true), true);
    expect(isCycleDone(progress)).toBe(false);
    expect(isCycleDone(settle(progress, true))).toBe(true);
  });

  it('becomes a cycle of the history, with the puzzles solved at the first try', () => {
    let progress = beginCycle(set, 1000).progress!;
    progress = settle(progress, false);
    progress = settle(settle(settle(progress, true), true), true);
    const finished = finishCycle(set, { ...progress, elapsedMs: 61_234.4 }, 5000);
    expect(finished.cycles).toEqual([
      { number: 1, startedAt: 1000, finishedAt: 5000, totalMs: 61_234, size: 3, firstTry: 2 },
    ]);
    expect(finished.progress).toBeNull();
    expect(nextCycleNumber(finished)).toBe(2);
  });

  it('keeps the progress and its time', () => {
    const progress = beginCycle(set, 0).progress!;
    const saved = saveProgress(set, { ...progress, elapsedMs: 4000 }, 10);
    expect(saved.progress?.elapsedMs).toBe(4000);
    expect(saved.updatedAt).toBe(10);
    expect(nextCycleNumber(saved)).toBe(1);
  });
});

describe('compareCycle', () => {
  it('has nothing to compare the first cycle with', () => {
    expect(compareCycle([cycle(1, 1000)], 1)).toBeNull();
    expect(compareCycle([], 1)).toBeNull();
  });

  it('tells how much faster or slower a cycle is than the previous one', () => {
    const cycles = [cycle(1, 100_000), cycle(2, 85_000), cycle(3, 90_000)];
    expect(compareCycle(cycles, 2)).toEqual({ deltaMs: -15_000, ratio: -0.15, isBest: true });
    expect(compareCycle(cycles, 3)).toEqual({ deltaMs: 5000, ratio: 5000 / 85_000, isBest: false });
  });
});

describe('bestCycle', () => {
  it('is the fastest cycle, null without any', () => {
    expect(bestCycle([])).toBeNull();
    expect(bestCycle([cycle(1, 5000), cycle(2, 3000), cycle(3, 4000)])?.number).toBe(2);
  });
});

describe('formatDuration', () => {
  it('reads as hours, minutes or seconds', () => {
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(725_000)).toBe('12 min 05 s');
    expect(formatDuration(3_900_000)).toBe('1 h 05 min');
    expect(formatDuration(0)).toBe('0 s');
  });
});

describe('formatStopwatch', () => {
  it('counts up, to the second, with hours when needed', () => {
    expect(formatStopwatch(0)).toBe('0:00');
    expect(formatStopwatch(65_900)).toBe('1:05');
    expect(formatStopwatch(3_729_000)).toBe('1:02:09');
  });
});
