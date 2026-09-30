import React, { useState, useMemo, useRef } from 'react';
import { Chess, Square } from 'chess.js';
import { ChessPiece } from './ChessPieces';
import { ArrowsOverlay } from './ArrowsOverlay';
import { HeatmapSquareOverlay, heatmapSquareTitle } from './HeatmapOverlay';
import { ThreatBadge, ThreatTarget, ThreatTooltip } from './ThreatMarkers';
import { getSquareStyle } from './boardTheme';
import { useBoardDrawing } from './useBoardDrawing';
import { TacticalThreat } from '../../utils/tacticalThreats';
import { computeBoardHeatmap } from '../../utils/chessHeatmap';
import { BoardTheme, HeatmapMode } from '../../types/ui';

interface ChessBoardProps {
  fen: string;
  isFlipped?: boolean;
  boardTheme?: BoardTheme;
  lastMove?: { from: string; to: string; classification?: string } | null;
  bestMove?: { from: string; to: string } | null;
  showArrows?: boolean;
  tacticalThreats?: TacticalThreat[];
  showThreats?: boolean;
  showHeatmap?: boolean;
  heatmapMode?: HeatmapMode;
  onSquareClick?: (square: string) => void;
  onPieceMove?: (from: string, to: string) => void;
  selectedSquare?: string | null;
  maxWidthClass?: string;
  className?: string;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

// Castling: the rook slides too, so the square it lands on animates from its corner
const CASTLING_ROOK_FROM: Record<string, string> = {
  'e1-g1-f1': 'h1',
  'e1-c1-d1': 'a1',
  'e8-g8-f8': 'h8',
  'e8-c8-d8': 'a8',
};

const OPTIMAL_CLASSIFICATIONS = ['best', 'brilliant', 'great', 'excellent', 'good', 'book'];

function getPlayedArrowColor(classification?: string): string {
  switch (classification) {
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
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  fen,
  isFlipped = false,
  boardTheme = 'green',
  lastMove = null,
  bestMove = null,
  showArrows = true,
  tacticalThreats = [],
  showThreats = true,
  showHeatmap = false,
  heatmapMode,
  onSquareClick,
  onPieceMove,
  selectedSquare = null,
  maxWidthClass,
  className,
}) => {
  const effectiveHeatmapMode: HeatmapMode = heatmapMode ?? (showHeatmap ? 'both' : 'none');
  const isHeatmapActive = effectiveHeatmapMode !== 'none';

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const heatmap = useMemo(() => (isHeatmapActive ? computeBoardHeatmap(fen) : null), [fen, isHeatmapActive]);
  const board = useMemo(() => chess.board(), [chess]);

  // King in check square
  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    const turn = chess.turn();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === turn) return `${FILES[c]}${8 - r}`;
      }
    }
    return null;
  }, [chess, board]);

  const files = useMemo(() => (isFlipped ? [...FILES].reverse() : FILES), [isFlipped]);
  const ranks = useMemo(() => (isFlipped ? [...RANKS].reverse() : RANKS), [isFlipped]);

  // Square "e4" -> { x, y } in 0..100 SVG coordinates
  const toPoint = (sq: string) => {
    if (!sq || sq.length < 2) return { x: 50, y: 50 };
    return {
      x: (files.indexOf(sq[0]) + 0.5) * 12.5,
      y: (ranks.indexOf(parseInt(sq[1], 10)) + 0.5) * 12.5,
    };
  };

  const playedArrowColor = useMemo(() => getPlayedArrowColor(lastMove?.classification), [lastMove?.classification]);
  const isPlayedMoveOptimal = Boolean(
    lastMove?.classification && OPTIMAL_CLASSIFICATIONS.includes(lastMove.classification)
  );
  const bestArrowColor = isPlayedMoveOptimal ? '#06b6d4' : '#10b981';

  // Group threats by target square
  const threatsByTargetSquare = useMemo(() => {
    const map: Record<string, TacticalThreat[]> = {};
    if (!showThreats) return map;
    for (const threat of tacticalThreats) {
      for (const sq of threat.targetSquare.split(',')) {
        (map[sq] ||= []).push(threat);
      }
    }
    return map;
  }, [tacticalThreats, showThreats]);

  // Legal moves for currently selected square
  const legalDestinations = useMemo(() => {
    if (!selectedSquare) return [];
    try {
      return chess.moves({ square: selectedSquare as Square, verbose: true }).map((m) => m.to as string);
    } catch {
      return [];
    }
  }, [chess, selectedSquare]);

  // Hovered tactical threat (for tooltip positioning)
  const [hoveredThreat, setHoveredThreat] = useState<{
    threat: TacticalThreat;
    fileColIdx: number;
    rankRowIdx: number;
  } | null>(null);

  // Drag and drop / touch drag
  const [draggedSquare, setDraggedSquare] = useState<string | null>(null);
  const touchOriginRef = useRef<string | null>(null);

  // Right-click arrows and highlights
  const drawing = useBoardDrawing(fen, (square) => Boolean(chess.get(square as Square)));

  const movePiece = (from: string, to: string) => {
    if (onPieceMove) onPieceMove(from, to);
    else onSquareClick?.(to);
  };

  const handleTouchStart = (square: string) => {
    const piece = chess.get(square as Square);
    if (piece && piece.color === chess.turn()) {
      touchOriginRef.current = square;
      onSquareClick?.(square);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchOriginRef.current) return;
    const touch = e.changedTouches[0];
    if (touch) {
      const elem = document.elementFromPoint(touch.clientX, touch.clientY);
      const targetSquare = elem?.closest('[data-square]')?.getAttribute('data-square');
      if (targetSquare && targetSquare !== touchOriginRef.current) {
        movePiece(touchOriginRef.current, targetSquare);
      }
    }
    touchOriginRef.current = null;
  };

  return (
    <div
      className={`relative w-full aspect-square select-none rounded-xl shadow-2xl border-2 sm:border-4 border-slate-800 bg-slate-900 mx-auto ${
        maxWidthClass ?? 'max-w-[500px]'
      } ${className ?? ''}`}
      onContextMenu={(e) => e.preventDefault()}
      onTouchEnd={handleTouchEnd}
    >
      {/* 8x8 Board Grid */}
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-lg overflow-hidden">
        {ranks.map((rank, rankRowIdx) =>
          files.map((file, fileColIdx) => {
            const squareName = `${file}${rank}` as Square;
            const fileIdx = file.charCodeAt(0) - 'a'.charCodeAt(0);
            const rankIdx = 8 - rank;
            const isLight = (fileIdx + rankIdx) % 2 === 0;
            const piece = board[rankIdx]?.[fileIdx];

            const isLastMoveTo = lastMove?.to === squareName;
            const isLastMove = lastMove?.from === squareName || isLastMoveTo;
            const isSelected = selectedSquare === squareName;

            const primaryThreat = threatsByTargetSquare[squareName]?.[0];
            const hasHighThreat = threatsByTargetSquare[squareName]?.some((t) => t.severity === 'high');

            const { squareBg, coordTextColor } = getSquareStyle(boardTheme, isLight, isLastMove);

            // Move animation: the moved piece slides from its origin square
            const moveAnimationFrom: string | null =
              isLastMoveTo && lastMove?.from
                ? lastMove.from
                : CASTLING_ROOK_FROM[`${lastMove?.from}-${lastMove?.to}-${squareName}`] ?? null;

            let animationStyle: React.CSSProperties = {};
            if (moveAnimationFrom && moveAnimationFrom.length === 2) {
              const fromCol = files.indexOf(moveAnimationFrom[0]);
              const fromRow = ranks.indexOf(parseInt(moveAnimationFrom[1], 10));
              if (fromCol !== -1 && fromRow !== -1) {
                animationStyle = {
                  '--delta-x': `${(fromCol - fileColIdx) * 100}%`,
                  '--delta-y': `${(fromRow - rankRowIdx) * 100}%`,
                } as React.CSSProperties;
              }
            }

            const canDragPiece = Boolean(piece && piece.color === chess.turn());

            return (
              <div
                key={squareName}
                data-square={squareName}
                title={
                  isHeatmapActive && heatmap
                    ? heatmapSquareTitle(squareName, effectiveHeatmapMode as Exclude<HeatmapMode, 'none'>, heatmap.squares[squareName])
                    : undefined
                }
                className={`relative flex items-center justify-center cursor-pointer transition-colors duration-100 ${
                  isSelected ? 'bg-amber-300/85 ring-2 ring-inset ring-amber-500' : squareBg
                }`}
                onClick={() => onSquareClick?.(squareName)}
                onMouseDown={(e) => drawing.onSquareMouseDown(squareName, e)}
                onMouseEnter={() => drawing.onSquareMouseEnter(squareName)}
                onMouseUp={(e) => drawing.onSquareMouseUp(squareName, e)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromSquare = e.dataTransfer.getData('text/plain') || draggedSquare;
                  setDraggedSquare(null);
                  if (fromSquare && fromSquare !== squareName) movePiece(fromSquare, squareName);
                }}
                onTouchStart={() => handleTouchStart(squareName)}
              >
                {/* King in check red ring */}
                {checkSquare === squareName && (
                  <div className="absolute inset-0 bg-rose-500/40 rounded-sm animate-pulse z-0" />
                )}

                {/* Heatmap space control overlay */}
                {isHeatmapActive && heatmap && (
                  <HeatmapSquareOverlay
                    ctrl={heatmap.squares[squareName]}
                    mode={effectiveHeatmapMode as Exclude<HeatmapMode, 'none'>}
                  />
                )}

                {/* User custom highlight circle (right-click toggle) */}
                {drawing.userHighlights.includes(squareName) && (
                  <div className="absolute inset-1 rounded-full border-3 sm:border-4 border-emerald-400/90 bg-emerald-400/25 pointer-events-none z-10 shadow-sm" />
                )}

                {/* Best move destination indicator (dashed circle) */}
                {bestMove && bestMove.to === squareName && (
                  <div
                    className={`absolute inset-1.5 rounded-full border-2 border-dashed ${
                      isPlayedMoveOptimal ? 'border-cyan-400/90' : 'border-emerald-400/90'
                    } pointer-events-none z-10`}
                  />
                )}

                {/* Legal move dots & capture rings (sandbox / interactive mode) */}
                {legalDestinations.includes(squareName) && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-15">
                    {piece ? (
                      <div className="w-[82%] h-[82%] rounded-full border-4 border-slate-900/40 ring-2 ring-amber-400/70" />
                    ) : (
                      <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-slate-900/35 ring-1 ring-white/30 shadow-sm" />
                    )}
                  </div>
                )}

                {/* Tactical target crosshair + badge (top-right) */}
                {primaryThreat && <ThreatTarget hasHighThreat={Boolean(hasHighThreat)} />}
                {primaryThreat && (
                  <ThreatBadge
                    threat={primaryThreat}
                    onToggle={() =>
                      setHoveredThreat((prev) =>
                        prev?.threat.id === primaryThreat.id ? null : { threat: primaryThreat, fileColIdx, rankRowIdx }
                      )
                    }
                    onHover={() => setHoveredThreat({ threat: primaryThreat, fileColIdx, rankRowIdx })}
                    onLeave={() => setHoveredThreat(null)}
                  />
                )}

                {/* Rank notation (left edge) and file notation (bottom edge) */}
                {file === files[0] && (
                  <span className={`absolute top-0.5 left-1 text-[10px] font-bold pointer-events-none select-none ${coordTextColor}`}>
                    {rank}
                  </span>
                )}
                {rank === ranks[7] && (
                  <span className={`absolute bottom-0.5 right-1 text-[10px] font-bold pointer-events-none select-none ${coordTextColor}`}>
                    {file}
                  </span>
                )}

                {/* Chess piece (draggable for free exploration & click-to-move) */}
                {piece && (
                  <div
                    key={`${squareName}-${lastMove?.from}-${lastMove?.to}`}
                    draggable={canDragPiece}
                    onDragStart={(e) => {
                      if (!canDragPiece) return;
                      e.dataTransfer.setData('text/plain', squareName);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggedSquare(squareName);
                      onSquareClick?.(squareName);
                    }}
                    onDragEnd={() => setDraggedSquare(null)}
                    className={`relative w-[84%] h-[84%] z-10 select-none ${
                      canDragPiece ? 'cursor-grab active:cursor-grabbing hover:scale-105 transition-transform' : 'pointer-events-none'
                    } ${draggedSquare === squareName ? 'opacity-40' : 'opacity-100'} ${
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

      <ArrowsOverlay
        toPoint={toPoint}
        lastMove={lastMove}
        bestMove={bestMove}
        showArrows={showArrows}
        playedArrowColor={playedArrowColor}
        bestArrowColor={bestArrowColor}
        tacticalThreats={tacticalThreats}
        showThreats={showThreats}
        userArrows={drawing.userArrows}
        draftArrow={drawing.draftArrow}
      />

      {hoveredThreat && (
        <ThreatTooltip
          threat={hoveredThreat.threat}
          fileColIdx={hoveredThreat.fileColIdx}
          rankRowIdx={hoveredThreat.rankRowIdx}
        />
      )}
    </div>
  );
};
