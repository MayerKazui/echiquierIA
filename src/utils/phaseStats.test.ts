import { describe, expect, it } from 'vitest';
import { MoveAnalysis } from '../types/chess';
import { accuracyFromMoves } from './moveAnalysis';
import { computePhaseStats } from './phaseStats';

function move(moveNumber: number, color: 'w' | 'b', classification: string, centipawnLoss = 0): MoveAnalysis {
  return { moveNumber, color, classification, centipawnLoss } as MoveAnalysis;
}

describe('computePhaseStats', () => {
  it('splits moves into opening (1-12), middlegame (13-30) and endgame (31+)', () => {
    const stats = computePhaseStats([
      move(1, 'w', 'book'),
      move(1, 'b', 'book'),
      move(12, 'w', 'good'),
      move(13, 'w', 'good'),
      move(30, 'b', 'good'),
      move(31, 'w', 'good'),
      move(80, 'b', 'good'),
    ]);

    expect(stats.opening.totalMoves).toBe(3);
    expect(stats.middlegame.totalMoves).toBe(2);
    expect(stats.endgame.totalMoves).toBe(2);
    expect(stats.opening).toMatchObject({ whiteCount: 2, blackCount: 1 });
  });

  it('counts blunders (including missed wins), mistakes and inaccuracies per color', () => {
    const { opening } = computePhaseStats([
      move(2, 'w', 'blunder'),
      move(3, 'w', 'missedWin'),
      move(4, 'w', 'mistake'),
      move(5, 'b', 'inaccuracy'),
      move(6, 'b', 'inaccuracy'),
      move(7, 'b', 'best'),
    ]);

    expect(opening).toMatchObject({
      whiteBlunders: 2,
      whiteMistakes: 1,
      whiteInaccuracies: 0,
      blackBlunders: 0,
      blackMistakes: 0,
      blackInaccuracies: 2,
    });
  });

  it('computes an accuracy from the Win% lost, or null without moves', () => {
    const { opening, endgame } = computePhaseStats([
      { ...move(1, 'w', 'good', 0), evalBefore: 0, evalAfter: 0 },
      { ...move(2, 'w', 'good', 0), evalBefore: 0, evalAfter: -300 },
    ]);
    expect(opening.whiteAccuracy).toBeGreaterThan(30);
    expect(opening.whiteAccuracy).toBeLessThan(70);
    expect(opening.blackAccuracy).toBeNull();
    expect(endgame.whiteAccuracy).toBeNull();
    expect(endgame.totalMoves).toBe(0);
  });

  it("takes each player's rating into account", () => {
    const moves = [
      { ...move(1, 'w', 'good', 0), evalBefore: 100, evalAfter: -50 },
      { ...move(1, 'b', 'good', 0), evalBefore: -50, evalAfter: 100 },
    ];
    const rated = computePhaseStats(moves, { w: 2500, b: 400 }).opening;
    expect(rated.whiteAccuracy!).toBeLessThan(rated.blackAccuracy!); // same slip, harsher for the 2500
    expect(rated.whiteAccuracy).toBe(accuracyFromMoves([moves[0]], 2500));
    expect(rated.blackAccuracy).toBe(accuracyFromMoves([moves[1]], 400));
  });

  it('matches the overall accuracy formula', () => {
    const moves = [
      { ...move(1, 'w', 'good', 0), evalBefore: 0, evalAfter: 0 },
      { ...move(2, 'w', 'blunder', 500), evalBefore: 100, evalAfter: -400 },
    ];
    expect(computePhaseStats(moves).opening.whiteAccuracy).toBe(accuracyFromMoves(moves));
  });
});
