import { describe, expect, it } from 'vitest';
import { arrowOf, describeScore, formatScore, lineMoves, parseInfoLine } from './positionAnalysis';

describe('parseInfoLine', () => {
  const line =
    'info depth 18 seldepth 25 multipv 2 score cp 34 nodes 100 nps 512000 hashfull 3 time 200 pv e2e4 e7e5 g1f3';

  it('reads the line a depth reports', () => {
    expect(parseInfoLine(line, true)).toEqual({
      rank: 2,
      depth: 18,
      cp: 34,
      mate: null,
      pv: ['e2e4', 'e7e5', 'g1f3'],
      nps: 512000,
    });
  });

  it('turns the score to the side of White when Black has the move', () => {
    expect(parseInfoLine(line, false)?.cp).toBe(-34);
    expect(parseInfoLine('info depth 9 score mate 2 pv a1a8', false)).toMatchObject({ mate: -2, cp: -9980 });
    expect(parseInfoLine('info depth 9 score mate -2 pv a1a8', true)).toMatchObject({ mate: -2 });
  });

  it('is the first line when the engine does not number them', () => {
    expect(parseInfoLine('info depth 3 score cp 0 pv e2e4', true)?.rank).toBe(1);
  });

  it.each([
    ['a bound', 'info depth 5 multipv 1 score cp 50 upperbound pv e2e4'],
    ['no moves', 'info depth 5 multipv 1 score cp 50'],
    ['no score', 'info depth 5 multipv 1 pv e2e4'],
    ['no depth', 'info multipv 1 score cp 50 pv e2e4'],
    ['a move being tried', 'info depth 5 currmove e2e4 currmovenumber 1'],
    ['text', 'info string hello'],
    ['another message', 'bestmove e2e4'],
  ])('ignores %s', (_name, text) => {
    expect(parseInfoLine(text, true)).toBeNull();
  });
});

describe('formatScore', () => {
  it('writes pawns with a comma and a sign, and the mates', () => {
    expect(formatScore(34, null)).toBe('+0,3');
    expect(formatScore(-120, null)).toBe('-1,2');
    expect(formatScore(0, null)).toBe('0,0');
    expect(formatScore(3, null)).toBe('0,0');
    expect(formatScore(9970, 3)).toBe('M3');
    expect(formatScore(-9970, -3)).toBe('-M3');
  });

  it('says it in words too', () => {
    expect(describeScore(0, null)).toBe('position égale');
    expect(describeScore(150, null)).toBe('1,5 pion d’avantage pour les Blancs');
    expect(describeScore(-250, null)).toBe('2,5 pions d’avantage pour les Noirs');
    expect(describeScore(9970, 3)).toBe('mat en 3 pour les Blancs');
    expect(describeScore(-9990, -1)).toBe('mat en 1 pour les Noirs');
  });
});

describe('lineMoves', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('numbers the moves in French and gives the position after each', () => {
    const moves = lineMoves(START, ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    expect(moves.map((m) => m.label)).toEqual(['1.e4', '1…e5', '2.Cf3', '2…Cc6']);
    expect(moves.map((m) => m.color)).toEqual(['w', 'b', 'w', 'b']);
    expect(moves[0].fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  });

  it('starts from the move number of the position', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 3';
    expect(lineMoves(fen, ['g8f6']).map((m) => m.label)).toEqual(['3…Cf6']);
  });

  it('stops at the first move that is not legal, and at the limit', () => {
    expect(lineMoves(START, ['e2e4', 'e2e4', 'e7e5']).map((m) => m.uci)).toEqual(['e2e4']);
    expect(lineMoves(START, ['e2e4', 'e7e5', 'g1f3'], 2)).toHaveLength(2);
  });

  it('knows promotions', () => {
    const [move] = lineMoves('7k/P7/8/8/8/8/8/K7 w - - 0 1', ['a7a8q']);
    expect(move.san).toBe('a8=D+');
  });

  it('gives nothing for a position that is not one', () => {
    expect(lineMoves('nonsense', ['e2e4'])).toEqual([]);
  });
});

describe('arrowOf', () => {
  it('is the first move of the line', () => {
    expect(arrowOf({ pv: ['g1f3', 'd7d5'] })).toEqual({ from: 'g1', to: 'f3' });
    expect(arrowOf({ pv: ['e7e8q'] })).toEqual({ from: 'e7', to: 'e8' });
    expect(arrowOf({ pv: [] })).toBeNull();
  });
});
