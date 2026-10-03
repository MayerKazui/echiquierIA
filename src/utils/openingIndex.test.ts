import { describe, expect, it } from 'vitest';
import { game, mv, PSEUDO } from '../test/profileFixtures';
import { INDEX_PLIES, buildOpeningIndex, gamesIn, indexLines, talliesAt } from './openingIndex';
import { START_FEN } from './openingExplorer';

/** A game of the player given as SAN moves (the engine data does not matter here). */
const played = (sans: string[], over: Parameters<typeof game>[0] = {}) =>
  game({ moves: sans.map((san, ply) => mv(ply, { san })), ...over });

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('buildOpeningIndex', () => {
  it('counts, for each position, the moves played and how the player’s games went', async () => {
    const index = await buildOpeningIndex([
      played(['e4', 'e5'], { id: 'a', meta: { result: '1-0' } }),
      played(['e4', 'c5'], { id: 'b', meta: { result: '0-1' } }),
      played(['d4', 'd5'], { id: 'c', meta: { result: '1/2-1/2' } }),
    ]);
    const first = talliesAt(index, START_FEN, 'all')!;
    expect(first.get('e4')).toEqual({ games: 2, wins: 1, draws: 0, losses: 1 });
    expect(first.get('d4')).toEqual({ games: 1, wins: 0, draws: 1, losses: 0 });
    const reply = talliesAt(index, AFTER_E4, 'all')!;
    expect([...reply.keys()].sort()).toEqual(['c5', 'e5']);
  });

  it('takes the result from the side the player had', async () => {
    const index = await buildOpeningIndex([
      played(['e4', 'e5'], { white: 'Bob', black: PSEUDO, meta: { result: '1-0' } }),
    ]);
    expect(talliesAt(index, START_FEN, 'all')!.get('e4')).toEqual({ games: 1, wins: 0, draws: 0, losses: 1 });
  });

  it('can look at one colour only', async () => {
    const index = await buildOpeningIndex([
      played(['e4', 'e5'], { id: 'a' }),
      played(['d4', 'd5'], { id: 'b', white: 'Bob', black: PSEUDO, meta: { result: '0-1' } }),
    ]);
    expect([...talliesAt(index, START_FEN, 'w')!.keys()]).toEqual(['e4']);
    expect([...talliesAt(index, START_FEN, 'b')!.keys()]).toEqual(['d4']);
    expect(talliesAt(index, AFTER_E4, 'b')).toBeUndefined();
  });

  it('shares a position reached by transposition', async () => {
    const index = await buildOpeningIndex([
      played(['d4', 'd5', 'c4', 'e6', 'Nc3'], { id: 'a' }),
      played(['c4', 'e6', 'd4', 'd5', 'Nf3'], { id: 'b' }),
    ]);
    const after = 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -';
    expect([...index.get(after)!.keys()].sort()).toEqual(['Nc3', 'Nf3']);
  });

  it('leaves out the games the player is not named in', async () => {
    const index = await buildOpeningIndex([played(['e4', 'e5'], { white: 'X', black: 'Y' })]);
    expect(index.size).toBe(0);
  });

  it('counts a game without result, without scoring it', async () => {
    const index = await buildOpeningIndex([played(['e4', 'e5'], { meta: { result: '*' } })]);
    expect(talliesAt(index, START_FEN, 'all')!.get('e4')).toEqual({ games: 1, wins: 0, draws: 0, losses: 0 });
  });

  it('stops reading a game whose moves do not replay, and keeps what came before', async () => {
    const index = await buildOpeningIndex([played(['e4', 'e4', 'Nf3'])]);
    expect(talliesAt(index, START_FEN, 'all')!.get('e4')?.games).toBe(1);
    expect(index.size).toBe(1); // only the start: the second 1.e4 is not a move, so nothing is kept after it
  });

  it('only reads the opening', async () => {
    const shuffle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    const sans = Array.from({ length: INDEX_PLIES + 8 }, (_, i) => shuffle[i % 4]);
    const index = await buildOpeningIndex([played(sans)]);
    const total = [...index.values()].reduce((n, moves) => n + moves.size, 0);
    expect(total).toBeLessThanOrEqual(INDEX_PLIES);
  });

  it('lets the page breathe on a long history', async () => {
    let yields = 0;
    await buildOpeningIndex(
      Array.from({ length: 60 }, (_, i) => played(['e4'], { id: String(i) })),
      { yieldToUi: async () => void yields++ }
    );
    expect(yields).toBe(2);
  });
});

describe('gamesIn', () => {
  it('counts the games the player is named in', async () => {
    const index = await buildOpeningIndex([
      played(['e4', 'e5'], { id: 'a' }),
      played(['d4', 'd5'], { id: 'b' }),
      played(['d4'], { id: 'c', white: 'X', black: 'Y' }),
    ]);
    expect(gamesIn(index)).toBe(2);
  });
});

describe('indexLines', () => {
  it('indexes bare lines, by the colour of the counted player', async () => {
    const index = await indexLines([
      { sans: ['e4', 'e5'], color: 'w', outcome: 'win' },
      { sans: ['e4', 'c5'], color: 'b', outcome: 'loss' },
    ]);
    expect(talliesAt(index, START_FEN, 'w')!.get('e4')).toEqual({ games: 1, wins: 1, draws: 0, losses: 0 });
    expect(talliesAt(index, START_FEN, 'b')!.get('e4')).toEqual({ games: 1, wins: 0, draws: 0, losses: 1 });
    expect(gamesIn(index)).toBe(2);
  });

  it('keeps what was read of a line that stops being legal', async () => {
    const index = await indexLines([{ sans: ['e4', 'e5', 'Ke4'], color: 'w', outcome: null }]);
    expect(talliesAt(index, AFTER_E4, 'all')!.get('e5')).toEqual({ games: 1, wins: 0, draws: 0, losses: 0 });
  });
});
