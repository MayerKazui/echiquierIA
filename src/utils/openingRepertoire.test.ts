import { describe, expect, it } from 'vitest';
import { game, mv, PSEUDO } from '../test/profileFixtures';
import {
  ACCURACY_PLIES,
  BOOK_PLIES,
  COSTLY_EXIT,
  MIN_ACCURACY_GAMES,
  MIN_RECURRENCE,
  accuracyExtremes,
  buildRepertoire,
  familyOf,
  findExit,
  type Family,
  type RepertoireSource,
} from './openingRepertoire';

const RUY = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];

interface Options {
  id?: string;
  /** Plies in the book: the move at this ply is the first one outside it. */
  bookPlies?: number;
  /** Name given to the book moves (the last one of them names the game). */
  name?: string;
  eco?: string;
  /** Win % the first move outside the book gives away. */
  loss?: number;
  sans?: string[];
  result?: string;
  color?: 'w' | 'b';
  /** Plies of the player's moves that lose a lot (a drop of the evaluation of 300 cp), outside the book. */
  blunders?: number[];
}

/** A game of the player: the first `bookPlies` moves are theory, the next one leaves it. */
function played({
  id = 'g',
  bookPlies = 8,
  name = 'Ruy Lopez: Morphy Defense',
  eco = 'C78',
  loss = 0,
  sans = RUY,
  result = '1-0',
  color = 'w',
  blunders = [],
}: Options = {}): RepertoireSource {
  const moves = sans.map((san, ply) =>
    ply < bookPlies
      ? mv(ply, { san, classification: 'book', openingName: name, eco })
      : mv(ply, {
          san,
          classification: 'best',
          winPercentLoss: ply === bookPlies ? loss : 0,
          ...(blunders.includes(ply) && { evalAfter: ply % 2 === 0 ? -300 : 300 }),
        })
  );
  return game({
    id,
    white: color === 'w' ? PSEUDO : 'Bob',
    black: color === 'w' ? 'Bob' : PSEUDO,
    meta: { result },
    moves,
  });
}

describe('familyOf', () => {
  it('keeps what comes before the first colon', () => {
    expect(familyOf('Sicilian Defense: Najdorf Variation, English Attack')).toBe('Sicilian Defense');
    expect(familyOf('Italian Game')).toBe('Italian Game');
  });
});

describe('findExit', () => {
  it('is the first move outside the book, with the moves played before it', () => {
    const exit = findExit(played({ bookPlies: 6, loss: 12 }).result, 'w');
    expect(exit).toEqual({ moveNumber: 4, san: 'Ba4', byPlayer: true, loss: 12, line: RUY.slice(0, 6) });
  });

  it('says when the opponent left the theory', () => {
    const exit = findExit(played({ bookPlies: 7 }).result, 'w');
    expect(exit).toMatchObject({ san: 'Nf6', byPlayer: false, moveNumber: 4 });
  });

  it('is the side of the player that counts', () => {
    expect(findExit(played({ bookPlies: 6 }).result, 'b')?.byPlayer).toBe(false);
  });

  it('is null for a game that stays in the book', () => {
    expect(findExit(played({ bookPlies: RUY.length }).result, 'w')).toBeNull();
  });

  it('only looks at the opening', () => {
    const long = Array.from({ length: BOOK_PLIES + 10 }, (_, i) => ['Nf3', 'Nf6', 'Ng1', 'Ng8'][i % 4]);
    expect(findExit(played({ sans: long, bookPlies: BOOK_PLIES + 5 }).result, 'w')).toBeNull();
  });

  it('counts a move that is better than the engine’s as free', () => {
    const game = played({ bookPlies: 6 });
    game.result.moves[6] = { ...game.result.moves[6], winPercentLoss: -3 };
    expect(findExit(game.result, 'w')?.loss).toBe(0);
  });
});

