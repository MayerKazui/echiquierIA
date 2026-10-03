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

  describe('themes that need the replies', () => {
    it('finds a trapped piece: the pawn shuts the knight in', () => {
      // g4 attacks the knight on h5, which has no square left (Qd4 hits g7, f4 is covered by the queen)
      expect(tacticThemesOfMove('r1bqkb1r/pppp1ppp/8/4P2n/3Q4/8/PPP2PPP/RNB1KB1R w KQkq - 1 7', 'g2g4')).toContain(
        'trappedPiece'
      );
    });

    it('does not call a piece trapped when it has a way out', () => {
      // The same attack with the knight free to go back to f6
      expect(
        tacticThemesOfMove('r1bqkb1r/pppp1ppp/5n2/4P2n/3Q4/8/PPP2PPP/RNB1KB1R w KQkq - 1 7', 'g2g4')
      ).not.toContain('trappedPiece');
    });

    it('finds an interference: the pawn cuts the queen from the bishop it guarded', () => {
      // g3 stands on the diagonal between the queen on c7 and the bishop on h2, which the king then takes
      expect(tacticThemesOfMove('r4rk1/2q2p2/p4p1p/1pp2b2/3pR3/2PP4/PPBN1PPb/R3Q2K w - - 2 20', 'g2g3')).toContain(
        'interference'
      );
    });

    it('finds a deflection: whoever takes the rook leaves the bishop on h3 unguarded', () => {
      expect(tacticThemesOfMove('5rk1/1p4pp/2p1q3/8/1P6/P3PPQb/5P2/R2R2K1 w - - 6 28', 'd1d6')).toContain('deflection');
    });

    it('finds an attraction: the king takes the bishop and a check forks it', () => {
      expect(tacticThemesOfMove('r1bqk1nr/p1pp1pp1/2p4p/2b5/2B1P3/8/PPP2PPP/RNBQK2R w KQkq - 0 7', 'c4f7')).toContain(
        'attraction'
      );
    });

    it('finds an intermezzo: the check comes before the capture that waits', () => {
      // Re7+ first: whatever the king does, Qxd4 is still there
      expect(tacticThemesOfMove('7r/1p4k1/p4pp1/8/1P1r4/P1Q3Pq/5P1P/4RRK1 w - - 2 32', 'e1e7')).toContain('intermezzo');
    });

    it('does not call a plain check an intermezzo when nothing waits', () => {
      expect(tacticThemesOfMove('4k3/8/8/8/8/8/8/4R1K1 w - - 0 1', 'e1e7')).not.toContain('intermezzo');
    });

    it('finds an overloading: the queen guards the knight and the bishop, and cannot keep both', () => {
      // Rf1 attacks the bishop on f5 while Bb5 attacks the knight on c6: Bxc6 Qxc6 and the bishop falls
      expect(tacticThemesOfMove('6k1/p2q2pp/2n5/1B3b2/8/8/6PP/4R1K1 w - - 0 1', 'e1f1')).toContain('overloading');
    });

    it('does not call it an overloading when another piece also guards', () => {
      // The pawn on g6 guards the bishop too
      expect(tacticThemesOfMove('6k1/p2q3p/2n3p1/1B3b2/8/8/6PP/4R1K1 w - - 0 1', 'e1f1')).not.toContain('overloading');
    });

    it('finds an x-ray: the rook reaches d5 through the queen, so the knight takes safely', () => {
      // Nxd5 Qxd5 Rxd5: without the rook on d1 the knight would be lost for a pawn
      expect(tacticThemesOfMove('6k1/6pp/8/3p4/3q4/2N5/6PP/3RR2K w - - 0 1', 'c3d5')).toContain('xRayAttack');
    });

    it('does not find an x-ray when the capture holds without the piece behind', () => {
      // The queen is not there: nothing stands between the rook and d5
      expect(tacticThemesOfMove('6k1/6pp/8/3p4/8/2N5/6PP/3RR2K w - - 0 1', 'c3d5')).not.toContain('xRayAttack');
    });
  });
});
