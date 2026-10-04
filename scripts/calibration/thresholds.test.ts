import { beforeAll, describe, expect, it } from 'vitest';
import { ensureOpeningBookLoaded, getOpeningPosition } from '../../src/services/openingBook';
import { loadOpeningsFromDisk } from '../../src/test/openings';
import { MAX_MOVES, PROMOTION_WIN_PERCENT } from '../../src/utils/endgameDrill';
import { ACCURACY_PLIES } from '../../src/utils/openingRepertoire';
import { MIN_FAMILY_GAMES, MIN_LINE_GAMES, STRONG_SCORE, WEAK_SCORE } from '../../src/utils/opponentPrep';
import type { PlayerSample } from './chesscom';
import { loadReference } from './reference';
import {
  accuracyWindows,
  conversionLengths,
  flagReliability,
  habitReliability,
  loadPlayers,
  pointsOf,
  scoreAcross,
  type WindowRow,
} from './thresholds';

/**
 * The thresholds that were first set by hand, against the real games of the calibration (`bun run thresholds` prints
 * the figures behind them). Each limit sits a little beyond today's measure: a threshold moved without a reason, or a
 * change to the analysis that makes a threshold meaningless, fails here. To move one on purpose, run the report and
 * say why in the commit message.
 */
const reference = loadReference();
const decided = reference.games.filter((g) => g.result);

describe('ACCURACY_PLIES', () => {
  let row: WindowRow;
  let shorter: WindowRow;

  beforeAll(async () => {
    await ensureOpeningBookLoaded(loadOpeningsFromDisk);
    [row, shorter] = await accuracyWindows(reference.games, [ACCURACY_PLIES, 10]);
  }, 120_000);

  it('gives almost every game enough moves to rate an opening', () => {
    expect(row.coverage).toBeGreaterThan(0.95);
  });

  it('keeps the accuracy of an opening met three times within about 4 points of the truth', () => {
    // Today 4.2 points; at 10 plies it is 5.3: a window that short rates an opening with a gap that is noise
    expect(row.noise).toBeLessThan(4.5);
    expect(shorter.noise).toBeGreaterThan(row.noise);
  });

  it('says something about how the player plays afterwards', () => {
    expect(row.correlation).toBeGreaterThan(0.25);
  });
});

describe('the endgame drill', () => {
  it(`has a real step in the points at ${PROMOTION_WIN_PERCENT} % of win chance`, () => {
    const { below, above } = scoreAcross(decided, PROMOTION_WIN_PERCENT, true);
    expect(below.positions).toBeGreaterThan(200);
    expect(above.positions).toBeGreaterThan(500);
    // Today 61 % just under and 85 % from 70: from there on a position is won, under it it is only better
    expect(above.score).toBeGreaterThan(0.8);
    expect(below.score).toBeLessThan(0.7);
  });

  it(`asks for more than players need to convert a won endgame (${MAX_MOVES} moves)`, () => {
    const conversion = conversionLengths(decided, PROMOTION_WIN_PERCENT, MAX_MOVES);
    expect(conversion.games).toBeGreaterThan(40);
    // Today: median 9 moves, 9 games in 10 within 26
    expect(conversion.moves.p90).toBeLessThan(MAX_MOVES);
    expect(conversion.withinLimit).toBeGreaterThan(0.95);
  });
});

describe('the opponent preparation', () => {
  const players = loadPlayers();
  const games = players.reduce((n, p) => n + p.games.length, 0);

  beforeAll(() => ensureOpeningBookLoaded(loadOpeningsFromDisk));

  it('is measured on enough players and games, of all levels', () => {
    expect(players.length).toBeGreaterThanOrEqual(30);
    expect(games).toBeGreaterThanOrEqual(4500);
    const ratings = players.map((p) => p.rating);
    expect(Math.min(...ratings)).toBeLessThan(1000);
    expect(Math.max(...ratings)).toBeGreaterThan(2000);
  });

  it(`finds a habit in a line played ${MIN_LINE_GAMES} times: it comes back in about 6 games in 7`, () => {
    const [once, habit, often] = habitReliability(players, [1, MIN_LINE_GAMES, 8]);
    expect(habit.predictions).toBeGreaterThan(5000);
    // Today 79 % for a move seen once, 86 % at three times, 90 % at eight
    expect(habit.hitRate).toBeGreaterThan(0.83);
    expect(habit.hitRate).toBeGreaterThan(once.hitRate + 0.05);
    expect(often.hitRate).toBeGreaterThan(habit.hitRate);
  }, 60_000);

  it('rates openings that describe a record, not one that forecasts the next game', () => {
    // Today the openings rated weak make 53 % of the points in the next game, those rated strong 53 % too (± 3): the
    // labels say what happened, and the screen must not promise more. A gap beyond three times its error would mean
    // that the labels have become a forecast: then the wording of the screen and the thresholds are worth revisiting.
    const [row] = flagReliability(players, getOpeningPosition, [
      { minGames: MIN_FAMILY_GAMES, weakBelow: WEAK_SCORE, strongFrom: STRONG_SCORE },
    ]);
    expect(row.weak.games).toBeGreaterThan(500);
    expect(row.strong.games).toBeGreaterThan(500);
    expect(Math.abs(row.gap)).toBeLessThan(3 * row.error);
  }, 60_000);
});

describe('the measures', () => {
  const player = (...results: Array<[`${'w' | 'b'}`, '1-0' | '0-1' | '1/2-1/2', string]>): PlayerSample => ({
    rating: 1500,
    games: results as PlayerSample['games'],
  });

  it('give a point for a win, half for a draw', () => {
    expect(pointsOf('1-0', 'w')).toBe(1);
    expect(pointsOf('1-0', 'b')).toBe(0);
    expect(pointsOf('0-1', 'b')).toBe(1);
    expect(pointsOf('1/2-1/2', 'b')).toBe(0.5);
  });

  it('check a forecast against the next game, own moves only', () => {
    const rows = habitReliability(
      [player(['w', '1-0', 'e4'], ['w', '1-0', 'e4'], ['w', '1-0', 'e4'], ['w', '1-0', 'd4'])],
      [1, 3]
    );
    expect(rows[0]).toMatchObject({ predictions: 3, hitRate: 2 / 3 });
    expect(rows[1]).toMatchObject({ predictions: 1, hitRate: 0 });
  });

  it('judge a game on the earlier ones with the same colour and opening family', () => {
    const sicilian = 'e4 c5';
    const [row] = flagReliability(
      [player(['w', '0-1', sicilian], ['w', '0-1', sicilian], ['w', '0-1', sicilian], ['w', '1-0', sicilian])],
      getOpeningPosition,
      [{ minGames: 3, weakBelow: 0.4, strongFrom: 0.6 }]
    );
    // After three defeats the opening is rated weak; the fourth game, a win, is what the label is checked against
    expect(row.weak).toEqual({ games: 1, score: 1 });
    expect(row.strong.games).toBe(0);
  });
});
