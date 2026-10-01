import { describe, expect, it } from 'vitest';
import { MoveAnalysis, MoveClassification } from '../types/chess';
import {
  accuracyFromMoves,
  accuracyFromWinDrop,
  calculateWinPercentage,
  classifyMove,
  computePlayerStats,
  moveAccuracy,
} from './moveAnalysis';

describe('calculateWinPercentage', () => {
  it('is 50% for an equal position', () => {
    expect(calculateWinPercentage(0)).toBeCloseTo(50, 5);
  });

  it('is symmetric around 0 and increases with the score', () => {
    expect(calculateWinPercentage(200) + calculateWinPercentage(-200)).toBeCloseTo(100, 5);
    expect(calculateWinPercentage(100)).toBeGreaterThan(calculateWinPercentage(50));
    expect(calculateWinPercentage(100)).toBeGreaterThan(50);
  });

  it('clamps the score to ±1000 centipawns', () => {
    expect(calculateWinPercentage(5000)).toBe(calculateWinPercentage(1000));
    expect(calculateWinPercentage(-5000)).toBe(calculateWinPercentage(-1000));
    expect(calculateWinPercentage(1000)).toBeLessThan(100);
  });
});

describe('accuracyFromWinDrop', () => {
  it('is (almost) 100 when no win probability is lost', () => {
    expect(accuracyFromWinDrop(0)).toBeCloseTo(100, 1);
    expect(accuracyFromWinDrop(-5)).toBe(accuracyFromWinDrop(0));
  });

  it('decreases as the drop grows and stays within 0-100', () => {
    expect(accuracyFromWinDrop(5)).toBeGreaterThan(accuracyFromWinDrop(20));
    expect(accuracyFromWinDrop(20)).toBeGreaterThan(accuracyFromWinDrop(60));
    expect(accuracyFromWinDrop(100)).toBeGreaterThanOrEqual(0);
    expect(accuracyFromWinDrop(100)).toBeLessThan(5);
  });
});

describe('moveAccuracy', () => {
  it('uses the Win% lost by the mover, whatever the colour', () => {
    // White goes from +300 to -300; Black goes from -300 to +300: the same loss
    const white = moveAccuracy({ color: 'w', evalBefore: 300, evalAfter: -300, centipawnLoss: 600 });
    const black = moveAccuracy({ color: 'b', evalBefore: -300, evalAfter: 300, centipawnLoss: 600 });
    expect(white).toBeCloseTo(black, 5);
    expect(white).toBeLessThan(15);
  });

  it('is not affected by a mate score beyond what a Win% can express', () => {
    const mate = moveAccuracy({ color: 'w', evalBefore: 500, evalAfter: -10000, centipawnLoss: 10500 });
    const queen = moveAccuracy({ color: 'w', evalBefore: 500, evalAfter: -1000, centipawnLoss: 1500 });
    expect(mate).toBeCloseTo(queen, 5);
  });

  it('gives a move that improves the position full marks', () => {
    expect(moveAccuracy({ color: 'w', evalBefore: 0, evalAfter: 200, centipawnLoss: 0 })).toBeCloseTo(100, 1);
  });

  it('falls back to the centipawn loss when evaluations are missing', () => {
    const accurate = moveAccuracy({ color: 'w', centipawnLoss: 0 } as MoveAnalysis);
    const poor = moveAccuracy({ color: 'w', centipawnLoss: 300 } as MoveAnalysis);
    expect(accurate).toBeCloseTo(100, 1);
    expect(poor).toBeLessThan(accurate);
  });
});

describe('accuracyFromMoves', () => {
  const played = (evalBefore: number, evalAfter: number): MoveAnalysis =>
    ({ color: 'w', evalBefore, evalAfter, centipawnLoss: Math.max(0, evalBefore - evalAfter) }) as MoveAnalysis;

  it('is 100 for no moves or a perfect game', () => {
    expect(accuracyFromMoves([])).toBe(100);
    expect(accuracyFromMoves([played(0, 0), played(0, 20)])).toBeGreaterThan(99.9);
  });

  it('is not floored: a lost game can go well under 25', () => {
    const awful = Array.from({ length: 10 }, () => played(500, -500));
    expect(accuracyFromMoves(awful)).toBeLessThan(10);
  });

  it('is not wiped out by a single blunder (even into a mate) among solid moves', () => {
    const solid = Array.from({ length: 19 }, () => played(0, -5));
    expect(accuracyFromMoves([...solid, played(300, -10000)])).toBeGreaterThan(85);
  });

  it('ranks players by the errors they made', () => {
    const fewer = [...Array.from({ length: 18 }, () => played(0, 0)), played(0, -300), played(0, -300)];
    const more = [
      ...Array.from({ length: 14 }, () => played(0, 0)),
      ...Array.from({ length: 6 }, () => played(0, -300)),
    ];
    expect(accuracyFromMoves(fewer)).toBeGreaterThan(accuracyFromMoves(more));
  });
});

describe('classifyMove', () => {
  // classifyMove(isWhite, playedSan, bestSan, cpLoss, winPctDrop, evalBefore, evalAfter, isSacrifice)
  it('labels the engine move (or a near-identical one) as best', () => {
    expect(classifyMove(true, 'Nf3', 'Nf3', 0, 0, 20, 20)).toBe('best');
    expect(classifyMove(true, 'd4', 'Nf3', 10, 0.5, 20, 10)).toBe('best');
  });

  it('labels a sacrifice that is as good as the best move as brilliant', () => {
    expect(classifyMove(true, 'Bxh7+', 'Nf3', 8, 1, 50, 150, true)).toBe('brilliant');
    // The engine's own move, with up to 15 cp of noise, also counts
    expect(classifyMove(true, 'Bxh7+', 'Bxh7+', 14, 1, 50, 150, true)).toBe('brilliant');
    // Without a sacrifice the same move is only "best"
    expect(classifyMove(true, 'Bxh7+', 'Nf3', 8, 1, 50, 150, false)).toBe('best');
  });

  it('does not label a costly sacrifice as brilliant', () => {
    expect(classifyMove(true, 'Bxh7+', 'Nf3', 40, 3, 50, 150, true)).toBe('good');
  });

  it('detects a missed win for White and for Black', () => {
    expect(classifyMove(true, 'h3', 'Qxf7#', 300, 40, 300, 0)).toBe('missedWin');
    expect(classifyMove(false, 'h6', 'Qxf2#', 300, 40, -300, 0)).toBe('missedWin');
  });

  it('does not report a missed win when the advantage is kept', () => {
    expect(classifyMove(true, 'h3', 'Qxf7#', 120, 10, 300, 180)).toBe('mistake');
  });

  it.each<[string, number, number, MoveClassification]>([
    ['win% drop of 18', 50, 18, 'blunder'],
    ['loss of 200 cp', 200, 5, 'blunder'],
    ['win% drop of 9', 50, 9, 'mistake'],
    ['loss of 90 cp', 90, 2, 'mistake'],
    ['win% drop of 4', 20, 4, 'inaccuracy'],
    ['loss of 45 cp', 45, 1, 'inaccuracy'],
    ['loss of 25 cp', 25, 1, 'excellent'],
    ['loss of 30 cp', 30, 1, 'good'],
  ])('thresholds: %s', (_label, cpLoss, winPctDrop, expected) => {
    // Evaluations stay close to equal so the "missed win" rule cannot apply
    expect(classifyMove(true, 'a3', 'e4', cpLoss, winPctDrop, 20, 20 - cpLoss)).toBe(expected);
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
    expect(a.accuracy).toBeGreaterThan(25);
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
