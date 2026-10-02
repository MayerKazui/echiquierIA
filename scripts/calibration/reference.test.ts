import { describe, expect, it } from 'vitest';
import { ensureOpeningBookLoaded } from '../../src/services/openingBook';
import { loadOpeningsFromDisk } from '../../src/test/openings';
import {
  ELO_BANDS,
  gapOf,
  gapsByBand,
  movetextOf,
  positionsOf,
  resultsOf,
  toRecorded,
  type PlayerResult,
  type ReferenceGame,
} from './reference';

const result = (elo: number, ours: number, theirs: number): PlayerResult => ({
  game: 'g',
  color: 'w',
  elo,
  timeClass: 'blitz',
  plies: 40,
  ours,
  theirs,
});

describe('gapOf', () => {
  it('is the mean absolute difference and the mean signed difference', () => {
    expect(gapOf([result(1000, 70, 60), result(1000, 50, 56)])).toEqual({ players: 2, meanAbsolute: 8, bias: 2 });
  });

  it('is zero without players', () => {
    expect(gapOf([])).toEqual({ players: 0, meanAbsolute: 0, bias: 0 });
  });
});

describe('gapsByBand', () => {
  it('groups the players by Elo band, from the lowest, and leaves out the empty bands', () => {
    const bands = gapsByBand([result(650, 60, 50), result(699, 40, 50), result(700, 80, 80), result(2400, 90, 92)]);
    expect(bands.map((b) => [b.label, b.players])).toEqual([
      ['< 700', 2],
      ['700-1100', 1],
      ['> 2300', 1],
    ]);
    expect(bands[0]).toMatchObject({ meanAbsolute: 10, bias: 0 });
  });

  it('covers every Elo without a hole', () => {
    ELO_BANDS.slice(1).forEach((band, i) => expect(band.min).toBe(ELO_BANDS[i].max));
    expect(ELO_BANDS[0].min).toBe(0);
    expect(ELO_BANDS.at(-1)!.max).toBe(Infinity);
  });
});

describe('movetextOf and positionsOf', () => {
  const PGN = '[Event "x"]\n[White "a"]\n\n1. e4 {[%clk 0:03:00]} e5 2. Nf3 Nc6 1-0';

  it('keeps the moves only: no header, comment or result', () => {
    expect(movetextOf(PGN)).toBe('1. e4 e5 2. Nf3 Nc6');
  });

  it('lists the starting position then the position after each move', () => {
    const fens = positionsOf(movetextOf(PGN));
    expect(fens).toHaveLength(5);
    expect(fens[0]).toContain('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w');
    expect(fens[1]).toContain('4P3');
  });
});

describe('resultsOf', () => {
  const PGN = '1. e4 e5 2. Nf3 Nc6';

  function game(evals: ReferenceGame['evals']): ReferenceGame {
    return {
      url: 'https://www.chess.com/game/live/1',
      timeClass: 'blitz',
      whiteElo: 1200,
      blackElo: 1300,
      accuracies: { white: 91.5, black: 88 },
      pgn: PGN,
      evals,
    };
  }

  it('runs the app’s analysis on the recorded evaluations and pairs it with chess.com’s accuracy', async () => {
    await ensureOpeningBookLoaded(loadOpeningsFromDisk);
    const flat = positionsOf(PGN).map(() =>
      toRecorded({ cp: 20, mate: null, bestMoveUci: '', bestMoveSan: '', pv: [] })
    );
    const [white, black] = await resultsOf(game(flat));
    expect(white).toMatchObject({ color: 'w', elo: 1200, theirs: 91.5, plies: 4, ours: 100 });
    expect(black).toMatchObject({ color: 'b', elo: 1300, theirs: 88, ours: 100 });
  });

  it('refuses a game without evaluations, or with the wrong number of them', async () => {
    await expect(resultsOf(game(undefined))).rejects.toThrow('no recorded evaluations');
    await expect(resultsOf(game([[0, null, '', '', null]]))).rejects.toThrow('1 evaluations for 5 positions');
  });
});
