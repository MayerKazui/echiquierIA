import { describe, expect, it, vi } from 'vitest';
import {
  ImportError,
  fetchGamesPage,
  formatTimeControl,
  isValidUsername,
  parseChessComGame,
  parseLichessGame,
} from './gameImport';

const PGN = '[Event "Live Chess"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';

function chessComGame(over: Record<string, unknown> = {}) {
  return {
    url: 'https://www.chess.com/game/live/1',
    pgn: PGN,
    time_control: '300+3',
    time_class: 'blitz',
    end_time: 1_700_000_000,
    rated: true,
    rules: 'chess',
    white: { username: 'Alice', rating: 1500, result: 'win' },
    black: { username: 'Bob', rating: 1480, result: 'resigned' },
    ...over,
  };
}

function lichessGame(over: Record<string, unknown> = {}) {
  return {
    id: 'abcd1234',
    rated: true,
    variant: 'standard',
    speed: 'blitz',
    createdAt: 1_700_000_000_000,
    status: 'resign',
    players: {
      white: { user: { name: 'Alice', id: 'alice' }, rating: 1500 },
      black: { user: { name: 'Bob', id: 'bob' }, rating: 1480 },
    },
    winner: 'white',
    pgn: PGN,
    clock: { initial: 300, increment: 3 },
    ...over,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ndjson = (games: unknown[], status = 200) =>
  new Response(games.map((g) => JSON.stringify(g)).join('\n'), { status });

describe('formatTimeControl', () => {
  it.each([
    ['300+3', '5+3'],
    ['600', '10 min'],
    ['180', '3 min'],
    ['60', '1 min'],
    ['30', '30 s'],
    ['15+10', '15 s +10'],
    ['1/259200', '3 j/coup'],
    ['1/86400', '1 j/coup'],
    ['', ''],
    ['-', '-'],
  ])('%s → %s', (raw, expected) => {
    expect(formatTimeControl(raw)).toBe(expected);
  });
});

describe('isValidUsername', () => {
  it('accepts the characters the sites allow and refuses everything that could change a URL', () => {
    expect(isValidUsername('chesscom', 'Hikaru_1-x')).toBe(true);
    expect(isValidUsername('lichess', 'ab')).toBe(true);
    expect(isValidUsername('chesscom', 'ab')).toBe(false); // chess.com: 3 characters at least
    expect(isValidUsername('lichess', 'a/b')).toBe(false);
    expect(isValidUsername('lichess', 'a?x=1')).toBe(false);
    expect(isValidUsername('lichess', '../x')).toBe(false);
    expect(isValidUsername('chesscom', '')).toBe(false);
    expect(isValidUsername('chesscom', 'a'.repeat(26))).toBe(false);
  });
});

describe('parseChessComGame', () => {
  it('reads the colour, the outcome and the time control from the searched player', () => {
    const game = parseChessComGame(chessComGame(), 'alice');
    expect(game).toMatchObject({
      id: 'https://www.chess.com/game/live/1',
      source: 'chesscom',
      white: 'Alice',
      black: 'Bob',
      userColor: 'w',
      outcome: 'win',
      speed: 'blitz',
      timeControl: '5+3',
      playedAt: 1_700_000_000_000,
      rated: true,
    });
  });

  it('reports a loss when the opponent won, and a draw otherwise', () => {
    const lost = chessComGame({
      white: { username: 'Alice', result: 'checkmated' },
      black: { username: 'Bob', result: 'win' },
    });
    expect(parseChessComGame(lost, 'Alice')?.outcome).toBe('loss');
    const drawn = chessComGame({
      white: { username: 'Alice', result: 'repetition' },
      black: { username: 'Bob', result: 'repetition' },
    });
    expect(parseChessComGame(drawn, 'Alice')?.outcome).toBe('draw');
  });

  it('takes the black side when the player is Black', () => {
    const game = parseChessComGame(chessComGame(), 'BOB');
    expect(game).toMatchObject({ userColor: 'b', outcome: 'loss' });
  });

  it('skips what the analysis cannot replay', () => {
    expect(parseChessComGame(chessComGame({ rules: 'chess960' }), 'alice')).toBeNull();
    expect(parseChessComGame(chessComGame({ pgn: undefined }), 'alice')).toBeNull();
    expect(
      parseChessComGame(chessComGame({ pgn: `[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n1. Ka2` }), 'alice')
    ).toBeNull();
    expect(parseChessComGame(chessComGame({ time_class: 'unknown' }), 'alice')).toBeNull();
    expect(parseChessComGame(chessComGame(), 'someone-else')).toBeNull();
  });
});

describe('parseLichessGame', () => {
  it('reads the colour, the outcome and the clock', () => {
    expect(parseLichessGame(lichessGame(), 'Alice')).toMatchObject({
      id: 'abcd1234',
      source: 'lichess',
      url: 'https://lichess.org/abcd1234',
      userColor: 'w',
      outcome: 'win',
      speed: 'blitz',
      timeControl: '5+3',
      whiteRating: 1500,
    });
    expect(parseLichessGame(lichessGame(), 'bob')).toMatchObject({ userColor: 'b', outcome: 'loss' });
  });

  it('has a draw when nobody won, and maps ultraBullet and correspondence', () => {
    expect(parseLichessGame(lichessGame({ winner: undefined, status: 'draw' }), 'alice')?.outcome).toBe('draw');
    expect(parseLichessGame(lichessGame({ speed: 'ultraBullet' }), 'alice')?.speed).toBe('bullet');
    const daily = parseLichessGame(lichessGame({ speed: 'correspondence', clock: undefined, daysPerTurn: 3 }), 'alice');
    expect(daily).toMatchObject({ speed: 'daily', timeControl: '3 j/coup' });
  });

  it('names a Stockfish opponent and an anonymous one', () => {
    const ai = lichessGame({
      players: { white: { user: { name: 'Alice', id: 'alice' } }, black: { aiLevel: 3 } },
    });
    expect(parseLichessGame(ai, 'alice')?.black).toBe('Stockfish (niveau 3)');
    const anonymous = lichessGame({ players: { white: { user: { name: 'Alice', id: 'alice' } }, black: {} } });
    expect(parseLichessGame(anonymous, 'alice')?.black).toBe('Anonyme');
  });

  it('skips variants, aborted games and games that are not the player’s', () => {
    expect(parseLichessGame(lichessGame({ variant: 'chess960' }), 'alice')).toBeNull();
    expect(parseLichessGame(lichessGame({ status: 'aborted' }), 'alice')).toBeNull();
    expect(parseLichessGame(lichessGame({ status: 'started' }), 'alice')).toBeNull();
    expect(parseLichessGame(lichessGame({ status: 'noStart' }), 'alice')).toBeNull();
    expect(parseLichessGame(lichessGame({ pgn: undefined }), 'alice')).toBeNull();
    expect(parseLichessGame(lichessGame(), 'nobody')).toBeNull();
  });
});

describe('fetchGamesPage: validation and errors', () => {
  it('refuses a malformed pseudo without calling the network', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchGamesPage('lichess', 'a/b', { fetchImpl })).rejects.toMatchObject({ code: 'invalid_username' });
    await expect(fetchGamesPage('chesscom', '  ', { fetchImpl })).rejects.toBeInstanceOf(ImportError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'unexpected'],
  ])('maps a %i answer to %s', async (status, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status }));
    await expect(fetchGamesPage('chesscom', 'alice', { fetchImpl })).rejects.toMatchObject({ code });
    await expect(fetchGamesPage('lichess', 'alice', { fetchImpl })).rejects.toMatchObject({ code });
  });

  it('maps a network failure, but lets an abort through untouched', async () => {
    const down = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchGamesPage('lichess', 'alice', { fetchImpl: down })).rejects.toMatchObject({ code: 'network' });

    const controller = new AbortController();
    const aborted = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    await expect(
      fetchGamesPage('lichess', 'alice', { fetchImpl: aborted, signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('refuses a body that is not JSON (chess.com)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(fetchGamesPage('chesscom', 'alice', { fetchImpl })).rejects.toMatchObject({ code: 'unexpected' });
  });
});

describe('fetchGamesPage: chess.com', () => {
  const archives = (...months: string[]) => ({
    archives: months.map((m) => `https://api.chess.com/pub/player/alice/games/${m}`),
  });

  function serve(routes: Record<string, unknown>) {
    return vi.fn((input: RequestInfo | URL) => {
      const path = String(input).replace('https://api.chess.com/pub/player/alice/', '');
      return Promise.resolve(path in routes ? json(routes[path]) : new Response('', { status: 404 }));
    });
  }

  it('reads the latest month first, most recent game first, and rebuilds the URLs itself', async () => {
    const fetchImpl = serve({
      'games/archives': {
        archives: [
          'https://evil.example/pub/player/alice/games/2026/01',
          'https://api.chess.com/pub/player/alice/games/2026/02',
        ],
      },
      'games/2026/02': {
        games: [
          chessComGame({ url: 'https://www.chess.com/game/live/old', end_time: 100 }),
          chessComGame({ url: 'https://www.chess.com/game/live/new', end_time: 200 }),
        ],
      },
      'games/2026/01': { games: [chessComGame({ url: 'https://www.chess.com/game/live/jan', end_time: 50 })] },
    });
    const page = await fetchGamesPage('chesscom', 'Alice', { fetchImpl });
    expect(page.games.map((g) => g.id)).toEqual([
      'https://www.chess.com/game/live/new',
      'https://www.chess.com/game/live/old',
      'https://www.chess.com/game/live/jan',
    ]);
    expect(page.cursor).toBeNull();
    // Every request went to chess.com, even for the archive that pointed elsewhere
    for (const [url] of fetchImpl.mock.calls) expect(url).toMatch(/^https:\/\/api\.chess\.com\/pub\/player\/alice\//);
  });

  it('goes back one month at a time until the page is full, and keeps the rest for the next page', async () => {
    const games = (prefix: string, count: number, endBase: number) =>
      Array.from({ length: count }, (_, i) =>
        chessComGame({ url: `https://www.chess.com/game/live/${prefix}${i}`, end_time: endBase + i })
      );
    const fetchImpl = serve({
      'games/archives': archives('2026/01', '2026/02', '2026/03'),
      'games/2026/03': { games: games('mar', 3, 300) },
      'games/2026/02': { games: games('feb', 3, 200) },
      'games/2026/01': { games: games('jan', 3, 100) },
    });

    const first = await fetchGamesPage('chesscom', 'alice', { fetchImpl, limit: 4 });
    expect(first.games.map((g) => g.id.split('/').pop())).toEqual(['mar2', 'mar1', 'mar0', 'feb2']);
    expect(first.cursor).toMatchObject({ source: 'chesscom', months: ['2026/01'] });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // archives, March, February

    const second = await fetchGamesPage('chesscom', 'alice', { fetchImpl, limit: 4, cursor: first.cursor });
    expect(second.games.map((g) => g.id.split('/').pop())).toEqual(['feb1', 'feb0', 'jan2', 'jan1']);
    // The list of archives is not asked again
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/games/archives'))).toHaveLength(1);

    const third = await fetchGamesPage('chesscom', 'alice', { fetchImpl, limit: 4, cursor: second.cursor });
    expect(third.games.map((g) => g.id.split('/').pop())).toEqual(['jan0']);
    expect(third.cursor).toBeNull();
  });

  it('filters on the speed while reading, and ignores variants', async () => {
    const fetchImpl = serve({
      'games/archives': archives('2026/03'),
      'games/2026/03': {
        games: [
          chessComGame({ url: 'https://www.chess.com/game/live/b', time_class: 'blitz', end_time: 3 }),
          chessComGame({ url: 'https://www.chess.com/game/live/r', time_class: 'rapid', end_time: 2 }),
          chessComGame({
            url: 'https://www.chess.com/game/live/v',
            time_class: 'rapid',
            rules: 'chess960',
            end_time: 1,
          }),
        ],
      },
    });
    const page = await fetchGamesPage('chesscom', 'alice', { fetchImpl, speed: 'rapid' });
    expect(page.games.map((g) => g.id.split('/').pop())).toEqual(['r']);
  });

  it('stops after a few months when nothing matches, and offers to continue', async () => {
    const months = Array.from({ length: 10 }, (_, i) => `2026/${String(i + 1).padStart(2, '0')}`);
    const routes: Record<string, unknown> = { 'games/archives': archives(...months) };
    for (const m of months) routes[`games/${m}`] = { games: [] };
    const fetchImpl = serve(routes);
    const page = await fetchGamesPage('chesscom', 'alice', { fetchImpl });
    expect(page.games).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1 + 6);
    expect(page.cursor).toMatchObject({ months: months.slice(0, 4) });
  });

  it('has no game for a player without archive', async () => {
    const fetchImpl = serve({ 'games/archives': { archives: [] } });
    expect(await fetchGamesPage('chesscom', 'alice', { fetchImpl })).toEqual({ games: [], cursor: null });
  });

  it('counts the half-moves and drops the games that are too short or unreadable', async () => {
    const fetchImpl = serve({
      'games/archives': archives('2026/03'),
      'games/2026/03': {
        games: [
          chessComGame({ url: 'https://www.chess.com/game/live/ok', end_time: 4 }),
          chessComGame({
            url: 'https://www.chess.com/game/live/abandoned',
            pgn: '[Event "x"]\n\n1. e4 1-0',
            end_time: 3,
          }),
          chessComGame({
            url: 'https://www.chess.com/game/live/broken',
            pgn: '[Event "x"]\n\n1. e4 e5 2. Ke4 1-0',
            end_time: 2,
          }),
          chessComGame({ url: 'https://www.chess.com/game/live/empty', pgn: '[Event "x"]\n\n*', end_time: 1 }),
        ],
      },
    });
    const page = await fetchGamesPage('chesscom', 'alice', { fetchImpl });
    expect(page.games.map((g) => [g.id.split('/').pop(), g.plies])).toEqual([['ok', 4]]);
  });
});

describe('fetchGamesPage: Lichess', () => {
  it('asks for the PGN with the clocks, restricted to the speeds without variants', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ndjson([lichessGame()]));
    await fetchGamesPage('lichess', 'Alice', { fetchImpl, limit: 10 });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/games/user/alice');
    expect(parsed.searchParams.get('max')).toBe('10');
    expect(parsed.searchParams.get('pgnInJson')).toBe('true');
    expect(parsed.searchParams.get('clocks')).toBe('true');
    expect(parsed.searchParams.get('perfType')).toBe('ultraBullet,bullet,blitz,rapid,classical,correspondence');
    expect(parsed.searchParams.has('until')).toBe(false);
    expect((init.headers as Record<string, string>).Accept).toBe('application/x-ndjson');
  });

  it('maps the speed filter to Lichess’ performance types', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(ndjson([])));
    await fetchGamesPage('lichess', 'alice', { fetchImpl, speed: 'bullet' });
    await fetchGamesPage('lichess', 'alice', { fetchImpl, speed: 'daily' });
    const perfTypes = fetchImpl.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('perfType'));
    expect(perfTypes).toEqual(['ultraBullet,bullet', 'correspondence']);
  });

  it('reads NDJSON, skipping unusable and malformed lines', async () => {
    const body = [
      JSON.stringify(lichessGame({ id: 'one', createdAt: 3 })),
      '{"id": "trunc',
      JSON.stringify(lichessGame({ id: 'two', status: 'aborted', createdAt: 2 })),
      '',
      JSON.stringify(lichessGame({ id: 'three', createdAt: 1 })),
    ].join('\n');
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body));
    const page = await fetchGamesPage('lichess', 'alice', { fetchImpl });
    expect(page.games.map((g) => g.id)).toEqual(['one', 'three']);
    expect(page.cursor).toBeNull(); // fewer than a full page: nothing older
  });

  it('continues before the oldest game of a full page, even when some of them were skipped', async () => {
    const games = [
      lichessGame({ id: 'a', createdAt: 5000 }),
      lichessGame({ id: 'b', createdAt: 4000, status: 'aborted' }),
      lichessGame({ id: 'c', createdAt: 3000 }),
    ];
    // A body can be read once: each request gets its own response
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(ndjson(games)));
    const page = await fetchGamesPage('lichess', 'alice', { fetchImpl, limit: 3 });
    expect(page.games.map((g) => g.id)).toEqual(['a', 'c']);
    expect(page.cursor).toEqual({ source: 'lichess', until: 2999 });

    await fetchGamesPage('lichess', 'alice', { fetchImpl, limit: 3, cursor: page.cursor });
    expect(new URL(String(fetchImpl.mock.calls[1][0])).searchParams.get('until')).toBe('2999');
  });

  it('ignores a cursor that belongs to the other site', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ndjson([]));
    await fetchGamesPage('lichess', 'alice', {
      fetchImpl,
      cursor: { source: 'chesscom', months: [], carry: [] },
    });
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.has('until')).toBe(false);
  });
});
