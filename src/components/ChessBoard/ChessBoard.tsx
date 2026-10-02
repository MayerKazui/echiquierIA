import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Chess, Square } from 'chess.js';
import { ChessPiece } from './ChessPieces';
import { ArrowsOverlay } from './ArrowsOverlay';
import { BoardSquare, type HoveredThreat } from './BoardSquare';
import { ThreatTooltip } from './ThreatMarkers';
import { useBoardDrawing } from './useBoardDrawing';
import { usePieceDrag } from './usePieceDrag';
import { PromotionPicker } from './PromotionPicker';
import type { PendingPromotion, PromotionPiece } from '../../hooks/useSandbox';
import { diffPositions, type BoardTransition } from './boardTransition';
import { useStableCallback } from '../../hooks/useStableCallback';
import { nextSquare, type BoardKey } from '../../utils/accessibility';
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
    if (!selectedSquare) return new Set<string>();
    try {
      return new Set(chess.moves({ square: selectedSquare as Square, verbose: true }).map((m) => m.to as string));
    } catch {
      return new Set<string>();
    }
  }, [chess, selectedSquare]);

  // Hovered tactical threat (for tooltip positioning)
  const [hoveredThreat, setHoveredThreat] = useState<HoveredThreat | null>(null);

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

  // Escape puts the selected piece down, wherever the focus is (a mouse click does not leave it on the board).
  // It is spent on that: the app's own Escape (leave the exploration) comes with the next press.
  const isPromoting = promotion !== null;
  useEffect(() => {
    if (!selectedSquare || isPromoting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as Element | null)?.closest?.('[role="dialog"], input, textarea, select')) return;
      e.stopPropagation();
      onSquareClick?.(selectedSquare); // clicking the selected square again unselects it
    };
    window.addEventListener('keydown', onKeyDown, true); // capture: before the app's listeners
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [selectedSquare, isPromoting, onSquareClick]);

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
    canDrag: (_from, piece) => piece.color === chess.turn(),
    // Pressing the piece that is already selected must keep it selected (a second click would unselect it)
    onDragStart: (from) => {
      if (from !== selectedSquare) onSquareClick?.(from);
    },
    onDrop: movePiece,
  });

  // Handlers of the squares: stable functions that use the latest props and state, so that the squares
  // (memoised) are rendered again only when what they show changes.
  const registerCell = useCallback((square: string, element: HTMLDivElement | null) => {
    cellRefs.current[square] = element;
  }, []);
  const onFocusSquare = useCallback((square: string, element: HTMLElement) => {
    setFocusedSquare(square);
    if (pointerInteraction.current) element.blur(); // focus from the mouse: not the keyboard
  }, []);
  const onSquareClickStable = useStableCallback((square: string) => {
    if (!consumeClick()) onSquareClick?.(square);
  });
  const onSquareMouseDown = useStableCallback(drawing.onSquareMouseDown);
  const onSquareMouseEnter = useStableCallback(drawing.onSquareMouseEnter);
  const onSquareMouseUp = useStableCallback(drawing.onSquareMouseUp);

  const turn = chess.turn();
  const userHighlights = useMemo(() => new Set(drawing.userHighlights), [drawing.userHighlights]);
  const activeHeatmapMode = isHeatmapActive && heatmap ? (effectiveHeatmapMode as Exclude<HeatmapMode, 'none'>) : null;

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
        data-turn={turn}
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
        className="group/board grid grid-cols-8 grid-rows-8 w-full h-full rounded-lg overflow-hidden"
      >
        {ranks.map((rank, rankRowIdx) => (
          <div key={rank} role="row" aria-rowindex={rankRowIdx + 1} className="contents">
            {files.map((file, fileColIdx) => {
              const squareName = `${file}${rank}`;
              const fileIdx = file.charCodeAt(0) - 'a'.charCodeAt(0);
              const rankIdx = 8 - rank;
              const piece = board[rankIdx]?.[fileIdx];
              const threats = threatsByTargetSquare[squareName];

              // Step animation (see `transition`): where this square's piece slides in from, and what fades
              const slideFrom = transition?.slides[squareName] ?? null;
              const vanishedPiece = transition?.vanished[squareName] ?? null;
              const hasReappeared = transition?.appeared.includes(squareName) ?? false;
              const isBestTarget = bestMove?.to === squareName;

              return (
                <BoardSquare
                  key={squareName}
                  square={squareName}
                  colIndex={fileColIdx}
                  rowIndex={rankRowIdx}
                  isLight={(fileIdx + rankIdx) % 2 === 0}
                  pieceType={piece?.type ?? null}
                  pieceColor={piece?.color ?? null}
                  boardTheme={boardTheme}
                  isLastMove={lastMove?.from === squareName || lastMove?.to === squareName}
                  isSelected={selectedSquare === squareName}
                  isLegalDestination={legalDestinations.has(squareName)}
                  isFocusable={squareName === focusedSquare}
                  isCheck={checkSquare === squareName}
                  isUserHighlight={userHighlights.has(squareName)}
                  isBestTarget={isBestTarget}
                  isBestOptimal={isBestTarget && isPlayedMoveOptimal}
                  isDragOver={
                    drag?.over === squareName && drag.from !== squareName && legalDestinations.has(squareName)
                  }
                  isDragSource={drag?.from === squareName}
                  primaryThreat={threats?.[0]}
                  hasHighThreat={Boolean(threats?.some((t) => t.severity === 'high'))}
                  heatmapMode={activeHeatmapMode}
                  heatmapControl={heatmap?.squares[squareName]}
                  rankLabel={file === files[0] ? String(rank) : null}
                  fileLabel={rank === ranks[7] ? file : null}
                  slideDx={slideFrom ? files.indexOf(slideFrom[0]) - fileColIdx : null}
                  slideDy={slideFrom ? ranks.indexOf(parseInt(slideFrom[1], 10)) - rankRowIdx : null}
                  vanished={vanishedPiece}
                  reappeared={hasReappeared}
                  stepId={slideFrom || vanishedPiece || hasReappeared ? track.id : 0}
                  registerCell={registerCell}
                  onFocusSquare={onFocusSquare}
                  onSquareClick={onSquareClickStable}
                  onSquareMouseDown={onSquareMouseDown}
                  onSquareMouseEnter={onSquareMouseEnter}
                  onSquareMouseUp={onSquareMouseUp}
                  pieceHandlers={pieceHandlers}
                  setHoveredThreat={setHoveredThreat}
                />
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
          className="fixed left-0 top-0 z-50 pointer-events-none drop-shadow-xl"
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
