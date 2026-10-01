import { MoveClassification, PlayerStats, MoveAnalysis } from '../types/chess';

/** Rating of each side, when the PGN gives it. */
export interface PlayerElos {
  w?: number;
  b?: number;
}

/** A rating from a PGN header ("1672"), or undefined when it is missing or not a positive number. */
export function parseElo(value: string | number | undefined): number | undefined {
  const elo = typeof value === 'number' ? value : parseInt(value ?? '', 10);
  return Number.isFinite(elo) && elo > 0 ? elo : undefined;
}

const DEFAULT_ELO = 1500;
const LICHESS_COEFFICIENT = 0.00368208;
// Fitted on 14 players of 7 chess.com game reviews (Elo 100 to 1757): their curve is steeper than Lichess'
// and gets slightly steeper as the rating grows (a strong player is held to a higher standard).
const BASE_SLOPE = 1.5;
const ELO_EXPONENT = 0.15;

/** How much steeper than Lichess' curve the Win% is for a player of this rating (1500 when unknown). */
export function eloSlope(elo?: number): number {
  const clamped = Math.min(3000, Math.max(100, elo ?? DEFAULT_ELO));
  return BASE_SLOPE * Math.pow(clamped / DEFAULT_ELO, ELO_EXPONENT);
}

/**
 * Win probability (0-100) of White from a centipawn score (White's perspective), for a player of the given
 * rating. Lichess' logistic curve, made steeper (see `eloSlope`), with the score clamped to ±1000 cp. It is
 * the only curve of the app: the classification thresholds and the accuracy below are both calibrated on it.
 */
export function calculateWinPercentage(cp: number, elo?: number): number {
  const clampedCp = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-LICHESS_COEFFICIENT * eloSlope(elo) * clampedCp)) - 1);
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

/** Accuracy of one analysed move, for a mover of the given rating; falls back to the centipawn loss without evaluations. */
export function moveAccuracy(m: EvaluatedMove, elo?: number): number {
  if (typeof m.evalBefore === 'number' && typeof m.evalAfter === 'number') {
    const before = calculateWinPercentage(m.evalBefore, elo);
    const after = calculateWinPercentage(m.evalAfter, elo);
    return accuracyFromWinDrop(m.color === 'w' ? before - after : after - before);
  }
  return accuracyFromWinDrop(calculateWinPercentage(m.centipawnLoss, elo) - 50);
}

/** A single move can pull the harmonic mean down only so far (a mate blunder is already one lost game). */
const HARMONIC_FLOOR = 5;

/**
 * Accuracy (0-100, one decimal) of a set of moves of one player: the harmonic mean of the per-move accuracies.
 * Unlike a plain average it does not hide an isolated blunder among many good moves. Of the aggregations tried
 * (plain, volatility-weighted as on Lichess, harmonic, and mixes) it was the closest to chess.com's figures.
 */
export function accuracyFromMoves(moves: MoveAnalysis[], elo?: number): number {
  if (moves.length === 0) return 100;
  const inverseSum = moves.reduce((sum, m) => sum + 1 / Math.max(moveAccuracy(m, elo), HARMONIC_FLOOR), 0);
  return Math.round((moves.length / inverseSum) * 10) / 10;
}

/**
 * Win% (0-100 points) a move may give away for each class: chess.com's expected-points limits (0.02, 0.05,
 * 0.10, 0.20), lowered by a fifth so that the moves counted as inaccuracies, mistakes and blunders over the
 * 14 reference players come close to chess.com's counts (126 against 136; with its own limits: 111).
 */
export const CLASS_LIMITS = { best: 0.5, excellent: 1.5, good: 4, inaccuracy: 8, mistake: 16 } as const;

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
 * Aggregates the moves of one player into the statistics shown in the dashboard. `elo` is the player's rating, if known.
 */
export function computePlayerStats(playerMoves: MoveAnalysis[], elo?: number): PlayerStats {
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

  const accuracy = accuracyFromMoves(playerMoves, elo);

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
