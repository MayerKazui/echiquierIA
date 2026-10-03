import { Chess } from 'chess.js';
import type { GameAnalysisResult } from '../types/chess';
import { normalizeFen } from '../services/openingBook';
import { START_FEN, addToTally, emptyTally, mergeTallies, type Tally } from './openingExplorer';
import { parseOutcome, playerColorIn, type Outcome } from './weaknessProfile';

/**
 * The moves of the player's own games, by position: from each position of the first plies of a game, which moves
 * were played (by either side), and how the player's games went afterwards. It is what the explorer shows next to
 * the theory.
 */

/** What this needs of a stored game. */
export interface IndexSource {
  result: GameAnalysisResult;
}

/** Plies of a game that are indexed: the opening (a deeper line is rarely shared by two games). */
export const INDEX_PLIES = 35;

export type OpeningIndex = Map<string, Map<string, Record<'w' | 'b', Tally>>>;

/** A game reduced to what the index needs: the moves, the side the counted player had, and how it went for them. */
export interface IndexedLine {
  sans: readonly string[];
  color: 'w' | 'b';
  outcome: Outcome | null;
}

interface IndexOptions {
  yieldToUi?: () => Promise<void>;
}

/**
 * Indexes lines of play. The position keys ignore the move counters (a transposition shares its entry); the
 * tallies are kept by the colour of the counted player, so that the explorer can look at one side only.
 * `yieldToUi` is called now and then so that a long history does not freeze the page.
 */
export async function indexLines(
  lines: readonly IndexedLine[],
  { yieldToUi }: IndexOptions = {}
): Promise<OpeningIndex> {
  const index: OpeningIndex = new Map();
  let sinceYield = 0;

  for (const { sans, color, outcome } of lines) {
    const chess = new Chess();
    for (const san of sans.slice(0, INDEX_PLIES)) {
      const key = normalizeFen(chess.fen());
      let played: string;
      try {
        played = chess.move(san).san;
      } catch {
        break; // the stored moves do not replay: keep what was read so far
      }
      let moves = index.get(key);
      if (!moves) index.set(key, (moves = new Map()));
      let byColor = moves.get(played);
      if (!byColor) moves.set(played, (byColor = { w: emptyTally(), b: emptyTally() }));
      addToTally(byColor[color], outcome);
    }

    if (yieldToUi && ++sinceYield >= 25) {
      sinceYield = 0;
      await yieldToUi();
    }
  }
  return index;
}

/** Indexes the games the player is named in (the ones where the pseudo kept with the game is not found are left out). */
export async function buildOpeningIndex(
  games: readonly IndexSource[],
  options: IndexOptions = {}
): Promise<OpeningIndex> {
  const lines = games.flatMap(({ result }): IndexedLine[] => {
    const color = playerColorIn(result);
    if (color === null) return [];
    return [{ sans: result.moves.map((m) => m.san), color, outcome: parseOutcome(result.metadata.result, color) }];
  });
  return indexLines(lines, options);
}

/** The tallies of a position for the games played with `side` ('all' adds both), by move. */
export function talliesAt(index: OpeningIndex, fen: string, side: 'all' | 'w' | 'b'): Map<string, Tally> | undefined {
  const moves = index.get(normalizeFen(fen));
  if (!moves) return undefined;
  const result = new Map<string, Tally>();
  for (const [san, byColor] of moves) {
    const tally = side === 'all' ? mergeTallies(byColor.w, byColor.b) : byColor[side];
    if (tally.games > 0) result.set(san, tally);
  }
  return result.size > 0 ? result : undefined;
}

/** Games the player is named in, which the index was built from (each one has a first move). */
export function gamesIn(index: OpeningIndex): number {
  let games = 0;
  for (const byColor of index.get(normalizeFen(START_FEN))?.values() ?? []) games += byColor.w.games + byColor.b.games;
  return games;
}