describe('buildRepertoire', () => {
  it('groups the games by opening, with the results from the player’s side', async () => {
    const repertoire = await buildRepertoire([
      played({ id: 'a', result: '1-0' }),
      played({ id: 'b', result: '0-1' }),
      played({ id: 'c', result: '1/2-1/2', name: 'Italian Game', eco: 'C50' }),
    ]);
    expect(repertoire.counted).toBe(3);
    const [ruy, italian] = repertoire.colors.w;
    expect(ruy).toMatchObject({ name: 'Ruy Lopez', eco: 'C78', tally: { games: 2, wins: 1, draws: 0, losses: 1 } });
    expect(italian).toMatchObject({ name: 'Italian Game', tally: { games: 1, draws: 1 } });
    expect(repertoire.colors.b).toEqual([]);
  });

  it('keeps White and Black apart, and reads the result for the side played', async () => {
    const repertoire = await buildRepertoire([
      played({ id: 'a', color: 'w', result: '1-0' }),
      played({ id: 'b', color: 'b', result: '1-0' }),
    ]);
    expect(repertoire.colors.w[0].tally).toMatchObject({ games: 1, wins: 1 });
    expect(repertoire.colors.b[0].tally).toMatchObject({ games: 1, losses: 1 });
  });

  it('lists the variations of a family, the most played first', async () => {
    const repertoire = await buildRepertoire([
      played({ id: 'a', name: 'Sicilian Defense: Najdorf Variation', eco: 'B90' }),
      played({ id: 'b', name: 'Sicilian Defense: Dragon Variation', eco: 'B70' }),
      played({ id: 'c', name: 'Sicilian Defense: Dragon Variation', eco: 'B70' }),
      played({ id: 'd', name: 'Sicilian Defense', eco: 'B20' }),
    ]);
    const [sicilian] = repertoire.colors.w;
    expect(sicilian.tally.games).toBe(4);
    expect(sicilian.variations.map((v) => [v.name, v.tally.games])).toEqual([
      ['Sicilian Defense: Dragon Variation', 2],
      ['Sicilian Defense: Najdorf Variation', 1],
      ['Sicilian Defense', 1],
    ]);
    expect(sicilian.eco).toBe('B70');
  });

  it('puts a game without a named opening in its own group', async () => {
    const game = played();
    game.result.moves = game.result.moves.map((m) => ({ ...m, openingName: undefined, eco: undefined }));
    const [group] = (await buildRepertoire([game])).colors.w;
    expect(group.name).toBe('');
    expect(group.tally.games).toBe(1);
  });

  it('counts who left the theory first', async () => {
    const [ruy] = (
      await buildRepertoire([
        played({ id: 'a', bookPlies: 6 }), // the player (White, ply 6)
        played({ id: 'b', bookPlies: 7 }), // the opponent
        played({ id: 'c', bookPlies: 5 }), // the opponent (Black, ply 5)
        played({ id: 'd', bookPlies: RUY.length }), // nobody
      ])
    ).colors.w;
    expect(ruy.exits).toEqual({ player: 1, opponent: 2, none: 1 });
  });

  describe('recurring exits', () => {
    it('needs the same move from the same position in several games', async () => {
      expect(MIN_RECURRENCE).toBe(2);
      const [ruy] = (
        await buildRepertoire([
          played({ id: 'a', bookPlies: 6, loss: 10, result: '0-1' }),
          played({ id: 'b', bookPlies: 6, loss: 4, result: '1-0' }),
          played({ id: 'c', bookPlies: 6, loss: 1, sans: [...RUY.slice(0, 6), 'Bxc6', 'dxc6', 'O-O', 'Bg4'] }),
        ])
      ).colors.w;
      expect(ruy.exits.player).toBe(3);
      expect(ruy.recurring).toHaveLength(1);
      expect(ruy.recurring[0]).toMatchObject({
        moveNumber: 4,
        san: 'Ba4',
        line: RUY.slice(0, 6),
        count: 2,
        loss: 7,
        tally: { games: 2, wins: 1, losses: 1 },
      });
    });

    it('calls an exit costly from the limit of an inaccuracy', async () => {
      const exits = async (loss: number) =>
        (await buildRepertoire([played({ id: 'a', loss }), played({ id: 'b', loss })])).colors.w[0].recurring[0];
      expect((await exits(COSTLY_EXIT)).isCostly).toBe(true);
      expect((await exits(COSTLY_EXIT - 0.5)).isCostly).toBe(false);
    });

    it('does not count the exits of the opponent', async () => {
      const [ruy] = (await buildRepertoire([played({ id: 'a', bookPlies: 7 }), played({ id: 'b', bookPlies: 7 })]))
        .colors.w;
      expect(ruy.recurring).toEqual([]);
    });

    it('keeps a transposition in one entry: the position, not the move order', async () => {
      const a = ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6'];
      const b = ['c4', 'e6', 'Nc3', 'd5', 'd4', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6'];
      const opts = { name: "Queen's Gambit Declined", eco: 'D37', bookPlies: 10, loss: 9 };
      const [qgd] = (
        await buildRepertoire([played({ ...opts, id: 'a', sans: a }), played({ ...opts, id: 'b', sans: b })])
      ).colors.w;
      expect(qgd.recurring).toHaveLength(1);
      expect(qgd.recurring[0].count).toBe(2);
    });

    it('does not mix the same move played from two different positions', async () => {
      const a = [...RUY.slice(0, 6), 'a3', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];
      const b = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'a3', 'a6', 'O-O', 'Be7', 'Re1', 'b5'];
      const [ruy] = (
        await buildRepertoire([played({ id: 'a', bookPlies: 6, sans: a }), played({ id: 'b', bookPlies: 6, sans: b })])
      ).colors.w;
      expect(ruy.exits.player).toBe(2);
      expect(ruy.recurring).toEqual([]);
    });

    it('keeps the three most frequent, the most frequent first', async () => {
      const exits = [
        ['Bxc6', 3],
        ['Nc3', 2],
        ['d4', 4],
        ['h3', 2],
      ] as const;
      const games = exits.flatMap(([san, times]) =>
        Array.from({ length: times }, (_, i) =>
          played({ id: `${san}${i}`, bookPlies: 6, sans: [...RUY.slice(0, 6), san, 'a6', 'a3', 'a5'].slice(0, 12) })
        )
      );
      const [ruy] = (await buildRepertoire(games)).colors.w;
      expect(ruy.recurring.map((r) => [r.san, r.count])).toEqual([
        ['d4', 4],
        ['Bxc6', 3],
        ['Nc3', 2],
      ]);
    });
  });

  it('leaves out the games the player is not named in, and the games that are too short', async () => {
    const stranger = played({ id: 'a' });
    stranger.result.metadata = { ...stranger.result.metadata, white: 'X', black: 'Y' };
    const short = played({ id: 'b', sans: RUY.slice(0, 8) });
    const repertoire = await buildRepertoire([stranger, short, played({ id: 'c' })]);
    expect(repertoire).toMatchObject({ counted: 1, ignored: 2 });
  });

  it('counts a game without result, without scoring it', async () => {
    const [ruy] = (await buildRepertoire([played({ result: '*' })])).colors.w;
    expect(ruy.tally).toEqual({ games: 1, wins: 0, draws: 0, losses: 0 });
  });

  it('lets the page breathe on a long history', async () => {
    let yields = 0;
    await buildRepertoire(
      Array.from({ length: 60 }, (_, i) => played({ id: String(i) })),
      { yieldToUi: async () => void yields++ }
    );
    expect(yields).toBe(2);
  });

  describe('accuracy', () => {
    it('is perfect when the moves outside the theory are', async () => {
      const repertoire = await buildRepertoire([played({ id: 'a' })]);
      expect(repertoire.colors.w[0].accuracy).toBe(100);
      expect(repertoire.colors.w[0].variations[0].accuracy).toBe(100);
      expect(repertoire.accuracy).toBe(100);
    });

    it('drops with the moves that lose ground', async () => {
      const [ruy] = (await buildRepertoire([played({ id: 'a', blunders: [8] })])).colors.w;
      expect(ruy.accuracy).toBeLessThan(90);
    });

    it('leaves out the moves of the theory, which are always perfect', async () => {
      // Whatever the evaluations say of a book move, it is not counted: it would flatter (or hurt) the opening
      const game = played({ id: 'a', bookPlies: 8, blunders: [8] });
      const reference = (await buildRepertoire([game])).colors.w[0].accuracy!;
      game.result.moves[2] = { ...game.result.moves[2], evalAfter: -300 };
      expect((await buildRepertoire([game])).colors.w[0].accuracy).toBe(reference);
    });

    it('only counts the moves that follow the theory, not the rest of a long game', async () => {
      const long = [...RUY, ...Array.from({ length: 40 }, (_, i) => `m${i}`)];
      const lastPly = long.length - 2; // a move of White, well past the window
      expect(lastPly - 8).toBeGreaterThan(ACCURACY_PLIES);
      const [late] = (await buildRepertoire([played({ id: 'a', sans: long, blunders: [lastPly] })])).colors.w;
      expect(late.accuracy).toBe(100);
      const [early] = (await buildRepertoire([played({ id: 'a', sans: long, blunders: [8 + ACCURACY_PLIES - 2] })]))
        .colors.w;
      expect(early.accuracy!).toBeLessThan(100);
      const [just] = (await buildRepertoire([played({ id: 'a', sans: long, blunders: [8 + ACCURACY_PLIES] })])).colors
        .w;
      expect(just.accuracy).toBe(100);
    });

    it('measures the window from the first move outside the theory of the game', async () => {
      const long = [...RUY, ...Array.from({ length: 40 }, (_, i) => `m${i}`)];
      const [ruy] = (await buildRepertoire([played({ id: 'a', sans: long, bookPlies: 4, blunders: [4 + 18] })])).colors
        .w;
      expect(ruy.accuracy!).toBeLessThan(100);
    });

    it('does not count the opponent’s moves', async () => {
      // Ply 9 is Black's: a blunder there is not the player's (White)
      const [ruy] = (await buildRepertoire([played({ id: 'a', blunders: [9] })])).colors.w;
      expect(ruy.accuracy).toBe(100);
    });

    it('is null when every move is theory', async () => {
      const repertoire = await buildRepertoire([played({ id: 'a', bookPlies: RUY.length })]);
      expect(repertoire.colors.w[0].accuracy).toBeNull();
      expect(repertoire.accuracy).toBeNull();
    });

    it('is worked out for each opening and each variation, the average being over all the games', async () => {
      const repertoire = await buildRepertoire([
        played({ id: 'a', name: 'Ruy Lopez: Morphy Defense' }),
        played({ id: 'b', name: 'Ruy Lopez: Berlin Defense', blunders: [8] }),
        played({ id: 'c', name: 'Italian Game', eco: 'C50', blunders: [8, 10] }),
      ]);
      const [ruy, italian] = repertoire.colors.w;
      const [morphy, berlin] = ruy.variations;
      expect(morphy.accuracy).toBe(100);
      expect(berlin.accuracy!).toBeLessThan(morphy.accuracy!);
      expect(ruy.accuracy!).toBeLessThan(100);
      expect(ruy.accuracy!).toBeGreaterThan(berlin.accuracy!);
      expect(italian.accuracy!).toBeLessThan(berlin.accuracy!);
      // Between the best and the worst of the games
      expect(repertoire.accuracy!).toBeGreaterThan(italian.accuracy!);
      expect(repertoire.accuracy!).toBeLessThan(100);
    });

    it('keeps both colours in the average', async () => {
      const repertoire = await buildRepertoire([
        played({ id: 'a', color: 'w' }),
        played({ id: 'b', color: 'b', blunders: [9] }),
      ]);
      expect(repertoire.colors.w[0].accuracy).toBe(100);
      expect(repertoire.colors.b[0].accuracy!).toBeLessThan(100);
      expect(repertoire.accuracy!).toBeLessThan(100);
      expect(repertoire.accuracy!).toBeGreaterThan(repertoire.colors.b[0].accuracy!);
    });
  });
});

