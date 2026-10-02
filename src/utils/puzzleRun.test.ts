import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANGE,
  RANGE_FROM_VALUES,
  RANGE_TO_VALUES,
  TOP_END,
  formatClock,
  median,
  normalizeRange,
  rangeLabel,
  shuffle,
  suggestRange,
  toFilter,
} from './puzzleRun';

describe('normalizeRange', () => {
  it('rounds to the bands and keeps the ends in order, at least one band wide', () => {
    expect(normalizeRange({ from: 1010, to: 1590 })).toEqual({ from: 1000, to: 1600 });
    expect(normalizeRange({ from: 1400, to: 1000 })).toEqual({ from: 1400, to: 1600 });
    expect(normalizeRange({ from: 1000, to: 1000 })).toEqual({ from: 1000, to: 1200 });
  });

  it('stays inside the bands that exist', () => {
    expect(normalizeRange({ from: 0, to: 100 })).toEqual({ from: 400, to: 600 });
    expect(normalizeRange({ from: 5000, to: 9000 })).toEqual({ from: 2800, to: TOP_END });
  });

  it('leaves the default range as it is', () => {
    expect(normalizeRange(DEFAULT_RANGE)).toEqual(DEFAULT_RANGE);
  });

  it('has the values of the selects in step', () => {
    expect(RANGE_FROM_VALUES[0]).toBe(400);
    expect(RANGE_FROM_VALUES.at(-1)).toBe(2800);
    expect(RANGE_TO_VALUES.at(-1)).toBe(TOP_END);
  });
});

describe('rangeLabel', () => {
  it('says the ends, or "and above" at the top', () => {
    expect(rangeLabel({ from: 1000, to: 1400 })).toBe('de 1000 à 1400');
    expect(rangeLabel({ from: 2400, to: TOP_END })).toBe('2400 et plus');
  });
});

describe('toFilter', () => {
  it('excludes the upper end', () => {
    expect(toFilter({ from: 1000, to: 1400 }, ['fork'], 'all')).toEqual({
      minRating: 1000,
      maxRating: 1399,
      themes: ['fork'],
      match: 'all',
    });
  });

  it('takes everything above at the top of the range', () => {
    expect(toFilter({ from: 2400, to: TOP_END }, [], 'any').maxRating).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('median', () => {
  it('is the middle value', () => {
    expect(median([1500, 1300, 1700])).toBe(1500);
    expect(median([1300, 1500, 1700, 1900])).toBe(1600);
    expect(median([])).toBeNull();
  });
});

describe('suggestRange', () => {
  it('is three bands that start 200 under the rating', () => {
    expect(suggestRange(1432)).toEqual({ from: 1200, to: 1800 });
    expect(suggestRange(1400)).toEqual({ from: 1200, to: 1800 });
  });

  it('stays inside the bands that exist', () => {
    expect(suggestRange(300)).toEqual({ from: 400, to: 1000 });
    expect(suggestRange(3000)).toEqual({ from: 2800, to: TOP_END });
  });
});

describe('shuffle', () => {
  it('keeps the same items, leaves the list alone and follows the random numbers', () => {
    const items = [1, 2, 3, 4, 5];
    const result = shuffle(items, () => 0);
    expect(result).toEqual([2, 3, 4, 5, 1]);
    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect([...shuffle(items)].sort()).toEqual(items);
  });
});

describe('formatClock', () => {
  it('writes minutes and seconds, rounding up', () => {
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(184_100)).toBe('3:05');
    expect(formatClock(900)).toBe('0:01');
    expect(formatClock(-5)).toBe('0:00');
  });
});
