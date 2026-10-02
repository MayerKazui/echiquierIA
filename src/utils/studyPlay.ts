import { Chess } from 'chess.js';
import type { StudyNode } from '../types/study';

/** Probability that the computer follows the main line when it has a choice (the rest goes to the variations). */
export const MAIN_LINE_SHARE = 0.6;

/**
 * The reply the computer plays from `node`: usually the main line, sometimes one of the variations, so that
 * the player meets the whole study and not only its first line. Null when the line ends here.
 */
export function pickReply(node: StudyNode, random: () => number = Math.random): StudyNode | null {
  const [main, ...variations] = node.children;
  if (!main) return null;
  if (variations.length === 0 || random() < MAIN_LINE_SHARE) return main;
  return variations[Math.min(variations.length - 1, Math.floor(random() * variations.length))];
}

export type Verdict =
  | { kind: 'followed'; node: StudyNode }
  /** A legal move that the study does not play here: it is taken back. */
  | { kind: 'off-book'; san: string }
  | { kind: 'illegal' };

/** Judges a move of the player against the continuations of the study at `node`. */
export function judgeMove(node: StudyNode, from: string, to: string, promotion?: string): Verdict {
  let san: string;
  try {
    san = new Chess(node.fen).move({ from, to, promotion }).san;
  } catch {
    return { kind: 'illegal' };
  }
  const followed = node.children.find((child) => child.san === san);
  return followed ? { kind: 'followed', node: followed } : { kind: 'off-book', san };
}
