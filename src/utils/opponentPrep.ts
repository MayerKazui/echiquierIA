import { Chess } from 'chess.js';
import type { GameSpeed, ImportedGame } from '../services/gameImport';
import { addToTally, emptyTally, scoreOf, walkLine, type PositionLookup, type Tally } from './openingExplorer';
import { INDEX_PLIES, indexLines, talliesAt, type IndexedLine, type OpeningIndex } from './openingIndex';
import { familyOf } from './openingRepertoire';

/**
 * What to know about an opponent before facing them: the openings they play with each colour, how those went,
 * and the line they come back to. Built from the games read on chess.com or Lichess, which are not analysed by the
 * engine: only the moves and the results count, so everything here is about the choice of openings, not about the
 * quality of the play.
 */

/** One game of the opponent, seen from their side. */
export interface OpponentGame extends IndexedLine {
  speed: GameSpeed;
  playedAt: number;
  /** The opponent's rating in that game, when the site gave one. */
  rating?: number;
}

/** A line is called a habit when this many games go through it. */
export const MIN_LINE_GAMES = 3;
/** Plies of the favourite line at most. */
export const MAX_LINE_PLIES = 24;
/** Games an opening needs before its score says anything. */
export const MIN_FAMILY_GAMES = 3;
/** Openings listed for each colour. */
const MAX_FAMILIES = 6;
const MAX_STARTS = 5;
/** Score (points per game) under which an opening is a soft spot, and over which it is a strength. */
export const WEAK_SCORE = 0.4;
export const STRONG_SCORE = 0.6;

interface WorkOptions {
  /** Called now and then so that a long history does not freeze the page. */
  yieldToUi?: () => Promise<void>;
}

/** Games between two calls of `yieldToUi`. */
const YIELD_EVERY = 10;

/** The moves of each game, from the PGN the import gave; a game that cannot be read is left out. */
export async function toOpponentGames(
  games: readonly ImportedGame[],
  { yieldToUi }: WorkOptions = {}
): Promise<OpponentGame[]> {
  const result: OpponentGame[] = [];
  for (const [i, game] of games.entries()) {
    if (yieldToUi && i > 0 && i % YIELD_EVERY === 0) await yieldToUi();
    try {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      const sans = chess.history();
      if (sans.length === 0) continue;
      result.push({
        sans,
        color: game.userColor,
        outcome: game.outcome,
        speed: game.speed,
        playedAt: game.playedAt,
        rating: game.userColor === 'w' ? game.whiteRating : game.blackRating,
      });
    } catch {
      // A game that cannot be read has nothing to count
    }
  }
  return result;
}

/** How the opponent starts: the first moves with White, the reply to White's first move with Black. */
export interface Start {
  /** English SAN, from the initial position: one move with White, two (White's, then theirs) with Black. */
  line: string[];
  tally: Tally;
}

export interface PrepVariation {
  name: string;
  eco: string;
  tally: Tally;
}

export interface PrepFamily {
  /** Empty for the games that never reached a named line. */
  name: string;
  eco: string;
  tally: Tally;
  /** The most played first. */
  variations: PrepVariation[];
}

/** The line the opponent plays most often: the most played move each time, while enough games agree. */
export interface FavouriteLine {
  sans: string[];
  /** Games that went through the whole line, and how they ended. */
  tally: Tally;
}

export interface ColorPrep {
  color: 'w' | 'b';
  tally: Tally;
  starts: Start[];
  families: PrepFamily[];
  favourite: FavouriteLine | null;
  /** The openings with enough games and the lowest score, then the highest (best and worst at most one each). */
  weakest: PrepFamily | null;
  strongest: PrepFamily | null;
  /** Mean number of moves played inside the book (35 plies at most), null without any game. */
  meanBookMoves: number | null;
}

export interface OpponentPrep {
  games: number;
  /** The most recent rating found, and the span of the games. */
  rating: number | null;
  from: number | null;
  to: number | null;
  speeds: Array<{ speed: GameSpeed; games: number }>;
  index: OpeningIndex;
  colors: Record<'w' | 'b', ColorPrep>;
}

const byGames = <T extends { tally: Tally }>(items: T[]): T[] => items.sort((a, b) => b.tally.games - a.tally.games);

function favouriteLine(index: OpeningIndex, color: 'w' | 'b'): FavouriteLine | null {
  const chess = new Chess();
  const sans: string[] = [];
  let tally: Tally | null = null;
  while (sans.length < MAX_LINE_PLIES) {
    const moves = talliesAt(index, chess.fen(), color);
    if (!moves) break;
    let best: [string, Tally] | null = null;
    for (const entry of moves) if (best === null || entry[1].games > best[1].games) best = entry;
    if (best === null || best[1].games < MIN_LINE_GAMES) break;
    chess.move(best[0]);
    sans.push(best[0]);
    tally = best[1];
  }
  return tally !== null && sans.length >= 2 ? { sans, tally } : null;
}

