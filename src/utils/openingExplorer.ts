import { Chess } from 'chess.js';
import type { OpeningPosition } from '../services/openingBook';
import type { Outcome } from './weaknessProfile';

/**
 * What the opening explorer shows for a position: the opening reached, and the moves that can follow, from the
 * openings database and from the player's own games. Pure: the database and the games are given in.
 */

export type PositionLookup = (fen: string) => OpeningPosition | null;

/** How a player's games went from a position, for one move. */
export interface Tally {
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

export const emptyTally = (): Tally => ({ games: 0, wins: 0, draws: 0, losses: 0 });

export function addToTally(tally: Tally, outcome: Outcome | null): void {
  tally.games++;
  if (outcome === 'win') tally.wins++;
  else if (outcome === 'draw') tally.draws++;
  else if (outcome === 'loss') tally.losses++;
}

export function mergeTallies(a: Tally, b: Tally): Tally {
  return {
    games: a.games + b.games,
    wins: a.wins + b.wins,
    draws: a.draws + b.draws,
    losses: a.losses + b.losses,
  };
}

/** Points per game (win 1, draw 0.5) among the games that have a result; null when none has. */
export function scoreOf(tally: Tally): number | null {
  const decided = tally.wins + tally.draws + tally.losses;
  return decided === 0 ? null : (tally.wins + tally.draws / 2) / decided;
}

/** One step of the line on the board: the move, and the position it leads to. */
export interface Step {
  san: string;
  from: string;
  to: string;
  /** Positions before and after the move. */
  before: string;
  fen: string;
  /** The opening that ends exactly there, when the database names one. */
  eco: string;
  name: string;
}

export interface Walk {
  /** The moves that could be played, in order; it stops at the first one that is not legal. */
  steps: Step[];
  fen: string;
  /** The opening reached: the last name met along the line (it is kept while the line goes on without a name). */
  eco: string;
  name: string;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Plays `sans` from the starting position, and says which opening the line has reached. */
export function walkLine(sans: readonly string[], lookup: PositionLookup): Walk {
  const chess = new Chess();
  const steps: Step[] = [];
  let eco = '';
  let name = '';
  for (const san of sans) {
    const before = chess.fen();
    let move;
    try {
      move = chess.move(san);
    } catch {
      break;
    }
    const named = lookup(chess.fen());
    if (named?.name) {
      eco = named.eco;
      name = named.name;
    }
    steps.push({
      san: move.san,
      from: move.from,
      to: move.to,
      before,
      fen: chess.fen(),
      eco: named?.name ? named.eco : '',
      name: named?.name ?? '',
    });
  }
  return { steps, fen: chess.fen(), eco, name };
}

export interface Continuation {
  san: string;
  /** Position after the move. */
  fen: string;
  /** In the openings database (otherwise only the player's games went there). */
  inBook: boolean;
  /** The opening that ends exactly after this move, if any. */
  name: string;
  eco: string;
  /** When the move itself has no name: the first named opening on its main line ("leads to"). */
  leadsTo: string;
  /** The player's games that played this move from here (null without games). */
  mine: Tally | null;
}

/** Follows the main line (the first continuation each time) until an opening is named, at most `limit` plies. */
function firstNameAhead(fen: string, lookup: PositionLookup, limit = 8): string {
  const chess = new Chess(fen);
  for (let i = 0; i < limit; i++) {
    const [san] = lookup(chess.fen())?.nextSans ?? [];
    if (!san) return '';
    try {
      chess.move(san);
    } catch {
      return '';
    }
    const named = lookup(chess.fen());
    if (named?.name) return named.name;
  }
  return '';
}

/**
 * The moves to offer from `fen`: the continuations of the database (most common first), then the moves the
 * player's games went through that the database does not know (the most played first). `mine` gives the tallies
 * of the player's games from this position, by move.
 */
export function continuationsOf(
  fen: string,
  lookup: PositionLookup,
  mine: ReadonlyMap<string, Tally> | undefined
): Continuation[] {
  const book = lookup(fen)?.nextSans ?? [];
  const bookSet = new Set(book);
  const offBook = [...(mine?.keys() ?? [])]
    .filter((san) => !bookSet.has(san))
    .sort((a, b) => (mine?.get(b)?.games ?? 0) - (mine?.get(a)?.games ?? 0));

  const result: Continuation[] = [];
  for (const [list, inBook] of [
    [book, true],
    [offBook, false],
  ] as const) {
    for (const san of list) {
      const chess = new Chess(fen);
      try {
        chess.move(san);
      } catch {
        continue; // a move that is not legal here (damaged data): leave it out
      }
      const after = chess.fen();
      const named = lookup(after);
      result.push({
        san,
        fen: after,
        inBook,
        name: named?.name ?? '',
        eco: named?.name ? named.eco : '',
        leadsTo: inBook && !named?.name ? firstNameAhead(after, lookup) : '',
        mine: mine?.get(san) ?? null,
      });
    }
  }
  return result;
}
