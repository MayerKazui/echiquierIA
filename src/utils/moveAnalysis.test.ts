import { describe, expect, it } from 'vitest';
import { MoveAnalysis, MoveClassification } from '../types/chess';
import {
  CLASS_LIMITS,
  accuracyFromMoves,
  accuracyFromWinDrop,
  calculateWinPercentage,
  classifyMove,
  computePlayerStats,
  moveAccuracy,
} from './moveAnalysis';

/** A game from the White-perspective evaluation after each move (the first value is the starting position). */
function gameFromEvals(evals: number[]): MoveAnalysis[] {
  return evals.slice(1).map(
    (evalAfter, i) =>
      ({
        ply: i,
        color: i % 2 === 0 ? 'w' : 'b',
        evalBefore: evals[i],
        evalAfter,
        centipawnLoss: 0,
        classification: 'good',
      }) as MoveAnalysis
  );
}
const side = (game: MoveAnalysis[], color: 'w' | 'b') => game.filter((m) => m.color === color);
const accuracyOf = (game: MoveAnalysis[], color: 'w' | 'b') => accuracyFromMoves(side(game, color));
/** Quiet moves: the evaluation hovers around +20 cp. */
const quiet = (plies: number) => Array.from({ length: plies }, (_, i) => (i % 2 ? 15 : 25));

describe('calculateWinPercentage', () => {
  it('is 50% for an equal position', () => {
    expect(calculateWinPercentage(0)).toBeCloseTo(50, 5);
  });

  it('is symmetric around 0 and increases with the score', () => {
    expect(calculateWinPercentage(200) + calculateWinPercentage(-200)).toBeCloseTo(100, 5);
    expect(calculateWinPercentage(100)).toBeGreaterThan(calculateWinPercentage(50));
  });

  it("is Lichess' curve flattened (fitted on chess.com reviews)", () => {
    expect(calculateWinPercentage(100)).toBeCloseTo(55.5, 1);
    expect(calculateWinPercentage(300)).toBeCloseTo(66.0, 1);
    expect(calculateWinPercentage(-100)).toBeCloseTo(44.5, 1);
    // Lichess' own curve would give 59.1 and 75.1
    expect(calculateWinPercentage(100)).toBeLessThan(59.1);
  });

  it('clamps the score to ±1000 centipawns', () => {
    expect(calculateWinPercentage(5000)).toBe(calculateWinPercentage(1000));
    expect(calculateWinPercentage(-5000)).toBe(calculateWinPercentage(-1000));
    expect(calculateWinPercentage(1000)).toBeLessThan(100);
  });
});

describe('accuracyFromWinDrop', () => {
  it('is 100 when no win probability is lost, and never above', () => {
    expect(accuracyFromWinDrop(0)).toBe(100);
    expect(accuracyFromWinDrop(-5)).toBe(100);
  });

  it('decreases as the drop grows and stays within 0-100', () => {
    expect(accuracyFromWinDrop(5)).toBeGreaterThan(accuracyFromWinDrop(20));
    expect(accuracyFromWinDrop(20)).toBeGreaterThan(accuracyFromWinDrop(60));
    expect(accuracyFromWinDrop(100)).toBeGreaterThanOrEqual(0);
    expect(accuracyFromWinDrop(100)).toBeLessThan(5);
  });

  it("is Lichess' formula decaying 2.5 times faster (fitted on chess.com reviews)", () => {
    expect(accuracyFromWinDrop(5)).toBeCloseTo(57.7, 1);
    expect(accuracyFromWinDrop(10)).toBeCloseTo(32.6, 1);
    expect(accuracyFromWinDrop(30)).toBeCloseTo(1.8, 1);
    // Lichess' own formula would give 64.6 for a drop of 10
    expect(accuracyFromWinDrop(10)).toBeLessThan(64.6);
  });
});

