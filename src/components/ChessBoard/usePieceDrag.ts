import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BoardPiece } from './boardTransition';

/** The piece that follows the pointer is a little bigger than the one on the square. */
const GHOST_SCALE = 1.1;

/** How long (ms) a piece takes to slide back to its square after a drag that played no move. */
const RETURN_DURATION = 160;

/** The pointer must move this far (px) before a press on a piece becomes a drag; a tap stays a click. */
const DRAG_THRESHOLD = 5;

export interface PieceDrag {
  from: string;
  piece: BoardPiece;
  /** Square under the pointer (null outside of the board). */
  over: string | null;
  /** Side of a square in px, for the piece that follows the pointer. */
  size: number;
  /** No move was played: the piece slides back to its square before it disappears. */
  returning?: boolean;
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
  /** Plays the move; returning `false` (an illegal move) sends the piece back to its square. */
  onDrop: (from: string, to: string) => boolean | void;
}) {
  const [drag, setDrag] = useState<PieceDrag | null>(null);
  const session = useRef<Session | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const swallowNextClick = useRef(false);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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

  const end = useCallback(() => {
    clearTimeout(returnTimer.current);
    session.current = null;
    setDrag(null);
  }, []);

  // The piece that follows the pointer exists from the render after the drag starts: place it right away.
  // When no move was played it slides to the centre of its square, then goes away.
  const isReturning = drag?.returning === true;
  useLayoutEffect(() => {
    if (!drag) return;
    if (!isReturning) return moveGhost();
    const ghost = ghostRef.current;
    const target = document.querySelector(`[data-square="${drag.from}"]`)?.getBoundingClientRect();
    if (!ghost || !target) return end();
    ghost.style.transition = `transform ${RETURN_DURATION}ms cubic-bezier(0.2, 0, 0.2, 1)`;
    ghost.style.transform = `translate(${target.left + target.width / 2 - drag.size / 2}px, ${target.top + target.height / 2 - drag.size / 2}px)`;
    returnTimer.current = setTimeout(end, RETURN_DURATION + 20);
    return () => clearTimeout(returnTimer.current);
  }, [drag, isReturning, moveGhost, end]);

  /** Ends the drag without a move: the piece goes back to its square. */
  const giveBack = useCallback(() => {
    session.current = null;
    setDrag((d) => (d ? { ...d, over: null, returning: true } : d));
  }, []);

  // Escape gives the piece back: the drag is cancelled, nothing is played
  const isDragging = drag !== null && !isReturning;
  useEffect(() => {
    if (!isDragging) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // this Escape is spent on the drag: the app's own Escape (leave the exploration) waits
      swallowNextClick.current = true;
      setTimeout(() => (swallowNextClick.current = false), 0);
      giveBack();
    };
    window.addEventListener('keydown', onKeyDown, true); // capture: before the app's listeners
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isDragging, giveBack]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, from: string, piece: BoardPiece) => {
      if (e.button !== 0 || !e.isPrimary) return; // right click draws arrows
      if (callbacks.current.canDrag && !callbacks.current.canDrag(from, piece)) return;
      end(); // a piece still sliding back from the last drag goes away
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
    },
    [end]
  );

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
        const played = Boolean(to && to !== s.from && callbacks.current.onDrop(s.from, to) !== false);
        if (played) end();
        else giveBack();
      } else {
        end();
      }
    },
    [end, giveBack]
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
