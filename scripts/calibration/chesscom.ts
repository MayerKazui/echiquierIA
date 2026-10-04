import { Chess } from 'chess.js';
import { ELO_BANDS, movetextOf, type GameResult, type ReferenceGame } from './reference';

/**
 * Collects reference games from chess.com's public API: for the games its "Game Review" analysed, the PGN and the
 * accuracy of each side are published (`accuracies`). Players are drawn at random from the country and titled-player
 * lists so that every Elo band is represented. The API asks for a low request rate and blocks heavy crawls: requests
 * go one at a time with a pause, and a player whose month is too big is skipped.
 */

const API = 'https://api.chess.com/pub';
const HEADERS = {
  'User-Agent': 'echiquier-ia-calibration (https://github.com/MayerKazui/echiquierIA)',
  'Accept-Encoding': 'gzip',
};
const PAUSE_MS = 800;
const COUNTRIES = ['FR', 'US', 'DE', 'IN', 'BR', 'GB', 'ES', 'RU', 'PL', 'TR'];
const TITLES = ['NM', 'FM', 'IM', 'CM'];

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function getJson<T>(url: string): Promise<T | null> {
  await sleep(PAUSE_MS);
  const response = await fetch(url, { headers: HEADERS });
  if (response.status === 429) {
    await sleep(30_000);
    return getJson(url);
  }
  if (!response.ok) return null;
  // A blocked crawl answers with plain text instead of JSON
  return response.json().catch(() => null) as Promise<T | null>;
}

interface ApiGame {
  url: string;
  pgn?: string;
  rules: string;
  time_class: string;
  accuracies?: { white: number; black: number };
  white: { rating: number; result?: string };
  black: { rating: number; result?: string };
}

/** chess.com says "win" for the winner and a reason ("checkmated", "resigned", "timeout", "agreed"…) for the other. */
function resultOf(game: Pick<ApiGame, 'white' | 'black'>): GameResult | undefined {
  if (game.white.result === 'win') return '1-0';
  if (game.black.result === 'win') return '0-1';
  return game.white.result && game.black.result ? '1/2-1/2' : undefined;
}

