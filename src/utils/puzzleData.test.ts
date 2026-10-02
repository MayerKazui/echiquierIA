import { describe, expect, it } from 'vitest';
import { MAX_BAND, MIN_BAND, bandOf, bandsBetween, decodePuzzle, encodePuzzle, type Puzzle } from './puzzleData';

const puzzle: Puzzle = {
  id: '00008',
  fen: 'r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24',
  moves: ['f2g3', 'e6e7', 'b2b1', 'b3c1', 'b1c1', 'h6c1'],
  rating: 1811,
  themes: ['crushing', 'hangingPiece', 'long', 'middlegame'],
};

describe('bandOf', () => {
  it('gives the lowest rating of the band of 200', () => {
    expect(bandOf(1811)).toBe(1800);
    expect(bandOf(1800)).toBe(1800);
    expect(bandOf(1799)).toBe(1600);
  });

  it('puts what is below the first band or above the last one in the nearest', () => {
    expect(bandOf(250)).toBe(MIN_BAND);
    expect(bandOf(3208)).toBe(MAX_BAND);
  });
});

describe('bandsBetween', () => {
  it('lists the bands that cover the ratings', () => {
    expect(bandsBetween(1000, 1300)).toEqual([1000, 1200]);
    expect(bandsBetween(1000, 1000)).toEqual([1000]);
  });

  it('is limited to the bands that exist', () => {
    expect(bandsBetween(0, 600)).toEqual([400, 600]);
    expect(bandsBetween(2700, 4000)).toEqual([2600, 2800]);
  });
});

describe('encodePuzzle and decodePuzzle', () => {
  it('give back the puzzle, the move counters of the FEN excepted', () => {
    const record = encodePuzzle(puzzle);
    expect(record[1]).toBe('r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - -');
    expect(decodePuzzle(record)).toEqual({ ...puzzle, fen: `${record[1]} 0 1` });
  });

  it('reads a puzzle without themes', () => {
    expect(decodePuzzle(['a', '8/8/8/8/8/8/8/8 w - -', 'e2e4 e7e5', 900, ''])?.themes).toEqual([]);
  });

  it.each([
    ['not a record', 'text'],
    ['too short', ['a', 'fen', 'e2e4 e7e5']],
    ['a rating that is not a number', ['a', 'fen', 'e2e4 e7e5', '900', '']],
    ['a move that is not UCI', ['a', 'fen', 'e2e4 e5', 900, '']],
    ['a single move', ['a', 'fen', 'e2e4', 900, '']],
  ])('refuses a damaged record: %s', (_name, record) => {
    expect(decodePuzzle(record)).toBeNull();
  });
});
