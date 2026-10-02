import { Chess } from 'chess.js';
import type { GameAnalysisResult } from '../types/chess';
import { normalizeFen } from '../services/openingBook';
import { addToTally, emptyTally, type Tally } from './openingExplorer';
import { openingAtPly } from './openingAtPly';
import { CLASS_LIMITS } from './moveAnalysis';
import { MIN_GAME_PLIES, parseOutcome, playerColorIn } from './weaknessProfile';

/**
 * The player's real repertoire: which openings the games kept in the browser went through, how they ended, and
 * where the player leaves the theory (the first move outside the book) and what that move costs.
 *
 * An opening is a family ("Sicilian Defense") with its variations ("Sicilian Defense: Najdorf Variation"), kept
 * apart by the colour the player had: the same name is a different repertoire as White and as Black.
 */

/** What this needs of a stored game. */
export interface RepertoireSource {
  result: GameAnalysisResult;
}

/** Plies at which a game can still be in the book (the analysis looks at the 35 first). */
export const BOOK_PLIES = 35;
/** A move that gives away at least this much win % is costly: the limit of an inaccuracy. */
export const COSTLY_EXIT = CLASS_LIMITS.inaccuracy;
/** A way out of the book needs to be met this many times to be called recurrent. */
export const MIN_RECURRENCE = 2;
/** Recurrent exits kept for each opening. */
const MAX_EXITS = 3;

/** The first move outside the book, in one game. */
export interface Exit {
  /** 1 for the first move of the game. */
  moveNumber: number;
  san: string;
  /** Who left the theory: the player (so the move is theirs to learn) or the opponent. */
  byPlayer: boolean;
  /** Win % the move gave away (0 for a move as good as the engine's). */
  loss: number;
  /** The moves played up to this one, so that the position can be shown. */
  line: string[];
}

/** One way out of the book, met in several games. */
export interface RecurringExit {
  moveNumber: number;
  san: string;
  line: string[];
  /** Games in which the player left the book here. */
  count: number;
  /** Mean win % that move gave away. */
  loss: number;
  isCostly: boolean;
  tally: Tally;
}

export interface Variation {
  name: string;
  eco: string;
  tally: Tally;
}

export interface Family {
  name: string;
  eco: string;
  tally: Tally;
  /** The most played first. */
  variations: Variation[];
  /** Games in which the player was the first to leave the theory, the opponent was, or nobody did. */
  exits: { player: number; opponent: number; none: number };
  /** The way out of the book that comes back most often (player only), the most frequent first. */
  recurring: RecurringExit[];
}

export interface Repertoire {
  /** Games that count (the player is named in them, long enough), and those left out. */
  counted: number;
  ignored: number;
  colors: Record<'w' | 'b', Family[]>;
}

/** "Sicilian Defense: Najdorf Variation, English Attack" → "Sicilian Defense". */
export const familyOf = (name: string): string => name.split(':')[0].trim();

/** Where the game leaves the book, from its stored classifications; null when it stays in it. */
export function findExit(result: GameAnalysisResult, color: 'w' | 'b'): Exit | null {
  const { moves } = result;
  const limit = Math.min(moves.length, BOOK_PLIES);
  for (let ply = 0; ply < limit; ply++) {
    const move = moves[ply];
    if (move.classification === 'book') continue;
    return {
      moveNumber: Math.floor(ply / 2) + 1,
      san: move.san,
      byPlayer: move.color === color,
      loss: Math.max(0, move.winPercentLoss),
      line: moves.slice(0, ply).map((m) => m.san),
    };
  }
  return null;
}

interface Bucket {
  name: string;
  tally: Tally;
  variations: Map<string, Variation>;
  exits: Family['exits'];
  /** The ways out of the book met, by position and move. */
  ways: Map<string, { exit: Exit; losses: number; tally: Tally }>;
}

const sorted = <T extends { tally: Tally }>(items: T[]): T[] => items.sort((a, b) => b.tally.games - a.tally.games);

/**
 * Groups the games the player is named in by the opening they reached. `yieldToUi` is called now and then so that
 * a long history does not freeze the page.
 */
export async function buildRepertoire(
  games: readonly RepertoireSource[],
  { yieldToUi }: { yieldToUi?: () => Promise<void> } = {}
): Promise<Repertoire> {
  const buckets: Record<'w' | 'b', Map<string, Bucket>> = { w: new Map(), b: new Map() };
  let counted = 0;
  let sinceYield = 0;

  for (const { result } of games) {
    const color = playerColorIn(result);
    if (color === null || result.moves.length < MIN_GAME_PLIES) continue;
    counted++;
    const outcome = parseOutcome(result.metadata.result, color);

    const opening = openingAtPly(result.moves, result.moves.length - 1);
    const name = opening?.name ?? '';
    const family = name ? familyOf(name) : '';
    let bucket = buckets[color].get(family);
    if (!bucket) {
      bucket = {
        name: family,
        tally: emptyTally(),
        variations: new Map(),
        exits: { player: 0, opponent: 0, none: 0 },
        ways: new Map(),
      };
      buckets[color].set(family, bucket);
    }
    addToTally(bucket.tally, outcome);

    const variation = bucket.variations.get(name) ?? { name, eco: opening?.eco ?? '', tally: emptyTally() };
    bucket.variations.set(name, variation);
    addToTally(variation.tally, outcome);

    const exit = findExit(result, color);
    if (!exit) bucket.exits.none++;
    else if (!exit.byPlayer) bucket.exits.opponent++;
    else {
      bucket.exits.player++;
      const key = `${normalizeFen(positionAfter(exit.line))}|${exit.san}`;
      let way = bucket.ways.get(key);
      if (!way) bucket.ways.set(key, (way = { exit, losses: 0, tally: emptyTally() }));
      way.losses += exit.loss;
      addToTally(way.tally, outcome);
    }

    if (yieldToUi && ++sinceYield >= 25) {
      sinceYield = 0;
      await yieldToUi();
    }
  }

  const families = (color: 'w' | 'b'): Family[] =>
    sorted(
      [...buckets[color].values()].map((bucket): Family => {
        const variations = sorted([...bucket.variations.values()]);
        const recurring = [...bucket.ways.values()]
          .filter(({ tally }) => tally.games >= MIN_RECURRENCE)
          .map(({ exit, losses, tally }): RecurringExit => {
            const loss = losses / tally.games;
            return {
              moveNumber: exit.moveNumber,
              san: exit.san,
              line: exit.line,
              count: tally.games,
              loss,
              isCostly: loss >= COSTLY_EXIT,
              tally,
            };
          })
          .sort((a, b) => b.count - a.count || b.loss - a.loss)
          .slice(0, MAX_EXITS);
        return {
          name: bucket.name,
          eco: variations[0]?.eco ?? '',
          tally: bucket.tally,
          variations,
          exits: bucket.exits,
          recurring,
        };
      })
    );

  return { counted, ignored: games.length - counted, colors: { w: families('w'), b: families('b') } };
}

/** The position after playing `line` from the start. */
function positionAfter(line: readonly string[]): string {
  const chess = new Chess();
  for (const san of line) {
    try {
      chess.move(san);
    } catch {
      break;
    }
  }
  return chess.fen();
}
