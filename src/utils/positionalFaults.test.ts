import { describe, expect, it } from 'vitest';
import { positionalKind } from './positionalFaults';

describe('positionalKind', () => {
  it('is a king fault when a pawn is pushed in front of the castled king', () => {
    // h3-h4 in front of the king on g1, where the engine played elsewhere (b4)
    expect(positionalKind('r4rk1/pppn1ppp/2nb2b1/4p1B1/2N1P1P1/2PB1N1P/PP3P2/R4RK1 w - - 5 15', 'h3h4', 'b2b4')).toBe(
      'king'
    );
  });

  it('is not a king fault when the engine pushed a pawn there too', () => {
    expect(positionalKind('r4rk1/pppn1ppp/2nb2b1/4p1B1/2N1P1P1/2PB1N1P/PP3P2/R4RK1 w - - 5 15', 'h3h4', 'f2f3')).toBe(
      null
    );
  });

  it('is a passive fault when a piece is pulled back and leaves far fewer moves', () => {
    // The rook goes from a7 back to a4
    expect(positionalKind('1rb4r/Rp2k1pp/4pp2/1B1p3n/1b1P4/1P2P3/1P1N1PPP/4K1NR w K - 2 13', 'a7a4', 'g2g4')).toBe(
      'passive'
    );
  });

  it('is nothing for a move that cannot be played, or the engine move itself', () => {
    const fen = 'r4rk1/pppn1ppp/2nb2b1/4p1B1/2N1P1P1/2PB1N1P/PP3P2/R4RK1 w - - 5 15';
    expect(positionalKind(fen, 'h3h4', 'h3h4')).toBeNull();
    expect(positionalKind(fen, 'h3h4', 'a1a8')).toBeNull();
    expect(positionalKind('', 'h3h4', 'b2b4')).toBeNull();
  });
});
