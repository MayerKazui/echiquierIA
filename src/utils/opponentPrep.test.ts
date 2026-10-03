import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ImportedGame } from '../services/gameImport';
import { ensureOpeningBookLoaded, getOpeningPosition } from '../services/openingBook';
import { loadOpeningsFromDisk } from '../test/openings';
import { MIN_LINE_GAMES, buildOpponentPrep, toOpponentGames, type OpponentGame } from './opponentPrep';
import { scoreOf } from './openingExplorer';

beforeAll(async () => {
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
});

const SICILIAN = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
const RUY = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'];

let seq = 0;
const line = (sans: string[], over: Partial<OpponentGame> = {}): OpponentGame => ({
  sans,
  color: 'w',
  outcome: 'win',
  speed: 'blitz',
  playedAt: 1_790_000_000_000 + ++seq * 1000,
  ...over,
});

describe('toOpponentGames', () => {
  const imported = (pgn: string, over: Partial<ImportedGame> = {}): ImportedGame => ({
    id: '1',
    source: 'chesscom',
    url: 'https://example.test/1',
    pgn,
    white: 'adv',
    black: 'moi',
    whiteRating: 1800,
    blackRating: 1700,
    playedAt: 1_790_000_000_000,
    speed: 'blitz',
    timeControl: '5 min',
    rated: true,
    userColor: 'w',
    outcome: 'win',
    plies: 6,
    ...over,
  });

  it('reads the moves, the side and the result of the searched player, and their own rating', async () => {
    const [game] = await toOpponentGames([
      imported('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0'),
      imported('1. d4 d5 2. c4 e6 3. Nc3 Nf6 0-1', { userColor: 'b', outcome: 'loss' }),
    ]);
    expect(game).toMatchObject({
      sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'],
      color: 'w',
      outcome: 'win',
      rating: 1800,
    });
    expect(
      (await toOpponentGames([imported('1. d4 d5 2. c4 e6 0-1', { userColor: 'b', outcome: 'loss' })]))[0]
    ).toMatchObject({
      color: 'b',
      outcome: 'loss',
      rating: 1700,
    });
  });

  it('leaves out a game that cannot be read', async () => {
    expect(await toOpponentGames([imported('not a pgn at all')])).toEqual([]);
  });
});

