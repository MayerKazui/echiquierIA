import { MoveClassification, PlayerStats, MoveAnalysis } from '../types/chess';

/**
 * Win probability (0-100) of White from a centipawn score (White's perspective).
 * Lichess' logistic curve, with the score clamped to ±1000 cp. It is the only curve of the app:
 * the classification thresholds and the accuracy below are both calibrated on it.
 */
export function calculateWinPercentage(cp: number): number {
  const clampedCp = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clampedCp)) - 1);
}

/**
 * Accuracy (0-100) of a single move from the Win% it gave away (Lichess formula, with its small
 * "uncertainty bonus"). Based on the win probability rather than on raw centipawns, so a blunder or a
 * mate score weighs at most "the whole game lost", never thousands of centipawns.
 */
export function accuracyFromWinDrop(winPctDrop: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * Math.max(0, winPctDrop)) - 3.1669 + 1;
  return Math.min(100, Math.max(0, raw));
}

type EvaluatedMove = Pick<MoveAnalysis, 'color' | 'evalBefore' | 'evalAfter' | 'centipawnLoss'>;

/** Accuracy of one analysed move; falls back to its centipawn loss when evaluations are missing. */
export function moveAccuracy(m: EvaluatedMove): number {
  if (typeof m.evalBefore === 'number' && typeof m.evalAfter === 'number') {
    const before = calculateWinPercentage(m.evalBefore);
    const after = calculateWinPercentage(m.evalAfter);
    return accuracyFromWinDrop(m.color === 'w' ? before - after : after - before);
  }
  return accuracyFromWinDrop(calculateWinPercentage(m.centipawnLoss) - 50);
}

/** A single move can pull the harmonic mean down only so far (a mate blunder is already one lost game). */
const HARMONIC_FLOOR = 10;

const standardDeviation = (values: number[]) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
};

/**
 * Weight of each move of a game, as on Lichess: moves played in a volatile stretch (the Win% of White
 * swings a lot around them) count more than moves of a quiet, settled position. The weight is the standard
 * deviation (0.5 to 12) of the Win% over a sliding window ending on the move.
 */
export function volatilityWeights(allMoves: MoveAnalysis[]): Map<MoveAnalysis, number> {
  const weights = new Map<MoveAnalysis, number>();
  const evaluated = allMoves.filter((m) => typeof m.evalBefore === 'number' && typeof m.evalAfter === 'number');
  if (evaluated.length === 0) return weights;

  // Win% of White before the game and after every move
  const series = [
    calculateWinPercentage(evaluated[0].evalBefore),
    ...evaluated.map((m) => calculateWinPercentage(m.evalAfter)),
  ];
  const windowSize = Math.min(8, Math.max(2, Math.floor(series.length / 10)));

  evaluated.forEach((move, i) => {
    const end = i + 1; // position reached by this move
    const start = Math.max(0, end - windowSize + 1);
    const window = series.slice(start, Math.max(end + 1, windowSize));
    weights.set(move, Math.min(12, Math.max(0.5, standardDeviation(window))));
  });
  return weights;
}

/**
 * Accuracy (0-100, one decimal) of a set of moves, as on Lichess: the mean of the volatility-weighted mean
 * and of the harmonic mean of the per-move accuracies. The weighted mean makes the moves of the critical
 * stretches count more; the harmonic mean penalises the isolated blunders a plain average would hide.
 *
 * `allMoves` is the whole game (both colours): the weights need the Win% around each move, which a set of
 * moves of one side or one phase does not contain.
 */
export function accuracyFromMoves(moves: MoveAnalysis[], allMoves: MoveAnalysis[] = moves): number {
  if (moves.length === 0) return 100;
  const weights = volatilityWeights(allMoves);
  let weightedSum = 0;
  let totalWeight = 0;
  let inverseSum = 0;
  for (const m of moves) {
    const accuracy = moveAccuracy(m);
    const weight = weights.get(m) ?? 1;
    weightedSum += accuracy * weight;
    totalWeight += weight;
    inverseSum += 1 / Math.max(accuracy, HARMONIC_FLOOR);
  }
  const weighted = weightedSum / totalWeight;
  const harmonic = moves.length / inverseSum;
  return Math.round(((weighted + harmonic) / 2) * 10) / 10;
}

/**
 * Win% (0-100 points) a move may give away for each class. These are chess.com's expected-points limits
 * (0.02, 0.05, 0.10, 0.20) applied to the Lichess curve, which is the one the Win% here comes from.
 */
