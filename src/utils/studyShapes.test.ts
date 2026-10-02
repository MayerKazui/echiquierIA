import { describe, expect, it } from 'vitest';
import { fromBoardShapes, toBoardShapes } from './studyShapes';

describe('studyShapes', () => {
  it('maps the Lichess brushes to the board colors and back', () => {
    const shapes = [
      { brush: 'G' as const, from: 'e2', to: 'e4' },
      { brush: 'R' as const, from: 'b1', to: 'c3' },
      { brush: 'Y' as const, from: 'd4', to: 'd4' },
      { brush: 'B' as const, from: 'a1', to: 'a8' },
    ];
    const board = toBoardShapes(shapes);
    expect(new Set(board.map((s) => s.color)).size).toBe(4);
    expect(fromBoardShapes(board)).toEqual(shapes);
  });

  it('takes a color that is not a brush for green, and nothing for nothing', () => {
    expect(fromBoardShapes([{ from: 'a1', to: 'a2', color: '#123456' }])).toEqual([
      { brush: 'G', from: 'a1', to: 'a2' },
    ]);
    expect(toBoardShapes(undefined)).toEqual([]);
  });
});
