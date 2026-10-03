import { Chess } from 'chess.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { getOpeningPosition, ensureOpeningBookLoaded, normalizeFen } from '../services/openingBook';
import { game, mv, PSEUDO } from '../test/profileFixtures';
import { loadOpeningsFromDisk } from '../test/openings';
import {
  DRILL_ID_PREFIX,
  MIN_LINE_PLIES,
  collectDrillPositions,
  drillId,
  drillPositionsOf,
  isDrillSuccess,
  judgeDrillMove,
  type DrillPosition,
} from './openingDrill';
import { COSTLY_EXIT } from './openingRepertoire';
import type { ProfileSource } from './weaknessProfile';

/** After 3…a6 of the Ruy Lopez, White plays 4.a3, which the database does not know (4.Ba4 and 4.Bxc6 it does). */
const RUY_A3 = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'a3', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];
const RUY_H3 = [...RUY_A3.slice(0, 6), 'h3', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];
const AFTER_A6 = 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';

interface Options {
  id?: string;
  /** Plies in the book: the move at this ply is the first one outside it. */
  bookPlies?: number;
  name?: string;
  eco?: string;
  /** Win % the first move outside the book gives away. */
  loss?: number;
  sans?: string[];
  color?: 'w' | 'b';
  date?: string;
  savedAt?: number;
}

function played({
  id = 'g',
  bookPlies = 6,
  name = 'Ruy Lopez: Morphy Defense',
  eco = 'C78',
  loss = 12,
  sans = RUY_A3,
  color = 'w',
  date,
  savedAt = 1,
}: Options = {}): ProfileSource {
  const moves = sans.map((san, ply) =>
    ply < bookPlies
      ? mv(ply, { san, classification: 'book', openingName: name, eco })
      : mv(ply, { san, classification: 'best', winPercentLoss: ply === bookPlies ? loss : 0 })
  );
  return game({
    id,
    white: color === 'w' ? PSEUDO : 'Bob',
    black: color === 'w' ? 'Bob' : PSEUDO,
    meta: { result: '1-0', ...(date && { date }) },
    moves,
    savedAt,
  });
}

beforeAll(async () => {
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
});

const collectAll = (sources: ProfileSource[]) => collectDrillPositions(sources, getOpeningPosition);
/** The exits only: the games of the fixture also follow the theory for some moves, which makes lines. */
const collect = async (sources: ProfileSource[]) => (await collectAll(sources)).filter((p) => p.kind === 'exit');
/** The lines that work only. */
const collectLines = async (sources: ProfileSource[]) => (await collectAll(sources)).filter((p) => p.kind === 'line');

/** The line of the theory the games below follow: 4.Ba4 Nf6, then 5.O-O. */
const RUY_BA4 = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];

