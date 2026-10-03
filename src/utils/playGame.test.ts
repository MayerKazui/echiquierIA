import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { STANDARD_START_FEN, gamePgn, lengthAfterTakeback, replay, resultTag, ruleOutcome, validFen } from './playGame';

describe('replay', () => {
  it('plays the moves and reports the position, the notation and no outcome', () => {
    const result = replay(STANDARD_START_FEN, ['e2e4', 'e7e5', 'g1f3']);
    expect(result.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(result.fen).toBe(result.moves[2].fen);
    expect(result.outcome).toBeNull();
  });

  it('stops at the first illegal move', () => {
    const result = replay(STANDARD_START_FEN, ['e2e4', 'e2e4', 'e7e5']);
    expect(result.moves.map((m) => m.uci)).toEqual(['e2e4']);
  });

  it('knows a checkmate and who won', () => {
    const result = replay(STANDARD_START_FEN, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(result.outcome).toEqual({ kind: 'checkmate', winner: 'b' });
  });

  it('knows a stalemate and a lack of material', () => {
    expect(ruleOutcome(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toEqual({ kind: 'draw', reason: 'stalemate' });
    expect(ruleOutcome(new Chess('8/8/4k3/8/8/4K3/8/8 w - - 0 1'))).toEqual({ kind: 'draw', reason: 'material' });
  });

  it('knows a threefold repetition', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const result = replay(STANDARD_START_FEN, [...shuffle, ...shuffle]);
    expect(result.outcome).toEqual({ kind: 'draw', reason: 'repetition' });
  });
});

describe('validFen', () => {
  it('accepts a position and refuses anything else', () => {
    expect(validFen(STANDARD_START_FEN)).toBe(true);
    expect(validFen('  8/8/4k3/8/8/4K3/8/8 w - - 0 1 ')).toBe(true);
    expect(validFen('pas une position')).toBe(false);
    expect(validFen('')).toBe(false);
  });
});

describe('lengthAfterTakeback', () => {
  it("takes back the player's move and the answer to it", () => {
    expect(lengthAfterTakeback(4, 'w', 'w', 'w')).toBe(2);
  });
  it('takes back only the move when the engine had not answered yet', () => {
    expect(lengthAfterTakeback(3, 'w', 'w', 'b')).toBe(2);
  });
  it('stays at the start when nothing was played', () => {
    expect(lengthAfterTakeback(0, 'w', 'w', 'w')).toBe(0);
  });
  it("never goes before the engine's first move when it plays first", () => {
    expect(lengthAfterTakeback(1, 'w', 'b', 'b')).toBe(1);
    expect(lengthAfterTakeback(3, 'w', 'b', 'b')).toBe(1);
  });
});

describe('resultTag', () => {
  it('writes the result as in a PGN', () => {
    expect(resultTag(null)).toBe('*');
    expect(resultTag({ kind: 'draw', reason: 'fifty' })).toBe('1/2-1/2');
    expect(resultTag({ kind: 'checkmate', winner: 'w' })).toBe('1-0');
    expect(resultTag({ kind: 'resigned', winner: 'b' })).toBe('0-1');
  });
});

describe('gamePgn', () => {
  const moves = replay(STANDARD_START_FEN, ['e2e4', 'e7e5']).moves;
  const names = { white: 'Moi', black: 'Stockfish (Club)' };

  it('writes a game from the standard start', () => {
    const pgn = gamePgn({ startFen: STANDARD_START_FEN, moves, outcome: null, ...names })!;
    expect(pgn).toContain('[White "Moi"]');
    expect(pgn).toContain('[Black "Stockfish (Club)"]');
    expect(pgn).toContain('1. e4 e5');
  });

  it('puts the moves that lead to a position before the ones played from it', () => {
    const start = replay(STANDARD_START_FEN, ['e2e4', 'e7e5']);
    const after = replay(start.fen, ['g1f3']);
    const pgn = gamePgn({ startFen: start.fen, prefix: ['e4', 'e5'], moves: after.moves, outcome: null, ...names })!;
    expect(pgn).toContain('1. e4 e5 2. Nf3');
  });

  it('gives no PGN for a position whose way there is unknown, or when the way does not lead to it', () => {
    const fen = '8/8/4k3/8/8/4K3/8/7R w - - 0 1';
    expect(gamePgn({ startFen: fen, moves: [], outcome: null, ...names })).toBeNull();
    expect(gamePgn({ startFen: fen, prefix: ['e4'], moves: [], outcome: null, ...names })).toBeNull();
  });
});
