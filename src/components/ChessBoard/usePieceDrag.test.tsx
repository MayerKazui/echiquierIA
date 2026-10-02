// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardPiece } from './boardTransition';
import { usePieceDrag } from './usePieceDrag';

const PAWN = { type: 'p', color: 'b' } as const;

/** A pointer event as the handlers read it. */
function pointer(x: number, y: number, extra: Partial<{ button: number; isPrimary: boolean; pointerId: number }> = {}) {
  return {
    button: 0,
    isPrimary: true,
    pointerId: 1,
    clientX: x,
    clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ width: 60 }), setPointerCapture: vi.fn() },
    ...extra,
  } as unknown as React.PointerEvent<HTMLElement>;
}

/** Makes `document.elementFromPoint` answer with the square at x (a square is 100px wide): 0 -> a1, 100 -> b1… */
function squaresAlongX() {
  const files = 'abcdefgh';
  document.elementFromPoint = vi.fn((x: number) => {
    const el = document.createElement('div');
    el.setAttribute('data-square', `${files[Math.floor(x / 100)]}1`);
    return el;
  });
}

beforeEach(squaresAlongX);
afterEach(() => vi.useRealTimers());

function setup() {
  const onDragStart = vi.fn();
  const onDrop = vi.fn();
  const hook = renderHook(() => usePieceDrag({ onDragStart, onDrop }));
  return { ...hook, onDragStart, onDrop };
}

