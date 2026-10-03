import { describe, expect, it } from 'vitest';
import type { MoveAnalysis } from '../types/chess';
import { FAULT_KINDS, FAULT_KINDS_VERSION, classifyFault, diagnoseFault, withFaultKinds } from './faultKinds';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function move(over: Partial<MoveAnalysis> = {}): MoveAnalysis {
  return {
    ply: 0,
    moveNumber: 1,
    color: 'w',
    san: 'e4',
    uci: 'e2e4',
    from: 'e2',
    to: 'e4',
    fenBefore: START,
    fenAfter: '',
    evalBefore: 0,
    evalAfter: -200,
    mateBefore: null,
    mateAfter: null,
    bestMoveUci: '',
    bestMoveSan: '',
    bestMoveFrom: '',
    bestMoveTo: '',
    pv: [],
    centipawnLoss: 200,
    winPercentBefore: 50,
    winPercentAfter: 30,
    winPercentLoss: 20,
    classification: 'blunder',
    ...over,
  };
}

describe('classifyFault', () => {
  describe('mate', () => {
    it('is a forced mate that was not played (white)', () => {
      expect(classifyFault(move({ mateBefore: 3, mateAfter: null }))).toBe('mate');
    });

    it('is a forced mate that was not played (black: the sign is the other way)', () => {
      expect(classifyFault(move({ color: 'b', mateBefore: -3, mateAfter: null }))).toBe('mate');
    });

    it('is a mate that is no longer there for the player, even if another one remains for the opponent', () => {
      expect(classifyFault(move({ mateBefore: 2, mateAfter: -4 }))).toBe('mate');
    });

    it('is a mate that the move allows', () => {
      expect(classifyFault(move({ mateBefore: null, mateAfter: -2 }))).toBe('mate');
      expect(classifyFault(move({ color: 'b', mateBefore: null, mateAfter: 2 }))).toBe('mate');
    });

    it('is not a mate when the player keeps the mate they had', () => {
      expect(classifyFault(move({ mateBefore: 3, mateAfter: 4 }))).not.toBe('mate');
    });

    it('is not a mate when the player was already getting mated', () => {
      expect(classifyFault(move({ mateBefore: -3, mateAfter: -2 }))).not.toBe('mate');
    });

    it('comes before everything else', () => {
      const queenEnPrise = '4k3/4p3/8/8/8/8/8/3QK3 w - - 0 1';
      expect(classifyFault(move({ fenBefore: queenEnPrise, uci: 'd1d6', mateBefore: 2, mateAfter: null }))).toBe(
        'mate'
      );
    });
  });

  describe('piece left en prise', () => {
    // The pawn on e7 takes whatever lands on d6
    const queenToPawnSquare = '4k3/4p3/8/8/8/8/8/3QK3 w - - 0 1';

    it('is a queen moved where a pawn takes it for nothing', () => {
      expect(classifyFault(move({ fenBefore: queenToPawnSquare, uci: 'd1d6' }))).toBe('hanging');
    });

    it('is still one when the queen can be recaptured: it was given for a pawn', () => {
      // Nc4 defends d6, but queen for a pawn is a loss of 8
      expect(classifyFault(move({ fenBefore: '4k3/4p3/8/8/2N5/8/8/3QK3 w - - 0 1', uci: 'd1d6' }))).toBe('hanging');
    });

    it('is not one when the piece is defended and the trade is even', () => {
      // Nc3-d5 can be taken by Nf6, and exd5 takes back: a knight for a knight
      const kind = classifyFault(move({ fenBefore: '4k3/8/5n2/8/4P3/2N5/8/4K3 w - - 0 1', uci: 'c3d5' }));
      expect(kind).not.toBe('hanging');
    });

    it('is one for a piece given for a pawn (a net loss of two)', () => {
      // Nc3-d5 is taken by the pawn on e6, and exd5 takes the pawn back: a knight for a pawn
      const fen = '4k3/8/4p3/8/4P3/2N5/8/4K3 w - - 0 1';
      expect(classifyFault(move({ fenBefore: fen, uci: 'c3d5' }))).toBe('hanging');
    });

    it('is not one for a lone pawn when nothing says the engine move saved it', () => {
      // After d2-d4 the pawn on d4 is taken by the pawn on e5: only a pawn lost
      expect(classifyFault(move({ fenBefore: '4k3/8/8/4p3/8/8/3P4/4K3 w - - 0 1', uci: 'd2d4' }))).not.toBe('hanging');
    });

    it('is one for a lone pawn that the engine move did not give away', () => {
      const fen = '4k3/8/8/4p3/8/8/3P4/4K3 w - - 0 1';
      expect(classifyFault(move({ fenBefore: fen, uci: 'd2d4', bestMoveUci: 'e1e2' }))).toBe('hanging');
      // The engine move loses the pawn too (d2-d4 is what it plays): nothing more was given away
      expect(classifyFault(move({ fenBefore: fen, uci: 'd2d4', bestMoveUci: 'd2d4' }))).not.toBe('hanging');
    });

    it('works for black too', () => {
      // The pawn on e2 takes whatever lands on d3
      const fen = '3qk3/8/8/8/8/8/4P3/4K3 b - - 0 1';
      expect(classifyFault(move({ color: 'b', fenBefore: fen, uci: 'd8d3', winPercentBefore: 50 }))).toBe('hanging');
    });

    it('is not decided from a missing or unreadable position', () => {
      expect(classifyFault(move({ fenBefore: '' }))).toBe('other');
      expect(classifyFault(move({ fenBefore: 'not a position' }))).toBe('other');
    });
  });

  describe('missed tactic', () => {
    // Ne7 forks the rooks on c8 and g8
    const fork = '2r3r1/8/8/5N2/8/8/k7/4K3 w - - 0 1';

    it('is the engine move being a fork that was not played', () => {
      expect(classifyFault(move({ fenBefore: fork, uci: 'e1d1', bestMoveUci: 'f5e7' }))).toBe('tactic');
    });

    it('is a free piece to take: a single attacked piece with nothing to defend it', () => {
      const lone = '6r1/8/8/5N2/8/8/k7/4K3 w - - 0 1';
      expect(classifyFault(move({ fenBefore: lone, uci: 'e1d1', bestMoveUci: 'f5e7' }))).toBe('tactic');
    });

    it('is not one when the engine move only attacks a piece that is defended', () => {
      const defended = 'r5r1/8/8/5N2/8/8/k7/4K3 w - - 0 1';
      expect(classifyFault(move({ fenBefore: defended, uci: 'e1d1', bestMoveUci: 'f5e7' }))).not.toBe('tactic');
    });

    it('is not one when the fork was played', () => {
      expect(classifyFault(move({ fenBefore: fork, uci: 'f5e7', bestMoveUci: 'f5e7' }))).not.toBe('tactic');
    });

    it('is not one without a move from the engine', () => {
      expect(classifyFault(move({ fenBefore: fork, uci: 'e1d1', bestMoveUci: '' }))).not.toBe('tactic');
    });

    it('is not one when the engine move is a quiet one', () => {
      expect(classifyFault(move({ fenBefore: fork, uci: 'e1d1', bestMoveUci: 'e1e2' }))).not.toBe('tactic');
    });

    it('comes after a piece left en prise', () => {
      // Qd1-d6 hangs the queen, even though Ne7 was a fork
      const both = '2r3r1/4p3/8/5N2/8/8/k7/3QK3 w - - 0 1';
      expect(classifyFault(move({ fenBefore: both, uci: 'd1d6', bestMoveUci: 'f5e7' }))).toBe('hanging');
    });
  });

  describe('advantage thrown away', () => {
    it('is a won position (70 % or more) that falls to 55 % or less', () => {
      expect(classifyFault(move({ winPercentBefore: 85, winPercentAfter: 55 }))).toBe('wasted');
    });

    it('counts a position at exactly 70 % as won', () => {
      expect(classifyFault(move({ winPercentBefore: 70, winPercentAfter: 55 }))).toBe('wasted');
    });

    it('needs the position to be won before', () => {
      expect(classifyFault(move({ winPercentBefore: 69, winPercentAfter: 30 }))).not.toBe('wasted');
    });

    it('needs the position to be lost to a fair one after', () => {
      expect(classifyFault(move({ winPercentBefore: 85, winPercentAfter: 56 }))).not.toBe('wasted');
    });

    it('reads the win % from the side of black', () => {
      // 15 → 45 for white is 85 → 55 for black
      expect(classifyFault(move({ color: 'b', winPercentBefore: 15, winPercentAfter: 45 }))).toBe('wasted');
      expect(classifyFault(move({ color: 'b', winPercentBefore: 85, winPercentAfter: 55 }))).not.toBe('wasted');
    });
  });

  describe('what is left, once the concrete causes are out', () => {
    // A middlegame: queens and rooks on, 9 pieces
    const middlegame = 'r2q1rk1/pp3ppp/2n1pn2/3p4/3P4/2P1PN2/PP3PPP/R2Q1RK1 w - - 0 1';

    it('is a capture the engine made and the player did not: an exchange misjudged', () => {
      // The engine takes on d5 (Nxd5 is not available: use the pawn capture of e6xd5 for black's reply)
      const fen = 'r2q1rk1/pp3ppp/2n1pn2/3p4/2PP4/4PN2/PP3PPP/R2Q1RK1 w - - 0 1';
      expect(classifyFault(move({ fenBefore: fen, uci: 'a2a3', bestMoveUci: 'c4d5' }))).toBe('exchange');
    });

    it('is a capture the player made and the engine did not', () => {
      const fen = 'r2q1rk1/pp3ppp/2n1pn2/3p4/2PP4/4PN2/PP3PPP/R2Q1RK1 w - - 0 1';
      expect(classifyFault(move({ fenBefore: fen, uci: 'c4d5', bestMoveUci: 'a2a3' }))).toBe('exchange');
    });

    it('is a move of the king', () => {
      expect(classifyFault(move({ fenBefore: middlegame, uci: 'g1h1', bestMoveUci: 'a2a3' }))).toBe('king');
      expect(classifyFault(move({ fenBefore: middlegame, uci: 'a2a3', bestMoveUci: 'g1h1' }))).toBe('king');
    });

    it('is a move against the principles in the opening', () => {
      expect(classifyFault(move({ uci: 'e2e4', bestMoveUci: 'd2d4' }))).toBe('principles');
    });

    it('is a lost thread in the endgame', () => {
      expect(
        classifyFault(move({ fenBefore: '4k3/8/8/4p3/8/8/P7/4K3 w - - 0 1', uci: 'a2a3', bestMoveUci: 'a2a4' }))
      ).toBe('technique');
    });

    it('is "other" for a quiet move of the middlegame', () => {
      expect(classifyFault(move({ fenBefore: middlegame, uci: 'a2a3', bestMoveUci: 'b2b3' }))).toBe('other');
    });
  });

  describe('the theme', () => {
    it('is the one the engine move carried: a fork', () => {
      const fork = '2r3r1/8/8/5N2/8/8/k7/4K3 w - - 0 1';
      expect(diagnoseFault(move({ fenBefore: fork, uci: 'e1d1', bestMoveUci: 'f5e7' }))).toEqual({
        kind: 'tactic',
        theme: 'fork',
      });
    });

    it('is the length of the mate that was missed', () => {
      expect(diagnoseFault(move({ mateBefore: 3, mateAfter: null }))).toEqual({ kind: 'mate', theme: 'mateIn3' });
      expect(diagnoseFault(move({ color: 'b', mateBefore: -9, mateAfter: null }))).toEqual({
        kind: 'mate',
        theme: 'mateIn5',
      });
    });

    it('is the pattern of the mate that was missed, when it has a name', () => {
      const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
      expect(diagnoseFault(move({ fenBefore: fen, uci: 'g1h1', bestMoveUci: 'a1a8', mateBefore: 1 }))).toEqual({
        kind: 'mate',
        theme: 'backRankMate',
      });
    });

    it('is nothing for a mate that was allowed', () => {
      expect(diagnoseFault(move({ mateBefore: null, mateAfter: -2 }))).toEqual({ kind: 'mate' });
    });
  });

  it('knows every kind', () => {
    expect(FAULT_KINDS).toEqual([
      'mate',
      'hanging',
      'tactic',
      'wasted',
      'exchange',
      'king',
      'principles',
      'technique',
      'other',
    ]);
    expect(FAULT_KINDS_VERSION).toBeGreaterThan(1);
  });
});

