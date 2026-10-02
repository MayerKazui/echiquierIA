import { Chess } from 'chess.js';
import { ELO_BANDS, movetextOf, type ReferenceGame } from './reference';

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
  white: { rating: number };
  black: { rating: number };
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
