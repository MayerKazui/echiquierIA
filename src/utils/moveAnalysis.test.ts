import { describe, expect, it } from 'vitest';
import { MoveAnalysis, MoveClassification } from '../types/chess';
import { accuracyFromCpLoss, calculateWinPercentage, classifyMove, computePlayerStats } from './moveAnalysis';

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

describe('accuracyFromCpLoss', () => {
  it('caps a perfect game at 99.4', () => {
    expect(accuracyFromCpLoss(0)).toBe(99.4);
  });

  it('floors very bad games at 25', () => {
    expect(accuracyFromCpLoss(2000)).toBe(25);
  });

  it('decreases as the average loss grows', () => {
    expect(accuracyFromCpLoss(20)).toBeGreaterThan(accuracyFromCpLoss(60));
    expect(accuracyFromCpLoss(60)).toBeGreaterThan(accuracyFromCpLoss(150));
  });

  it('follows 100 * exp(-0.0038 * loss), rounded to one decimal', () => {
    expect(accuracyFromCpLoss(50)).toBe(82.7);
    expect(accuracyFromCpLoss(100)).toBe(68.4);
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
    expect(stats.accuracy).toBe(accuracyFromCpLoss(100));
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
    expect(stats.accuracy).toBe(99.4);
  });
});