describe('usePieceDrag', () => {
  it('leaves a tap alone: a click, not a drag', () => {
    const { result, onDragStart, onDrop } = setup();
    const handlers = result.current.pieceHandlers('a1', PAWN);
    act(() => handlers.onPointerDown(pointer(50, 50)));
    act(() => handlers.onPointerMove(pointer(52, 51))); // below the threshold
    act(() => handlers.onPointerUp(pointer(52, 51)));
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
    expect(result.current.drag).toBeNull();
    expect(result.current.consumeClick()).toBe(false);
  });

  it('starts a drag past the threshold, follows the square under the pointer and drops on it', () => {
    const { result, onDragStart, onDrop } = setup();
    const handlers = result.current.pieceHandlers('a1', PAWN);
    act(() => handlers.onPointerDown(pointer(50, 50)));
    act(() => handlers.onPointerMove(pointer(70, 50)));
    expect(onDragStart).toHaveBeenCalledWith('a1');
    expect(result.current.drag).toMatchObject({ from: 'a1', piece: PAWN, over: 'a1', size: 60 });

    act(() => handlers.onPointerMove(pointer(250, 50)));
    expect(result.current.drag?.over).toBe('c1');

    act(() => handlers.onPointerUp(pointer(250, 50)));
    expect(onDrop).toHaveBeenCalledWith('a1', 'c1');
    expect(result.current.drag).toBeNull();
  });

  it('scales the piece inside its transform, so that the translation is not scaled with it', () => {
    const { result } = setup();
    const handlers = result.current.pieceHandlers('a1', PAWN);
    const ghost = document.createElement('div');
    (result.current.ghostRef as React.MutableRefObject<HTMLDivElement | null>).current = ghost;
    act(() => handlers.onPointerDown(pointer(50, 50)));
    act(() => handlers.onPointerMove(pointer(250, 80)));
    expect(ghost.style.transform).toBe('translate(220px, 50px) scale(1.1)');
  });

  it('gives the piece back when Escape is pressed during a drag', () => {
    const { result, onDrop } = setup();
    const handlers = result.current.pieceHandlers('a1', PAWN);
    act(() => handlers.onPointerDown(pointer(50, 50)));
    act(() => handlers.onPointerMove(pointer(250, 50)));
    expect(result.current.drag).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.drag).toBeNull();
    act(() => handlers.onPointerUp(pointer(250, 50)));
    expect(onDrop).not.toHaveBeenCalled();
  });

  describe('giving the piece back', () => {
    /** A drag from a1 (a ghost on screen, the square a1 at the origin) released on c1; `onDrop` answers `played`. */
    function dropOnC1(played: boolean | void) {
      vi.useFakeTimers();
      const onDrop = vi.fn(() => played);
      const hook = renderHook(() => usePieceDrag({ onDrop }));
      const square = document.createElement('div');
      square.setAttribute('data-square', 'a1');
      square.getBoundingClientRect = () => ({ left: 0, top: 200, width: 100, height: 100 }) as DOMRect;
      document.body.append(square);
      const ghost = document.createElement('div');
      const handlers = hook.result.current.pieceHandlers('a1', PAWN);
      act(() => handlers.onPointerDown(pointer(50, 50)));
      act(() => handlers.onPointerMove(pointer(70, 50)));
      (hook.result.current.ghostRef as React.MutableRefObject<HTMLDivElement | null>).current = ghost;
      act(() => handlers.onPointerUp(pointer(250, 50)));
      return { ...hook, ghost, handlers, square };
    }

    it('slides an illegal move back to its square, then removes the piece', () => {
      const { result, ghost, square } = dropOnC1(false);
      expect(result.current.drag?.returning).toBe(true);
      expect(result.current.drag?.over).toBeNull();
      expect(ghost.style.transform).toBe('translate(20px, 220px)'); // the centre of a1, minus half the piece (60px)
      expect(ghost.style.transition).toContain('transform');
      act(() => {
        vi.runAllTimers();
      });
      expect(result.current.drag).toBeNull();
      square.remove();
    });

    it('removes the piece at once when the move is played', () => {
      const { result, square } = dropOnC1(true);
      expect(result.current.drag).toBeNull();
      square.remove();
    });

    it('slides back after Escape, ignoring what the pointer does next', () => {
      const { result, handlers, square } = dropOnC1(true);
      act(() => handlers.onPointerDown(pointer(50, 50)));
      act(() => handlers.onPointerMove(pointer(70, 50)));
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(result.current.drag?.returning).toBe(true);
      act(() => {
        vi.runAllTimers();
      });
      expect(result.current.drag).toBeNull();
      square.remove();
    });

    it('drops the piece that is still sliding back when a new press starts', () => {
      const { result, handlers, square } = dropOnC1(false);
      expect(result.current.drag?.returning).toBe(true);
      act(() => handlers.onPointerDown(pointer(50, 50)));
      expect(result.current.drag).toBeNull();
      square.remove();
    });
  });

  it('swallows the click that follows a drag, once', () => {
    const { result } = setup();
    const handlers = result.current.pieceHandlers('a1', PAWN);
    act(() => handlers.onPointerDown(pointer(50, 50)));
    act(() => handlers.onPointerMove(pointer(250, 50)));
    act(() => handlers.onPointerUp(pointer(250, 50)));
    expect(result.current.consumeClick()).toBe(true);
    expect(result.current.consumeClick()).toBe(false);
  });

  it('forgets the swallowed click if none comes', () => {
    vi.useFakeTimers();
    const { result } = setup();
    const handlers = result.current.pieceHandlers('a1', PAWN);
    act(() => handlers.onPointerDown(pointer(50, 50)));
    act(() => handlers.onPointerMove(pointer(250, 50)));
    act(() => handlers.onPointerUp(pointer(250, 50)));
    vi.runAllTimers();
    expect(result.current.consumeClick()).toBe(false);
  });

  it('does not play a move when released on the starting square, nor outside of the board', () => {
    const { result, onDrop } = setup();
    const handlers = result.current.pieceHandlers('a1', PAWN);
    act(() => handlers.onPointerDown(pointer(50, 50)));
    act(() => handlers.onPointerMove(pointer(90, 50)));
    act(() => handlers.onPointerUp(pointer(60, 50)));
    expect(onDrop).not.toHaveBeenCalled();

    (document.elementFromPoint as ReturnType<typeof vi.fn>).mockReturnValue(null);
    act(() => handlers.onPointerDown(pointer(50, 50)));
    act(() => handlers.onPointerMove(pointer(90, 50)));
    act(() => handlers.onPointerUp(pointer(900, 50)));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('ignores the right button and secondary pointers', () => {
    const { result, onDragStart } = setup();
    const handlers = result.current.pieceHandlers('a1', PAWN);
    act(() => handlers.onPointerDown(pointer(50, 50, { button: 2 })));
    act(() => handlers.onPointerMove(pointer(250, 50)));
    act(() => handlers.onPointerDown(pointer(50, 50, { isPrimary: false })));
    act(() => handlers.onPointerMove(pointer(250, 50)));
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('cancels without a move when the browser takes the pointer away', () => {
    const { result, onDrop } = setup();
    const handlers = result.current.pieceHandlers('a1', PAWN);
    act(() => handlers.onPointerDown(pointer(50, 50)));
    act(() => handlers.onPointerMove(pointer(250, 50)));
    expect(result.current.drag).not.toBeNull();
    act(() => handlers.onPointerCancel());
    expect(result.current.drag).toBeNull();
    act(() => handlers.onPointerUp(pointer(250, 50)));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('captures the pointer on the piece so that the moves keep coming', () => {
    const { result } = setup();
    const down = pointer(50, 50);
    act(() => result.current.pieceHandlers('a1', PAWN).onPointerDown(down));
    expect(down.currentTarget.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('does not start a drag for a piece that cannot be dragged', () => {
    const onDragStart = vi.fn();
    const onDrop = vi.fn();
    const canDrag = vi.fn((_from: string, piece: BoardPiece) => piece.color === 'w');
    const { result } = renderHook(() => usePieceDrag({ canDrag, onDragStart, onDrop }));
    const handlers = result.current.pieceHandlers('a1', PAWN); // a black pawn

    act(() => handlers.onPointerDown(pointer(50, 50)));
    act(() => handlers.onPointerMove(pointer(250, 50)));
    act(() => handlers.onPointerUp(pointer(250, 50)));
    expect(canDrag).toHaveBeenCalledWith('a1', PAWN);
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
    expect(result.current.drag).toBeNull();

    const white = result.current.pieceHandlers('a1', { type: 'p', color: 'w' });
    act(() => white.onPointerDown(pointer(50, 50)));
    act(() => white.onPointerMove(pointer(250, 50)));
    expect(onDragStart).toHaveBeenCalledWith('a1');
  });

  it('has handlers with a stable identity that call the latest callbacks', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ onDrop }) => usePieceDrag({ onDrop }), {
      initialProps: { onDrop: first },
    });
    const before = { pieceHandlers: result.current.pieceHandlers, consumeClick: result.current.consumeClick };
    const handlers = result.current.pieceHandlers('a1', PAWN); // taken before the callbacks change

    rerender({ onDrop: second });
    expect(result.current.pieceHandlers).toBe(before.pieceHandlers);
    expect(result.current.consumeClick).toBe(before.consumeClick);

    act(() => handlers.onPointerDown(pointer(50, 50)));
    act(() => handlers.onPointerMove(pointer(70, 50)));
    act(() => handlers.onPointerUp(pointer(250, 50)));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('a1', 'c1'); // the handlers of an earlier render use the new callback
  });
});