describe('moveAccuracy', () => {
  it('uses the Win% lost by the mover, whatever the colour', () => {
    // White goes from +300 to -300; Black goes from -300 to +300: the same loss
    const white = moveAccuracy({ color: 'w', evalBefore: 300, evalAfter: -300, centipawnLoss: 600 });
    const black = moveAccuracy({ color: 'b', evalBefore: -300, evalAfter: 300, centipawnLoss: 600 });
    expect(white).toBeCloseTo(black, 5);
    expect(white).toBeLessThan(10);
  });

  it('is not affected by a mate score beyond what a Win% can express', () => {
    const mate = moveAccuracy({ color: 'w', evalBefore: 500, evalAfter: -10000, centipawnLoss: 10500 });
    const queen = moveAccuracy({ color: 'w', evalBefore: 500, evalAfter: -1000, centipawnLoss: 1500 });
    expect(mate).toBeCloseTo(queen, 5);
  });

  it('gives a move that improves the position full marks', () => {
    expect(moveAccuracy({ color: 'w', evalBefore: 0, evalAfter: 200, centipawnLoss: 0 })).toBe(100);
  });

  it('penalises a slip inside an already decided position far less than one that throws the game away', () => {
    // +12 -> +9 : the game is won either way
    const decided = moveAccuracy({ color: 'w', evalBefore: 1200, evalAfter: 900, centipawnLoss: 300 });
    const thrown = moveAccuracy({ color: 'w', evalBefore: 300, evalAfter: -300, centipawnLoss: 600 });
    expect(decided).toBeGreaterThan(70);
    expect(thrown).toBeLessThan(decided / 10);
  });

  it('falls back to the centipawn loss when evaluations are missing', () => {
    const accurate = moveAccuracy({ color: 'w', centipawnLoss: 0 } as MoveAnalysis);
    const poor = moveAccuracy({ color: 'w', centipawnLoss: 300 } as MoveAnalysis);
    expect(accurate).toBe(100);
    expect(poor).toBeLessThan(accurate);
  });
});

describe('accuracyFromMoves', () => {
  it('is 100 for no moves or a perfect game', () => {
    expect(accuracyFromMoves([])).toBe(100);
    expect(accuracyOf(gameFromEvals([20, ...quiet(40)]), 'w')).toBe(100);
  });

  it('bottoms out at the per-move floor for a lost game, far below the old 25% floor', () => {
    const awful = gameFromEvals([500, ...Array.from({ length: 20 }, (_, i) => (i % 2 ? 500 : -500))]);
    expect(accuracyOf(awful, 'w')).toBe(10);
  });

  it.each<[string, number]>([
    ['a blunder into a lost position', -400],
    ['a blunder into a forced mate', -10000],
  ])('stays realistic after a single blunder in a long game: %s', (_label, evalAfter) => {
    // 24 quiet plies, White blunders, then 15 more plies in the new position
    const game = gameFromEvals([20, ...quiet(24), evalAfter, ...Array.from({ length: 15 }, () => evalAfter)]);
    const white = accuracyOf(game, 'w');
    expect(white).toBeGreaterThan(80);
    expect(white).toBeLessThan(95); // still clearly below a clean game
    expect(accuracyOf(game, 'b')).toBeGreaterThan(95); // the opponent is not penalised
  });

  it('ranks players by the errors they made', () => {
    const few = gameFromEvals([20, ...quiet(20), -250, -250, ...quiet(16)]);
    const many = gameFromEvals([
      20,
      ...quiet(12),
      -250,
      -250,
      200,
      200,
      -250,
      -250,
      200,
      200,
      -250,
      -250,
      ...quiet(14),
    ]);
    expect(accuracyOf(few, 'w')).toBeGreaterThan(accuracyOf(many, 'w') + 15);
  });

  it('is barely touched by a slip made inside a decided position', () => {
    const game = gameFromEvals([20, ...quiet(10), 1200, 1200, 900, 900, 950, ...Array.from({ length: 10 }, () => 950)]);
    expect(accuracyOf(game, 'w')).toBeGreaterThan(97);
  });

  it('is a geometric mean: an isolated blunder weighs more than in a plain average', () => {
    // Without evaluations the moves are scored from their centipawn loss alone
    const perfect = { color: 'w', centipawnLoss: 0 } as MoveAnalysis;
    const blunder = { color: 'w', centipawnLoss: 1000 } as MoveAnalysis;
    const moves = [...Array.from({ length: 9 }, () => perfect), blunder];
    const plainMean = (9 * 100 + moveAccuracy(blunder)) / 10;
    expect(plainMean).toBeGreaterThan(85);
    expect(accuracyFromMoves(moves)).toBeGreaterThan(70);
    expect(accuracyFromMoves(moves)).toBeLessThan(plainMean - 5);
  });

  it('does not let a single move go below the floor, however bad it is', () => {
    const perfect = { color: 'w', centipawnLoss: 0 } as MoveAnalysis;
    const mate = { color: 'w', evalBefore: 500, evalAfter: -10000, centipawnLoss: 10500 } as MoveAnalysis;
    const queen = { color: 'w', evalBefore: 500, evalAfter: -1000, centipawnLoss: 1500 } as MoveAnalysis;
    expect(accuracyFromMoves([perfect, perfect, mate])).toBe(accuracyFromMoves([perfect, perfect, queen]));
    expect(accuracyFromMoves([perfect, perfect, mate])).toBeGreaterThan(40);
  });
});

