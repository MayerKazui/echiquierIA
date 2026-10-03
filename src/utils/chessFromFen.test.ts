import { describe, expect, it } from 'vitest';
import { chessFromFen } from './chessFromFen';

describe('chessFromFen', () => {
  it('loads a normal position', () => {
    expect(chessFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').turn()).toBe('w');
  });

  it('drops an en-passant square that chess.js refuses, and keeps the rest', () => {
    // Black has just played ...e5 but there is no white pawn to take it: the square e6 is illegal
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 2';
    expect(() => chessFromFen(fen)).not.toThrow();
    expect(chessFromFen(fen).fen()).toContain('w KQkq - 0 2');
  });

  it('still throws for a FEN that is wrong otherwise', () => {
    expect(() => chessFromFen('not a position')).toThrow();
  });
});
