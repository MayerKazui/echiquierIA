import React, { useState, useMemo, useRef } from 'react';
import { Chess, Square } from 'chess.js';
import { ChessPiece } from './ChessPieces';
import { ArrowsOverlay } from './ArrowsOverlay';
import { HeatmapSquareOverlay, heatmapSquareTitle } from './HeatmapOverlay';
import { ThreatBadge, ThreatTarget, ThreatTooltip } from './ThreatMarkers';
import { getSquareStyle } from './boardTheme';
import { useBoardDrawing } from './useBoardDrawing';
import { usePieceDrag } from './usePieceDrag';
import { PromotionPicker } from './PromotionPicker';
import type { PendingPromotion, PromotionPiece } from '../../hooks/useSandbox';
import { diffPositions, type BoardTransition } from './boardTransition';
import { nextSquare, squareLabel, type BoardKey } from '../../utils/accessibility';
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
  /** A pawn move waiting for the choice of the new piece. */
  promotion?: PendingPromotion | null;
  onPromote?: (piece: PromotionPiece) => void;
  onCancelPromotion?: () => void;
  className?: string;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

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
  promotion = null,
  onPromote,
  onCancelPromotion,
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

  // Keyboard navigation: roving tabindex, one square of the grid is in the tab order at a time
  const [focusedSquare, setFocusedSquare] = useState<string>('e4');
  const cellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // A click or a tap gives the square the focus; the grid must keep the arrow keys only when the focus
  // came from the keyboard, otherwise the arrows stop navigating the game after any click on the board.
  const pointerInteraction = useRef(false);

  const BOARD_KEYS: readonly string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (BOARD_KEYS.includes(e.key) && !e.shiftKey) {
      e.preventDefault();
      const next = nextSquare(focusedSquare, e.key as BoardKey, isFlipped);
      setFocusedSquare(next);
      cellRefs.current[next]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSquareClick?.(focusedSquare);
    }
  };

  // Each step of the game animates from the previous position: the pieces that moved slide (forward or
  // backward), a captured piece fades out, a capture taken back fades in. The state is derived during render
  // (not in an effect) so that the first frame of the new position already carries its animation.
  const [track, setTrack] = useState<{ fen: string; id: number; transition: BoardTransition | null }>({
    fen,
    id: 0,
    transition: null,
  });
  if (track.fen !== fen) {
    setTrack({ fen, id: track.id + 1, transition: diffPositions(track.fen, fen) });
  }
  const transition = track.fen === fen ? track.transition : null;

  // Right-click arrows and highlights
  const drawing = useBoardDrawing(fen, (square) => Boolean(chess.get(square as Square)));

  const movePiece = (from: string, to: string) => {
    if (onPieceMove) onPieceMove(from, to);
    else onSquareClick?.(to);
  };

  // Drag and drop with pointer events (mouse and finger): the piece follows the pointer
  const { drag, ghostRef, consumeClick, pieceHandlers } = usePieceDrag({
    onDragStart: (from) => onSquareClick?.(from),
    onDrop: movePiece,
  });

  return (
    <div
      className={`relative w-full aspect-square select-none rounded-xl shadow-2xl border-2 sm:border-4 border-slate-800 bg-slate-900 mx-auto ${className ?? ''}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 8x8 Board Grid */}
      <div
        role="grid"
        aria-label={`Échiquier, trait aux ${chess.turn() === 'w' ? 'Blancs' : 'Noirs'}. Flèches pour se déplacer, Entrée pour sélectionner ou jouer.`}
        aria-rowcount={8}
        aria-colcount={8}
        onKeyDown={handleGridKeyDown}
        onPointerDownCapture={() => {
          pointerInteraction.current = true;
        }}
        onPointerUpCapture={() => {
          pointerInteraction.current = false;
        }}
        onPointerCancelCapture={() => {
          pointerInteraction.current = false;
        }}
        className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-lg overflow-hidden"
      >
        {ranks.map((rank, rankRowIdx) => (
          <div key={rank} role="row" aria-rowindex={rankRowIdx + 1} className="contents">
            {files.map((file, fileColIdx) => {
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

              // Step animation (see `transition`): where this square's piece slides in from, and what fades
              const slideFrom = transition?.slides[squareName] ?? null;
              const vanishedPiece = transition?.vanished[squareName] ?? null;
              const hasReappeared = transition?.appeared.includes(squareName) ?? false;

              let animationStyle: React.CSSProperties = {};
              if (slideFrom) {
                const fromCol = files.indexOf(slideFrom[0]);
                const fromRow = ranks.indexOf(parseInt(slideFrom[1], 10));
                animationStyle = {
                  '--delta-x': `${(fromCol - fileColIdx) * 100}%`,
                  '--delta-y': `${(fromRow - rankRowIdx) * 100}%`,
                } as React.CSSProperties;
              }

              const canDragPiece = Boolean(piece && piece.color === chess.turn());

              return (
                <div
                  key={squareName}
                  data-square={squareName}
                  ref={(el) => {
                    cellRefs.current[squareName] = el;
                  }}
                  role="gridcell"
                  aria-colindex={fileColIdx + 1}
                  aria-selected={isSelected}
                  aria-label={squareLabel(squareName, piece, {
                    selected: isSelected,
                    legalDestination: legalDestinations.includes(squareName),
                    threat: primaryThreat?.label,
                  })}
                  tabIndex={squareName === focusedSquare ? 0 : -1}
                  onFocus={(e) => {
                    setFocusedSquare(squareName);
                    if (pointerInteraction.current) e.currentTarget.blur(); // focus from the mouse: not the keyboard
                  }}
                  title={
                    isHeatmapActive && heatmap
                      ? heatmapSquareTitle(
                          squareName,
                          effectiveHeatmapMode as Exclude<HeatmapMode, 'none'>,
                          heatmap.squares[squareName]
                        )
                      : undefined
                  }
                  className={`relative flex items-center justify-center cursor-pointer transition-colors duration-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                    isSelected ? 'bg-amber-300/85 ring-2 ring-inset ring-amber-500' : squareBg
                  } ${drag && drag.over === squareName && drag.from !== squareName ? 'ring-4 ring-inset ring-white/60' : ''}`}
                  onClick={() => {
                    if (!consumeClick()) onSquareClick?.(squareName);
                  }}
                  onMouseDown={(e) => drawing.onSquareMouseDown(squareName, e)}
                  onMouseEnter={() => drawing.onSquareMouseEnter(squareName)}
                  onMouseUp={(e) => drawing.onSquareMouseUp(squareName, e)}
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
                          prev?.threat.id === primaryThreat.id
                            ? null
                            : { threat: primaryThreat, fileColIdx, rankRowIdx }
                        )
                      }
                      onHover={() => setHoveredThreat({ threat: primaryThreat, fileColIdx, rankRowIdx })}
                      onLeave={() => setHoveredThreat(null)}
                    />
                  )}

                  {/* Rank notation (left edge) and file notation (bottom edge) */}
                  {file === files[0] && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-0.5 left-1 text-[10px] font-bold pointer-events-none select-none ${coordTextColor}`}
                    >
                      {rank}
                    </span>
                  )}
                  {rank === ranks[7] && (
                    <span
                      aria-hidden="true"
                      className={`absolute bottom-0.5 right-1 text-[10px] font-bold pointer-events-none select-none ${coordTextColor}`}
                    >
                      {file}
                    </span>
                  )}

                  {/* A captured piece fades out under the piece that took it */}
                  {vanishedPiece && (
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]"
                    >
                      <div key={`vanish-${track.id}`} className="w-[84%] h-[84%] animate-piece-vanish">
                        <ChessPiece type={vanishedPiece.type} color={vanishedPiece.color} />
                      </div>
                    </div>
                  )}

                  {/* Chess piece (draggable for free exploration & click-to-move). Only the pieces that
                      move or come back are re-created for the animation, not the 32 of them at each step. */}
                  {piece && (
                    <div
                      key={slideFrom || hasReappeared ? `step-${track.id}` : 'piece'}
                      aria-hidden="true"
                      {...(canDragPiece ? pieceHandlers(squareName, piece) : {})}
                      className={`relative w-[84%] h-[84%] z-10 select-none ${
                        canDragPiece
                          ? 'cursor-grab active:cursor-grabbing hover:scale-105 transition-transform touch-none'
                          : 'pointer-events-none'
                      } ${drag?.from === squareName ? 'opacity-40' : 'opacity-100'} ${
                        slideFrom ? 'animate-piece-slide' : hasReappeared ? 'animate-piece-appear' : ''
                      }`}
                      style={animationStyle}
                    >
                      <ChessPiece type={piece.type} color={piece.color} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* The piece being dragged follows the pointer */}
      {drag && (
        <div
          ref={ghostRef}
          aria-hidden="true"
          className="fixed left-0 top-0 z-50 pointer-events-none drop-shadow-xl scale-110"
          style={{ width: drag.size, height: drag.size }}
        >
          <ChessPiece type={drag.piece.type} color={drag.piece.color} />
        </div>
      )}

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

      {promotion && onPromote && onCancelPromotion && (
        <PromotionPicker promotion={promotion} onChoose={onPromote} onCancel={onCancelPromotion} />
      )}

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