describe('collectDrillPositions', () => {
  it('is the position before a costly move that left the theory, with the theory and what was played', async () => {
    const [position] = await collect([played({ date: '2026.03.14' })]);
    expect(position).toEqual({
      kind: 'exit',
      id: `${DRILL_ID_PREFIX}${normalizeFen(AFTER_A6)}`,
      fen: AFTER_A6,
      color: 'w',
      moveNumber: 4,
      line: RUY_A3.slice(0, 6),
      opening: 'Ruy Lopez: Morphy Defense',
      eco: 'C78',
      bookMoves: ['Ba4', 'Bxc6'],
      played: [{ san: 'a3', games: 1 }],
      games: 1,
      loss: 12,
      date: Date.UTC(2026, 2, 14),
    });
    expect(position.id).toBe(drillId(AFTER_A6));
  });

  it('puts the games that went through the same position together: the moves, the mean cost, the latest date', async () => {
    const positions = await collect([
      played({ id: 'a', loss: 10, date: '2026.01.10' }),
      played({ id: 'b', loss: 20, date: '2026.02.20' }),
      played({ id: 'c', loss: 15, sans: RUY_H3, date: '2026.01.30' }),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      games: 3,
      loss: 15,
      played: [
        { san: 'a3', games: 2 },
        { san: 'h3', games: 1 },
      ],
      date: Date.UTC(2026, 1, 20),
    });
  });

  it('takes the date the game was saved when it has none', async () => {
    const [position] = await collect([played({ savedAt: 4242 })]);
    expect(position.date).toBe(4242);
  });

  it('puts a position reached by another order of moves together with the first', async () => {
    const a = ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Rb1', 'h6'];
    const b = ['c4', 'e6', 'Nc3', 'd5', 'd4', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Rb1', 'h6'];
    const opts = { name: "Queen's Gambit Declined", eco: 'D37', bookPlies: 10, loss: 9 };
    const positions = await collect([played({ ...opts, id: 'a', sans: a }), played({ ...opts, id: 'b', sans: b })]);
    expect(positions).toHaveLength(1);
    expect(positions[0].games).toBe(2);
  });

  it('keeps the black pieces for a game as Black, and counts the move of Black', async () => {
    const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'h6', 'O-O', 'Nf6', 'd3', 'd6', 'Nc3', 'Be7'];
    const [position] = await collect([played({ sans, bookPlies: 5, color: 'b', loss: 9 })]);
    expect(position).toMatchObject({ color: 'b', moveNumber: 3, line: sans.slice(0, 5) });
    expect(position.bookMoves).toContain('a6');
    expect(position.fen.split(' ')[1]).toBe('b');
  });

  it('only takes a move that costs at least the limit of an inaccuracy', async () => {
    expect(await collect([played({ loss: COSTLY_EXIT - 0.1 })])).toEqual([]);
    expect(await collect([played({ loss: COSTLY_EXIT })])).toHaveLength(1);
  });

  it('averages the cost of the games: one cheap game among costly ones does not hide the position', async () => {
    expect(await collect([played({ id: 'a', loss: 4 }), played({ id: 'b', loss: 4 })])).toEqual([]);
    expect(await collect([played({ id: 'a', loss: 0 }), played({ id: 'b', loss: 20 })])).toHaveLength(1);
  });

  it('leaves out the exits of the opponent', async () => {
    // Ply 7 is Black's: the opponent of a White player leaves the theory
    expect(await collect([played({ bookPlies: 7, loss: 20 })])).toEqual([]);
  });

  it('leaves out a game that stays in the theory', async () => {
    expect(await collect([played({ bookPlies: RUY_A3.length })])).toEqual([]);
  });

  it('leaves out a position from which the database knows nothing to play', async () => {
    const sans = ['a3', 'a6', 'b3', 'b6', 'c3', 'c6', 'd3', 'd6', 'e3', 'e6', 'f3', 'f6'];
    expect(getOpeningPosition(new Chess().fen())).not.toBeNull();
    expect(await collect([played({ sans, bookPlies: 4, loss: 20 })])).toEqual([]);
  });

  it('leaves out a move the database knows today: the game was analysed with an incomplete database', async () => {
    // 4.Ba4 is theory, whatever the stored classification says
    const sans = [...RUY_A3.slice(0, 6), 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];
    expect(await collect([played({ sans, loss: 20 })])).toEqual([]);
  });

  it('keeps the other moves of a position when one of them is theory today', async () => {
    const theory = [...RUY_A3.slice(0, 6), 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];
    const [position] = await collect([played({ id: 'a', sans: theory, loss: 20 }), played({ id: 'b', loss: 20 })]);
    expect(position.played).toEqual([{ san: 'a3', games: 1 }]);
    expect(position.games).toBe(2);
  });

  it('leaves out the games the player is not named in, and the games that are too short', async () => {
    const stranger = played({ id: 'a' });
    stranger.result.metadata = { ...stranger.result.metadata, white: 'X', black: 'Y' };
    const short = played({ id: 'b', sans: RUY_A3.slice(0, 8) });
    expect(await collect([stranger, short])).toEqual([]);
  });

  it('puts the costliest first', async () => {
    const italian = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'a3', 'Nf6', 'O-O', 'd6', 'c3', 'a6'];
    const positions = await collect([
      played({ id: 'a', loss: 10 }),
      played({ id: 'b', sans: italian, loss: 25, name: 'Italian Game', eco: 'C50' }),
    ]);
    expect(positions.map((p) => p.loss)).toEqual([25, 10]);
  });

  it('lets the page breathe on a long history', async () => {
    let yields = 0;
    await collectDrillPositions(
      Array.from({ length: 60 }, (_, i) => played({ id: String(i) })),
      getOpeningPosition,
      { yieldToUi: async () => void yields++ }
    );
    expect(yields).toBe(2);
  });

  it('uses the test it is given for what is theory', async () => {
    const everything = () => true;
    expect(await collectDrillPositions([played()], getOpeningPosition, { isBook: everything })).toEqual([]);
  });
});

