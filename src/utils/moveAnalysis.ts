import { MoveClassification, PlayerStats, MoveAnalysis } from '../types/chess';

/**
 * Win probability (0-100) of White from a centipawn score (White's perspective).
 * Logistic curve, with the score clamped to ±1000 cp.
 */
export function calculateWinPercentage(cp: number): number {
  const clampedCp = Math.max(-1000, Math.min(1000, cp));
  return 100 / (1 + Math.pow(10, -clampedCp / 400));
}

/**
 * Accuracy (25-99.4) from an average centipawn loss: a CAPS-like precision curve,
 * 100 * exp(-0.0038 * avgCpLoss).
 */
export function accuracyFromCpLoss(avgCpLoss: number): number {
  const raw = 100 * Math.exp(-0.0038 * avgCpLoss);
  return Math.min(99.4, Math.max(25.0, Math.round(raw * 10) / 10));
}

/** Classifies a move from the Win% drop and centipawn loss it caused. */
export function classifyMove(
  isWhite: boolean,
  playedSan: string,
  bestSan: string,
  cpLoss: number,
  winPctDrop: number,
  evalBefore: number,
  evalAfter: number,
  isSacrifice = false
): MoveClassification {
  // Identical to the best move (or practically as good)
  if (playedSan === bestSan || cpLoss <= 10) {
    if (isSacrifice && cpLoss <= 15) {
      return 'brilliant';
    }
    return 'best';
  }

  // Missed win: was heavily winning (>+2.5) and dropped to near equal or worse
  if (isWhite && evalBefore >= 250 && evalAfter <= 50) return 'missedWin';
  if (!isWhite && evalBefore <= -250 && evalAfter >= -50) return 'missedWin';

  // Blunder (Gaffe): huge drop
  if (winPctDrop >= 18 || cpLoss >= 200) return 'blunder';

  // Mistake (Erreur)
  if (winPctDrop >= 9 || cpLoss >= 90) return 'mistake';

  // Inaccuracy (Imprécision)
  if (winPctDrop >= 4 || cpLoss >= 45) return 'inaccuracy';

  // Excellent / Good
  if (cpLoss <= 25) return 'excellent';

  return 'good';
}

/** Aggregates the moves of one player into the statistics shown in the dashboard. */
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
  const avgThinkTimeSeconds = movesWithThink.length > 0
    ? Math.round(movesWithThink.reduce((a, b) => a + (b.thinkTimeSeconds || 0), 0) / movesWithThink.length)
    : undefined;
  const longThinksCount = playerMoves.filter((m) => m.isLongThink).length;
  const rushedMovesCount = playerMoves.filter((m) => m.isRushed).length;

  const accuracy = accuracyFromCpLoss(avgCentipawnLoss);

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