/** Moves of the line that the openings database knows, from the start (it stops at the first unknown position). */
function bookMoves(steps: ReadonlyArray<{ fen: string }>, lookup: PositionLookup): number {
  const outside = steps.findIndex((step) => lookup(step.fen) === null);
  return Math.ceil((outside < 0 ? steps.length : outside) / 2);
}

async function colorPrep(
  games: readonly OpponentGame[],
  color: 'w' | 'b',
  index: OpeningIndex,
  lookup: PositionLookup,
  { yieldToUi }: WorkOptions
): Promise<ColorPrep> {
  const own = games.filter((game) => game.color === color);
  const tally = emptyTally();
  const starts = new Map<string, Start>();
  const families = new Map<string, PrepFamily>();
  let bookTotal = 0;

  for (const [i, { sans, outcome }] of own.entries()) {
    if (yieldToUi && i > 0 && i % YIELD_EVERY === 0) await yieldToUi();
    addToTally(tally, outcome);

    const startLine = sans.slice(0, color === 'w' ? 1 : 2);
    if (startLine.length === (color === 'w' ? 1 : 2)) {
      const key = startLine.join(' ');
      const start = starts.get(key) ?? { line: startLine, tally: emptyTally() };
      starts.set(key, start);
      addToTally(start.tally, outcome);
    }

    const reached = walkLine(sans.slice(0, INDEX_PLIES), lookup);
    const family = reached.name ? familyOf(reached.name) : '';
    const entry = families.get(family) ?? { name: family, eco: '', tally: emptyTally(), variations: [] };
    families.set(family, entry);
    addToTally(entry.tally, outcome);
    let variation = entry.variations.find((v) => v.name === reached.name);
    if (!variation) {
      variation = { name: reached.name, eco: reached.eco, tally: emptyTally() };
      entry.variations.push(variation);
    }
    addToTally(variation.tally, outcome);

    bookTotal += bookMoves(reached.steps, lookup);
  }

  const allFamilies = byGames([...families.values()]).map((family) => ({
    ...family,
    variations: byGames(family.variations),
    eco: byGames(family.variations)[0]?.eco ?? '',
  }));
  // Only named openings can be compared: the games without a name are not "an opening"
  const rated = allFamilies
    .filter((f) => f.name !== '' && f.tally.games >= MIN_FAMILY_GAMES && scoreOf(f.tally) !== null)
    .sort((a, b) => scoreOf(a.tally)! - scoreOf(b.tally)! || b.tally.games - a.tally.games);
  const weakest = rated.find((f) => scoreOf(f.tally)! < WEAK_SCORE) ?? null;
  const strongest = [...rated].reverse().find((f) => scoreOf(f.tally)! >= STRONG_SCORE && f !== weakest) ?? null;

  return {
    color,
    tally,
    starts: byGames([...starts.values()]).slice(0, MAX_STARTS),
    families: allFamilies.slice(0, MAX_FAMILIES),
    favourite: favouriteLine(index, color),
    weakest,
    strongest,
    meanBookMoves: own.length === 0 ? null : bookTotal / own.length,
  };
}

/** The preparation for an opponent, from their games (the opening names come from the loaded openings database). */
export async function buildOpponentPrep(
  games: readonly OpponentGame[],
  lookup: PositionLookup,
  options: WorkOptions = {}
): Promise<OpponentPrep> {
  const index = await indexLines(games, options);

  const dated = games.filter((g) => g.playedAt > 0);
  const newest = [...games].sort((a, b) => b.playedAt - a.playedAt).find((g) => g.rating !== undefined);
  const speeds = new Map<GameSpeed, number>();
  for (const { speed } of games) speeds.set(speed, (speeds.get(speed) ?? 0) + 1);

  return {
    games: games.length,
    rating: newest?.rating ?? null,
    from: dated.length ? Math.min(...dated.map((g) => g.playedAt)) : null,
    to: dated.length ? Math.max(...dated.map((g) => g.playedAt)) : null,
    speeds: [...speeds].map(([speed, count]) => ({ speed, games: count })).sort((a, b) => b.games - a.games),
    index,
    colors: {
      w: await colorPrep(games, 'w', index, lookup, options),
      b: await colorPrep(games, 'b', index, lookup, options),
    },
  };
}
