import { Chess } from 'chess.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadOpeningsFromDisk } from '../test/openings';
import {
  checkIsTheoreticalMove,
  chooseOpening,
  ensureOpeningBookLoaded,
  getOpeningBookEvaluation,
  identifyGameOpening,
  normalizeFen,
} from './openingBook';

const FEN_AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
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
    await ensureOpeningBookLoaded(loadOpeningsFromDisk);
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

  it('names the first moves with the dataset names, not the French labels of the base book', () => {
    for (const sans of [['e4'], ['e4', 'c5'], ['e4', 'c5', 'Nf3'], ['d4', 'd5']]) {
      const name = identifyGameOpening(fensOf(sans).after)?.name ?? '';
      expect(name, sans.join(' ')).toMatch(/^[A-Za-z' -]+(: [A-Za-z0-9' ,.-]+)?$/);
      expect(name, sans.join(' ')).not.toMatch(/Défense sicilienne|Ouverture du pion|Partie |Début du|Gambit Dame/);
    }
    expect(identifyGameOpening(fensOf(['e4', 'c5']).after)?.name).toBe('Sicilian Defense');
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
    await expect(ensureOpeningBookLoaded(loadOpeningsFromDisk)).resolves.toBeUndefined();
  });
});

describe('ensureOpeningBookLoaded (download)', () => {
  it('uses the given loader, and retries after a failure instead of staying empty', async () => {
    // Fresh module state: this file's other tests already loaded the dataset, so use an isolated copy
    vi.resetModules();
    const fresh = await import('./openingBook');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    await fresh.ensureOpeningBookLoaded(failing);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();

    const dataset = await loadOpeningsFromDisk();
    const working = vi.fn().mockResolvedValue(dataset);
    await fresh.ensureOpeningBookLoaded(working); // retried, now it works
    expect(working).toHaveBeenCalledTimes(1);
    expect(fresh.identifyGameOpening([FEN_AFTER_E4])?.eco).toBe('B00');

    await fresh.ensureOpeningBookLoaded(working); // loaded: no second download
    expect(working).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('opening book (built-in labels before the dataset is there)', () => {
  it('names the first moves in French, then the dataset takes over', async () => {
    vi.resetModules();
    const fresh = await import('./openingBook');
    const sicilian = fensOf(['e4', 'c5', 'Nf3']).after;
    expect(fresh.identifyGameOpening(sicilian)?.name).toBe('Défense sicilienne (2. Cf3)');
    await fresh.ensureOpeningBookLoaded(loadOpeningsFromDisk);
    expect(fresh.identifyGameOpening(sicilian)?.name).toMatch(/^Sicilian Defense/);
  });
});

describe('chooseOpening', () => {
  const detected = { eco: 'B87', name: 'Sicilian Defense: Sozin Attack' };

  it('prefers the database: name and ECO code always come from the same source', () => {
    expect(chooseOpening(detected, { opening: 'Défense sicilienne', eco: 'B20' })).toEqual(detected);
  });

  it('falls back on the PGN header, with its own ECO code', () => {
    expect(chooseOpening(null, { opening: 'Ouverture maison', eco: 'A00' })).toEqual({
      name: 'Ouverture maison',
      eco: 'A00',
    });
    expect(chooseOpening(null, { opening: 'Ouverture maison' })).toEqual({ name: 'Ouverture maison', eco: undefined });
  });

  it('is null when nothing names the game', () => {
    expect(chooseOpening(null, {})).toBeNull();
    expect(chooseOpening(null, { eco: 'B20' })).toBeNull();
  });
});
