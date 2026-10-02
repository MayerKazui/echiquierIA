import { describe, expect, it } from 'vitest';
import {
  DEVELOPED_BACK_RANK,
  ENDGAME_MAX_PIECES,
  MIDDLEGAME_MAX_PIECES,
  phaseOf,
  phaseOfMoveNumber,
  phaseOfPosition,
  phasesOfPositions,
} from './gamePhase';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const GIUOCO = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 1';
/** Both sides castled and developed: their first ranks are almost empty. */
const DEVELOPED = 'r2q1rk1/ppp2ppp/2npbn2/2b1p3/2B1P3/2NPBN1P/PPPQ1PP1/R4RK1 w - - 0 10';
/** Eight pieces left: the queens and four minor pieces are gone. */
const TRADED = 'r2r2k1/pp3ppp/2n2n2/8/8/2N2N2/PP3PPP/R2R2K1 w - - 0 1';
const ROOKS = 'r4rk1/pp3ppp/2p5/8/8/2P5/PP3PPP/R4RK1 w - - 0 1';

describe('phaseOfPosition', () => {
  it('is the opening at the start and while the pieces are still on their first rank', () => {
    expect(phaseOfPosition(START)).toBe('opening');
    expect(phaseOfPosition(GIUOCO)).toBe('opening');
  });

  it('is the middlegame once a side has developed its pieces off the first rank', () => {
    expect(phaseOfPosition(DEVELOPED)).toBe('middlegame');
    // One side is enough: White's first rank is full, Black's is not
    expect(phaseOfPosition('r4rk1/ppp2ppp/2npbn2/2bqp3/2B1P3/2NP1N2/PPP1BPPP/R1BQK2R w KQ - 0 8')).toBe('middlegame');
  });

  it('is the middlegame once pieces have been traded, even at move 8', () => {
    expect(phaseOfPosition(TRADED)).toBe('middlegame');
  });

  it('is the endgame when few pieces are left, and for a pawn ending', () => {
    expect(phaseOfPosition(ROOKS)).toBe('endgame');
    expect(phaseOfPosition('8/5pk1/8/8/8/8/5PK1/8 w - - 0 1')).toBe('endgame');
  });

  it('counts queens, rooks, bishops and knights, not kings or pawns', () => {
    // 6 pieces is an endgame, 7 is not (pawns and kings do not count)
    expect(phaseOfPosition('2rr1k2/pppppppp/8/8/8/8/PPPPPPPP/1RRN1K2 w - - 0 1')).toBe('endgame'); // 5 pieces
    expect(phaseOfPosition('2rr1k2/pppppppp/8/8/8/8/PPPPPPPP/1RRNN1K1 w - - 0 1')).toBe('endgame'); // 6 pieces
    expect(phaseOfPosition('1nrr1k2/pppppppp/8/8/8/8/PPPPPPPP/1RRNN1K1 w - - 0 1')).toBe('middlegame'); // 7 pieces
    expect(ENDGAME_MAX_PIECES).toBe(6);
    expect(MIDDLEGAME_MAX_PIECES).toBe(10);
    expect(DEVELOPED_BACK_RANK).toBe(4);
  });
});

describe('phasesOfPositions', () => {
  it('never goes back to an earlier phase', () => {
    expect(phasesOfPositions([START, DEVELOPED, GIUOCO, ROOKS, DEVELOPED])).toEqual([
      'opening',
      'middlegame',
      'middlegame',
      'endgame',
      'endgame',
    ]);
  });

  it('is empty for no position', () => {
    expect(phasesOfPositions([])).toEqual([]);
  });
});

describe('phaseOf', () => {
  it('is the phase stored with the move', () => {
    expect(phaseOf({ phase: 'endgame', moveNumber: 3 })).toBe('endgame');
  });

  it('comes from the move number for a game analysed before phases were stored', () => {
    expect(phaseOf({ moveNumber: 12 })).toBe('opening');
    expect(phaseOf({ moveNumber: 13 })).toBe('middlegame');
    expect(phaseOf({ moveNumber: 30 })).toBe('middlegame');
    expect(phaseOf({ moveNumber: 31 })).toBe('endgame');
    expect(phaseOfMoveNumber(1)).toBe('opening');
  });
});
