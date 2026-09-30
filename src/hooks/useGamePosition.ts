import { useMemo } from 'react';
import { Chess } from 'chess.js';
import { GameAnalysisResult } from '../types/chess';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Position data for the move at `currentPly`: the move itself, the previous one, the FEN after it
 * and the FEN that would have resulted from playing Stockfish's best move instead.
 */
export function useGamePosition(analysis: GameAnalysisResult | null, currentPly: number) {
  const activeMove = useMemo(() => {
    if (!analysis || currentPly < 0) return null;
    return analysis.moves[currentPly] || null;
  }, [analysis, currentPly]);

  const previousMove = useMemo(() => {
    if (!analysis || currentPly <= 0) return null;
    return analysis.moves[currentPly - 1] || null;
  }, [analysis, currentPly]);

  const { currentFen, alternativeFen } = useMemo(() => {
    if (!activeMove) return { currentFen: START_FEN, alternativeFen: null };

    let altFen: string | null = null;
    if (activeMove.bestMoveUci && activeMove.bestMoveUci.length >= 4) {
      try {
        const altChess = new Chess(activeMove.fenBefore);
        altChess.move({
          from: activeMove.bestMoveUci.substring(0, 2),
          to: activeMove.bestMoveUci.substring(2, 4),
          promotion: activeMove.bestMoveUci.length > 4 ? activeMove.bestMoveUci[4] : undefined,
        });
        altFen = altChess.fen();
      } catch {
        altFen = null;
      }
    }
    return { currentFen: activeMove.fenAfter, alternativeFen: altFen };
  }, [activeMove]);

  return { activeMove, previousMove, currentFen, alternativeFen };
}
