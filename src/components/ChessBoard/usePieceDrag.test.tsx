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
