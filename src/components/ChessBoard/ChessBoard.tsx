import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Chess, Square } from 'chess.js';
import { ChessPiece } from './ChessPieces';
import { TacticalThreat } from '../../utils/tacticalThreats';
import { computeBoardHeatmap } from '../../utils/chessHeatmap';

export type BoardTheme = 'green' | 'wood' | 'blue';
export type HeatmapMode = 'none' | 'both' | 'white' | 'black';

export interface UserArrow {
  from: string;
  to: string;
  color: string;
}

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
  onClearCustomArrows?: () => void;
  maxWidthClass?: string;
  className?: string;
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

  const heatmap = useMemo(() => {
    if (!isHeatmapActive) return null;
    return computeBoardHeatmap(fen);
  }, [fen, isHeatmapActive]);

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

  // Check if played move is already optimal or good
  const isPlayedMoveOptimal = useMemo(() => {
    return Boolean(
      lastMove?.classification &&
      ['best', 'brilliant', 'great', 'excellent', 'good', 'book'].includes(lastMove.classification)
    );
  }, [lastMove?.classification]);

  const bestArrowColor = isPlayedMoveOptimal ? '#06b6d4' : '#10b981';

  // Group threats by target square
  const threatsByTargetSquare = useMemo(() => {
    if (!showThreats || !tacticalThreats || tacticalThreats.length === 0) return {};
    const map: Record<string, TacticalThreat[]> = {};
    for (const t of tacticalThreats) {
      const squares = t.targetSquare.split(',');
      for (const sq of squares) {
        if (!map[sq]) map[sq] = [];
        map[sq].push(t);
      }
    }
    return map;
  }, [tacticalThreats, showThreats]);

  // Legal moves for currently selected square
  const legalDestinations = useMemo(() => {
    if (!selectedSquare) return [];
    try {
      const moves = chess.moves({ square: selectedSquare as Square, verbose: true });
      return moves.map((m) => m.to as string);
    } catch {
      return [];
    }
  }, [chess, selectedSquare]);

  // Hovered tactical threat for intelligent tooltip positioning
  const [hoveredThreat, setHoveredThreat] = useState<{
    threat: TacticalThreat;
    fileColIdx: number;
    rankRowIdx: number;
  } | null>(null);

  // --- DRAG AND DROP STATE ---
  const [draggedSquare, setDraggedSquare] = useState<string | null>(null);
  const touchOriginRef = useRef<string | null>(null);

  // --- USER CUSTOM ARROWS & HIGHLIGHTS STATE ---
  const [userArrows, setUserArrows] = useState<UserArrow[]>([]);
  const [userHighlights, setUserHighlights] = useState<string[]>([]);
  const [rightClickStart, setRightClickStart] = useState<string | null>(null);
  const [rightClickCurrent, setRightClickCurrent] = useState<string | null>(null);
  const [rightClickColor, setRightClickColor] = useState<string>('#10b981');

  // Clear custom arrows when user changes FEN (new move)
  useEffect(() => {
    setUserArrows([]);
    setUserHighlights([]);
  }, [fen]);

  // Global mouseup to release right click drag if released outside
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 2 && rightClickStart) {
        if (rightClickCurrent && rightClickStart !== rightClickCurrent) {
          setUserArrows((prev) => {
            const exists = prev.some(
              (a) => a.from === rightClickStart && a.to === rightClickCurrent
            );
            if (exists) {
              return prev.filter(
                (a) => !(a.from === rightClickStart && a.to === rightClickCurrent)
              );
            }
            return [
              ...prev,
              { from: rightClickStart, to: rightClickCurrent, color: rightClickColor },
            ];
          });
        } else if (rightClickStart === rightClickCurrent) {
          setUserHighlights((prev) =>
            prev.includes(rightClickStart)
              ? prev.filter((s) => s !== rightClickStart)
              : [...prev, rightClickStart]
          );
        }
        setRightClickStart(null);
        setRightClickCurrent(null);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [rightClickStart, rightClickCurrent, rightClickColor]);

  const handleSquareMouseDown = (square: string, e: React.MouseEvent) => {
    if (e.button === 2) {
      // Right click: start drawing user arrow
      e.preventDefault();
      e.stopPropagation();

      let color = '#10b981'; // Emerald Green
      if (e.shiftKey) color = '#f59e0b'; // Amber / Orange
      else if (e.altKey) color = '#06b6d4'; // Cyan
      else if (e.ctrlKey || e.metaKey) color = '#ef4444'; // Red

      setRightClickStart(square);
      setRightClickCurrent(square);
      setRightClickColor(color);
    } else if (e.button === 0) {
      // Left click: if user has drawn arrows and clicks an empty square, clear them
      if (userArrows.length > 0 || userHighlights.length > 0) {
        const piece = chess.get(square as Square);
        if (!piece) {
          setUserArrows([]);
          setUserHighlights([]);
        }
      }
    }
  };

  const handleSquareMouseEnter = (square: string) => {
    if (rightClickStart) {
      setRightClickCurrent(square);
    }
  };

  const handleSquareMouseUp = (square: string, e: React.MouseEvent) => {
    if (e.button === 2 && rightClickStart) {
      e.preventDefault();
      e.stopPropagation();

      if (rightClickStart !== square) {
        // Toggle arrow
        setUserArrows((prev) => {
          const exists = prev.some(
            (a) => a.from === rightClickStart && a.to === square
          );
          if (exists) {
            return prev.filter(
              (a) => !(a.from === rightClickStart && a.to === square)
            );
          }
          return [...prev, { from: rightClickStart, to: square, color: rightClickColor }];
        });
      } else {
        // Toggle highlight circle
        setUserHighlights((prev) =>
          prev.includes(square)
            ? prev.filter((s) => s !== square)
            : [...prev, square]
        );
      }

      setRightClickStart(null);
      setRightClickCurrent(null);
    }
  };

  // Touch drag support for mobile/tablet
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
      const targetElem = elem?.closest('[data-square]');
      const targetSquare = targetElem?.getAttribute('data-square');
      if (targetSquare && targetSquare !== touchOriginRef.current) {
        if (onPieceMove) {
          onPieceMove(touchOriginRef.current, targetSquare);
        } else {
          onSquareClick?.(targetSquare);
        }
      }
    }
    touchOriginRef.current = null;
  };

  // Dynamic positioning to guarantee the tooltip never goes out of bounds
  const getTooltipStyle = (fileColIdx: number, rankRowIdx: number): React.CSSProperties => {
    const style: React.CSSProperties = {};
    if (fileColIdx <= 3) {
      style.left = `${Math.max(2, fileColIdx * 12.5)}%`;
    } else {
      style.right = `${Math.max(2, (7 - fileColIdx) * 12.5)}%`;
    }
    if (rankRowIdx <= 2) {
      style.top = `${(rankRowIdx + 1) * 12.5 + 1.5}%`;
    } else {
      style.bottom = `${(8 - rankRowIdx) * 12.5 + 1.5}%`;
    }
    return style;
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

            const isLastMoveFrom = lastMove?.from === squareName;
            const isLastMoveTo = lastMove?.to === squareName;
            const isBestMoveTo = bestMove?.to === squareName;
            const isSelected = selectedSquare === squareName;
            const isKingInCheck = checkSquare === squareName;
            const isUserHighlighted = userHighlights.includes(squareName);

            const targetThreats = threatsByTargetSquare[squareName];
            const primaryThreat = targetThreats?.[0];
            const hasHighThreat = targetThreats?.some((t) => t.severity === 'high');

            let squareBg = '';
            let coordTextColor = '';

            if (boardTheme === 'wood') {
              if (isLastMoveFrom || isLastMoveTo) {
                squareBg = isLight ? 'bg-[#e8d197]' : 'bg-[#c9975b]';
              } else {
                squareBg = isLight ? 'bg-[#f0d9b5]' : 'bg-[#b58863]';
              }
              coordTextColor = isLight ? 'text-[#b58863]' : 'text-[#f0d9b5]';
            } else if (boardTheme === 'blue') {
              if (isLastMoveFrom || isLastMoveTo) {
                squareBg = isLight ? 'bg-[#b8d6e5]' : 'bg-[#64889c]';
              } else {
                squareBg = isLight ? 'bg-[#dee3e6]' : 'bg-[#8ca2ad]';
              }
              coordTextColor = isLight ? 'text-[#8ca2ad]' : 'text-[#dee3e6]';
            } else {
              // 'green' default (tournament green)
              if (isLastMoveFrom || isLastMoveTo) {
                squareBg = isLight ? 'bg-[#f5f682]' : 'bg-[#b9ca43]';
              } else {
                squareBg = isLight ? 'bg-[#edeed1]' : 'bg-[#779952]';
              }
              coordTextColor = isLight ? 'text-[#779952]' : 'text-[#edeed1]';
            }

            if (isSelected) {
              squareBg = 'bg-amber-300/85 ring-2 ring-inset ring-amber-500';
            }

            // Move animation
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

            const canDragPiece = Boolean(piece && piece.color === chess.turn());

            return (
              <div
                key={squareName}
                data-square={squareName}
                title={
                  isHeatmapActive && heatmap
                    ? effectiveHeatmapMode === 'white'
                      ? `${squareName.toUpperCase()} : ${heatmap.squares[squareName]?.whiteCount || 0} attaquant(s) blanc(s)`
                      : effectiveHeatmapMode === 'black'
                      ? `${squareName.toUpperCase()} : ${heatmap.squares[squareName]?.blackCount || 0} attaquant(s) noir(s)`
                      : `${squareName.toUpperCase()} : ${heatmap.squares[squareName]?.whiteCount || 0} attaquant(s) blancs vs ${heatmap.squares[squareName]?.blackCount || 0} noirs (${
                          heatmap.squares[squareName]?.net > 0
                            ? `+${heatmap.squares[squareName].net} Blancs`
                            : heatmap.squares[squareName]?.net < 0
                            ? `${heatmap.squares[squareName].net} Noirs`
                            : heatmap.squares[squareName]?.isContested
                            ? 'Contestée'
                            : 'Neutre'
                        })`
                    : undefined
                }
                className={`relative flex items-center justify-center cursor-pointer transition-colors duration-100 ${squareBg}`}
                onClick={() => onSquareClick?.(squareName)}
                onMouseDown={(e) => handleSquareMouseDown(squareName, e)}
                onMouseEnter={() => handleSquareMouseEnter(squareName)}
                onMouseUp={(e) => handleSquareMouseUp(squareName, e)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromSquare = e.dataTransfer.getData('text/plain') || draggedSquare;
                  setDraggedSquare(null);
                  if (fromSquare && fromSquare !== squareName) {
                    if (onPieceMove) {
                      onPieceMove(fromSquare, squareName);
                    } else {
                      onSquareClick?.(squareName);
                    }
                  }
                }}
                onTouchStart={() => handleTouchStart(squareName)}
              >
                {/* King in check red ring */}
                {isKingInCheck && (
                  <div className="absolute inset-0 bg-rose-500/40 rounded-sm animate-pulse z-0" />
                )}

                {/* Heatmap space control overlay */}
                {isHeatmapActive && heatmap && (() => {
                  const ctrl = heatmap.squares[squareName];
                  if (!ctrl) return null;

                  if (effectiveHeatmapMode === 'white') {
                    if (ctrl.whiteCount <= 0) return null;
                    const opacity = Math.min(0.55, 0.18 + Math.min(ctrl.whiteCount, 4) * 0.09);
                    return (
                      <>
                        <div
                          className="absolute inset-0 pointer-events-none transition-all duration-200 z-5 bg-blue-500"
                          style={{ opacity }}
                        />
                        <div className="absolute bottom-0.5 left-0.5 sm:bottom-1 sm:left-1 pointer-events-none z-25 flex items-center justify-center">
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] sm:min-w-[22px] sm:h-[22px] px-1 rounded-md bg-slate-950/95 text-blue-200 border border-blue-400/70 font-mono font-black text-[11px] sm:text-xs shadow-md leading-none">
                            {ctrl.whiteCount}
                          </span>
                        </div>
                      </>
                    );
                  }

                  if (effectiveHeatmapMode === 'black') {
                    if (ctrl.blackCount <= 0) return null;
                    const opacity = Math.min(0.55, 0.18 + Math.min(ctrl.blackCount, 4) * 0.09);
                    return (
                      <>
                        <div
                          className="absolute inset-0 pointer-events-none transition-all duration-200 z-5 bg-rose-500"
                          style={{ opacity }}
                        />
                        <div className="absolute bottom-0.5 left-0.5 sm:bottom-1 sm:left-1 pointer-events-none z-25 flex items-center justify-center">
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] sm:min-w-[22px] sm:h-[22px] px-1 rounded-md bg-slate-950/95 text-rose-200 border border-rose-400/70 font-mono font-black text-[11px] sm:text-xs shadow-md leading-none">
                            {ctrl.blackCount}
                          </span>
                        </div>
                      </>
                    );
                  }

                  // Both (differential) mode
                  if (ctrl.whiteCount <= 0 && ctrl.blackCount <= 0) return null;
                  const bg = ctrl.net > 0 ? 'bg-blue-500' : ctrl.net < 0 ? 'bg-rose-500' : 'bg-amber-400';
                  const opacity = ctrl.net !== 0
                    ? Math.min(0.48, 0.16 + Math.min(Math.abs(ctrl.net), 4) * 0.08)
                    : ctrl.isContested ? 0.22 : 0;

                  return (
                    <>
                      <div
                        className={`absolute inset-0 pointer-events-none transition-all duration-200 z-5 ${bg}`}
                        style={{ opacity }}
                      />
                      <div className="absolute bottom-0.5 left-0.5 sm:bottom-1 sm:left-1 pointer-events-none z-25 flex items-center justify-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[18px] h-[18px] sm:min-w-[22px] sm:h-[22px] px-1 rounded-md bg-slate-950/95 font-mono font-black text-[11px] sm:text-xs shadow-md leading-none border ${
                            ctrl.net > 0
                              ? 'text-blue-200 border-blue-400/70'
                              : ctrl.net < 0
                              ? 'text-rose-200 border-rose-400/70'
                              : 'text-amber-300 border-amber-400/70'
                          }`}
                        >
                          {ctrl.net > 0 ? `+${ctrl.net}` : ctrl.net < 0 ? `${ctrl.net}` : '='}
                        </span>
                      </div>
                    </>
                  );
                })()}

                {/* User custom highlight circle (Right-click toggle) */}
                {isUserHighlighted && (
                  <div className="absolute inset-1 rounded-full border-3 sm:border-4 border-emerald-400/90 bg-emerald-400/25 pointer-events-none z-10 shadow-sm" />
                )}

                {/* Best move destination indicator (clearly dashed circle) */}
                {bestMove && isBestMoveTo && (
                  <div
                    className={`absolute inset-1.5 rounded-full border-2 border-dashed ${
                      isPlayedMoveOptimal ? 'border-cyan-400/90' : 'border-emerald-400/90'
                    } pointer-events-none z-10`}
                  />
                )}

                {/* Legal Move Destination Dots & Capture Rings (Sandbox / Interactive mode) */}
                {legalDestinations.includes(squareName) && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-15">
                    {piece ? (
                      <div className="w-[82%] h-[82%] rounded-full border-4 border-slate-900/40 ring-2 ring-amber-400/70" />
                    ) : (
                      <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-slate-900/35 ring-1 ring-white/30 shadow-sm" />
                    )}
                  </div>
                )}

                {/* Tactical Target Indicator / Crosshairs */}
                {primaryThreat && (
                  <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                    <div
                      className={`absolute inset-0.5 sm:inset-1 rounded-md sm:rounded-lg border-2 ${
                        hasHighThreat
                          ? 'border-rose-500/90 bg-rose-500/15 shadow-[0_0_10px_rgba(244,63,94,0.35)] animate-pulse'
                          : 'border-amber-500/90 bg-amber-500/15 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                      }`}
                    />
                    <div className={`absolute top-0.5 w-2 h-0.5 ${hasHighThreat ? 'bg-rose-400' : 'bg-amber-400'}`} />
                    <div className={`absolute bottom-0.5 w-2 h-0.5 ${hasHighThreat ? 'bg-rose-400' : 'bg-amber-400'}`} />
                    <div className={`absolute left-0.5 w-0.5 h-2 ${hasHighThreat ? 'bg-rose-400' : 'bg-amber-400'}`} />
                    <div className={`absolute right-0.5 w-0.5 h-2 ${hasHighThreat ? 'bg-rose-400' : 'bg-amber-400'}`} />
                  </div>
                )}

                {/* Tactical Badge Indicator (top-right) */}
                {primaryThreat && (
                  <div
                    className="absolute top-0.5 right-0.5 z-30 pointer-events-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHoveredThreat((prev) =>
                        prev?.threat.id === primaryThreat.id
                          ? null
                          : { threat: primaryThreat, fileColIdx, rankRowIdx }
                      );
                    }}
                    onMouseEnter={() => setHoveredThreat({ threat: primaryThreat, fileColIdx, rankRowIdx })}
                    onMouseLeave={() => setHoveredThreat(null)}
                  >
                    <div
                      className={`flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-md text-[11px] sm:text-xs font-bold shadow-lg cursor-pointer transition-transform hover:scale-125 ${
                        primaryThreat.type === 'check' || primaryThreat.type === 'hanging'
                          ? 'bg-rose-600 text-white ring-1 ring-rose-400'
                          : primaryThreat.type === 'pin'
                          ? 'bg-purple-600 text-white ring-1 ring-purple-400'
                          : primaryThreat.type === 'fork'
                          ? 'bg-amber-500 text-slate-950 ring-1 ring-amber-300'
                          : 'bg-amber-600 text-white ring-1 ring-amber-400'
                      }`}
                    >
                      {primaryThreat.type === 'check'
                        ? '⚡'
                        : primaryThreat.type === 'hanging'
                        ? '🛡️'
                        : primaryThreat.type === 'pin'
                        ? '🧷'
                        : primaryThreat.type === 'fork'
                        ? '🔱'
                        : '⚔️'}
                    </div>
                  </div>
                )}

                {/* Rank notation (on left edge) */}
                {file === files[0] && (
                  <span
                    className={`absolute top-0.5 left-1 text-[10px] font-bold pointer-events-none select-none ${coordTextColor}`}
                  >
                    {rank}
                  </span>
                )}

                {/* File notation (on bottom edge) */}
                {rank === ranks[7] && (
                  <span
                    className={`absolute bottom-0.5 right-1 text-[10px] font-bold pointer-events-none select-none ${coordTextColor}`}
                  >
                    {file}
                  </span>
                )}

                {/* Chess piece (Draggable for free exploration & click-to-move) */}
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
                    onDragEnd={() => {
                      setDraggedSquare(null);
                    }}
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

      {/* SVG Overlay for Directional Arrows, Tactical Threat Rays & User Custom Arrows */}
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

          {/* Arrow marker for Stockfish best/alternative move */}
          <marker
            id="bestArrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="4.2"
            markerHeight="4.2"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={bestArrowColor} />
          </marker>

          {/* Tactical Threat Red Arrow */}
          <marker
            id="threatArrowRed"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="3.6"
            markerHeight="3.6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#ef4444" />
          </marker>

          {/* Tactical Threat Amber Arrow */}
          <marker
            id="threatArrowAmber"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="3.6"
            markerHeight="3.6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#f59e0b" />
          </marker>

          {/* Pin Arrow Through (Purple) */}
          <marker
            id="pinArrowPurple"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="3.4"
            markerHeight="3.4"
            orient="auto-start-reverse"
          >
            <path d="M 0 2 L 8 5 L 0 8 z" fill="#c084fc" />
          </marker>

          {/* User custom arrow markers (Green, Amber, Cyan, Red) */}
          <marker
            id="userArrowGreen"
            viewBox="0 0 10 10"
            refX="6.5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#10b981" />
          </marker>
          <marker
            id="userArrowAmber"
            viewBox="0 0 10 10"
            refX="6.5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#f59e0b" />
          </marker>
          <marker
            id="userArrowCyan"
            viewBox="0 0 10 10"
            refX="6.5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#06b6d4" />
          </marker>
          <marker
            id="userArrowRed"
            viewBox="0 0 10 10"
            refX="6.5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#ef4444" />
          </marker>
        </defs>

        {/* Tactical Threat Laser Rays */}
        {showThreats &&
          tacticalThreats &&
          tacticalThreats.map((threat) => {
            const targetSquares = threat.targetSquare.split(',');
            return targetSquares.map((targetSq) => {
              const start = squareToPercent(threat.sourceSquare);
              const end = squareToPercent(targetSq);
              const isHigh = threat.severity === 'high';
              const color = isHigh ? '#ef4444' : '#f59e0b';
              const markerId = isHigh ? 'url(#threatArrowRed)' : 'url(#threatArrowAmber)';

              return (
                <React.Fragment key={`${threat.id}-${targetSq}`}>
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke={color}
                    strokeWidth="1.9"
                    strokeOpacity="0.88"
                    strokeDasharray="2.5 2.5"
                    strokeLinecap="round"
                    markerEnd={markerId}
                  />

                  {threat.pinThroughSquare && (
                    (() => {
                      const pinEnd = squareToPercent(threat.pinThroughSquare);
                      return (
                        <line
                          x1={end.x}
                          y1={end.y}
                          x2={pinEnd.x}
                          y2={pinEnd.y}
                          stroke="#c084fc"
                          strokeWidth="1.6"
                          strokeOpacity="0.8"
                          strokeDasharray="1.5 2"
                          strokeLinecap="round"
                          markerEnd="url(#pinArrowPurple)"
                        />
                      );
                    })()
                  )}
                </React.Fragment>
              );
            });
          })}

        {/* Played Move Arrow (solid line) */}
        {showArrows && lastMove && lastMove.from && lastMove.to && (
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
                strokeWidth="2.3"
                strokeOpacity="0.85"
                strokeLinecap="round"
                markerEnd="url(#playedArrow)"
              />
            );
          })()
        )}

        {/* Stockfish Best/Alternative Move Arrow (dashed) */}
        {showArrows &&
          bestMove &&
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
                  stroke={bestArrowColor}
                  strokeWidth="2.2"
                  strokeOpacity="0.95"
                  strokeDasharray="1.5 5.5"
                  strokeLinecap="round"
                  markerEnd="url(#bestArrow)"
                />
              );
            })()
          )}

        {/* --- USER DRAWN CUSTOM ARROWS --- */}
        {userArrows.map((arrow, idx) => {
          const start = squareToPercent(arrow.from);
          const end = squareToPercent(arrow.to);
          let markerUrl = 'url(#userArrowGreen)';
          if (arrow.color === '#f59e0b') markerUrl = 'url(#userArrowAmber)';
          else if (arrow.color === '#06b6d4') markerUrl = 'url(#userArrowCyan)';
          else if (arrow.color === '#ef4444') markerUrl = 'url(#userArrowRed)';

          return (
            <line
              key={`user-arrow-${idx}-${arrow.from}-${arrow.to}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={arrow.color}
              strokeWidth="2.4"
              strokeOpacity="0.9"
              strokeLinecap="round"
              markerEnd={markerUrl}
            />
          );
        })}

        {/* --- LIVE DRAFT ARROW (while right-click dragging) --- */}
        {rightClickStart && rightClickCurrent && rightClickStart !== rightClickCurrent && (
          (() => {
            const start = squareToPercent(rightClickStart);
            const end = squareToPercent(rightClickCurrent);
            let markerUrl = 'url(#userArrowGreen)';
            if (rightClickColor === '#f59e0b') markerUrl = 'url(#userArrowAmber)';
            else if (rightClickColor === '#06b6d4') markerUrl = 'url(#userArrowCyan)';
            else if (rightClickColor === '#ef4444') markerUrl = 'url(#userArrowRed)';

            return (
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={rightClickColor}
                strokeWidth="2.4"
                strokeOpacity="0.65"
                strokeDasharray="2 2"
                strokeLinecap="round"
                markerEnd={markerUrl}
              />
            );
          })()
        )}
      </svg>

      {/* Floating Tactical Tooltip */}
      {hoveredThreat && (
        <div
          style={getTooltipStyle(hoveredThreat.fileColIdx, hoveredThreat.rankRowIdx)}
          className="absolute z-50 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95 max-w-[290px] sm:max-w-[340px] w-auto min-w-[240px]"
        >
          <div className="flex flex-col gap-1.5 p-3 sm:p-3.5 rounded-xl bg-slate-950/95 border-2 border-slate-700/90 text-white shadow-[0_15px_30px_rgba(0,0,0,0.85)] backdrop-blur-md">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-base sm:text-lg">
                  {hoveredThreat.threat.type === 'check'
                    ? '⚡'
                    : hoveredThreat.threat.type === 'hanging'
                    ? '🛡️'
                    : hoveredThreat.threat.type === 'pin'
                    ? '🧷'
                    : hoveredThreat.threat.type === 'fork'
                    ? '🔱'
                    : '⚔️'}
                </span>
                <span className="font-bold text-xs sm:text-sm text-amber-300">
                  {hoveredThreat.threat.type === 'check'
                    ? 'Échec au Roi'
                    : hoveredThreat.threat.type === 'hanging'
                    ? 'Pièce en prise'
                    : hoveredThreat.threat.type === 'pin'
                    ? 'Clouage tactique'
                    : hoveredThreat.threat.type === 'fork'
                    ? 'Fourchette (Attaque double)'
                    : 'Menace de capture'}
                </span>
              </div>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-bold uppercase tracking-wider shrink-0 ${
                  hoveredThreat.threat.severity === 'high'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {hoveredThreat.threat.severity === 'high' ? 'Critique' : 'Pression'}
              </span>
            </div>

            <div className="text-xs sm:text-sm font-semibold text-white">
              {hoveredThreat.threat.label}
            </div>

            <div className="text-[11.5px] sm:text-[12.5px] text-slate-300 leading-relaxed font-normal">
              {hoveredThreat.threat.description}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