describe('buildOpponentPrep', () => {
  it('counts the games and tallies them by colour', async () => {
    const prep = await buildOpponentPrep(
      [line(SICILIAN), line(SICILIAN, { outcome: 'loss' }), line(RUY, { color: 'b', outcome: 'draw' })],
      getOpeningPosition
    );
    expect(prep.games).toBe(3);
    expect(prep.colors.w.tally).toEqual({ games: 2, wins: 1, draws: 0, losses: 1 });
    expect(prep.colors.b.tally).toEqual({ games: 1, wins: 0, draws: 1, losses: 0 });
  });

  it('lists how they start: first moves with White, the reply to the first move with Black', async () => {
    const prep = await buildOpponentPrep(
      [
        line(['e4', 'e5']),
        line(['e4', 'c5']),
        line(['e4', 'c5']),
        line(['d4', 'd5'], { color: 'b' }),
        line(['d4', 'd5'], { color: 'b' }),
        line(['e4', 'c6'], { color: 'b', outcome: 'loss' }),
      ],
      getOpeningPosition
    );
    expect(prep.colors.w.starts.map((s) => [s.line, s.tally.games])).toEqual([[['e4'], 3]]);
    expect(prep.colors.b.starts.map((s) => [s.line, s.tally.games])).toEqual([
      [['d4', 'd5'], 2],
      [['e4', 'c6'], 1],
    ]);
  });

  it('groups the games by opening family, the most played first, with its variations', async () => {
    const prep = await buildOpponentPrep(
      [line(SICILIAN), line(SICILIAN), line(SICILIAN, { outcome: 'loss' }), line(RUY)],
      getOpeningPosition
    );
    const [first, second] = prep.colors.w.families;
    expect(first.name).toBe('Sicilian Defense');
    expect(first.tally.games).toBe(3);
    expect(first.variations.length).toBeGreaterThan(0);
    expect(second.name).toBe('Ruy Lopez');
  });

  it('finds the line they come back to, as long as enough games go the same way', async () => {
    const lines = [
      line(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']),
      line(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'], { outcome: 'loss' }),
      line(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']),
      line(['e4', 'c5']),
    ];
    const { colors } = await buildOpponentPrep(lines, getOpeningPosition);
    // 4 games with 1.e4, 3 with 1…e5, 3 with 2.Nf3, 3 with 2…Nc6, then no move reaches the threshold
    expect(colors.w.favourite?.sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(colors.w.favourite?.tally.games).toBe(3);
    expect(MIN_LINE_GAMES).toBe(3);
  });

  it('has no favourite line when no move comes back often enough', async () => {
    const { colors } = await buildOpponentPrep([line(['e4', 'e5']), line(['d4', 'd5'])], getOpeningPosition);
    expect(colors.w.favourite).toBeNull();
  });

  it('points to the opening that scores worst and the one that scores best, with enough games', async () => {
    const lines = [
      ...[1, 2, 3].map(() => line(SICILIAN, { outcome: 'loss' })),
      ...[1, 2, 3].map(() => line(RUY, { outcome: 'win' })),
      line(['d4', 'd5', 'c4', 'e6'], { outcome: 'loss' }), // one game: says nothing
    ];
    const { colors } = await buildOpponentPrep(lines, getOpeningPosition);
    expect(colors.w.weakest?.name).toBe('Sicilian Defense');
    expect(colors.w.strongest?.name).toBe('Ruy Lopez');
    expect(scoreOf(colors.w.weakest!.tally)).toBe(0);
  });

  it('does not call an opening weak or strong on too few games', async () => {
    const { colors } = await buildOpponentPrep([line(SICILIAN, { outcome: 'loss' }), line(RUY)], getOpeningPosition);
    expect(colors.w.weakest).toBeNull();
    expect(colors.w.strongest).toBeNull();
  });

  it('measures how long they stay in the book', async () => {
    const { colors } = await buildOpponentPrep(
      [line(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']), line(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Qh5'])],
      getOpeningPosition
    );
    // 3 moves inside the book for the first game, 2 and a half for the second (Qh5 is not in the book)
    expect(colors.w.meanBookMoves).toBeGreaterThan(2);
    expect(colors.w.meanBookMoves).toBeLessThanOrEqual(3);
    expect(colors.b.meanBookMoves).toBeNull();
  });

  it('reports the rating of the newest game, the span and the speeds', async () => {
    const prep = await buildOpponentPrep(
      [
        line(['e4'], { playedAt: 1000, rating: 1500, speed: 'rapid' }),
        line(['e4'], { playedAt: 3000, rating: 1600 }),
        line(['e4'], { playedAt: 2000, rating: 1550 }),
      ],
      getOpeningPosition
    );
    expect(prep).toMatchObject({ rating: 1600, from: 1000, to: 3000 });
    expect(prep.speeds).toEqual([
      { speed: 'blitz', games: 2 },
      { speed: 'rapid', games: 1 },
    ]);
  });

  it('gives the page a pause now and then while it works through many games', async () => {
    const yieldToUi = vi.fn(async () => {});
    await buildOpponentPrep(
      Array.from({ length: 25 }, () => line(['e4', 'e5'])),
      getOpeningPosition,
      { yieldToUi }
    );
    expect(yieldToUi).toHaveBeenCalled();
  });

  it('copes with no game', async () => {
    const prep = await buildOpponentPrep([], getOpeningPosition);
    expect(prep).toMatchObject({ games: 0, rating: null, from: null, to: null });
    expect(prep.colors.w.starts).toEqual([]);
  });
});
