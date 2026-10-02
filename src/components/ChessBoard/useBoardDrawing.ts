import React, { useCallback, useEffect, useState } from 'react';

/** An arrow (`from` to `to`) or a circle (`from` equals `to`) drawn on the board. */
export interface BoardShape {
  from: string;
  to: string;
  color: string;
}

export type UserArrow = BoardShape;

const NO_SHAPES: BoardShape[] = [];

export interface BoardDrawingOptions {
  /** Shapes that belong to the position (a study's arrows): always shown. */
  shapes?: BoardShape[];
  /**
   * Given, the shapes are edited through it (`shapes` is the whole list and the player's drawings are written
   * back with it); absent, the player's drawings only last until the position changes.
   */
  onShapesChange?: (shapes: BoardShape[]) => void;
}

const DEFAULT_COLOR = '#10b981'; // Emerald
const COLOR_SHIFT = '#f59e0b'; // Amber
const COLOR_ALT = '#06b6d4'; // Cyan
const COLOR_CTRL = '#ef4444'; // Red

/**
 * The list with `shape` added; drawing the same arrow again removes it, in another color replaces it (as Lichess
 * does).
 */
export function toggleShape(list: BoardShape[], shape: BoardShape): BoardShape[] {
  const same = list.find((s) => s.from === shape.from && s.to === shape.to);
  const others = list.filter((s) => s !== same);
  return same && same.color === shape.color ? others : [...others, shape];
}

/**
 * Lichess-style annotations: right-click drag draws an arrow (Shift / Alt / Ctrl pick the color),
 * right-click on a square toggles a circle. The drawings are cleared when the position changes, or by
 * left-clicking an empty square, unless they are kept by the caller (`onShapesChange`).
 */
export function useBoardDrawing(
  fen: string,
  hasPieceAt: (square: string) => boolean,
  { shapes: given = NO_SHAPES, onShapesChange }: BoardDrawingOptions = {}
) {
  const isControlled = onShapesChange !== undefined;
  const [ownShapes, setOwnShapes] = useState<BoardShape[]>([]);
  const drawn = isControlled ? given : ownShapes;
  const shapes = isControlled ? given : [...given, ...ownShapes];
  const userArrows = shapes.filter((s) => s.from !== s.to);
  const userHighlights = shapes.filter((s) => s.from === s.to);
  const edit = useCallback(
    (change: (list: BoardShape[]) => BoardShape[]) => {
      if (onShapesChange) onShapesChange(change(given));
      else setOwnShapes(change);
    },
    [onShapesChange, given]
  );
  const [rightClickStart, setRightClickStart] = useState<string | null>(null);
  const [rightClickCurrent, setRightClickCurrent] = useState<string | null>(null);
  const [rightClickColor, setRightClickColor] = useState<string>(DEFAULT_COLOR);

  // Clear the drawings when the position changes (state reset during render, not in an effect)
  const [drawnOnFen, setDrawnOnFen] = useState(fen);
  if (drawnOnFen !== fen) {
    setDrawnOnFen(fen);
    setOwnShapes([]);
  }

  const finishDrawing = useCallback(
    (start: string, end: string | null, color: string) => {
      if (end) edit((list) => toggleShape(list, { from: start, to: end, color }));
      setRightClickStart(null);
      setRightClickCurrent(null);
    },
    [edit]
  );

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
    } else if (e.button === 0 && !isControlled && drawn.length > 0 && !hasPieceAt(square)) {
      setOwnShapes([]);
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
