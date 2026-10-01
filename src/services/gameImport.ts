/**
 * Import of a player's recent games from chess.com and Lichess.
 *
 * Both public APIs answer cross-origin requests (`Access-Control-Allow-Origin: *`), so the browser calls them
 * directly: no server involved, nothing sent to ours. Both ask for one request at a time (Lichess refuses
 * parallel ones), so pages are fetched one after the other and a new search aborts the previous one.
 */
import { Chess } from 'chess.js';
import type { PlayerColor } from '../types/ui';

export type ImportSource = 'chesscom' | 'lichess';
/** Speed classes common to both sites (`daily` is chess.com's "daily" and Lichess' "correspondence"). */
export type GameSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily';
export type SpeedFilter = 'all' | GameSpeed;
export type GameOutcome = 'win' | 'loss' | 'draw';

export interface ImportedGame {
  /** Unique within a source. */
  id: string;
  source: ImportSource;
  url: string;
  pgn: string;
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  /** Milliseconds since the epoch (end of the game on chess.com, start on Lichess). */
  playedAt: number;
  speed: GameSpeed;
  /** For display: "5+3", "10 min", "3 j/coup". */
  timeControl: string;
  rated: boolean;
  /** Colour of the searched player. */
  userColor: PlayerColor;
  /** Result from the searched player's point of view. */
  outcome: GameOutcome;
  /** Half-moves played. */
  plies: number;
}

/** A game as read from an API: the number of half-moves is counted afterwards, for the games shown only. */
type ParsedGame = Omit<ImportedGame, 'plies'>;

/** Where the next page starts; `null` once the history is exhausted. */
export type ImportCursor =
  | {
      source: 'chesscom';
      /** Months not read yet, oldest first (`YYYY/MM`). */
      months: string[];
      /** Games of the last month read that did not fit in the previous page, most recent first. */
      carry: ParsedGame[];
    }
  | { source: 'lichess'; until: number };

export interface ImportPage {
  games: ImportedGame[];
  cursor: ImportCursor | null;
}

export interface FetchPageOptions {
  speed?: SpeedFilter;
  /** Games per page (25 by default). */
  limit?: number;
  cursor?: ImportCursor | null;
  signal?: AbortSignal;
  /** Replaces `fetch` (tests). */
  fetchImpl?: typeof fetch;
}

export type ImportErrorCode = 'invalid_username' | 'not_found' | 'rate_limited' | 'network' | 'unexpected';

/** A failed import; `message` is meant to be shown as is (in French). */
export class ImportError extends Error {
  readonly code: ImportErrorCode;
  constructor(code: ImportErrorCode, message: string) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
  }
}

export const SOURCE_LABELS: Record<ImportSource, string> = { chesscom: 'chess.com', lichess: 'Lichess' };
export const DEFAULT_PAGE_SIZE = 25;
/** Shorter games (abandoned after a move or two) have nothing to analyse. */
export const MIN_PLIES = 4;
/** Months read for one page at most: an inactive account must not trigger dozens of requests. */
const MAX_MONTHS_PER_PAGE = 6;

const USERNAME_PATTERNS: Record<ImportSource, RegExp> = {
  chesscom: /^[A-Za-z0-9_-]{3,25}$/,
  lichess: /^[A-Za-z0-9_-]{2,30}$/,
};

export function isValidUsername(source: ImportSource, username: string): boolean {
  return USERNAME_PATTERNS[source].test(username);
}

/** The speed filters offered for a site (chess.com has no "classical": its slow games are "rapid"). */
export const SPEED_OPTIONS: Record<ImportSource, readonly { value: SpeedFilter; label: string }[]> = {
  chesscom: [
    { value: 'all', label: 'Toutes les cadences' },
    { value: 'bullet', label: 'Bullet' },
    { value: 'blitz', label: 'Blitz' },
    { value: 'rapid', label: 'Rapide' },
    { value: 'daily', label: 'Quotidienne' },
  ],
  lichess: [
    { value: 'all', label: 'Toutes les cadences' },
    { value: 'bullet', label: 'Bullet' },
    { value: 'blitz', label: 'Blitz' },
    { value: 'rapid', label: 'Rapide' },
    { value: 'classical', label: 'Classique' },
    { value: 'daily', label: 'Correspondance' },
  ],
};

