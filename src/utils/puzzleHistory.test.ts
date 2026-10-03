import { describe, expect, it } from 'vitest';
import type { Puzzle } from './puzzleData';
import {
  EMPTY_HISTORY,
  MAX_LOG,
  MAX_SEEN,
  MAX_SESSIONS,
  MIN_THEME_ATTEMPTS,
  addAttempt,
  addSession,
  attemptKey,
  orderForPlay,
  overallTally,
  themeTallies,
  weakestTheme,
  weeklyAttempts,
  WEEK_MS,
  type PuzzleAttempt,
} from './puzzleHistory';

const puzzle = (id: string, themes: string[] = ['fork'], rating = 1000): Puzzle => ({
  id,
  fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  moves: ['e2e4', 'e7e5'],
  rating,
  themes,
});
const attempt = (at: number, themes: string[], ok = true, id = `p${at}`): PuzzleAttempt => ({
  at,
  id,
  ok,
  rating: 1000,
  themes,
});
const NOW = 100 * WEEK_MS;

describe('addAttempt', () => {
  it('notes a puzzle played, and how often it was played and won', () => {
    let history = addAttempt(EMPTY_HISTORY, puzzle('a'), false, 10);
    history = addAttempt(history, puzzle('a'), true, 20);
    expect(history.seen.get('a')).toEqual({ id: 'a', plays: 2, wins: 1, lastAt: 20 });
    expect(history.log.map((a) => [a.at, a.ok])).toEqual([
      [10, false],
      [20, true],
    ]);
    expect(history.log[0]).toMatchObject({ id: 'a', rating: 1000, themes: ['fork'] });
  });

  it('does not change the history it starts from', () => {
    const history = addAttempt(EMPTY_HISTORY, puzzle('a'), true, 10);
    addAttempt(history, puzzle('b'), true, 20);
    expect(history.seen.size).toBe(1);
    expect(history.log).toHaveLength(1);
    expect(EMPTY_HISTORY.log).toHaveLength(0);
  });

  it('keeps the latest attempts only', () => {
    let history = EMPTY_HISTORY;
    for (let i = 0; i < MAX_LOG + 3; i++) history = addAttempt(history, puzzle('a'), true, i);
    expect(history.log).toHaveLength(MAX_LOG);
    expect(history.log[0].at).toBe(3);
  });

  it('forgets the puzzles played longest ago past the limit', () => {
    const full = new Map(
      Array.from({ length: MAX_SEEN }, (_, i) => [`p${i}`, { id: `p${i}`, plays: 1, wins: 1, lastAt: i }] as const)
    );
    const history = addAttempt({ ...EMPTY_HISTORY, seen: full }, puzzle('new'), true, MAX_SEEN + 5);
    expect(history.seen.size).toBe(MAX_SEEN);
    expect(history.seen.has('p0')).toBe(false);
    expect(history.seen.has('p1')).toBe(true);
    expect(history.seen.has('new')).toBe(true);
  });
});

describe('addSession', () => {
  it('keeps the latest sessions only', () => {
    let history = EMPTY_HISTORY;
    for (let i = 0; i < MAX_SESSIONS + 2; i++) {
      history = addSession(history, { at: i, mode: 'free', solved: 1, total: 2, elapsedMs: 1, minutes: null });
    }
    expect(history.sessions).toHaveLength(MAX_SESSIONS);
    expect(history.sessions[0].at).toBe(2);
  });
});

describe('orderForPlay', () => {
  const pool = ['a', 'b', 'c', 'd'].map((id) => puzzle(id));
  const seen = new Map([
    ['a', { id: 'a', plays: 1, wins: 1, lastAt: 50 }],
    ['c', { id: 'c', plays: 1, wins: 0, lastAt: 10 }],
  ]);

  it('puts the puzzles never played first, then the ones played longest ago', () => {
    const order = orderForPlay(pool, seen).map((p) => p.id);
    expect(order.slice(0, 2).sort()).toEqual(['b', 'd']);
    expect(order.slice(2)).toEqual(['c', 'a']);
  });

  it('draws the fresh ones in an order that follows the random numbers', () => {
    const fresh = ['a', 'b', 'c', 'd'].map((id) => puzzle(id));
    expect(orderForPlay(fresh, new Map(), () => 0.99).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(orderForPlay(fresh, new Map(), () => 0).map((p) => p.id)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('keeps every puzzle once, and does not touch the pool', () => {
    const copy = [...pool];
    expect(orderForPlay(pool, seen)).toHaveLength(4);
    expect(pool).toEqual(copy);
    expect(orderForPlay([], seen)).toEqual([]);
  });
});

describe('the figures', () => {
  const log = [
    attempt(NOW - 40 * 24 * 3600_000, ['fork'], false),
    attempt(NOW - 3 * 24 * 3600_000, ['fork', 'short'], true),
    attempt(NOW - 2 * 24 * 3600_000, ['fork', 'pin'], false),
    attempt(NOW - 1000, ['pin'], true),
  ];

  it('tells the share of puzzles solved, over all the attempts or over a window', () => {
    expect(overallTally(log, NOW)).toEqual({ attempts: 4, wins: 2, rate: 0.5 });
    expect(overallTally(log, NOW, WEEK_MS)).toEqual({ attempts: 3, wins: 2, rate: 2 / 3 });
    expect(overallTally([], NOW)).toEqual({ attempts: 0, wins: 0, rate: null });
  });

  it('counts the attempts of the week on some themes', () => {
    expect(weeklyAttempts(log, ['fork'], NOW)).toBe(2);
    expect(weeklyAttempts(log, ['fork', 'pin'], NOW)).toBe(3);
    expect(weeklyAttempts(log, ['skewer'], NOW)).toBe(0);
  });

  it('tallies by theme, the most played first, leaving out what says only how a puzzle is', () => {
    const tallies = themeTallies(log, NOW);
    expect(tallies.map((t) => [t.theme, t.attempts, t.wins])).toEqual([
      ['fork', 3, 1],
      ['pin', 2, 1],
    ]);
    expect(themeTallies(log, NOW, WEEK_MS).map((t) => t.theme)).toEqual(['fork', 'pin']);
    expect(themeTallies(log, NOW, WEEK_MS)[0]).toMatchObject({ theme: 'fork', attempts: 2 });
  });

  it('finds the weakest theme only among those played enough', () => {
    const many = (theme: string, wins: number, total: number) =>
      Array.from({ length: total }, (_, i) => attempt(NOW - i, [theme], i < wins, `${theme}${i}`));
    const tallies = themeTallies(
      [...many('fork', 1, MIN_THEME_ATTEMPTS), ...many('pin', 4, 6), ...many('skewer', 0, 2)],
      NOW
    );
    expect(weakestTheme(tallies)?.theme).toBe('fork');
    expect(weakestTheme(themeTallies(many('skewer', 0, MIN_THEME_ATTEMPTS - 1), NOW))).toBeNull();
    expect(weakestTheme([])).toBeNull();
  });
});

describe('attemptKey', () => {
  it('sorts as the attempts happened, and tells two puzzles of the same moment apart', () => {
    const keys = [attemptKey({ at: 9, id: 'x' }), attemptKey({ at: 10, id: 'x' }), attemptKey({ at: 100, id: 'a' })];
    expect([...keys].sort()).toEqual(keys);
    expect(attemptKey({ at: 5, id: 'a' })).not.toBe(attemptKey({ at: 5, id: 'b' }));
  });
});
