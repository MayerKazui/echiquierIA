import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BoardPiece } from './boardTransition';

/** The piece that follows the pointer is a little bigger than the one on the square. */
const GHOST_SCALE = 1.1;

/** The pointer must move this far (px) before a press on a piece becomes a drag; a tap stays a click. */
const DRAG_THRESHOLD = 5;

export interface PieceDrag {
  from: string;
  piece: BoardPiece;
  /** Square under the pointer (null outside of the board). */
  over: string | null;
  /** Side of a square in px, for the piece that follows the pointer. */
  size: number;
}

interface Session {
  from: string;
  piece: BoardPiece;
  pointerId: number;
  startX: number;
  startY: number;
  size: number;
  isDragging: boolean;
}

const squareAt = (x: number, y: number): string | null =>
  document.elementFromPoint(x, y)?.closest('[data-square]')?.getAttribute('data-square') ?? null;

/**
 * Drag and drop of a piece with pointer events (mouse, pen and finger alike): the piece follows the
 * pointer, the square under it is highlighted, and releasing on another square plays the move.
 * Replaces the HTML5 drag and drop (a ghost image chosen by the browser, nothing under a finger).
 *
 * The press, move and release handlers go on the piece itself: the pointer is captured there, so they keep
 * firing wherever the pointer goes. The pieces that can move need `touch-action: none`, or a finger scrolls the
 * page instead of dragging.
 */
export function usePieceDrag({
  canDrag,
  onDragStart,
  onDrop,
}: {
  /** Whether the piece on this square can be dragged (checked when the press starts; default: always). */
  canDrag?: (from: string, piece: BoardPiece) => boolean;
  /** The drag has started from this square (select the piece, show its moves). */
  onDragStart?: (from: string) => void;
  onDrop: (from: string, to: string) => void;
}) {
  const [drag, setDrag] = useState<PieceDrag | null>(null);
  const session = useRef<Session | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const swallowNextClick = useRef(false);
  // Every handler below has a stable identity (the squares of the board are memoised and keep the handlers
  // of their last render) and reaches the latest callbacks through this ref.
  const callbacks = useRef({ canDrag, onDragStart, onDrop });
  useLayoutEffect(() => {
    callbacks.current = { canDrag, onDragStart, onDrop };
  });

  const moveGhost = useCallback(() => {
    const ghost = ghostRef.current;
    const size = session.current?.size ?? 0;
    // The scale goes in the same `transform`, after the translation: a separate CSS `scale` is applied before
    // `transform`, which would scale the translation too (the piece drifts away from the pointer).
    if (ghost)
      ghost.style.transform = `translate(${pointer.current.x - size / 2}px, ${pointer.current.y - size / 2}px) scale(${GHOST_SCALE})`;
  }, []);

  // The piece that follows the pointer exists from the render after the drag starts: place it right away
  useLayoutEffect(() => {
    if (drag) moveGhost();
  }, [drag, moveGhost]);

  const end = useCallback(() => {
    session.current = null;
    setDrag(null);
  }, []);

  // Escape gives the piece back: the drag is cancelled, nothing is played
  const isDragging = drag !== null;
  useEffect(() => {
    if (!isDragging) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // this Escape is spent on the drag: the app's own Escape (leave the exploration) waits
      swallowNextClick.current = true;
      setTimeout(() => (swallowNextClick.current = false), 0);
      end();
    };
    window.addEventListener('keydown', onKeyDown, true); // capture: before the app's listeners
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isDragging, end]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>, from: string, piece: BoardPiece) => {
    if (e.button !== 0 || !e.isPrimary) return; // right click draws arrows
    if (callbacks.current.canDrag && !callbacks.current.canDrag(from, piece)) return;
    session.current = {
      from,
      piece,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      size: e.currentTarget.getBoundingClientRect().width,
      isDragging: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const s = session.current;
      if (!s || e.pointerId !== s.pointerId) return;
      pointer.current = { x: e.clientX, y: e.clientY };

      if (!s.isDragging) {
        if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < DRAG_THRESHOLD) return;
        s.isDragging = true;
        callbacks.current.onDragStart?.(s.from);
        setDrag({ from: s.from, piece: s.piece, over: s.from, size: s.size });
        return;
      }

      moveGhost();
      const over = squareAt(e.clientX, e.clientY);
      setDrag((d) => (d && d.over !== over ? { ...d, over } : d));
    },
    [moveGhost]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const s = session.current;
      if (!s || e.pointerId !== s.pointerId) return;
      if (s.isDragging) {
        // The click that follows the release must not select the square again
        swallowNextClick.current = true;
        setTimeout(() => (swallowNextClick.current = false), 0);
        const to = squareAt(e.clientX, e.clientY);
        end();
        if (to && to !== s.from) callbacks.current.onDrop(s.from, to);
      } else {
        end();
      }
    },
    [end]
  );

  /** True once after a drag: the caller ignores that click. */
  const consumeClick = useCallback(() => {
    const swallow = swallowNextClick.current;
    swallowNextClick.current = false;
    return swallow;
  }, []);

  const onLostPointerCapture = useCallback(() => {
    if (session.current?.isDragging) end();
    else session.current = null;
  }, [end]);

  /** Handlers for the piece standing on `from`. */
  const pieceHandlers = useCallback(
    (from: string, piece: BoardPiece) => ({
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => onPointerDown(e, from, piece),
      onPointerMove,
      onPointerUp,
      onPointerCancel: end,
      onLostPointerCapture,
    }),
    [onPointerDown, onPointerMove, onPointerUp, end, onLostPointerCapture]
  );

  return { drag, ghostRef, consumeClick, pieceHandlers };
}
