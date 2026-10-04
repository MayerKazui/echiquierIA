/**
 * The days the player practised (a position replayed, a puzzle solved, a Woodpecker puzzle…), with how many times:
 * what the streak and the calendar of "À réviser aujourd'hui" are made of. A day is a calendar day of the player's own
 * time zone, written `yyyy-mm-dd`.
 */

export interface PracticeDay {
  day: string;
  count: number;
}

/** Days kept (about a year and a half): older ones no longer show in the calendar and a streak that long is a record. */
export const MAX_PRACTICE_DAYS = 550;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const isPracticeDay = (value: unknown): value is PracticeDay =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as PracticeDay).day === 'string' &&
  DAY_KEY.test((value as PracticeDay).day) &&
  typeof (value as PracticeDay).count === 'number' &&
  Number.isInteger((value as PracticeDay).count) &&
  (value as PracticeDay).count > 0;

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-10-04` for the day of this moment, in the time zone of the browser. */
export function dayKey(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The day `offset` days from `key` (negative: before), by calendar (a change of hour does not shift it). */
export function shiftDay(key: string, offset: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d + offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The days as a map by day. */
export const daysMap = (days: Iterable<PracticeDay>): Map<string, number> =>
  new Map([...days].map(({ day, count }) => [day, count]));

/** Two sets of days put together: a day known to both keeps the larger count (the same practice seen twice). */
export function mergeDays(a: Iterable<PracticeDay>, b: Iterable<PracticeDay>): Map<string, number> {
  const merged = daysMap(a);
  for (const { day, count } of b) merged.set(day, Math.max(merged.get(day) ?? 0, count));
  return merged;
}

export interface Streak {
  /** Days in a row up to today, or up to yesterday while today is not done yet (the streak is still alive). */
  current: number;
  /** The longest run of days in a row. */
  longest: number;
  /** Whether something was done today. */
  isTodayDone: boolean;
}

export function streakOf(days: ReadonlyMap<string, number>, now: number): Streak {
  const today = dayKey(now);
  const isTodayDone = (days.get(today) ?? 0) > 0;
  let current = 0;
  for (let day = isTodayDone ? today : shiftDay(today, -1); (days.get(day) ?? 0) > 0; day = shiftDay(day, -1)) {
    current += 1;
  }
  let longest = 0;
  const sorted = [...days.entries()]
    .filter(([, count]) => count > 0)
    .map(([day]) => day)
    .sort();
  let run = 0;
  let previous = '';
  for (const day of sorted) {
    run = previous !== '' && shiftDay(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return { current, longest: Math.max(longest, current), isTodayDone };
}

/** 0 for a day without practice, then 1 to 4 as the day gets fuller. */
export function levelOf(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

export interface CalendarCell {
  day: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  /** After today: shown empty and not counted. */
  isFuture: boolean;
  isToday: boolean;
}

/**
 * The calendar: `weeks` columns of seven days from Monday to Sunday, the last one holding today. The days of the
 * last week that are still to come are marked as such.
 */
export function calendarWeeks(days: ReadonlyMap<string, number>, now: number, weeks = 16): CalendarCell[][] {
  const today = dayKey(now);
  const [y, m, d] = today.split('-').map(Number);
  // getDay(): 0 is Sunday; Monday comes first here
  const sinceMonday = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const first = shiftDay(today, -(sinceMonday + 7 * (weeks - 1)));
  const columns: CalendarCell[][] = [];
  for (let week = 0; week < weeks; week++) {
    const column: CalendarCell[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const day = shiftDay(first, week * 7 + weekday);
      const isFuture = day > today;
      const count = isFuture ? 0 : (days.get(day) ?? 0);
      column.push({ day, count, level: levelOf(count), isFuture, isToday: day === today });
    }
    columns.push(column);
  }
  return columns;
}

/** The days in the calendar window that were practised. */
export const activeDaysIn = (columns: readonly CalendarCell[][]): number =>
  columns.reduce((total, column) => total + column.filter((cell) => cell.count > 0).length, 0);

/** The most recent days, and no more than the limit: what is kept in the browser. */
export function pruneDays(days: ReadonlyMap<string, number>, max: number = MAX_PRACTICE_DAYS): PracticeDay[] {
  return [...days]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, max);
}

/**
 * The days that the work already saved shows (the last time each position was replayed, the puzzles played, the
 * Woodpecker cycles finished), counted one per moment: what the player did before the days were logged.
 */
export function daysFromTimes(times: Iterable<number>): Map<string, number> {
  const days = new Map<string, number>();
  for (const time of times) {
    if (!Number.isFinite(time) || time <= 0 || time > 8.64e15) continue;
    const day = dayKey(time);
    days.set(day, (days.get(day) ?? 0) + 1);
  }
  return days;
}
