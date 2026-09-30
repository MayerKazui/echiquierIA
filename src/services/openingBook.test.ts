import { Chess } from 'chess.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  checkIsTheoreticalMove,
  ensureOpeningBookLoaded,
  getOpeningBookEvaluation,
  identifyGameOpening,
  normalizeFen,
} from './openingBook';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** FENs before each ply of a game given as SAN moves. */
function fensOf(sans: string[]) {
  const chess = new Chess();
  const before: string[] = [];
  const after: string[] = [];
  for (const san of sans) {
    before.push(chess.fen());
    chess.move(san);
    after.push(chess.fen());
  }
  return { before, after };
}

describe('normalizeFen', () => {
  it('drops the halfmove clock and fullmove number', () => {
    expect(normalizeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'
    );
  });

  it('makes transpositions reached with different move counters equal', () => {
    expect(normalizeFen('8/8/8/8/8/8/8/K6k w - - 12 40')).toBe(normalizeFen('8/8/8/8/8/8/8/K6k w - - 0 1'));
  });
});

describe('opening book (built-in lines)', () => {
  it('knows the first move of the repertoire', () => {
    const evaluation = getOpeningBookEvaluation(START);
    expect(evaluation).not.toBeNull();
    expect(evaluation!.mate).toBeNull();
    expect(evaluation!.bestMoveSan).toBeTruthy();
  });

  it('has no entry for a position outside of theory', () => {
    expect(getOpeningBookEvaluation('8/8/8/8/8/8/8/K6k w - - 0 1')).toBeNull();
  });

  it('recognizes theoretical moves and rejects others', () => {
    expect(checkIsTheoreticalMove(START, 'e4').isBook).toBe(true);
    expect(checkIsTheoreticalMove(START, 'h4').isBook).toBe(false);
  });

  it('accepts a move written with French piece letters', () => {
    const afterE4E5 = fensOf(['e4', 'e5']).after[1];
    expect(checkIsTheoreticalMove(afterE4E5, 'Cf3').isBook).toBe(true);
    expect(checkIsTheoreticalMove(afterE4E5, 'Nf3').isBook).toBe(true);
  });

  it('does not mix up a rook move and a king move in French notation', () => {
    const ruyLopez = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'];
    const before = fensOf(ruyLopez).after[ruyLopez.length - 1];
    expect(checkIsTheoreticalMove(before, 'Re1').isBook).toBe(true); // rook, English
    expect(checkIsTheoreticalMove(before, 'Te1').isBook).toBe(true); // rook, French
    expect(checkIsTheoreticalMove(before, 'Rh1').isBook).toBe(false); // legal king move, not theory
    expect(checkIsTheoreticalMove(before, 'Ke1').isBook).toBe(false);
  });

  it('flags a move reaching a known position as theory even if the source is unknown', () => {
    const { before, after } = fensOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(checkIsTheoreticalMove(before[4], 'Bb5', after[4]).isBook).toBe(true);
  });
});

describe('opening book (full dataset)', () => {
  beforeAll(async () => {
    await ensureOpeningBookLoaded();
  });

  it('identifies the opening that ends exactly on the last position', () => {
    expect(identifyGameOpening(fensOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']).after)).toEqual({
      eco: 'C60',
      name: 'Ruy Lopez',
    });
    // One move later the named position is the Morphy Defense, not a variation that needs 4.Bxc6
    expect(identifyGameOpening(fensOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']).after)).toEqual({
      eco: 'C70',
      name: 'Ruy Lopez: Morphy Defense',
    });
  });

  it('keeps the last named position when the game leaves the named lines', () => {
    const { after } = fensOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O', 'Qd6', 'd3', 'Bg4']);
    const opening = identifyGameOpening(after);
    expect(opening?.eco).toMatch(/^C/);
    expect(opening?.name).toMatch(/^Ruy Lopez/);
  });

  it('gives the canonical names of the first moves', () => {
    expect(identifyGameOpening(fensOf(['e4']).after)?.eco).toBe('B00');
    expect(identifyGameOpening(fensOf(['d4', 'd5', 'c4']).after)?.eco).toBe('D06');
  });

  it('names irregular openings too', () => {
    expect(identifyGameOpening(fensOf(['a3', 'a6', 'h3', 'h6']).after)?.eco).toBe('A00');
  });

  it('describes the position reached by a book move, not its continuation', () => {
    const { before, after } = fensOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    expect(checkIsTheoreticalMove(before[4], 'Bb5', after[4])).toEqual({
      isBook: true,
      eco: 'C60',
      name: 'Ruy Lopez',
    });
    expect(checkIsTheoreticalMove(before[5], 'a6', after[5])).toEqual({
      isBook: true,
      eco: 'C70',
      name: 'Ruy Lopez: Morphy Defense',
    });
  });

  it('flags a move inside theory without inventing a name when no opening ends there', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4: still theory, but no opening is named after this exact position
    const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4'];
    const { before, after } = fensOf(moves);
    const last = moves.length - 1;
    const result = checkIsTheoreticalMove(before[last], 'Ba4', after[last]);
    expect(result.isBook).toBe(true);
    expect(result.name).toBeUndefined();
  });

  it('knows every continuation of a position, not just the main one', () => {
    const afterE4 = fensOf(['e4']).after[0];
    for (const reply of ['e5', 'c5', 'e6', 'c6', 'd5', 'd6', 'g6', 'Nf6']) {
      expect(checkIsTheoreticalMove(afterE4, reply).isBook, reply).toBe(true);
    }
  });

  it('returns null when there are no positions', () => {
    expect(identifyGameOpening([])).toBeNull();
  });

  it('is idempotent', async () => {
    await expect(ensureOpeningBookLoaded()).resolves.toBeUndefined();
  });
});
