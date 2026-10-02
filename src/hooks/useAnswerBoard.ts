import { useCallback, useState } from 'react';
import { Chess, Square } from 'chess.js';
import { chessAudio } from '../utils/chessAudio';
import type { PendingPromotion, PromotionPiece } from './useSandbox';

export interface Answer {
  uci: string;
  san: string;
  from: string;
  to: string;
}

/**
 * Entering one move on a position (click a piece then its square, or drag it), for an exercise: the move is
 * handed over to `onAnswer` instead of being played on the board. Nothing is accepted while `isEnabled` is false.
 * The state starts afresh with the component: give it a new `key` for a new position.
 */
export function useAnswerBoard(fen: string, isEnabled: boolean, onAnswer: (answer: Answer) => void) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const tryMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece): boolean => {
      if (!isEnabled) return false;
      try {
        const chess = new Chess(fen);
        const candidates = chess.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
        if (candidates.length === 0) return false;
        if (candidates[0].isPromotion() && !promotion) {
          setPendingPromotion({ from, to, color: candidates[0].color });
          return true;
        }
        const move = chess.move({ from, to, promotion });
        chessAudio.playForMove(move.san, chess.isCheck());
        setSelectedSquare(null);
        setPendingPromotion(null);
        onAnswer({ uci: `${move.from}${move.to}${move.promotion ?? ''}`, san: move.san, from: move.from, to: move.to });
        return true;
      } catch {
        return false; // Illegal move: ignored
      }
    },
    [fen, isEnabled, onAnswer]
  );

  const handleSquareClick = useCallback(
    (square: string) => {
      if (!isEnabled) return;
      if (selectedSquare === square) {
        setSelectedSquare(null); // a second click on the selected piece puts it down
        return;
      }
      if (selectedSquare && tryMove(selectedSquare, square)) return;
      try {
        const chess = new Chess(fen);
        const piece = chess.get(square as Square);
        setSelectedSquare(piece && piece.color === chess.turn() ? square : null);
      } catch {
        setSelectedSquare(null);
      }
    },
    [fen, isEnabled, selectedSquare, tryMove]
  );

  const handlePieceMove = useCallback(
    (from: string, to: string) => {
      if (from !== to) tryMove(from, to);
    },
    [tryMove]
  );

  const choosePromotion = useCallback(
    (piece: PromotionPiece) => {
      if (pendingPromotion) tryMove(pendingPromotion.from, pendingPromotion.to, piece);
    },
    [pendingPromotion, tryMove]
  );
  const cancelPromotion = useCallback(() => setPendingPromotion(null), []);

  return {
    selectedSquare: isEnabled ? selectedSquare : null,
    pendingPromotion,
    handleSquareClick,
    handlePieceMove,
    choosePromotion,
    cancelPromotion,
  };
}
