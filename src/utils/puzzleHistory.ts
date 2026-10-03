import type { Puzzle } from './puzzleData';
import { DAY_MS } from './spacedRepetition';

/**
 * What the player has done with the puzzles, kept to draw puzzles never played first, to show how they do by theme,
 * and to give the plan of the week a progress. Three records, all small:
 * - `seen`: one per puzzle played (how many times, when last), so that a puzzle is not drawn again before the others;
 * - `log`: the latest attempts (the first outcome of a puzzle each time it was shown), for the figures by theme and
 *   by week;
 * - `sessions`: the score of each free session or review.
 */

export interface SeenPuzzle {
  id: string;
  plays: number;
  wins: number;
  /** When it was last played (ms). */
  lastAt: number;
}

export interface PuzzleAttempt {
  /** When (ms). */
  at: number;
  id: string;
  /** Solved without a wrong move. */
  ok: boolean;
  rating: number;
  themes: string[];
}

export interface PuzzleSession {
  /** When it ended (ms); identifies the session. */
  at: number;
  mode: 'free' | 'review';
  solved: number;
  total: number;
  elapsedMs: number;
  /** The timer that was set, in minutes; null without one. */
  minutes: number | null;
}

export interface PuzzleHistory {
  seen: ReadonlyMap<string, SeenPuzzle>;
  /** Oldest first. */
  log: readonly PuzzleAttempt[];
  /** Oldest first. */
  sessions: readonly PuzzleSession[];
  /**
   * When the player cleared the history (ms, 0 for never). Everything played up to then is gone, here and, through
   * the backup, on the other devices: it is what stops a copy that still has the old records from bringing them back.
   */
  clearedAt: number;
}

/** Attempts kept: the backup stays small (about 3 MB of text, much less compressed). */
export const MAX_LOG = 20_000;
export const MAX_SESSIONS = 200;
/** Puzzles remembered (out of the 200 000 there are): the ones played longest ago are forgotten first. */
export const MAX_SEEN = 20_000;

export const EMPTY_HISTORY: PuzzleHistory = { seen: new Map(), log: [], sessions: [], clearedAt: 0 };

/** The history once cleared at `now`: nothing is left, and the date is kept. */
export const clearedHistory = (now: number): PuzzleHistory => ({ ...EMPTY_HISTORY, clearedAt: now });

export const WEEK_MS = 7 * DAY_MS;
export const MONTH_MS = 30 * DAY_MS;
/** Puzzles to play in a week on the theme of an objective of the plan. */
export const PLAN_PUZZLE_TARGET = 10;
/** Attempts on a theme from which its success rate means something. */
export const MIN_THEME_ATTEMPTS = 5;

/** Themes that say how a puzzle is (its length, where it comes from), not what it is about. */
const NOT_A_SUBJECT: ReadonlySet<string> = new Set([
  'short',
  'long',
  'veryLong',
  'oneMove',
  'master',
  'masterVsMaster',
  'superGM',
]);

export const attemptKey = (attempt: Pick<PuzzleAttempt, 'at' | 'id'>): string =>
  `${String(attempt.at).padStart(15, '0')}:${attempt.id}`;

/** The history after a puzzle was played. */
export function addAttempt(history: PuzzleHistory, puzzle: Puzzle, ok: boolean, now: number): PuzzleHistory {
  const before = history.seen.get(puzzle.id);
  const seen = new Map(history.seen);
  seen.set(puzzle.id, {
    id: puzzle.id,
    plays: (before?.plays ?? 0) + 1,
    wins: (before?.wins ?? 0) + (ok ? 1 : 0),
    lastAt: now,
  });
  if (seen.size > MAX_SEEN) {
    const oldest = [...seen.values()].sort((a, b) => a.lastAt - b.lastAt).slice(0, seen.size - MAX_SEEN);
    for (const { id } of oldest) seen.delete(id);
  }
  const attempt: PuzzleAttempt = { at: now, id: puzzle.id, ok, rating: puzzle.rating, themes: puzzle.themes };
  return { ...history, seen, log: [...history.log, attempt].slice(-MAX_LOG) };
}

export function addSession(history: PuzzleHistory, session: PuzzleSession): PuzzleHistory {
  return { ...history, sessions: [...history.sessions, session].slice(-MAX_SESSIONS) };
}

/**
 * The puzzles in the order to play them: the ones never played first (in a random order), then the ones played, the
 * longest ago first. `random` is injectable for the tests.
 */
export function orderForPlay(
  pool: readonly Puzzle[],
  seen: ReadonlyMap<string, SeenPuzzle>,
  random: () => number = Math.random
): Puzzle[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const fresh = shuffled.filter((puzzle) => !seen.has(puzzle.id));
  const played = shuffled
    .filter((puzzle) => seen.has(puzzle.id))
    .sort((a, b) => seen.get(a.id)!.lastAt - seen.get(b.id)!.lastAt);
  return [...fresh, ...played];
}

export interface Tally {
  attempts: number;
  wins: number;
  /** Share of puzzles solved, 0 to 1; null without any attempt. */
  rate: number | null;
}

const tally = (attempts: readonly PuzzleAttempt[]): Tally => {
  const wins = attempts.filter((a) => a.ok).length;
  return { attempts: attempts.length, wins, rate: attempts.length === 0 ? null : wins / attempts.length };
};

/** The attempts of the last `windowMs` (all of them without a window). */
const within = (log: readonly PuzzleAttempt[], now: number, windowMs?: number) =>
  windowMs === undefined ? log : log.filter((a) => a.at >= now - windowMs);

export const overallTally = (log: readonly PuzzleAttempt[], now: number, windowMs?: number): Tally =>
  tally(within(log, now, windowMs));

/** Attempts on any of these themes in the last week (the progress of an objective of the plan). */
export function weeklyAttempts(log: readonly PuzzleAttempt[], themes: readonly string[], now: number): number {
  return within(log, now, WEEK_MS).filter((a) => a.themes.some((theme) => themes.includes(theme))).length;
}

export interface ThemeTally extends Tally {
  theme: string;
}

/** The figures of every theme played, the most played first (ties by name). */
export function themeTallies(log: readonly PuzzleAttempt[], now: number, windowMs?: number): ThemeTally[] {
  const byTheme = new Map<string, PuzzleAttempt[]>();
  for (const attempt of within(log, now, windowMs)) {
    for (const theme of attempt.themes) {
      if (NOT_A_SUBJECT.has(theme)) continue;
      byTheme.set(theme, [...(byTheme.get(theme) ?? []), attempt]);
    }
  }
  return [...byTheme.entries()]
    .map(([theme, attempts]) => ({ theme, ...tally(attempts) }))
    .sort((a, b) => b.attempts - a.attempts || (a.theme < b.theme ? -1 : 1));
}

/** The theme with the lowest success rate among those played enough, null when none is. */
export function weakestTheme(tallies: readonly ThemeTally[]): ThemeTally | null {
  return tallies
    .filter((t) => t.attempts >= MIN_THEME_ATTEMPTS && t.rate !== null)
    .reduce<ThemeTally | null>((worst, t) => (!worst || t.rate! < worst.rate! ? t : worst), null);
}
