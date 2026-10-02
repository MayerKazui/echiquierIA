import React, { memo } from 'react';
import type { Color, PieceSymbol } from 'chess.js';
import { ChessPiece } from './ChessPieces';
import { HeatmapSquareOverlay, heatmapSquareTitle } from './HeatmapOverlay';
import { ThreatBadge, ThreatTarget } from './ThreatMarkers';
import { getSquareStyle } from './boardTheme';
import type { BoardPiece } from './boardTransition';
import { squareLabel } from '../../utils/accessibility';
import type { SquareControl } from '../../utils/chessHeatmap';
import type { TacticalThreat } from '../../utils/tacticalThreats';
import type { BoardTheme, HeatmapMode } from '../../types/ui';

/**
 * Only the pieces of the side to move can be dragged. That depends on the turn, which changes at every step of
 * the game, so it is a style rule driven by `data-turn` on the grid (`group/board`) and not a prop: otherwise
 * the 32 pieces would be rendered again at every step. (Written out in full so Tailwind can detect the classes.)
 */
const PIECE_BY_TURN = [
  'group-data-[turn=w]/board:data-[color=w]:cursor-grab',
  'group-data-[turn=w]/board:data-[color=w]:active:cursor-grabbing',
  'group-data-[turn=w]/board:data-[color=w]:hover:scale-105',
  'group-data-[turn=w]/board:data-[color=w]:transition-transform',
  'group-data-[turn=w]/board:data-[color=w]:touch-none',
  'group-data-[turn=w]/board:data-[color=b]:pointer-events-none',
  'group-data-[turn=b]/board:data-[color=b]:cursor-grab',
  'group-data-[turn=b]/board:data-[color=b]:active:cursor-grabbing',
  'group-data-[turn=b]/board:data-[color=b]:hover:scale-105',
  'group-data-[turn=b]/board:data-[color=b]:transition-transform',
  'group-data-[turn=b]/board:data-[color=b]:touch-none',
  'group-data-[turn=b]/board:data-[color=w]:pointer-events-none',
].join(' ');

export interface HoveredThreat {
  threat: TacticalThreat;
  fileColIdx: number;
  rankRowIdx: number;
}

export interface BoardSquareProps {
  square: string;
  /** Position on screen (0 = left / top), which depends on the orientation of the board. */
  colIndex: number;
  rowIndex: number;
  isLight: boolean;
  pieceType: PieceSymbol | null;
  pieceColor: Color | null;
  boardTheme: BoardTheme;
  isLastMove: boolean;
  isSelected: boolean;
  isLegalDestination: boolean;
  /** The square that is in the tab order (roving tabindex). */
  isFocusable: boolean;
  isCheck: boolean;
  /** Color of the circle drawn on the square (right-click, or a study's), null when there is none. */
  highlightColor: string | null;
  isBestTarget: boolean;
  isBestOptimal: boolean;
  isDragOver: boolean;
  isDragSource: boolean;
  primaryThreat: TacticalThreat | undefined;
  hasHighThreat: boolean;
  heatmapMode: Exclude<HeatmapMode, 'none'> | null;
  heatmapControl: SquareControl | undefined;
  rankLabel: string | null;
  fileLabel: string | null;
  /** Step animation: offset (in squares) the piece slides from, or null. */
  slideDx: number | null;
  slideDy: number | null;
  vanished: BoardPiece | null;
  reappeared: boolean;
  /** Identifies the step for the animated parts only (0 elsewhere), so that the other squares do not change. */
  stepId: number;
  // Handlers: stable functions, so that they do not make the square re-render
  registerCell: (square: string, element: HTMLDivElement | null) => void;
  onFocusSquare: (square: string, element: HTMLElement) => void;
  onSquareClick: (square: string) => void;
  onSquareMouseDown: (square: string, event: React.MouseEvent) => void;
  onSquareMouseEnter: (square: string) => void;
  onSquareMouseUp: (square: string, event: React.MouseEvent) => void;
  pieceHandlers: (from: string, piece: BoardPiece) => React.HTMLAttributes<HTMLElement>;
  setHoveredThreat: React.Dispatch<React.SetStateAction<HoveredThreat | null>>;
}

/**
 * One square of the board. Memoised: a step of the game changes a handful of squares, and each of the 64
 * used to be rendered again. Every prop is a primitive or a stable reference for that reason.
 */