describe('the lines that work', () => {
  const AFTER_BA4_NF6 = 'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 5';
  /** Both games follow the theory up to 5.O-O, then Black (the opponent) leaves it. */
  const shared = (ids = ['a', 'b']) => ids.map((id) => played({ id, sans: RUY_BA4, bookPlies: 9, loss: 0 }));

  it('is the deepest position the games share in the theory, with the move the player played in it', async () => {
    const [position] = await collectLines(shared());
    expect(position).toMatchObject({
      kind: 'line',
      id: drillId(AFTER_BA4_NF6),
      fen: AFTER_BA4_NF6,
      color: 'w',
      moveNumber: 5,
      line: RUY_BA4.slice(0, 8),
      opening: 'Ruy Lopez: Morphy Defense',
      played: [{ san: 'O-O', games: 2 }],
      games: 2,
      loss: 0,
    });
    expect(position.bookMoves).toContain('O-O');
    expect(await collectLines(shared())).toHaveLength(1);
  });

  it('needs the position to be met in at least two games', async () => {
    expect(await collectLines(shared(['a']))).toEqual([]);
    expect(await collectLines(shared(['a', 'b']))).toHaveLength(1);
  });

  it('keeps for each game the deepest position it shares with another: not the ones on the way to it', async () => {
    // The second game leaves the theory a move earlier, so the games only share the position before 4.Ba4
    const positions = await collectLines([
      played({ id: 'a', sans: RUY_BA4, bookPlies: 9 }),
      played({ id: 'b', sans: RUY_BA4, bookPlies: 8 }),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      moveNumber: 4,
      line: RUY_BA4.slice(0, 6),
      played: [{ san: 'Ba4', games: 2 }],
    });
  });

  it('is only the moves of the player: a game as Black', async () => {
    const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];
    const games = ['a', 'b'].map((id) => played({ id, sans, bookPlies: 8, color: 'b' }));
    const [position] = await collectLines(games);
    expect(position).toMatchObject({
      color: 'b',
      moveNumber: 4,
      line: sans.slice(0, 7),
      played: [{ san: 'Nf6', games: 2 }],
    });
    expect(position.fen.split(' ')[1]).toBe('b');
  });

  it('puts the moves played from the same position together', async () => {
    const sans = (move: string) => [...RUY_BA4.slice(0, 8), move, 'Be7', 'Re1', 'b5'];
    const positions = await collectLines([
      played({ id: 'a', sans: sans('O-O'), bookPlies: 9 }),
      played({ id: 'b', sans: sans('O-O'), bookPlies: 9 }),
      played({ id: 'c', sans: sans('d3'), bookPlies: 9 }),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0].games).toBe(3);
    expect(positions[0].played.map((m) => m.san)).toEqual(['O-O', 'd3']);
  });

  it('leaves out the first moves, where nearly every move is theory', async () => {
    expect(
      await collectLines(shared(['a', 'b']).map(() => played({ sans: RUY_BA4, bookPlies: MIN_LINE_PLIES })))
    ).toEqual([]);
  });

  it('leaves out a position that is an exit with a cost: it is an exit', async () => {
    const [exit] = await collect([played({ id: 'a', loss: 12 })]);
    const positions = await collectAll([
      played({ id: 'a', loss: 12 }),
      played({ id: 'b', sans: RUY_BA4, bookPlies: 8 }),
      played({ id: 'c', sans: RUY_BA4, bookPlies: 8 }),
    ]);
    expect(positions.filter((p) => p.id === exit.id).map((p) => p.kind)).toEqual(['exit']);
  });

  it('leaves out the games whose exit is replayed: the line that leads to it is replayed with it', async () => {
    // Both games share the position before 3.Bb5, but they leave the theory a few moves later, at a cost
    expect(await collectLines([played({ id: 'a' }), played({ id: 'b' })])).toEqual([]);
    // Cheap exits are not replayed: their games give a line
    expect(await collectLines([played({ id: 'a', loss: 2 }), played({ id: 'b', loss: 2 })])).toHaveLength(1);
  });

  it('is a line again when the exits from it are cheap', async () => {
    const positions = await collectAll([
      played({ id: 'a', loss: 2 }),
      played({ id: 'b', sans: RUY_BA4, bookPlies: 8 }),
      played({ id: 'c', sans: RUY_BA4, bookPlies: 8 }),
    ]);
    expect(positions.filter((p) => p.fen === AFTER_A6).map((p) => p.kind)).toEqual(['line']);
  });

  it('leaves out a move the database does not know today: the game was analysed with another database', async () => {
    // 4.a3 is marked theory in the games, but is not in the database
    expect(await collectLines(['a', 'b'].map((id) => played({ id, sans: RUY_A3, bookPlies: 9 })))).toEqual([]);
  });

  it('leaves out a position from which the database knows nothing to play, and the games that are too short', async () => {
    const strange = ['a3', 'a6', 'b3', 'b6', 'c3', 'c6', 'd3', 'd6', 'e3', 'e6', 'f3', 'f6'];
    expect(await collectLines(['a', 'b'].map((id) => played({ id, sans: strange, bookPlies: 9 })))).toEqual([]);
    expect(await collectLines(['a', 'b'].map((id) => played({ id, sans: RUY_BA4.slice(0, 8), bookPlies: 8 })))).toEqual(
      []
    );
  });

  it('puts the exits first, the costliest of them first, then the lines the player met most often', async () => {
    const italian = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'a6'];
    const positions = await collectAll([
      ...shared(['a', 'b', 'c']),
      ...['d', 'e'].map((id) => played({ id, sans: italian, bookPlies: 9, name: 'Italian Game', eco: 'C50' })),
      played({ id: 'f', sans: RUY_A3, loss: 15 }),
    ]);
    expect(positions.map((p) => [p.kind, p.games])).toEqual([
      ['exit', 1],
      ['line', 3],
      ['line', 2],
    ]);
  });

  it('is judged by the theory: any move of it is right, the one that was played too', async () => {
    const [position] = await collectLines(shared());
    expect(judgeDrillMove(position, 'O-O')).toEqual({ kind: 'book' });
    expect(judgeDrillMove(position, 'h3')).toEqual({ kind: 'off' });
  });
});

