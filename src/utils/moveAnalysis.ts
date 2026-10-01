import { MoveClassification, PlayerStats, MoveAnalysis } from '../types/chess';

const LICHESS_COEFFICIENT = 0.00368208;
// The three constants below were fitted on 66 public chess.com games (132 players, 160 to 3300 Elo) whose
// accuracy is published by chess.com: see IMPROVEMENTS.md. Held-out error: 3.7 points on average.
/** The curve is flatter than Lichess' (0.6 times its slope): a won position is worth less than it looks. */
const WIN_CURVE_SLOPE = 0.6;
/** The accuracy of a move decays 2.5 times faster with the Win% given away than in Lichess' formula. */
const DECAY = 0.04354 * 2.5;
/** A single move can pull the mean down only so far (a mate blunder is already one lost game). */
const MOVE_FLOOR = 5;

/**
 * Win probability (0-100) of White from a centipawn score (White's perspective). Lichess' logistic curve,
 * flattened (see `WIN_CURVE_SLOPE`), with the score clamped to ±1000 cp. It is the only curve of the app:
 * the classification thresholds and the accuracy below are both calibrated on it.
 */
export function calculateWinPercentage(cp: number): number {
  const clampedCp = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-LICHESS_COEFFICIENT * WIN_CURVE_SLOPE * clampedCp)) - 1);
}

/**
 * Accuracy (0-100) of a single move from the Win% it gave away: Lichess' formula (with its small
 * "uncertainty bonus"), decaying faster. Based on the win probability rather than on raw centipawns, so a
 * blunder or a mate score weighs at most "the whole game lost", never thousands of centipawns.
 */
export function accuracyFromWinDrop(winPctDrop: number): number {
  const raw = 103.1668 * Math.exp(-DECAY * Math.max(0, winPctDrop)) - 3.1669 + 1;
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

/**
 * Accuracy (0-100, one decimal) of a set of moves of one player: the geometric mean of the per-move accuracies
 * (each at least `MOVE_FLOOR`). Unlike a plain average it does not hide an isolated blunder among many good
 * moves, and unlike a harmonic mean it is not dominated by it. Of the aggregations tried (arithmetic,
 * volatility-weighted as on Lichess, harmonic, power means) it was the simplest of those closest to chess.com.
 */
export function accuracyFromMoves(moves: MoveAnalysis[]): number {
  if (moves.length === 0) return 100;
  const logSum = moves.reduce((sum, m) => sum + Math.log(Math.max(moveAccuracy(m), MOVE_FLOOR)), 0);
  return Math.round(Math.exp(logSum / moves.length) * 10) / 10;
}

/**
 * Win% (0-100 points) a move may give away for each class. They follow chess.com's expected-points limits
 * (0.05, 0.10 and 0.20 for inaccuracies, mistakes and blunders) on this flatter curve, and were fitted so that the
 * moves counted in each class over 14 chess.com reference players come close to chess.com's counts.
 */
export const CLASS_LIMITS = { best: 0.3, excellent: 1.2, good: 4, inaccuracy: 8, mistake: 20 } as const;

/**
 * A "miss" (chess.com's "Manqué"): a move that does not punish a mistake of the opponent. The opponent's previous
 * move gave away at least `opponentDrop` points and this one gives away at least `ownDrop`: the advantage that was
 * offered is not taken. Fitted on the same reference players: 27 against 28 for chess.com.
 */
export const MISS_LIMITS = { opponentDrop: 8, ownDrop: 5 } as const;

/**
 * Classifies a move from the Win% it gave away (from the mover's point of view, in points).
 * `previousOpponentDrop` is what the opponent's move just before gave away: it tells a miss from a plain error.
 */
export function classifyMove(
  playedSan: string,
  bestSan: string,
  winPctDrop: number,
  isSacrifice = false,
  previousOpponentDrop = 0
): MoveClassification {
  // The engine's move, or one as good within its noise
  if (playedSan === bestSan || winPctDrop <= CLASS_LIMITS.best) return 'best';

  // A sacrifice that gives away practically nothing
  if (isSacrifice && winPctDrop <= CLASS_LIMITS.excellent) return 'brilliant';

  if (winPctDrop < CLASS_LIMITS.excellent) return 'excellent';
  if (winPctDrop < CLASS_LIMITS.good) return 'good';

  // The opponent has just offered something and it is not taken
  if (previousOpponentDrop >= MISS_LIMITS.opponentDrop && winPctDrop >= MISS_LIMITS.ownDrop) return 'missedWin';

  if (winPctDrop < CLASS_LIMITS.inaccuracy) return 'inaccuracy';
  if (winPctDrop < CLASS_LIMITS.mistake) return 'mistake';
  return 'blunder';
}

/**
 * Aggregates the moves of one player into the statistics shown in the dashboard.
 */
export function computePlayerStats(playerMoves: MoveAnalysis[]): PlayerStats {
  let book = 0;
  let brilliant = 0;
  let great = 0;
  let best = 0;
  let excellent = 0;
  let good = 0;
  let inaccuracies = 0;
  let mistakes = 0;
  let blunders = 0;
  let missedWins = 0;
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
        // A miss is counted apart from the blunders (as chess.com does) but is still a fault of its phase
        if (m.classification === 'missedWin') missedWins++;
        else blunders++;
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

  const accuracy = accuracyFromMoves(playerMoves);

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