export const BoardSquare = memo(function BoardSquare({
  square,
  colIndex,
  rowIndex,
  isLight,
  pieceType,
  pieceColor,
  boardTheme,
  isLastMove,
  isSelected,
  isLegalDestination,
  isFocusable,
  isCheck,
  highlightColor,
  isBestTarget,
  isBestOptimal,
  isDragOver,
  isDragSource,
  primaryThreat,
  hasHighThreat,
  heatmapMode,
  heatmapControl,
  rankLabel,
  fileLabel,
  slideDx,
  slideDy,
  vanished,
  reappeared,
  stepId,
  registerCell,
  onFocusSquare,
  onSquareClick,
  onSquareMouseDown,
  onSquareMouseEnter,
  onSquareMouseUp,
  pieceHandlers,
  setHoveredThreat,
}: BoardSquareProps) {
  const piece = pieceType && pieceColor ? { type: pieceType, color: pieceColor } : null;
  const { squareBg, coordTextColor } = getSquareStyle(boardTheme, isLight, isLastMove);

  const animationStyle =
    slideDx !== null && slideDy !== null
      ? ({ '--delta-x': `${slideDx * 100}%`, '--delta-y': `${slideDy * 100}%` } as React.CSSProperties)
      : undefined;

  return (
    <div
      data-square={square}
      ref={(el) => registerCell(square, el)}
      role="gridcell"
      aria-colindex={colIndex + 1}
      aria-selected={isSelected}
      aria-label={squareLabel(square, piece, {
        selected: isSelected,
        legalDestination: isLegalDestination,
        threat: primaryThreat?.label,
      })}
      tabIndex={isFocusable ? 0 : -1}
      onFocus={(e) => onFocusSquare(square, e.currentTarget)}
      title={heatmapMode ? heatmapSquareTitle(square, heatmapMode, heatmapControl) : undefined}
      className={`relative flex items-center justify-center cursor-pointer transition-colors duration-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
        isSelected ? 'bg-amber-300/85 ring-2 ring-inset ring-amber-500' : squareBg
      } ${isLegalDestination ? 'group/dest hover:ring-4 hover:ring-inset hover:ring-amber-400/80' : ''} ${
        isDragOver ? 'ring-4 ring-inset ring-amber-400' : ''
      }`}
      onClick={() => onSquareClick(square)}
      onMouseDown={(e) => onSquareMouseDown(square, e)}
      onMouseEnter={() => onSquareMouseEnter(square)}
      onMouseUp={(e) => onSquareMouseUp(square, e)}
    >
      {/* King in check red ring */}
      {isCheck && <div className="absolute inset-0 bg-rose-500/40 rounded-sm animate-pulse z-0" />}

      {/* Heatmap space control overlay */}
      {heatmapMode && <HeatmapSquareOverlay ctrl={heatmapControl} mode={heatmapMode} />}

      {/* Circle drawn on the square (right-click toggle, or a study's) */}
      {highlightColor && (
        <div
          className="absolute inset-1 rounded-full border-3 sm:border-4 pointer-events-none z-10 shadow-sm"
          style={{ borderColor: highlightColor, backgroundColor: `${highlightColor}40` }}
        />
      )}

      {/* Best move destination indicator (dashed circle) */}
      {isBestTarget && (
        <div
          className={`absolute inset-1.5 rounded-full border-2 border-dashed ${
            isBestOptimal ? 'border-cyan-400/90' : 'border-emerald-400/90'
          } pointer-events-none z-10`}
        />
      )}

      {/* Legal move dots & capture rings (sandbox / interactive mode) */}
      {isLegalDestination && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-15">
          {piece ? (
            <div className="w-[82%] h-[82%] rounded-full border-4 border-slate-900/40 ring-2 ring-amber-400/70 transition-transform group-hover/dest:scale-105" />
          ) : (
            <div className="w-4 h-4 sm:w-[1.15rem] sm:h-[1.15rem] rounded-full bg-slate-900/40 ring-1 ring-white/30 shadow-sm transition-transform group-hover/dest:scale-150 group-hover/dest:bg-slate-900/55" />
          )}
        </div>
      )}

      {/* Tactical target crosshair + badge (top-right) */}
      {primaryThreat && <ThreatTarget hasHighThreat={hasHighThreat} />}
      {primaryThreat && (
        <ThreatBadge
          threat={primaryThreat}
          onToggle={() =>
            setHoveredThreat((prev) =>
              prev?.threat.id === primaryThreat.id
                ? null
                : { threat: primaryThreat, fileColIdx: colIndex, rankRowIdx: rowIndex }
            )
          }
          onHover={() => setHoveredThreat({ threat: primaryThreat, fileColIdx: colIndex, rankRowIdx: rowIndex })}
          onLeave={() => setHoveredThreat(null)}
        />
      )}

      {/* Rank notation (left edge) and file notation (bottom edge) */}
      {rankLabel && (
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-1 text-[10px] font-bold pointer-events-none select-none ${coordTextColor}`}
        >
          {rankLabel}
        </span>
      )}
      {fileLabel && (
        <span
          aria-hidden="true"
          className={`absolute bottom-0.5 right-1 text-[10px] font-bold pointer-events-none select-none ${coordTextColor}`}
        >
          {fileLabel}
        </span>
      )}

      {/* A captured piece fades out under the piece that took it */}
      {vanished && (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
          <div key={`vanish-${stepId}`} className="w-[84%] h-[84%] animate-piece-vanish">
            <ChessPiece type={vanished.type} color={vanished.color} />
          </div>
        </div>
      )}

      {/* Chess piece (draggable for free exploration & click-to-move). Only the pieces that
          move or come back are re-created for the animation, not the 32 of them at each step. */}
      {piece && (
        <div
          key={slideDx !== null || reappeared ? `step-${stepId}` : 'piece'}
          aria-hidden="true"
          data-color={piece.color}
          {...pieceHandlers(square, piece)}
          className={`relative w-[84%] h-[84%] z-10 select-none ${PIECE_BY_TURN} ${isDragSource ? 'opacity-40' : 'opacity-100'} ${
            slideDx !== null ? 'animate-piece-slide' : reappeared ? 'animate-piece-appear' : ''
          }`}
          style={animationStyle}
        >
          <ChessPiece type={piece.type} color={piece.color} />
        </div>
      )}
    </div>
  );
});
