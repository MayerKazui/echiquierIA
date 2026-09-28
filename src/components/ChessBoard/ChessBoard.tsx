import React, { useMemo } from 'react';
import { Chess, Square } from 'chess.js';
import { ChessPiece } from './ChessPieces';

interface ChessBoardProps {
  fen: string;
  isFlipped?: boolean;
  lastMove?: { from: string; to: string; classification?: string } | null;
  bestMove?: { from: string; to: string } | null;
  showArrows?: boolean;
  onSquareClick?: (square: string) => void;
  selectedSquare?: string | null;
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  fen,
  isFlipped = false,
  lastMove = null,
  bestMove = null,
  showArrows = true,
  onSquareClick,
  selectedSquare = null,
}) => {
  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const board = useMemo(() => chess.board(), [chess]);

  // King in check square
  const checkSquare = useMemo(() => {
    if (chess.inCheck()) {
      const turn = chess.turn();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (piece && piece.type === 'k' && piece.color === turn) {
            const file = String.fromCharCode('a'.charCodeAt(0) + c);
            const rank = (8 - r).toString();
            return `${file}${rank}`;
          }
        }
      }
    }
    return null;
  }, [chess, board]);

  const files = useMemo(() => {
    const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    return isFlipped ? [...list].reverse() : list;
  }, [isFlipped]);

  const ranks = useMemo(() => {
    const list = [8, 7, 6, 5, 4, 3, 2, 1];
    return isFlipped ? [...list].reverse() : list;
  }, [isFlipped]);

  // Coordinate helper: square "e4" -> { x, y } in 0..100% SVG coordinates
  const squareToPercent = (sq: string) => {
    if (!sq || sq.length < 2) return { x: 50, y: 50 };
    const f = sq[0];
    const r = parseInt(sq[1], 10);
    const fIdx = files.indexOf(f);
    const rIdx = ranks.indexOf(r);
    return {
      x: (fIdx + 0.5) * 12.5,
      y: (rIdx + 0.5) * 12.5,
    };
  };

  // Played move arrow color
  const playedArrowColor = useMemo(() => {
    if (!lastMove?.classification) return '#38bdf8';
    switch (lastMove.classification) {
      case 'blunder':
      case 'missedWin':
        return '#f43f5e'; // red-500
      case 'mistake':
        return '#f97316'; // orange-500
      case 'inaccuracy':
        return '#eab308'; // yellow-500
      case 'best':
      case 'brilliant':
        return '#10b981'; // emerald-500
      case 'book':
        return '#a855f7'; // purple-500 for theoretical book moves
      default:
        return '#38bdf8'; // sky-400
    }
  }, [lastMove?.classification]);

  return (
    <div className="relative w-full max-w-[500px] aspect-square select-none rounded-xl overflow-hidden shadow-2xl border-2 sm:border-4 border-slate-800 bg-slate-900 mx-auto">
      {/* 8x8 Board Grid */}
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
        {ranks.map((rank) =>
          files.map((file) => {
            const squareName = `${file}${rank}` as Square;
            const fileIdx = file.charCodeAt(0) - 'a'.charCodeAt(0);
            const rankIdx = 8 - rank;
            const isLight = (fileIdx + rankIdx) % 2 === 0;

            const piece = board[rankIdx]?.[fileIdx];

            const isLastMoveFrom = lastMove?.from === squareName;
            const isLastMoveTo = lastMove?.to === squareName;
            const isBestMoveTo = bestMove?.to === squareName;
            const isSelected = selectedSquare === squareName;
            const isKingInCheck = checkSquare === squareName;

            let squareBg = isLight ? 'bg-[#edeed1]' : 'bg-[#779952]';

            if (isLastMoveFrom || isLastMoveTo) {
              squareBg = isLight ? 'bg-[#f5f682]' : 'bg-[#b9ca43]';
            }
            if (isSelected) {
              squareBg = 'bg-amber-300/80';
            }

            // Detect if this piece was moved in the current move (including castling rook)
            let moveAnimationFrom: string | null = null;
            if (isLastMoveTo && lastMove?.from) {
              moveAnimationFrom = lastMove.from;
            } else if (lastMove?.from === 'e1' && lastMove?.to === 'g1' && squareName === 'f1') {
              moveAnimationFrom = 'h1';
            } else if (lastMove?.from === 'e1' && lastMove?.to === 'c1' && squareName === 'd1') {
              moveAnimationFrom = 'a1';
            } else if (lastMove?.from === 'e8' && lastMove?.to === 'g8' && squareName === 'f8') {
              moveAnimationFrom = 'h8';
            } else if (lastMove?.from === 'e8' && lastMove?.to === 'c8' && squareName === 'd8') {
              moveAnimationFrom = 'a8';
            }

            let animationStyle: React.CSSProperties = {};
            if (moveAnimationFrom && moveAnimationFrom.length === 2) {
              const fromCol = files.indexOf(moveAnimationFrom[0]);
              const fromRow = ranks.indexOf(parseInt(moveAnimationFrom[1], 10));
              const toCol = files.indexOf(file);
              const toRow = ranks.indexOf(rank);

              if (fromCol !== -1 && fromRow !== -1 && toCol !== -1 && toRow !== -1) {
                animationStyle = {
                  '--delta-x': `${(fromCol - toCol) * 100}%`,
                  '--delta-y': `${(fromRow - toRow) * 100}%`,
                } as React.CSSProperties;
              }
            }

            return (
              <div
                key={squareName}
                className={`relative flex items-center justify-center cursor-pointer transition-colors duration-100 ${squareBg}`}
                onClick={() => onSquareClick?.(squareName)}
              >
                {/* King in check red ring */}
                {isKingInCheck && (
                  <div className="absolute inset-0 bg-rose-500/40 rounded-sm animate-pulse z-0" />
                )}

                {/* Best move destination subtle indicator */}
                {bestMove && isBestMoveTo && (
                  <div className="absolute inset-1.5 rounded-full border-2 border-emerald-400/80 pointer-events-none z-10" />
                )}

                {/* Rank notation (on left edge) */}
                {file === files[0] && (
                  <span
                    className={`absolute top-0.5 left-1 text-[10px] font-bold pointer-events-none select-none ${
                      isLight ? 'text-[#779952]' : 'text-[#edeed1]'
                    }`}
                  >
                    {rank}
                  </span>
                )}

                {/* File notation (on bottom edge) */}
                {rank === ranks[7] && (
                  <span
                    className={`absolute bottom-0.5 right-1 text-[10px] font-bold pointer-events-none select-none ${
                      isLight ? 'text-[#779952]' : 'text-[#edeed1]'
                    }`}
                  >
                    {file}
                  </span>
                )}

                {/* Animated Chess piece */}
                {piece && (
                  <div
                    key={`${squareName}-${lastMove?.from}-${lastMove?.to}`}
                    className={`relative w-[84%] h-[84%] z-10 pointer-events-none ${
                      moveAnimationFrom ? 'animate-piece-slide' : ''
                    }`}
                    style={animationStyle}
                  >
                    <ChessPiece type={piece.type} color={piece.color} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* SVG Overlay for Directional Arrows */}
      {showArrows && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full pointer-events-none z-20"
        >
          <defs>
            {/* Arrow marker for played move */}
            <marker
              id="playedArrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill={playedArrowColor} />
            </marker>

            {/* Arrow marker for Stockfish best move */}
            <marker
              id="bestArrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
          </defs>

          {/* Played Move Arrow (if not best move) */}
          {lastMove && lastMove.from && lastMove.to && (
            (() => {
              const start = squareToPercent(lastMove.from);
              const end = squareToPercent(lastMove.to);
              return (
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={playedArrowColor}
                  strokeWidth="2.2"
                  strokeOpacity="0.75"
                  strokeLinecap="round"
                  markerEnd="url(#playedArrow)"
                />
              );
            })()
          )}

          {/* Stockfish Best Move Arrow (in bright emerald green) */}
          {bestMove &&
            bestMove.from &&
            bestMove.to &&
            (!lastMove || lastMove.from !== bestMove.from || lastMove.to !== bestMove.to) && (
              (() => {
                const start = squareToPercent(bestMove.from);
                const end = squareToPercent(bestMove.to);
                return (
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeOpacity="0.85"
                    strokeDasharray="4 2"
                    strokeLinecap="round"
                    markerEnd="url(#bestArrow)"
                  />
                );
              })()
            )}
        </svg>
      )}
    </div>
  );
};