/** A usable game: standard chess from the starting position, reviewed, neither tiny nor endless. */
function toReference(game: ApiGame): ReferenceGame | null {
  if (game.rules !== 'chess' || !game.accuracies || !game.pgn || /\[(SetUp|FEN) /.test(game.pgn)) return null;
  try {
    const chess = new Chess();
    chess.loadPgn(game.pgn);
    const plies = chess.history().length;
    if (plies < 30 || plies > 200) return null;
    return {
      url: game.url,
      timeClass: game.time_class,
      whiteElo: game.white.rating,
      blackElo: game.black.rating,
      accuracies: game.accuracies,
      pgn: movetextOf(game.pgn),
      result: resultOf(game),
    };
  } catch {
    return null;
  }
}

async function playersOf(urls: string[]): Promise<string[]> {
  const lists = await Promise.all(urls.map((url) => getJson<{ players: string[] }>(url)));
  return lists.flatMap((list) => list?.players ?? []).sort(() => Math.random() - 0.5);
}

function bandOf(game: ReferenceGame): number {
  const average = (game.whiteElo + game.blackElo) / 2;
  return ELO_BANDS.findIndex(({ min, max }) => average >= min && average < max);
}

export interface FetchOptions {
  /** Games wanted in each Elo band. */
  perBand: number;
  /** Games already in the reference file (not fetched again). */
  known: ReadonlySet<string>;
  log: (message: string) => void;
}

/** The bands from 1900 Elo up: the country lists hardly reach them, the titled-player lists do. */
const FIRST_HIGH_BAND = 4;
/** A band that cannot be filled (too few reviewed games) must not keep the run going forever. */
const MAX_PLAYERS = 800;

/** Draws players until each Elo band has enough games (or the pool or the budget is used up). */
export async function fetchReferenceGames({ perBand, known, log }: FetchOptions): Promise<ReferenceGame[]> {
  const everyone = await playersOf(COUNTRIES.map((code) => `${API}/country/${code}/players`));
  const titled = await playersOf(TITLES.map((title) => `${API}/titled/${title}`));
  const byBand: ReferenceGame[][] = ELO_BANDS.map(() => []);
  const seen = new Set(known);
  const lacking = (bands: ReferenceGame[][]) => bands.some((games) => games.length < perBand);

  for (let drawn = 0; drawn < MAX_PLAYERS && lacking(byBand); drawn++) {
    const needHigh = lacking(byBand.slice(FIRST_HIGH_BAND));
    const needLow = lacking(byBand.slice(0, FIRST_HIGH_BAND));
    const fromTitled = needHigh && (!needLow || drawn % 2 === 0);
    const player = (fromTitled ? titled : everyone).pop() ?? (fromTitled ? everyone : titled).pop();
    if (!player) break;
    const archives = await getJson<{ archives: string[] }>(`${API}/player/${player}/games/archives`);
    const month = archives?.archives.at(-1);
    if (!month) continue;
    const games = (await getJson<{ games: ApiGame[] }>(month))?.games ?? [];
    // One game per player keeps the sample varied (a prolific player would fill a band alone)
    for (const game of games.sort(() => Math.random() - 0.5)) {
      const reference = toReference(game);
      if (!reference || seen.has(reference.url)) continue;
      const band = bandOf(reference);
      if (band === -1 || byBand[band].length >= perBand) continue;
      seen.add(reference.url);
      byBand[band].push(reference);
      log(`${ELO_BANDS[band].label}: ${byBand[band].length}/${perBand} (${player}, ${reference.timeClass})`);
      break;
    }
  }
  return byBand.flat();
}

interface CallbackGame {
  game?: { colorOfWinner?: string; isFinished?: boolean };
}

/**
 * The result of a game already in the reference file, from the page data chess.com uses itself (the public archives
 * need the player's name, which the file does not keep). Null when the game cannot be found or is not finished.
 */
export async function fetchResult(url: string): Promise<GameResult | null> {
  const [, kind, id] = /\/game\/(live|daily)\/(\d+)/.exec(url) ?? [];
  if (!id) return null;
  const data = await getJson<CallbackGame>(`https://www.chess.com/callback/${kind}/game/${id}`);
  if (!data?.game?.isFinished) return null;
  const { colorOfWinner } = data.game;
  return colorOfWinner === 'white' ? '1-0' : colorOfWinner === 'black' ? '0-1' : '1/2-1/2';
}

/** One game of a followed player, from their side: the colour they had, how it ended, the first moves (SAN). */
export type SampleGame = [color: 'w' | 'b', result: GameResult, line: string];

export interface PlayerSample {
  /** The rating in the player's latest game. The name is not kept: the sample is about openings, not about people. */
  rating: number;
  /** Oldest first. */
  games: SampleGame[];
}

/** Plies of a game that are kept: what the opening index looks at. */
const SAMPLE_PLIES = 35;

interface ArchiveGame extends ApiGame {
  end_time: number;
  white: { rating: number; result?: string; username: string };
  black: { rating: number; result?: string; username: string };
}

function toSampleGame(game: ArchiveGame, player: string): SampleGame | null {
  const result = resultOf(game);
  if (game.rules !== 'chess' || !game.pgn || !result || /\[(SetUp|FEN) /.test(game.pgn)) return null;
  try {
    const chess = new Chess();
    chess.loadPgn(game.pgn);
    const sans = chess.history();
    if (sans.length < 10) return null;
    return [game.white.username.toLowerCase() === player ? 'w' : 'b', result, sans.slice(0, SAMPLE_PLIES).join(' ')];
  } catch {
    return null;
  }
}

/**
 * Draws players who play a lot and reads their last months of games (standard chess, all time controls), to see how
 * well the games already played tell the next one. One player after the other, a pause between requests.
 */
export async function fetchPlayerSamples({
  players,
  perPlayer,
  minRating = 0,
  titled = false,
  log,
}: {
  players: number;
  perPlayer: number;
  /** Players whose latest rating is lower are left out (the country lists are mostly beginners). */
  minRating?: number;
  /** Draws from the lists of titled players instead of the country lists. */
  titled?: boolean;
  log: (message: string) => void;
}): Promise<PlayerSample[]> {
  const pool = await playersOf(
    titled ? TITLES.map((title) => `${API}/titled/${title}`) : COUNTRIES.map((code) => `${API}/country/${code}/players`)
  );
  const samples: PlayerSample[] = [];
  for (let drawn = 0; samples.length < players && drawn < MAX_PLAYERS; drawn++) {
    const player = pool.pop()?.toLowerCase();
    if (!player) break;
    const archives = (await getJson<{ archives: string[] }>(`${API}/player/${player}/games/archives`))?.archives ?? [];
    const games: Array<{ at: number; sample: SampleGame; rating: number }> = [];
    for (const month of archives.slice(-3).reverse()) {
      for (const game of (await getJson<{ games: ArchiveGame[] }>(month))?.games ?? []) {
        const sample = toSampleGame(game, player);
        if (!sample) continue;
        const rating = (sample[0] === 'w' ? game.white : game.black).rating;
        games.push({ at: game.end_time, sample, rating });
      }
      if (games.length >= perPlayer) break;
    }
    if (games.length < perPlayer) continue;
    // The newest games, oldest first
    const kept = games
      .sort((a, b) => b.at - a.at)
      .slice(0, perPlayer)
      .reverse();
    if (kept.at(-1)!.rating < minRating) continue;
    samples.push({ rating: kept.at(-1)!.rating, games: kept.map((g) => g.sample) });
    log(`player ${samples.length}/${players}: ${kept.length} games, ${kept.at(-1)!.rating} Elo`);
  }
  return samples;
}
