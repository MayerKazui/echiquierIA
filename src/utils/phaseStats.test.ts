import { describe, expect, it } from 'vitest';
import { MoveAnalysis } from '../types/chess';
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

  it('computes an accuracy from the average centipawn loss, or null without moves', () => {
    const { opening, endgame } = computePhaseStats([move(1, 'w', 'good', 0), move(2, 'w', 'good', 100)]);
    // average loss 50 -> 82.7
    expect(opening.whiteAccuracy).toBe(82.7);
    expect(opening.blackAccuracy).toBeNull();
    expect(endgame.whiteAccuracy).toBeNull();
    expect(endgame.totalMoves).toBe(0);
  });
});
