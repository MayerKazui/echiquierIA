import { useMemo } from 'react';
import { MoveAnalysis } from '../types/chess';
import { ThreatsMode } from '../types/ui';
import { analyzeTacticalThreatsForMove } from '../utils/tacticalThreats';

/** Board arrows (played vs best move) and tactical threats for the active move. */
export function useMoveAnnotations(
  activeMove: MoveAnalysis | null,
  threatsMode: ThreatsMode,
  isPreviewingAlternative: boolean
) {
  const arrows = useMemo(() => {
    if (!activeMove) return { lastMove: null, bestMove: null };
    return {
      lastMove: { from: activeMove.from, to: activeMove.to, classification: activeMove.classification },
      bestMove:
        activeMove.bestMoveFrom && activeMove.bestMoveTo
          ? { from: activeMove.bestMoveFrom, to: activeMove.bestMoveTo }
          : null,
    };
  }, [activeMove]);

  const threats = useMemo(() => {
    if (!activeMove) return { suggestionThreats: [], playedThreats: [], activeThreats: [] };

    const suggestionThreats = activeMove.bestMoveUci
      ? analyzeTacticalThreatsForMove(activeMove.fenBefore, activeMove.bestMoveUci)
      : [];
    const playedThreats = activeMove.uci
      ? analyzeTacticalThreatsForMove(activeMove.fenBefore, activeMove.uci)
      : [];

    const effectiveMode = isPreviewingAlternative ? 'suggestion' : threatsMode;
    return {
      suggestionThreats,
      playedThreats,
      activeThreats: effectiveMode === 'suggestion' ? suggestionThreats : playedThreats,
    };
  }, [activeMove, threatsMode, isPreviewingAlternative]);

  return { arrows, ...threats };
}
