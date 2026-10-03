import { describe, expect, it } from 'vitest';
import { tacticThemesOfMove } from './tacticThemes';

describe('tacticThemesOfMove', () => {
  it('finds a back rank mate', () => {
    // White: Ra1-a8#, the black king is shut in by its pawns
    expect(tacticThemesOfMove('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1a8')).toContain('backRankMate');
  });

  it('finds a smothered mate', () => {
    // Nf7# with the king on h8 closed in by its rook and pawns
    expect(tacticThemesOfMove('6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', 'g5f7')).toContain('smotheredMate');
  });

  it('finds a double check', () => {
    // The knight leaves the e-file, checking too: the rook and the knight both give check
    expect(tacticThemesOfMove('4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1', 'e4f6')).toContain('doubleCheck');
  });

  it('finds a discovered check, and a discovered attack', () => {
    // The knight leaves the e-file: the rook checks
    const themes = tacticThemesOfMove('4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1', 'e4c5');
    expect(themes).toContain('discoveredCheck');
    expect(themes).not.toContain('doubleCheck');
    // The bishop moves away and the rook now hits the queen (nobody defends it)
    expect(tacticThemesOfMove('7k/8/8/4q3/4B3/8/8/4R1K1 w - - 0 1', 'e4f3')).toContain('discoveredAttack');
  });

  it('finds a fork, the king and a rook', () => {
    expect(tacticThemesOfMove('r3k3/8/4N3/8/8/8/8/4K3 w - - 0 1', 'e6c7')).toContain('fork');
  });

  it('finds a skewer: the king is in front, the queen behind', () => {
    expect(tacticThemesOfMove('q3k3/8/8/8/8/8/8/6KR w - - 0 1', 'h1h8')).toContain('skewer');
  });

  it('does not call a pin a skewer', () => {
    // The rook pins the knight against the king on the file: nothing worth more is behind
    expect(tacticThemesOfMove('4k3/4n3/8/8/8/8/8/R3K3 w - - 0 1', 'a1a7')).not.toContain('skewer');
  });

  it('finds a capture of the defender', () => {
    // Bxc6 takes the knight that guarded the bishop on e7, which the bishop on a3 now wins
    expect(tacticThemesOfMove('7k/4b3/2n5/1B6/8/B7/8/6K1 w - - 0 1', 'b5c6')).toContain('capturingDefender');
  });

  it('finds a promotion and a sacrifice', () => {
    expect(tacticThemesOfMove('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a7a8q')).toContain('promotion');
    // Bxf7+ Rxf7 gives a bishop for a pawn
    expect(tacticThemesOfMove('r1bq1rk1/ppp2ppp/2n5/4p3/2B5/5N2/PPPP1PPP/R1BQ1RK1 w - - 0 1', 'c4f7')).toContain(
      'sacrifice'
    );
  });

  it('returns nothing for a quiet move, or a move that cannot be played', () => {
    expect(tacticThemesOfMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4')).toEqual([]);
    expect(tacticThemesOfMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e5')).toEqual([]);
  });
});
