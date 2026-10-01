import { MoveAnalysis } from '../types/chess';

/**
 * The opening reached at `ply`: the last name the book gave up to and including that move, or null before
 * the first named position. Following the game this way shows the opening as it unfolds, not its final name
 * from the first move on.
 */
export function openingAtPly(
  moves: readonly MoveAnalysis[] | undefined,
  ply: number
): { name: string; eco?: string } | null {
  if (!moves) return null;
  for (let i = Math.min(ply, moves.length - 1); i >= 0; i--) {
    const { openingName, eco } = moves[i];
    if (openingName) return { name: openingName, eco };
  }
  return null;
}