export const CLASS_LIMITS = { best: 0.5, excellent: 2, good: 5, inaccuracy: 10, mistake: 20 } as const;

/** Classifies a move from the Win% it gave away (from the mover's point of view, in points). */
export function classifyMove(
  isWhite: boolean,
  playedSan: string,
  bestSan: string,
  winPctDrop: number,
  evalBefore: number,
  evalAfter: number,
  isSacrifice = false
): MoveClassification {
  // The engine's move, or one as good within its noise
  if (playedSan === bestSan || winPctDrop <= CLASS_LIMITS.best) return 'best';

  // A sacrifice that gives away practically nothing
  if (isSacrifice && winPctDrop <= CLASS_LIMITS.excellent) return 'brilliant';

  // Missed win: was heavily winning (>+2.5) and dropped to near equal or worse
  if (isWhite && evalBefore >= 250 && evalAfter <= 50) return 'missedWin';
  if (!isWhite && evalBefore <= -250 && evalAfter >= -50) return 'missedWin';

  if (winPctDrop < CLASS_LIMITS.excellent) return 'excellent';
  if (winPctDrop < CLASS_LIMITS.good) return 'good';
  if (winPctDrop < CLASS_LIMITS.inaccuracy) return 'inaccuracy';
  if (winPctDrop < CLASS_LIMITS.mistake) return 'mistake';
  return 'blunder';
}

/**
 * Aggregates the moves of one player into the statistics shown in the dashboard. `allMoves` is the whole game,
 * used for the volatility weights of the accuracy.
 */
export function computePlayerStats(playerMoves: MoveAnalysis[], allMoves: MoveAnalysis[] = playerMoves): PlayerStats {
  let book = 0;
  let brilliant = 0;
  let great = 0;
  let best = 0;
  let excellent = 0;
  let good = 0;
  let inaccuracies = 0;
  let mistakes = 0;
  let blunders = 0;
  // Missed wins are counted with the blunders, so this stays at 0
  const missedWins = 0;
  let totalCpLoss = 0;
  let openingBlunders = 0;
  let middlegameBlunders = 0;
  let endgameBlunders = 0;

  for (const m of playerMoves) {
    totalCpLoss += m.centipawnLoss;

    // Classify game phase (approximate: ply < 20 Opening, 20-50 Middlegame, >= 50 Endgame)
    const isOpening = m.ply < 20;
    const isMiddlegame = m.ply >= 20 && m.ply < 50;

    switch (m.classification) {
      case 'book':
        book++;
        break;
      case 'best':
        best++;
        break;
      case 'brilliant':
        brilliant++;
        break;
      case 'great':
        great++;
        break;
      case 'excellent':
        excellent++;
        break;
      case 'good':
        good++;
        break;
      case 'inaccuracy':
        inaccuracies++;
        break;
      case 'mistake':
        mistakes++;
        if (isOpening) openingBlunders++;
        else if (isMiddlegame) middlegameBlunders++;
        else endgameBlunders++;
        break;
      case 'blunder':
      case 'missedWin':
        blunders++;
        if (isOpening) openingBlunders++;
        else if (isMiddlegame) middlegameBlunders++;
        else endgameBlunders++;
        break;
    }
  }

  const totalMoves = playerMoves.length || 1;
  const avgCentipawnLoss = Math.round(totalCpLoss / totalMoves);

  // Calculate think time metrics if available
  const movesWithThink = playerMoves.filter((m) => m.thinkTimeSeconds !== undefined);
  const avgThinkTimeSeconds =
    movesWithThink.length > 0
      ? Math.round(movesWithThink.reduce((a, b) => a + (b.thinkTimeSeconds || 0), 0) / movesWithThink.length)
      : undefined;
  const longThinksCount = playerMoves.filter((m) => m.isLongThink).length;
  const rushedMovesCount = playerMoves.filter((m) => m.isRushed).length;

  const accuracy = accuracyFromMoves(playerMoves, allMoves);

  return {
    accuracy,
    totalMoves,
    book,
    brilliant,
    great,
    best,
    excellent,
    good,
    inaccuracies,
    mistakes,
    blunders,
    missedWins,
    avgCentipawnLoss,
    openingBlunders,
    middlegameBlunders,
    endgameBlunders,
    avgThinkTimeSeconds,
    longThinksCount,
    rushedMovesCount,
  };
}