export const SPEED_LABELS: Record<GameSpeed, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapide',
  classical: 'Classique',
  daily: 'Quotidienne',
};

/** "300+3" → "5+3", "600" → "10 min", "30" → "30 s", "1/259200" → "3 j/coup". */
export function formatTimeControl(raw: string | undefined): string {
  if (!raw) return '';
  const daily = /^1\/(\d+)$/.exec(raw);
  if (daily) {
    const days = Math.round(Number(daily[1]) / 86400);
    return `${days} j/coup`;
  }
  const match = /^(\d+)(?:\+(\d+))?$/.exec(raw);
  if (!match) return raw;
  return clockLabel(Number(match[1]), Number(match[2] ?? 0));
}

function clockLabel(initialSeconds: number, incrementSeconds: number): string {
  const base = initialSeconds % 60 === 0 ? String(initialSeconds / 60) : `${initialSeconds} s`;
  if (incrementSeconds > 0)
    return initialSeconds % 60 === 0 ? `${base}+${incrementSeconds}` : `${base} +${incrementSeconds}`;
  return initialSeconds % 60 === 0 ? `${base} min` : base;
}

/** Counts the half-moves of the games shown; drops those that cannot be read or are too short to be worth it. */
function withPlies(games: ParsedGame[]): ImportedGame[] {
  return games.flatMap((game) => {
    try {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      const plies = chess.history().length;
      return plies >= MIN_PLIES ? [{ ...game, plies }] : [];
    } catch {
      return [];
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// chess.com

interface ChessComPlayer {
  username?: string;
  rating?: number;
  result?: string;
}

interface ChessComGame {
  url?: string;
  pgn?: string;
  time_control?: string;
  time_class?: string;
  end_time?: number;
  rated?: boolean;
  rules?: string;
  white?: ChessComPlayer;
  black?: ChessComPlayer;
}

const CHESSCOM_SPEEDS: Record<string, GameSpeed> = { bullet: 'bullet', blitz: 'blitz', rapid: 'rapid', daily: 'daily' };

/** A game that does not start from the initial position cannot be replayed by the analysis. */
const hasCustomStart = (pgn: string) => /^\[(?:FEN|SetUp)\s/m.test(pgn);

/** One game of a chess.com monthly archive, or `null` when it cannot be analysed (variant, no moves…). */
export function parseChessComGame(raw: ChessComGame, username: string): ParsedGame | null {
  if (raw.rules !== 'chess' || !raw.pgn || !raw.url || hasCustomStart(raw.pgn)) return null;
  const speed = CHESSCOM_SPEEDS[raw.time_class ?? ''];
  if (!speed || !raw.white?.username || !raw.black?.username) return null;

  const me = username.toLowerCase();
  const userColor: PlayerColor | null =
    raw.white.username.toLowerCase() === me ? 'w' : raw.black.username.toLowerCase() === me ? 'b' : null;
  if (!userColor) return null;
  const own = userColor === 'w' ? raw.white : raw.black;
  const other = userColor === 'w' ? raw.black : raw.white;

  return {
    id: raw.url,
    source: 'chesscom',
    url: raw.url,
    pgn: raw.pgn,
    white: raw.white.username,
    black: raw.black.username,
    whiteRating: raw.white.rating,
    blackRating: raw.black.rating,
    playedAt: (raw.end_time ?? 0) * 1000,
    speed,
    timeControl: formatTimeControl(raw.time_control),
    rated: raw.rated ?? false,
    userColor,
    outcome: own.result === 'win' ? 'win' : other.result === 'win' ? 'loss' : 'draw',
  };
}

async function fetchChessComPage(username: string, options: FetchPageOptions): Promise<ImportPage> {
  const { speed = 'all', limit = DEFAULT_PAGE_SIZE, signal, fetchImpl = fetch } = options;
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}`;
  const previous = options.cursor?.source === 'chesscom' ? options.cursor : null;

  let months = previous?.months;
  if (!months) {
    const body = await getJson<{ archives?: unknown }>(fetchImpl, `${base}/games/archives`, signal, 'chesscom');
    const archives = Array.isArray(body.archives) ? body.archives : [];
    // Only the year and the month are kept: the request URL is rebuilt here, never taken from the response
    months = archives.flatMap((url) => {
      const match = typeof url === 'string' ? /\/games\/(\d{4})\/(\d{2})$/.exec(url) : null;
      return match ? [`${match[1]}/${match[2]}`] : [];
    });
  }

  const games: ParsedGame[] = [...(previous?.carry ?? [])];
  let remaining = [...months];
  let scanned = 0;
  while (games.length < limit && remaining.length > 0 && scanned < MAX_MONTHS_PER_PAGE) {
    const month = remaining[remaining.length - 1];
    remaining = remaining.slice(0, -1);
    scanned++;
    const body = await getJson<{ games?: unknown }>(fetchImpl, `${base}/games/${month}`, signal, 'chesscom');
    const list = Array.isArray(body.games) ? (body.games as ChessComGame[]) : [];
    const parsed = list
      .map((game) => parseChessComGame(game, username))
      .filter((game): game is ParsedGame => game !== null && (speed === 'all' || game.speed === speed))
      .sort((a, b) => b.playedAt - a.playedAt);
    games.push(...parsed);
  }

  const carry = games.slice(limit);
  const hasMore = carry.length > 0 || remaining.length > 0;
  return {
    games: withPlies(games.slice(0, limit)),
    cursor: hasMore ? { source: 'chesscom', months: remaining, carry } : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Lichess

interface LichessPlayer {
  user?: { name?: string; id?: string };
  rating?: number;
  aiLevel?: number;
}

interface LichessGame {
  id?: string;
  rated?: boolean;
  variant?: string;
  speed?: string;
  createdAt?: number;
  status?: string;
  players?: { white?: LichessPlayer; black?: LichessPlayer };
  winner?: string;
  pgn?: string;
  clock?: { initial?: number; increment?: number };
  daysPerTurn?: number;
}

const LICHESS_SPEEDS: Record<string, GameSpeed> = {
  ultraBullet: 'bullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'daily',
};

/** Lichess' `perfType` values for each filter; all of them (and no variant) when there is no filter. */
const LICHESS_PERF_TYPES: Record<SpeedFilter, string> = {
  all: 'ultraBullet,bullet,blitz,rapid,classical,correspondence',
  bullet: 'ultraBullet,bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  daily: 'correspondence',
};

/** Games that never started or are still running have nothing to analyse. */
const LICHESS_SKIPPED_STATUSES = new Set(['created', 'started', 'aborted', 'noStart']);

function lichessPlayerName(player: LichessPlayer | undefined): string | null {
  if (player?.user?.name) return player.user.name;
  if (player?.aiLevel !== undefined) return `Stockfish (niveau ${player.aiLevel})`;
  return player ? 'Anonyme' : null;
}

/** One game of Lichess' export (NDJSON with `pgnInJson`), or `null` when it cannot be analysed. */
export function parseLichessGame(raw: LichessGame, username: string): ParsedGame | null {
  if (!raw.id || !raw.pgn || raw.variant !== 'standard' || hasCustomStart(raw.pgn)) return null;
  if (LICHESS_SKIPPED_STATUSES.has(raw.status ?? '')) return null;
  const speed = LICHESS_SPEEDS[raw.speed ?? ''];
  const white = lichessPlayerName(raw.players?.white);
  const black = lichessPlayerName(raw.players?.black);
  if (!speed || !white || !black) return null;

  const me = username.toLowerCase();
  const userColor: PlayerColor | null =
    raw.players?.white?.user?.id === me ? 'w' : raw.players?.black?.user?.id === me ? 'b' : null;
  if (!userColor) return null;

  let timeControl = '';
  if (raw.clock?.initial !== undefined) timeControl = clockLabel(raw.clock.initial, raw.clock.increment ?? 0);
  else if (raw.daysPerTurn) timeControl = `${raw.daysPerTurn} j/coup`;

  const winner = raw.winner === 'white' ? 'w' : raw.winner === 'black' ? 'b' : null;
  return {
    id: raw.id,
    source: 'lichess',
    url: `https://lichess.org/${raw.id}`,
    pgn: raw.pgn,
    white,
    black,
    whiteRating: raw.players?.white?.rating,
    blackRating: raw.players?.black?.rating,
    playedAt: raw.createdAt ?? 0,
    speed,
    timeControl,
    rated: raw.rated ?? false,
    userColor,
    outcome: winner === null ? 'draw' : winner === userColor ? 'win' : 'loss',
  };
}

async function fetchLichessPage(username: string, options: FetchPageOptions): Promise<ImportPage> {
  const { speed = 'all', limit = DEFAULT_PAGE_SIZE, signal, fetchImpl = fetch } = options;
  const until = options.cursor?.source === 'lichess' ? options.cursor.until : null;

  const params = new URLSearchParams({
    max: String(limit),
    pgnInJson: 'true',
    clocks: 'true',
    opening: 'true',
    perfType: LICHESS_PERF_TYPES[speed],
  });
  if (until !== null) params.set('until', String(until));

  const text = await getText(
    fetchImpl,
    `https://lichess.org/api/games/user/${encodeURIComponent(username.toLowerCase())}?${params}`,
    signal,
    'lichess',
    'application/x-ndjson'
  );

  const rawGames: LichessGame[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      rawGames.push(JSON.parse(line) as LichessGame);
    } catch {
      // A truncated or malformed line: the others are still good
    }
  }

  const games = rawGames
    .map((game) => parseLichessGame(game, username))
    .filter((game): game is ParsedGame => game !== null);
  // A full page means there may be older games, including when some of them were skipped above
  const oldest = rawGames.reduce<number | null>(
    (min, game) => (game.createdAt !== undefined && (min === null || game.createdAt < min) ? game.createdAt : min),
    null
  );
  const hasMore = rawGames.length >= limit && oldest !== null;
  return { games: withPlies(games), cursor: hasMore ? { source: 'lichess', until: oldest - 1 } : null };
}

// ---------------------------------------------------------------------------------------------------------------
// Entry point and HTTP

/**
 * One page of the most recent games of `username`, most recent first. Pass the returned `cursor` to get the
 * following page. Throws an `ImportError` (or the `AbortError` of `signal`).
 */
export async function fetchGamesPage(
  source: ImportSource,
  username: string,
  options: FetchPageOptions = {}
): Promise<ImportPage> {
  const name = username.trim();
  if (!isValidUsername(source, name)) {
    throw new ImportError(
      'invalid_username',
      `« ${name || '…'} » n'est pas un pseudo ${SOURCE_LABELS[source]} valide (lettres, chiffres, _ et -).`
    );
  }
  return source === 'chesscom' ? fetchChessComPage(name, options) : fetchLichessPage(name, options);
}

async function request(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal | undefined,
  source: ImportSource,
  accept: string
): Promise<Response> {
  const label = SOURCE_LABELS[source];
  let response: Response;
  try {
    response = await fetchImpl(url, { signal, headers: { Accept: accept } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ImportError('network', `Impossible de joindre ${label}. Vérifiez votre connexion et réessayez.`);
  }
  if (response.status === 404) {
    throw new ImportError('not_found', `Aucun joueur de ce nom sur ${label}.`);
  }
  if (response.status === 429) {
    throw new ImportError('rate_limited', `${label} limite temporairement les requêtes : réessayez dans une minute.`);
  }
  if (!response.ok) {
    throw new ImportError('unexpected', `${label} a répondu par une erreur (${response.status}). Réessayez plus tard.`);
  }
  return response;
}

async function getJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal | undefined,
  source: ImportSource
): Promise<T> {
  const response = await request(fetchImpl, url, signal, source, 'application/json');
  try {
    return (await response.json()) as T;
  } catch {
    if (signal?.aborted) throw signal.reason;
    throw new ImportError('unexpected', `Réponse inattendue de ${SOURCE_LABELS[source]}.`);
  }
}

async function getText(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal | undefined,
  source: ImportSource,
  accept: string
): Promise<string> {
  const response = await request(fetchImpl, url, signal, source, accept);
  try {
    return await response.text();
  } catch {
    if (signal?.aborted) throw signal.reason;
    throw new ImportError('network', `La réponse de ${SOURCE_LABELS[source]} a été interrompue.`);
  }
}
