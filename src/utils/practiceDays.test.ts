import { describe, expect, it } from 'vitest';
import {
  MAX_PRACTICE_DAYS,
  activeDaysIn,
  calendarWeeks,
  dayKey,
  daysFromTimes,
  daysMap,
  isPracticeDay,
  levelOf,
  mergeDays,
  pruneDays,
  shiftDay,
  streakOf,
} from './practiceDays';

/** Noon of a day, local time. */
const at = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};
const map = (...keys: string[]) => new Map(keys.map((key) => [key, 1]));

describe('dayKey and shiftDay', () => {
  it('writes the local day', () => {
    expect(dayKey(new Date(2026, 9, 4, 23, 59).getTime())).toBe('2026-10-04');
    expect(dayKey(new Date(2026, 0, 1, 0, 0).getTime())).toBe('2026-01-01');
  });

  it('moves by calendar days across months and years', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-10-04', 0)).toBe('2026-10-04');
    expect(shiftDay('2024-02-28', 1)).toBe('2024-02-29');
  });
});

describe('isPracticeDay', () => {
  it('accepts a day with a count, and nothing else', () => {
    expect(isPracticeDay({ day: '2026-10-04', count: 3 })).toBe(true);
    expect(isPracticeDay({ day: '2026-10-4', count: 3 })).toBe(false);
    expect(isPracticeDay({ day: '2026-10-04', count: 0 })).toBe(false);
    expect(isPracticeDay({ day: '2026-10-04', count: 1.5 })).toBe(false);
    expect(isPracticeDay({ day: '2026-10-04' })).toBe(false);
    expect(isPracticeDay(null)).toBe(false);
  });
});

describe('mergeDays', () => {
  it('keeps the larger count of a day known to both', () => {
    const merged = mergeDays(
      [
        { day: '2026-10-01', count: 2 },
        { day: '2026-10-02', count: 5 },
      ],
      [
        { day: '2026-10-02', count: 3 },
        { day: '2026-10-03', count: 1 },
      ]
    );
    expect([...merged]).toEqual([
      ['2026-10-01', 2],
      ['2026-10-02', 5],
      ['2026-10-03', 1],
    ]);
  });
});

describe('streakOf', () => {
  const now = at('2026-10-04');

  it('counts the days in a row up to today', () => {
    expect(streakOf(map('2026-10-02', '2026-10-03', '2026-10-04'), now)).toEqual({
      current: 3,
      longest: 3,
      isTodayDone: true,
    });
  });

  it('keeps the streak alive while today is not done yet', () => {
    expect(streakOf(map('2026-10-02', '2026-10-03'), now)).toEqual({ current: 2, longest: 2, isTodayDone: false });
  });

  it('is over after a day without practice', () => {
    expect(streakOf(map('2026-10-01', '2026-10-02'), now)).toEqual({ current: 0, longest: 2, isTodayDone: false });
  });

  it('remembers the longest run', () => {
    const days = map('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-03', '2026-10-04');
    expect(streakOf(days, now)).toEqual({ current: 2, longest: 4, isTodayDone: true });
  });

  it('is empty without any day', () => {
    expect(streakOf(new Map(), now)).toEqual({ current: 0, longest: 0, isTodayDone: false });
  });

  it('runs across a month and a year', () => {
    const days = map('2025-12-30', '2025-12-31', '2026-01-01');
    expect(streakOf(days, at('2026-01-01')).current).toBe(3);
  });

  it('ignores a day with a zero count', () => {
    expect(streakOf(new Map([['2026-10-04', 0]]), now)).toEqual({ current: 0, longest: 0, isTodayDone: false });
  });
});

describe('levelOf', () => {
  it('goes from empty to full', () => {
    expect([0, 1, 2, 3, 5, 6, 10, 11, 99].map(levelOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('calendarWeeks', () => {
  // 2026-10-04 is a Sunday
  const now = at('2026-10-04');

  it('has the asked number of weeks of seven days, Monday first, the last holding today', () => {
    const weeks = calendarWeeks(new Map(), now, 4);
    expect(weeks).toHaveLength(4);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[3][0].day).toBe('2026-09-28'); // the Monday
    expect(weeks[3][6]).toMatchObject({ day: '2026-10-04', isToday: true, isFuture: false });
    expect(weeks[0][0].day).toBe('2026-09-07');
  });

  it('marks the days to come in the current week', () => {
    // Wednesday
    const weeks = calendarWeeks(new Map(), at('2026-10-07'), 2);
    const last = weeks[1];
    expect(last.map((cell) => cell.isFuture)).toEqual([false, false, false, true, true, true, true]);
    expect(last[2].isToday).toBe(true);
  });

  it('fills in the counts and the levels, and does not count a day to come', () => {
    const days = new Map([
      ['2026-10-04', 7],
      ['2026-09-30', 1],
      ['2026-10-09', 3], // a clock set back: the day is in the future
    ]);
    const weeks = calendarWeeks(days, at('2026-10-07'), 2);
    const cells = weeks.flat();
    expect(cells.find((c) => c.day === '2026-10-04')).toMatchObject({ count: 7, level: 3 });
    expect(cells.find((c) => c.day === '2026-09-30')).toMatchObject({ count: 1, level: 1 });
    expect(cells.find((c) => c.day === '2026-10-09')).toMatchObject({ count: 0, level: 0, isFuture: true });
    expect(activeDaysIn(weeks)).toBe(2);
  });
});

describe('pruneDays', () => {
  it('keeps the most recent days', () => {
    const days = daysMap([
      { day: '2026-10-01', count: 1 },
      { day: '2026-10-03', count: 1 },
      { day: '2026-10-02', count: 1 },
    ]);
    expect(pruneDays(days, 2).map((d) => d.day)).toEqual(['2026-10-03', '2026-10-02']);
    expect(MAX_PRACTICE_DAYS).toBeGreaterThan(366);
  });
});

describe('daysFromTimes', () => {
  it('counts the moments by day and ignores what is not a date', () => {
    const days = daysFromTimes([
      new Date(2026, 9, 4, 8).getTime(),
      new Date(2026, 9, 4, 21).getTime(),
      new Date(2026, 9, 3, 12).getTime(),
      NaN,
      0,
      -5,
      Number.MAX_SAFE_INTEGER,
    ]);
    expect([...days]).toEqual([
      ['2026-10-04', 2],
      ['2026-10-03', 1],
    ]);
  });
});