describe('classifyMove', () => {
  // classifyMove(isWhite, playedSan, bestSan, winPctDrop, evalBefore, evalAfter, isSacrifice)
  it('labels the engine move (or a near-identical one) as best', () => {
    expect(classifyMove(true, 'Nf3', 'Nf3', 0, 20, 20)).toBe('best');
    expect(classifyMove(true, 'Nf3', 'Nf3', 6, 20, 20)).toBe('best'); // the engine's own move is always "best"
    expect(classifyMove(true, 'd4', 'Nf3', CLASS_LIMITS.best, 20, 10)).toBe('best');
  });

  it('labels a sacrifice that gives nothing away as brilliant', () => {
    expect(classifyMove(true, 'Bxh7+', 'Nf3', 1, 50, 150, true)).toBe('brilliant');
    // Without a sacrifice the same move is only "excellent"
    expect(classifyMove(true, 'Bxh7+', 'Nf3', 1, 50, 150, false)).toBe('excellent');
  });

  it('does not label a costly sacrifice as brilliant', () => {
    expect(classifyMove(true, 'Bxh7+', 'Nf3', 2, 50, 150, true)).toBe('good');
  });

  it('detects a missed win for White and for Black', () => {
    expect(classifyMove(true, 'h3', 'Qxf7#', 40, 300, 0)).toBe('missedWin');
    expect(classifyMove(false, 'h6', 'Qxf2#', 40, -300, 0)).toBe('missedWin');
  });

  it('does not report a missed win when the advantage is kept', () => {
    expect(classifyMove(true, 'h3', 'Qxf7#', 10, 300, 180)).toBe('mistake');
  });

  it.each<[number, MoveClassification]>([
    [0.4, 'excellent'],
    [1.1, 'excellent'],
    [1.2, 'good'],
    [2.9, 'good'],
    [3, 'inaccuracy'],
    [5.9, 'inaccuracy'],
    [6, 'mistake'],
    [11.9, 'mistake'],
    [12, 'blunder'],
    [80, 'blunder'],
  ])('limits: a Win%-drop of %s is %s', (winPctDrop, expected) => {
    // Evaluations stay close to equal so the "missed win" rule cannot apply
    expect(classifyMove(true, 'a3', 'e4', winPctDrop, 20, -20)).toBe(expected);
  });

  it('is based on the Win% only: giving up pawns in a won position is not a blunder', () => {
    // +12 -> +9 is about two points of win probability
    const drop = calculateWinPercentage(1200) - calculateWinPercentage(900);
    expect(drop).toBeLessThan(CLASS_LIMITS.good);
    expect(classifyMove(true, 'a3', 'e4', drop, 1200, 900)).toBe('good');
  });
});

