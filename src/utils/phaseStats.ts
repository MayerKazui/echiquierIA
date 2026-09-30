import { MoveAnalysis } from '../types/chess';

export interface PhaseStat {
  totalMoves: number;
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

export interface PhaseStats {
  opening: PhaseStat;
  middlegame: PhaseStat;
  endgame: PhaseStat;
}

/** Accuracy (25–99.4) derived from the average centipawn loss, or null without moves. */
function accuracyOf(moves: MoveAnalysis[]): number | null {
  if (moves.length === 0) return null;
  const avgLoss = moves.reduce((acc, m) => acc + m.centipawnLoss, 0) / moves.length;
  return Math.min(99.4, Math.max(25.0, Math.round(100 * Math.exp(-0.0038 * avgLoss) * 10) / 10));
}

const countBlunders = (moves: MoveAnalysis[]) =>
  moves.filter((m) => ['blunder', 'missedWin'].includes(m.classification)).length;
const countMistakes = (moves: MoveAnalysis[]) => moves.filter((m) => m.classification === 'mistake').length;
const countInaccuracies = (moves: MoveAnalysis[]) => moves.filter((m) => m.classification === 'inaccuracy').length;

function computePhase(moves: MoveAnalysis[], startMove: number, endMove: number): PhaseStat {
  const phaseMoves = moves.filter((m) => m.moveNumber >= startMove && m.moveNumber <= endMove);
  const white = phaseMoves.filter((m) => m.color === 'w');
  const black = phaseMoves.filter((m) => m.color === 'b');

  return {
    totalMoves: phaseMoves.length,
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

/** Opening: moves 1-12, middlegame: 13-30, endgame: 31+. */
export function computePhaseStats(moves: MoveAnalysis[]): PhaseStats {
  return {
    opening: computePhase(moves, 1, 12),
    middlegame: computePhase(moves, 13, 30),
    endgame: computePhase(moves, 31, 999),
  };
}
