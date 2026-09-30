import React, { useCallback, useEffect, useState } from 'react';

export interface UserArrow {
  from: string;
  to: string;
  color: string;
}

const DEFAULT_COLOR = '#10b981'; // Emerald
const COLOR_SHIFT = '#f59e0b'; // Amber
const COLOR_ALT = '#06b6d4'; // Cyan
const COLOR_CTRL = '#ef4444'; // Red

const toggleIn = <T,>(list: T[], item: T) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

/**
 * Lichess-style annotations: right-click drag draws an arrow (Shift / Alt / Ctrl pick the color),
 * right-click on a square toggles a highlight. Everything is cleared when the position changes,
 * or by left-clicking an empty square.
 */
export function useBoardDrawing(fen: string, hasPieceAt: (square: string) => boolean) {
  const [userArrows, setUserArrows] = useState<UserArrow[]>([]);
  const [userHighlights, setUserHighlights] = useState<string[]>([]);
  const [rightClickStart, setRightClickStart] = useState<string | null>(null);
  const [rightClickCurrent, setRightClickCurrent] = useState<string | null>(null);
  const [rightClickColor, setRightClickColor] = useState<string>(DEFAULT_COLOR);

  // Clear the drawings when the position changes (state reset during render, not in an effect)
  const [drawnOnFen, setDrawnOnFen] = useState(fen);
  if (drawnOnFen !== fen) {
    setDrawnOnFen(fen);
    setUserArrows([]);
    setUserHighlights([]);
  }

  const finishDrawing = useCallback((start: string, end: string | null, color: string) => {
    if (end && start !== end) {
      setUserArrows((prev) => {
        const exists = prev.some((a) => a.from === start && a.to === end);
        if (exists) return prev.filter((a) => !(a.from === start && a.to === end));
        return [...prev, { from: start, to: end, color }];
      });
    } else if (start === end) {
      setUserHighlights((prev) => toggleIn(prev, start));
    }
    setRightClickStart(null);
    setRightClickCurrent(null);
  }, []);

  // Release of the right button outside of any square
  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2 && rightClickStart) {
        finishDrawing(rightClickStart, rightClickCurrent, rightClickColor);
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [rightClickStart, rightClickCurrent, rightClickColor, finishDrawing]);

  const onSquareMouseDown = (square: string, e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();

      let color = DEFAULT_COLOR;
      if (e.shiftKey) color = COLOR_SHIFT;
      else if (e.altKey) color = COLOR_ALT;
      else if (e.ctrlKey || e.metaKey) color = COLOR_CTRL;

      setRightClickStart(square);
      setRightClickCurrent(square);
      setRightClickColor(color);
    } else if (e.button === 0 && (userArrows.length > 0 || userHighlights.length > 0) && !hasPieceAt(square)) {
      setUserArrows([]);
      setUserHighlights([]);
    }
  };

  const onSquareMouseEnter = (square: string) => {
    if (rightClickStart) setRightClickCurrent(square);
  };

  const onSquareMouseUp = (square: string, e: React.MouseEvent) => {
    if (e.button === 2 && rightClickStart) {
      e.preventDefault();
      e.stopPropagation();
      finishDrawing(rightClickStart, square, rightClickColor);
    }
  };

  const draftArrow: UserArrow | null =
    rightClickStart && rightClickCurrent && rightClickStart !== rightClickCurrent
      ? { from: rightClickStart, to: rightClickCurrent, color: rightClickColor }
      : null;

  return { userArrows, userHighlights, draftArrow, onSquareMouseDown, onSquareMouseEnter, onSquareMouseUp };
}