describe('withFaultKinds', () => {
  const fault = (ply: number, over: Partial<MoveAnalysis> = {}) =>
    move({ ply, color: ply % 2 === 0 ? 'w' : 'b', winPercentBefore: 85, winPercentAfter: 40, ...over });

  it('fills in the kind of the faults of the side, and only theirs', () => {
    const moves = [fault(0), fault(1), fault(2, { classification: 'good' }), fault(4, { classification: 'missedWin' })];
    const result = withFaultKinds(moves, 'w');
    expect(result.map((m) => m.faultKind)).toEqual(['wasted', undefined, undefined, 'wasted']);
  });

  it('does not change the moves it was given', () => {
    const moves = [fault(0)];
    withFaultKinds(moves, 'w');
    expect(moves[0].faultKind).toBeUndefined();
  });

  it('keeps a kind that is already there', () => {
    const result = withFaultKinds([fault(0, { faultKind: 'hanging' })], 'w');
    expect(result[0].faultKind).toBe('hanging');
  });

  it('works the kind out again for every fault when asked, and drops the theme that no longer applies', () => {
    const stale = fault(0, { faultKind: 'other', faultTheme: 'fork' });
    const [result] = withFaultKinds([stale], 'w', true);
    expect(result.faultKind).toBe('wasted');
    expect(result.faultTheme).toBeUndefined();
  });

  it('returns the same array when there is nothing to add', () => {
    const moves = [fault(0, { faultKind: 'other' }), fault(1), fault(2, { classification: 'best' })];
    expect(withFaultKinds(moves, 'w')).toBe(moves);
  });

  it('counts mistakes, blunders and misses as faults, and not inaccuracies', () => {
    const kinds = (['inaccuracy', 'mistake', 'blunder', 'missedWin'] as const).map(
      (classification) => withFaultKinds([fault(0, { classification })], 'w')[0].faultKind
    );
    expect(kinds).toEqual([undefined, 'wasted', 'wasted', 'wasted']);
  });
});
