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

type Modifiers = Pick<MouseEvent, 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>;

/** The color of the drawing for the keys held: none green, Shift amber, Alt cyan, Ctrl (or Cmd) red. */
export function colorForModifiers(keys: Modifiers): string {
  if (keys.shiftKey) return COLOR_SHIFT;
  if (keys.altKey) return COLOR_ALT;
  if (keys.ctrlKey || keys.metaKey) return COLOR_CTRL;
  return DEFAULT_COLOR;
}

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

  // While drawing, the color follows the keys held: pressing or releasing Shift, Alt or Ctrl changes the preview
  // of the arrow at once, and the color of the drawing is the one at the release of the button
  const isDrawing = rightClickStart !== null;
  useEffect(() => {
    if (!isDrawing) return;
    const follow = (e: KeyboardEvent | MouseEvent) => {
      setRightClickColor(colorForModifiers(e));
      // Alt alone would otherwise move the focus to the menu bar of the browser
      if (e instanceof KeyboardEvent && e.key === 'Alt') e.preventDefault();
    };
    window.addEventListener('keydown', follow);
    window.addEventListener('keyup', follow);
    window.addEventListener('mousemove', follow);
    return () => {
      window.removeEventListener('keydown', follow);
      window.removeEventListener('keyup', follow);
      window.removeEventListener('mousemove', follow);
    };
  }, [isDrawing]);

  // Release of the right button outside of any square
  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2 && rightClickStart) {
        finishDrawing(rightClickStart, rightClickCurrent, colorForModifiers(e));
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [rightClickStart, rightClickCurrent, finishDrawing]);

  const onSquareMouseDown = (square: string, e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();

      setRightClickStart(square);
      setRightClickCurrent(square);
      setRightClickColor(colorForModifiers(e));
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
      finishDrawing(rightClickStart, square, colorForModifiers(e));
    }
  };

  const draftArrow: UserArrow | null =
    rightClickStart && rightClickCurrent && rightClickStart !== rightClickCurrent
      ? { from: rightClickStart, to: rightClickCurrent, color: rightClickColor }
      : null;

  return { userArrows, userHighlights, draftArrow, onSquareMouseDown, onSquareMouseEnter, onSquareMouseUp };
}
