import type { GamePhase, MoveAnalysis } from '../types/chess';
import { phaseOf } from './gamePhase';
import { accuracyFromMoves } from './moveAnalysis';

export interface PhaseStat {
  totalMoves: number;
  /** Move numbers (of the game) the phase spans, null when no move was played in it. */
  firstMove: number | null;
  lastMove: number | null;
  whiteCount: number;
  blackCount: number;
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  whiteBlunders: number;
  blackBlunders: number;
  whiteMistakes: number;
  blackMistakes: number;
  whiteInaccuracies: number;
  blackInaccuracies: number;
}

export type { GamePhase };

export interface PhaseStats {
  opening: PhaseStat;
  middlegame: PhaseStat;
  endgame: PhaseStat;
}

/** Accuracy (0-100) of the moves, or null without moves. */
function accuracyOf(moves: MoveAnalysis[]): number | null {
  return moves.length === 0 ? null : accuracyFromMoves(moves);
}

const countBlunders = (moves: MoveAnalysis[]) =>
  moves.filter((m) => ['blunder', 'missedWin'].includes(m.classification)).length;
const countMistakes = (moves: MoveAnalysis[]) => moves.filter((m) => m.classification === 'mistake').length;
const countInaccuracies = (moves: MoveAnalysis[]) => moves.filter((m) => m.classification === 'inaccuracy').length;

function computePhase(moves: MoveAnalysis[], phase: GamePhase): PhaseStat {
  const phaseMoves = moves.filter((m) => phaseOf(m) === phase);
  const white = phaseMoves.filter((m) => m.color === 'w');
  const black = phaseMoves.filter((m) => m.color === 'b');

  const numbers = phaseMoves.map((m) => m.moveNumber);
  return {
    totalMoves: phaseMoves.length,
    firstMove: numbers.length ? Math.min(...numbers) : null,
    lastMove: numbers.length ? Math.max(...numbers) : null,
    whiteCount: white.length,
    blackCount: black.length,
    whiteAccuracy: accuracyOf(white),
    blackAccuracy: accuracyOf(black),
    whiteBlunders: countBlunders(white),
    blackBlunders: countBlunders(black),
    whiteMistakes: countMistakes(white),
    blackMistakes: countMistakes(black),
    whiteInaccuracies: countInaccuracies(white),
    blackInaccuracies: countInaccuracies(black),
  };
}

export function computePhaseStats(moves: MoveAnalysis[]): PhaseStats {
  return {
    opening: computePhase(moves, 'opening'),
    middlegame: computePhase(moves, 'middlegame'),
    endgame: computePhase(moves, 'endgame'),
  };
}

/** "coups 1 à 9", "coup 31", or null when the phase was not played. */
export function moveRangeLabel({ firstMove, lastMove }: Pick<PhaseStat, 'firstMove' | 'lastMove'>): string | null {
  if (firstMove === null || lastMove === null) return null;
  return firstMove === lastMove ? `coup ${firstMove}` : `coups ${firstMove} à ${lastMove}`;
}
