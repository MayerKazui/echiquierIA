import { Chess } from 'chess.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpeningsFromDisk } from '../test/openings';
import { ensureOpeningBookLoaded, getOpeningPosition } from '../services/openingBook';
import {
  START_FEN,
  addToTally,
  continuationsOf,
  emptyTally,
  mergeTallies,
  scoreOf,
  walkLine,
  type Tally,
} from './openingExplorer';

beforeAll(async () => {
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
});

describe('tallies', () => {
  it('counts the games and the results from the player’s side', () => {
    const tally = emptyTally();
    addToTally(tally, 'win');
    addToTally(tally, 'win');
    addToTally(tally, 'draw');
    addToTally(tally, 'loss');
    addToTally(tally, null);
    expect(tally).toEqual({ games: 5, wins: 2, draws: 1, losses: 1 });
  });

  it('scores a win 1 and a draw ½, among the games that have a result', () => {
    expect(scoreOf({ games: 5, wins: 2, draws: 1, losses: 1 })).toBeCloseTo(2.5 / 4);
  });

  it('has no score without a result', () => {
    expect(scoreOf({ games: 2, wins: 0, draws: 0, losses: 0 })).toBeNull();
  });

  it('adds two tallies', () => {
    const a: Tally = { games: 2, wins: 1, draws: 1, losses: 0 };
    const b: Tally = { games: 3, wins: 0, draws: 1, losses: 2 };
    expect(mergeTallies(a, b)).toEqual({ games: 5, wins: 1, draws: 2, losses: 2 });
  });
});

describe('openings database lookup', () => {
  it('knows the continuations of the starting position, the most common first', () => {
    const start = getOpeningPosition(START_FEN);
    expect(start?.nextSans.slice(0, 3)).toEqual(expect.arrayContaining(['e4', 'd4']));
    expect(start?.nextSans[0]).toBe('e4');
  });

  it('accepts a FEN with move counters', () => {
    expect(getOpeningPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 12 40')).not.toBeNull();
  });

  it('knows nothing of a position outside the database', () => {
    expect(getOpeningPosition('8/8/8/8/8/8/8/K6k w - - 0 1')).toBeNull();
  });
});

describe('walkLine', () => {
  it('starts from the initial position', () => {
    const walk = walkLine([], getOpeningPosition);
    expect(walk.steps).toEqual([]);
    expect(walk.fen).toBe(START_FEN);
    expect(walk.name).toBe('');
  });

  it('names the opening a line has reached', () => {
    const walk = walkLine(['e4', 'c5'], getOpeningPosition);
    expect(walk.steps.map((s) => s.san)).toEqual(['e4', 'c5']);
    expect(walk.name).toMatch(/Sicilian/);
    expect(walk.eco).toMatch(/^B/);
  });

  it('keeps the last name while the line goes on without one', () => {
    // 1.d4 Nf6 2.Nc3 is not an opening of its own: the line is still the Indian Defense
    const walk = walkLine(['d4', 'Nf6', 'Nc3'], getOpeningPosition);
    expect(walk.steps[2]).toMatchObject({ san: 'Nc3', name: '', eco: '' });
    expect(walk.name).toBe('Indian Defense');
    expect(walk.eco).toBe(walk.steps[1].eco);
  });

  it('records where each move goes from and to, and the position before it', () => {
    const [first, second] = walkLine(['e4', 'e5'], getOpeningPosition).steps;
    expect(first).toMatchObject({ san: 'e4', from: 'e2', to: 'e4', before: START_FEN });
    expect(second.before).toBe(first.fen);
  });

  it('stops at the first move that is not legal', () => {
    const walk = walkLine(['e4', 'e4', 'Nf3'], getOpeningPosition);
    expect(walk.steps.map((s) => s.san)).toEqual(['e4']);
  });
});

describe('continuationsOf', () => {
  it('offers the database moves from the starting position, with the opening they name', () => {
    const list = continuationsOf(START_FEN, getOpeningPosition, undefined);
    expect(list[0]).toMatchObject({ san: 'e4', inBook: true, mine: null });
    expect(list.every((c) => c.inBook)).toBe(true);
  });

  it('says which opening an unnamed move leads to', () => {
    // 1.d4 Nf6 2.Nc3 has no name of its own, its main line goes to a named variation
    const { fen } = walkLine(['d4', 'Nf6'], getOpeningPosition);
    const nc3 = continuationsOf(fen, getOpeningPosition, undefined).find((c) => c.san === 'Nc3');
    expect(nc3).toMatchObject({ inBook: true, name: '', eco: '' });
    expect(nc3?.leadsTo).not.toBe('');
  });

  it('names the move that ends an opening', () => {
    const { fen } = walkLine(['e4', 'c5'], getOpeningPosition);
    const alapin = continuationsOf(fen, getOpeningPosition, undefined).find((c) => c.san === 'c3');
    expect(alapin?.name).toBe('Sicilian Defense: Alapin Variation');
    expect(alapin?.leadsTo).toBe('');
  });

  it('attaches the player’s tallies to the moves they played', () => {
    const mine = new Map([['e4', { games: 4, wins: 3, draws: 0, losses: 1 }]]);
    const list = continuationsOf(START_FEN, getOpeningPosition, mine);
    expect(list.find((c) => c.san === 'e4')?.mine).toEqual({ games: 4, wins: 3, draws: 0, losses: 1 });
    expect(list.find((c) => c.san === 'd4')?.mine).toBeNull();
  });

  it('adds the moves of the player’s games that the database does not know, the most played first', () => {
    const { fen } = walkLine(['e4', 'e5'], getOpeningPosition);
    const known = new Set(getOpeningPosition(fen)?.nextSans);
    const [rare, odd] = new Chess(fen).moves().filter((san) => !known.has(san));
    const mine = new Map<string, Tally>([
      [rare, { games: 1, wins: 0, draws: 0, losses: 1 }],
      [odd, { games: 3, wins: 1, draws: 1, losses: 1 }],
      ['Nf3', { games: 2, wins: 2, draws: 0, losses: 0 }],
    ]);
    const list = continuationsOf(fen, getOpeningPosition, mine);
    expect(list.filter((c) => !c.inBook).map((c) => c.san)).toEqual([odd, rare]);
    // Theory comes first, and a move of both lists is shown once
    expect(list.findIndex((c) => c.san === odd)).toBeGreaterThan(list.findIndex((c) => c.san === 'Nf3'));
    expect(list.filter((c) => c.san === 'Nf3')).toHaveLength(1);
    expect(list.find((c) => c.san === odd)).toMatchObject({ inBook: false, name: '', leadsTo: '' });
  });

  it('leaves out a move that is not legal in the position', () => {
    const mine = new Map<string, Tally>([['Qh5', { games: 1, wins: 1, draws: 0, losses: 0 }]]);
    expect(continuationsOf(START_FEN, getOpeningPosition, mine).some((c) => c.san === 'Qh5')).toBe(false);
  });

  it('has no move at a position the database and the games do not know', () => {
    expect(continuationsOf('8/8/8/8/8/8/8/K6k w - - 0 1', getOpeningPosition, undefined)).toEqual([]);
  });
});
