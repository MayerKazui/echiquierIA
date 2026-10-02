import { useCallback, useEffect, useState } from 'react';
import { Chess, Square } from 'chess.js';
import { stockfishService } from '../services/stockfishEngine';
import { chessAudio } from '../utils/chessAudio';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

/** A pawn move that reaches the last rank, waiting for the choice of the new piece. */
export interface PendingPromotion {
  from: string;
  to: string;
  color: 'w' | 'b';
}

interface SandboxMove {
  san: string;
  from: string;
  to: string;
  fen: string;
}

/**
 * Free exploration ("Et si j'avais joué... ?"): the user plays moves on the board from the
 * displayed position. `baseFen` is the position shown when no exploration is in progress.
 */
export function useSandbox(
  baseFen: string,
  { onEnter, onMove }: { onEnter?: () => void; onMove?: (san: string) => void } = {}
) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [isSandboxMode, setIsSandboxMode] = useState(false);
  const [history, setHistory] = useState<SandboxMove[]>([]);
  const [evaluation, setEvaluation] = useState<{ cp: number; mate: number | null }>({ cp: 0, mate: null });

  const lastMove = history.length > 0 ? history[history.length - 1] : null;
  const sandboxFen = isSandboxMode && lastMove ? lastMove.fen : null;
  const activeFen = sandboxFen ?? baseFen;

  // Real-time evaluation of the explored position
  useEffect(() => {
    if (!sandboxFen) return;
    let isCancelled = false;
    stockfishService
      .evaluatePosition(sandboxFen, 10)
      .then((res) => {
        if (!isCancelled) setEvaluation({ cp: res.cp, mate: res.mate });
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [sandboxFen]);

  const loadActivePosition = useCallback((): Chess => {
    try {
      return new Chess(activeFen);
    } catch {
      return new Chess();
    }
  }, [activeFen]);

  /**
   * Plays from -> to on the active position; returns false if the move is illegal. A promotion waits for the
   * choice of the piece (`pendingPromotion`) unless `promotion` is given.
   */
  const tryMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece): boolean => {
      const chess = loadActivePosition();
      try {
        const candidates = chess.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
        if (candidates.length === 0) return false;
        if (candidates[0].isPromotion() && !promotion) {
          setPendingPromotion({ from, to, color: candidates[0].color });
          return true;
        }
        const move = chess.move({ from, to, promotion });
        if (!move) return false;
        chessAudio.playForMove(move.san, move.san.includes('+') || move.san.includes('#'));
        setSelectedSquare(null);
        setPendingPromotion(null);
        setHistory((prev) => [...prev, { san: move.san, from: move.from, to: move.to, fen: chess.fen() }]);
        setIsSandboxMode(true);
        onEnter?.();
        onMove?.(move.san);
        return true;
      } catch {
        return false; // Illegal move ignored
      }
    },
    [loadActivePosition, onEnter, onMove]
  );

  const choosePromotion = useCallback(
    (piece: PromotionPiece) => {
      if (pendingPromotion) tryMove(pendingPromotion.from, pendingPromotion.to, piece);
    },
    [pendingPromotion, tryMove]
  );
  const cancelPromotion = useCallback(() => setPendingPromotion(null), []);

  // Click-to-move: select a piece of the side to move, then click its destination
  const handleSquareClick = useCallback(
    (square: string) => {
      if (selectedSquare === square) {
        setSelectedSquare(null); // a second click on the selected piece puts it down
        return;
      }
      if (selectedSquare && tryMove(selectedSquare, square)) return;
      const chess = loadActivePosition();
      const piece = chess.get(square as Square);
      setSelectedSquare(piece && piece.color === chess.turn() ? square : null);
    },
    [selectedSquare, tryMove, loadActivePosition]
  );

  const handlePieceMove = useCallback(
    (from: string, to: string): boolean => from !== to && tryMove(from, to),
    [tryMove]
  );

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length <= 1) {
        setIsSandboxMode(false);
        return [];
      }
      return prev.slice(0, -1);
    });
    setSelectedSquare(null);
    setPendingPromotion(null);
  }, []);

  const exit = useCallback(() => {
    setIsSandboxMode(false);
    setHistory([]);
    setSelectedSquare(null);
    setPendingPromotion(null);
  }, []);

  return {
    isSandboxMode,
    history,
    lastMove,
    evaluation,
    selectedSquare,
    pendingPromotion,
    choosePromotion,
    cancelPromotion,
    activeFen,
    handleSquareClick,
    handlePieceMove,
    undo,
    exit,
  };
}
