import { useCallback, useState } from 'react';
import { Chess, Square } from 'chess.js';
import type { PendingPromotion, PromotionPiece } from './useSandbox';

/**
 * Moves entered on the board of a study: click-to-move, drag and the choice of the piece for a promotion. The
 * move itself is decided by `onMove`, which returns false to refuse it (the piece goes back to its square).
 */
export function useMoveInput(fen: string, onMove: (from: string, to: string, promotion?: PromotionPiece) => boolean) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const tryMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece): boolean => {
      let candidates;
      try {
        candidates = new Chess(fen).moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
      } catch {
        return false;
      }
      if (candidates.length === 0) return false;
      if (candidates[0].isPromotion() && !promotion) {
        setPendingPromotion({ from, to, color: candidates[0].color });
        return true;
      }
      setSelectedSquare(null);
      setPendingPromotion(null);
      return onMove(from, to, promotion);
    },
    [fen, onMove]
  );

  const handleSquareClick = useCallback(
    (square: string) => {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }
      if (selectedSquare && tryMove(selectedSquare, square)) return;
      let piece;
      let turn;
      try {
        const chess = new Chess(fen);
        piece = chess.get(square as Square);
        turn = chess.turn();
      } catch {
        return;
      }
      setSelectedSquare(piece && piece.color === turn ? square : null);
    },
    [fen, selectedSquare, tryMove]
  );

  const handlePieceMove = useCallback((from: string, to: string) => from !== to && tryMove(from, to), [tryMove]);

  const choosePromotion = useCallback(
    (piece: PromotionPiece) => {
      if (pendingPromotion) tryMove(pendingPromotion.from, pendingPromotion.to, piece);
    },
    [pendingPromotion, tryMove]
  );

  const cancelPromotion = useCallback(() => setPendingPromotion(null), []);

  const reset = useCallback(() => {
    setSelectedSquare(null);
    setPendingPromotion(null);
  }, []);

  return {
    selectedSquare,
    pendingPromotion,
    handleSquareClick,
    handlePieceMove,
    choosePromotion,
    cancelPromotion,
    reset,
  };
}
