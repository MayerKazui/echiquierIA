import { describe, expect, it } from 'vitest';
import { computeBoardMaterial } from './chessMaterial';

describe('computeBoardMaterial', () => {
  it('is balanced at the starting position', () => {
    const material = computeBoardMaterial('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(material).toMatchObject({
      whiteMaterial: 39,
      blackMaterial: 39,
      diff: 0,
      whiteCaptured: [],
      blackCaptured: [],
      whiteAdvantage: 0,
      blackAdvantage: 0,
    });
  });

  it('lists the pieces each side has captured, largest first', () => {
    // White lost a knight and a pawn (captured by Black); Black lost its queen
    const material = computeBoardMaterial('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPP1/R1BQKBNR w KQkq - 0 1');
    expect(material.whiteCaptured).toEqual([{ type: 'q', count: 1 }]);
    expect(material.blackCaptured).toEqual([
      { type: 'n', count: 1 },
      { type: 'p', count: 1 },
    ]);
    // White 39 - 4 = 35, Black 39 - 9 = 30
    expect(material.whiteMaterial).toBe(35);
    expect(material.blackMaterial).toBe(30);
    expect(material.diff).toBe(5);
    expect(material.whiteAdvantage).toBe(5);
    expect(material.blackAdvantage).toBe(0);
  });

  it('gives the advantage to Black when it is ahead', () => {
    const material = computeBoardMaterial('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1');
    expect(material.blackAdvantage).toBe(9);
    expect(material.whiteAdvantage).toBe(0);
  });

  it('falls back to a balanced state for an empty FEN', () => {
    expect(computeBoardMaterial('').diff).toBe(0);
  });
});
