// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/stockfishEngine', () => ({
  stockfishService: { evaluatePosition: vi.fn().mockResolvedValue({ cp: 0, mate: null }) },
}));
vi.mock('../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

import { useSandbox } from './useSandbox';

const BEFORE_PROMOTION = '7k/P7/8/8/8/8/8/4K3 w - - 0 1';

describe('useSandbox promotion', () => {
  it('waits for the choice of the piece instead of promoting to a queen', () => {
    const { result } = renderHook(() => useSandbox(BEFORE_PROMOTION));
    act(() => {
      result.current.handlePieceMove('a7', 'a8');
    });
    expect(result.current.pendingPromotion).toEqual({ from: 'a7', to: 'a8', color: 'w' });
    expect(result.current.isSandboxMode).toBe(false);
    expect(result.current.history).toHaveLength(0);
  });

  it('plays the chosen piece, an under-promotion included', () => {
    const { result } = renderHook(() => useSandbox(BEFORE_PROMOTION));
    act(() => {
      result.current.handlePieceMove('a7', 'a8');
    });
    act(() => result.current.choosePromotion('n'));
    expect(result.current.pendingPromotion).toBeNull();
    expect(result.current.history.map((m) => m.san)).toEqual(['a8=N']);
    expect(result.current.activeFen.split(' ')[0]).toBe('N6k/8/8/8/8/8/8/4K3');
  });

  it('tells whether a dragged piece was played, so that the board can give it back', () => {
    const { result } = renderHook(() => useSandbox(BEFORE_PROMOTION));
    expect(result.current.handlePieceMove('a7', 'b5')).toBe(false); // not a pawn move
    expect(result.current.handlePieceMove('a7', 'a7')).toBe(false);
    expect(result.current.handlePieceMove('a7', 'a8')).toBe(true); // waits for the choice of the piece
  });

  it('puts the piece down when its square is clicked a second time', () => {
    const { result } = renderHook(() => useSandbox(BEFORE_PROMOTION));
    act(() => result.current.handleSquareClick('a7'));
    expect(result.current.selectedSquare).toBe('a7');
    act(() => result.current.handleSquareClick('a7'));
    expect(result.current.selectedSquare).toBeNull();
  });

  it('works with click-to-move too, and cancel keeps the position', () => {
    const { result } = renderHook(() => useSandbox(BEFORE_PROMOTION));
    act(() => result.current.handleSquareClick('a7'));
    act(() => result.current.handleSquareClick('a8'));
    expect(result.current.pendingPromotion).not.toBeNull();
    act(() => result.current.cancelPromotion());
    expect(result.current.pendingPromotion).toBeNull();
    expect(result.current.history).toHaveLength(0);
    expect(result.current.activeFen).toBe(BEFORE_PROMOTION);
  });

  it('forgets the pending promotion when the exploration ends', () => {
    const { result } = renderHook(() => useSandbox(BEFORE_PROMOTION));
    act(() => {
      result.current.handlePieceMove('a7', 'a8');
    });
    act(() => result.current.exit());
    expect(result.current.pendingPromotion).toBeNull();
  });

  it('still plays ordinary moves at once and ignores illegal ones', () => {
    const { result } = renderHook(() => useSandbox(BEFORE_PROMOTION));
    act(() => {
      result.current.handlePieceMove('e1', 'e2');
    });
    expect(result.current.pendingPromotion).toBeNull();
    expect(result.current.history.map((m) => m.san)).toEqual(['Ke2']);
    act(() => {
      result.current.handlePieceMove('e8', 'e7'); // no piece there
    });
    expect(result.current.history).toHaveLength(1);
  });
});
