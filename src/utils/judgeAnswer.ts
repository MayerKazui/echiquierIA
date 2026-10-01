import { Chess } from 'chess.js';
import type { EngineEvaluation } from '../services/stockfishEngine';
import { CLASS_LIMITS, calculateWinPercentage } from './moveAnalysis';
import type { TrainingPosition } from './trainingPositions';

/**
 * How an answer to a replayed position is judged. Finding the engine's move is right; so is any move that keeps
 * about as much as it does (the engine is asked, for there is often more than one good move); playing again the
 * move of the game is wrong without asking.
 */

export type Verdict =
  /** The engine's move. */
  | { kind: 'best' }
  /** Another move that holds the position, `loss` Win % under the engine's move. */
  | { kind: 'good'; loss: number }
  /** The move that was played in the game. */
  | { kind: 'played' }
  /** A move that gives `loss` Win % away (null when the engine could not say). */
  | { kind: 'bad'; loss: number | null }
  /** The player gave up and asked for the solution. */
  | { kind: 'revealed' };

export const isSuccess = (verdict: Verdict): boolean => verdict.kind === 'best' || verdict.kind === 'good';

/** Win % a move may give away and still count as good: the limit the analysis uses for a "good" move. */
export const ACCEPTED_LOSS = CLASS_LIMITS.good;

/** Search depth used to check another move (the engine keeps what it has already worked out). */
export const CHECK_DEPTH = 12;

type Evaluate = (fen: string, depth: number, signal?: AbortSignal) => Promise<EngineEvaluation>;

/** A mate counts as the largest advantage (the same plateau as the analysis). */
function scoreOf({ cp, mate }: EngineEvaluation): number {
  if (mate === null || mate === 0) return cp;
  return mate > 0 ? 1000 : -1000;
}

/** Win % of the player after the move, the engine's score being from White's point of view. */
function ownWinPercent(evaluation: EngineEvaluation, color: 'w' | 'b'): number {
  const white = calculateWinPercentage(scoreOf(evaluation));
  return color === 'w' ? white : 100 - white;
}

/** The position after the move (UCI), or null if the move is not legal there. */
function afterMove(fen: string, uci: string): Chess | null {
  try {
    const chess = new Chess(fen);
    chess.move({ from: uci.substring(0, 2), to: uci.substring(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    return chess;
  } catch {
    return null;
  }
}

/**
 * The verdict on the move `uci` played in `position`. Anything but the engine's move or the move of the game is
 * worked out by the engine, from the position it leads to; if it cannot, the move is judged wrong.
 */
export async function judgeAnswer(
  position: TrainingPosition,
  uci: string,
  evaluate: Evaluate,
  signal?: AbortSignal
): Promise<Verdict> {
  if (uci === position.bestUci) return { kind: 'best' };
  if (uci === position.playedUci) return { kind: 'played' };
  const chess = afterMove(position.fen, uci);
  if (!chess) return { kind: 'bad', loss: null };
  if (chess.isCheckmate()) return { kind: 'best' };
  try {
    const evaluation = await evaluate(chess.fen(), CHECK_DEPTH, signal);
    const loss = Math.max(0, position.winBefore - ownWinPercent(evaluation, position.color));
    return loss <= ACCEPTED_LOSS ? { kind: 'good', loss } : { kind: 'bad', loss };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { kind: 'bad', loss: null };
  }
}
