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

  it('accepts French piece letters for a knight, bishop and queen move', () => {
    const { before } = fensOf(['e4', 'e5']);
    expect(checkIsTheoreticalMove(before[1], 'e5').isBook).toBe(true);
    const afterE4E5 = fensOf(['e4', 'e5']).after[1];
    expect(checkIsTheoreticalMove(afterE4E5, 'Cf3').isBook).toBe(true);
    expect(checkIsTheoreticalMove(afterE4E5, 'Nf3').isBook).toBe(true);
  });

  it('treats a move reaching a named position as theory even if the source is unknown', () => {
    const { before, after } = fensOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    const result = checkIsTheoreticalMove(before[4], 'Bb5', after[4]);
    expect(result.isBook).toBe(true);
  });
});

describe('opening book (full dataset)', () => {
  beforeAll(async () => {
    await ensureOpeningBookLoaded();
  });

  it('identifies a well-known opening by its ECO code and name', () => {
    expect(identifyGameOpening(fensOf(['e4']).after)).toEqual({ eco: 'B00', name: expect.any(String) });
    expect(identifyGameOpening(fensOf(['d4', 'd5', 'c4']).after)?.eco).toBe('D06');

    const ruyLopez = identifyGameOpening(fensOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']).after);
    expect(ruyLopez).toEqual({ eco: 'C60', name: 'Ruy Lopez' });
  });

  it('returns ECO codes of the expected shape', () => {
    const opening = identifyGameOpening(fensOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']).after);
    expect(opening?.eco).toMatch(/^[A-E]\d\d$/);
    expect(opening?.name).toBeTruthy();
  });

  it('names irregular openings too', () => {
    expect(identifyGameOpening(fensOf(['a3', 'a6', 'h3', 'h6']).after)?.eco).toBe('A00');
  });

  it('returns null when there are no positions', () => {
    expect(identifyGameOpening([])).toBeNull();
  });

  it('is idempotent', async () => {
    await expect(ensureOpeningBookLoaded()).resolves.toBeUndefined();
  });
});