describe('judgeDrillMove', () => {
  let position: DrillPosition;
  beforeAll(async () => {
    [position] = await collect([played()]);
  });

  it('is right for a move of the theory', () => {
    expect(judgeDrillMove(position, 'Ba4')).toEqual({ kind: 'book' });
    expect(judgeDrillMove(position, 'Bxc6')).toEqual({ kind: 'book' });
    expect(isDrillSuccess({ kind: 'book' })).toBe(true);
  });

  it('is wrong for the move of the game', () => {
    expect(judgeDrillMove(position, 'a3')).toEqual({ kind: 'played' });
    expect(isDrillSuccess({ kind: 'played' })).toBe(false);
  });

  it('is wrong for a move the database does not know', () => {
    expect(judgeDrillMove(position, 'Nc3')).toEqual({ kind: 'off' });
    expect(isDrillSuccess({ kind: 'off' })).toBe(false);
  });

  it('is wrong for a move that is not legal, instead of failing', () => {
    expect(judgeDrillMove(position, 'Qh5')).toEqual({ kind: 'off' });
  });

  it('uses the test it is given for what is theory', () => {
    expect(judgeDrillMove(position, 'Nc3', () => true)).toEqual({ kind: 'book' });
    expect(judgeDrillMove(position, 'Ba4', () => false)).toEqual({ kind: 'off' });
  });

  it('does not count the solution that was asked for', () => {
    expect(isDrillSuccess({ kind: 'revealed' })).toBe(false);
  });
});

describe('drillPositionsOf', () => {
  it('keeps the positions of one side, or all of them', async () => {
    const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'h6', 'O-O', 'Nf6', 'd3', 'd6', 'Nc3', 'Be7'];
    const positions = await collect([played({ id: 'a' }), played({ id: 'b', sans, bookPlies: 5, color: 'b' })]);
    expect(positions).toHaveLength(2);
    expect(drillPositionsOf(positions, 'w').map((p) => p.color)).toEqual(['w']);
    expect(drillPositionsOf(positions, 'b').map((p) => p.color)).toEqual(['b']);
    expect(drillPositionsOf(positions, null)).toHaveLength(2);
  });

  it('keeps the positions of one kind, or all of them', async () => {
    const positions = await collectAll([
      played({ id: 'a', loss: 12 }),
      played({ id: 'b', sans: RUY_BA4, bookPlies: 9 }),
      played({ id: 'c', sans: RUY_BA4, bookPlies: 9 }),
    ]);
    expect(drillPositionsOf(positions, null, 'exit').map((p) => p.kind)).toEqual(['exit']);
    expect(drillPositionsOf(positions, null, 'line').every((p) => p.kind === 'line')).toBe(true);
    expect(drillPositionsOf(positions, 'w', null)).toHaveLength(positions.length);
    expect(drillPositionsOf(positions, 'b', 'line')).toEqual([]);
  });
});
