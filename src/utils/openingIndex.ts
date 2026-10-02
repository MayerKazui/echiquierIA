import { Chess } from 'chess.js';
import type { GameAnalysisResult } from '../types/chess';
import { normalizeFen } from '../services/openingBook';
import { START_FEN, addToTally, emptyTally, mergeTallies, type Tally } from './openingExplorer';
import { parseOutcome, playerColorIn } from './weaknessProfile';

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

/**
 * Indexes the games the player is named in. The position keys ignore the move counters (a transposition shares
 * its entry); the tallies are kept by the colour the player had, so that the explorer can look at one side only.
 * `yieldToUi` is called now and then so that a long history does not freeze the page.
 */
export async function buildOpeningIndex(
  games: readonly IndexSource[],
  { yieldToUi }: { yieldToUi?: () => Promise<void> } = {}
): Promise<OpeningIndex> {
  const index: OpeningIndex = new Map();
  let sinceYield = 0;

  for (const { result } of games) {
    const color = playerColorIn(result);
    if (color === null) continue;
    const outcome = parseOutcome(result.metadata.result, color);

    const chess = new Chess();
    for (const { san } of result.moves.slice(0, INDEX_PLIES)) {
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