describe('accuracyExtremes', () => {
  const family = (name: string, games: number, accuracy: number | null): Family => ({
    name,
    eco: 'A00',
    tally: { games, wins: 0, draws: 0, losses: 0 },
    accuracy,
    variations: [],
    exits: { player: 0, opponent: 0, none: games },
    recurring: [],
  });

  it('is the best and the worst of the openings met often enough', () => {
    const result = accuracyExtremes([
      family('Italian Game', MIN_ACCURACY_GAMES, 70),
      family('Ruy Lopez', 8, 84),
      family('Scotch Game', MIN_ACCURACY_GAMES + 1, 78),
    ]);
    expect(result?.best.name).toBe('Ruy Lopez');
    expect(result?.worst.name).toBe('Italian Game');
  });

  it('leaves out the openings met too rarely, and the games without a named opening', () => {
    expect(
      accuracyExtremes([
        family('Ruy Lopez', 8, 84),
        family('Italian Game', MIN_ACCURACY_GAMES - 1, 10),
        family('', 20, 12),
      ])
    ).toBeNull();
  });

  it('is null when the openings are all alike, or without accuracy', () => {
    expect(accuracyExtremes([family('A', 5, 80), family('B', 5, 80)])).toBeNull();
    expect(accuracyExtremes([family('A', 5, null), family('B', 5, null)])).toBeNull();
    expect(accuracyExtremes([])).toBeNull();
  });
});