function move(partial: Partial<MoveAnalysis>): MoveAnalysis {
  return { ply: 0, classification: 'good', centipawnLoss: 0, ...partial } as MoveAnalysis;
}

describe('computePlayerStats', () => {
  it('does not give two players with different mistakes the same floored accuracy', () => {
    const blunder = (ply: number, evalAfter: number) =>
      move({ ply, color: 'w', classification: 'blunder', evalBefore: 300, evalAfter, centipawnLoss: 300 - evalAfter });
    const solid = (ply: number) => move({ ply, color: 'w', evalBefore: 0, evalAfter: 0 });
    const a = computePlayerStats([...[0, 2, 4, 6, 8, 10, 12, 14].map(solid), blunder(16, -10000), blunder(18, -10000)]);
    const b = computePlayerStats([...[0, 2, 4, 6, 8, 10, 12, 14].map(solid), blunder(16, -10000), blunder(18, 0)]);
    expect(a.accuracy).toBeLessThan(b.accuracy);
    expect(a.accuracy).toBeGreaterThan(40);
  });

  it('counts each classification and computes the average loss and accuracy', () => {
    const moves = [
      move({ ply: 0, classification: 'book' }),
      move({ ply: 2, classification: 'best' }),
      move({ ply: 4, classification: 'brilliant' }),
      move({ ply: 6, classification: 'excellent', centipawnLoss: 10 }),
      move({ ply: 8, classification: 'good', centipawnLoss: 30 }),
      move({ ply: 10, classification: 'inaccuracy', centipawnLoss: 60 }),
      move({ ply: 12, classification: 'mistake', centipawnLoss: 100 }),
      move({ ply: 24, classification: 'blunder', centipawnLoss: 300 }),
      move({ ply: 60, classification: 'missedWin', centipawnLoss: 400 }),
      move({ ply: 62, classification: 'mistake', centipawnLoss: 100 }),
    ];
    const stats = computePlayerStats(moves);

    expect(stats).toMatchObject({
      totalMoves: 10,
      book: 1,
      best: 1,
      brilliant: 1,
      excellent: 1,
      good: 1,
      inaccuracies: 1,
      mistakes: 2,
      blunders: 2, // blunders and missed wins are counted together
      avgCentipawnLoss: 100,
    });
    expect(stats.accuracy).toBe(accuracyFromMoves(moves));
  });

  it('attributes mistakes and blunders to the opening, middlegame or endgame by ply', () => {
    const stats = computePlayerStats([
      move({ ply: 4, classification: 'mistake' }),
      move({ ply: 30, classification: 'blunder' }),
      move({ ply: 31, classification: 'mistake' }),
      move({ ply: 70, classification: 'missedWin' }),
    ]);
    expect(stats.openingBlunders).toBe(1);
    expect(stats.middlegameBlunders).toBe(2);
    expect(stats.endgameBlunders).toBe(1);
  });

  it('reports think-time metrics only when clock data exists', () => {
    const withClock = computePlayerStats([
      move({ thinkTimeSeconds: 4, isRushed: true }),
      move({ thinkTimeSeconds: 11, isLongThink: true }),
      move({ thinkTimeSeconds: 3 }),
    ]);
    expect(withClock.avgThinkTimeSeconds).toBe(6);
    expect(withClock.longThinksCount).toBe(1);
    expect(withClock.rushedMovesCount).toBe(1);

    expect(computePlayerStats([move({})]).avgThinkTimeSeconds).toBeUndefined();
  });

  it('handles a player with no moves', () => {
    const stats = computePlayerStats([]);
    expect(stats.totalMoves).toBe(1);
    expect(stats.avgCentipawnLoss).toBe(0);
    expect(stats.accuracy).toBe(100);
  });
});
