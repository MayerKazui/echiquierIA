import type { Move } from 'chess.js';
import type { EngineEvaluation } from '../services/stockfishEngine';
import { CLASS_LIMITS, winPercentOfEvaluation, type MoveContext } from './moveAnalysis';
import { materialSacrificed, SACRIFICE_MIN } from './sacrifice';

/** A sacrifice is brilliant only if the player was not already winning clearly (centipawns, from the mover's side). */
export const BRILLIANT_MAX_ADVANTAGE = 500;
/** ... and if it leaves the player clearly better (centipawns). */
export const BRILLIANT_MIN_RESULT = 100;

export interface MoveContextInput {
  move: Move;
  /** The opponent's move just before, if any. */
  previous?: Move;
  fenBefore: string;
  before: EngineEvaluation;
  after: EngineEvaluation;
  /** Win% of White before the move, and the Win% the mover gave away. */
  winPctBefore: number;
  winPctDrop: number;
  /** The Win% the opponent's move just before gave away. */
  previousOpponentDrop: number;
}

/** What makes a move more than its Win% says: a real sacrifice, an only move, a forced mate given up. */
export function moveContext({
  move,
  previous,
  fenBefore,
  before,
  after,
  winPctBefore,
  winPctDrop,
  previousOpponentDrop,
}: MoveContextInput): MoveContext {
  const white = move.color === 'w';
  const sign = white ? 1 : -1;
  const moverCpBefore = before.cp * sign;
  const moverCpAfter = after.cp * sign;

  // A sacrifice that gives away nothing, by a player who was not yet winning clearly and is better afterwards.
  // The exchange is only played out for the few moves that pass the cheap tests.
  const isSacrifice =
    winPctDrop <= CLASS_LIMITS.excellent &&
    moverCpBefore <= BRILLIANT_MAX_ADVANTAGE &&
    moverCpAfter > BRILLIANT_MIN_RESULT &&
    materialSacrificed(fenBefore, move) >= SACRIFICE_MIN;

  // An only move: the second choice of the engine is much worse than its first. Taking back the piece the
  // opponent has just taken is not a find.
  const isRecapture = Boolean(move.captured && previous?.captured && previous.to === move.to);
  let onlyMoveGap = 0;
  if (before.second && !isRecapture) {
    const best = white ? winPctBefore : 100 - winPctBefore;
    const secondWhite = winPercentOfEvaluation(before.second.cp, before.second.mate);
    onlyMoveGap = best - (white ? secondWhite : 100 - secondWhite);
  }

  // A forced mate that the move lets go
  const mates = (mate: number | null) => Boolean(mate) && (mate! > 0 ? 1 : -1) === sign;
  const lostForcedMate = mates(before.mate) && !mates(after.mate);

  return { isSacrifice, previousOpponentDrop, onlyMoveGap, lostForcedMate };
}
