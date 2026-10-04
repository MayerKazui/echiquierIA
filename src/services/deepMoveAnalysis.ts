import type { MoveAnalysis } from '../types/chess';
import type { DeepAnalysis, DeepLine } from '../utils/moveCoach';
import { stockfishService, type EngineEvaluation } from './stockfishEngine';

/** Depths offered to the coach, besides the analysis already made for the game (0). */
export const COACH_DEPTHS = [0, 12, 14, 16, 18] as const;
export type CoachDepth = (typeof COACH_DEPTHS)[number];

export const COACH_DEPTH_LABELS: Record<CoachDepth, string> = {
  0: 'Analyse de la partie (instantané)',
  12: 'Standard (profondeur 12)',
  14: 'Poussé (profondeur 14)',
  16: 'Expert (profondeur 16)',
  18: 'Maître (profondeur 18)',
};

const lineOf = (evaluation: EngineEvaluation): DeepLine => ({
  cp: evaluation.cp,
  mate: evaluation.mate,
  bestMoveUci: evaluation.bestMoveUci,
  pv: evaluation.pv,
});

/**
 * A search of the position before the move and of the one after it, at `depth`: the first gives the engine's move and
 * its line, the second the answer to the move played. The two run side by side on the engine's workers, and a position
 * already searched at least as deep (the game's analysis, an earlier request) is not searched again.
 */
export async function deepAnalyseMove(move: MoveAnalysis, depth: number, signal?: AbortSignal): Promise<DeepAnalysis> {
  const [before, after] = await Promise.all([
    stockfishService.evaluatePosition(move.fenBefore, depth, signal),
    stockfishService.evaluatePosition(move.fenAfter, depth, signal),
  ]);
  return { depth, before: lineOf(before), after: lineOf(after) };
}
