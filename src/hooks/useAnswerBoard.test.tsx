// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

import { chessAudio } from '../utils/chessAudio';
import { useAnswerBoard } from './useAnswerBoard';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BEFORE_PROMOTION = '7k/P7/8/8/8/8/8/4K3 w - - 0 1';

function setup(fen = START, isEnabled = true) {
  const onAnswer = vi.fn();
  const hook = renderHook(({ enabled }) => useAnswerBoard(fen, enabled, onAnswer), {
    initialProps: { enabled: isEnabled },
  });
  return { ...hook, onAnswer };
}

describe('useAnswerBoard', () => {
  it('selects a piece of the side to move, then plays it where it is clicked', () => {
    const { result, onAnswer } = setup();
    act(() => result.current.handleSquareClick('e2'));
    expect(result.current.selectedSquare).toBe('e2');
    act(() => result.current.handleSquareClick('e4'));
    expect(onAnswer).toHaveBeenCalledWith({ uci: 'e2e4', san: 'e4', from: 'e2', to: 'e4' });
    expect(result.current.selectedSquare).toBeNull();
    expect(chessAudio.playForMove).toHaveBeenCalledWith('e4', false);
  });

  it('puts the piece down when its square is clicked a second time', () => {
    const { result } = setup();
    act(() => result.current.handleSquareClick('e2'));
    act(() => result.current.handleSquareClick('e2'));
    expect(result.current.selectedSquare).toBeNull();
  });

  it('plays a piece dropped on a square', () => {
    const { result, onAnswer } = setup();
    act(() => result.current.handlePieceMove('g1', 'f3'));
    expect(onAnswer).toHaveBeenCalledWith({ uci: 'g1f3', san: 'Nf3', from: 'g1', to: 'f3' });
  });

  it('ignores a drop on the square the piece comes from', () => {
    const { result, onAnswer } = setup();
    act(() => result.current.handlePieceMove('g1', 'g1'));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('does not select a piece of the opponent, nor an empty square', () => {
    const { result } = setup();
    act(() => result.current.handleSquareClick('e7'));
    expect(result.current.selectedSquare).toBeNull();
    act(() => result.current.handleSquareClick('e4'));
    expect(result.current.selectedSquare).toBeNull();
  });

  it('refuses an illegal move and keeps the selection off', () => {
    const { result, onAnswer } = setup();
    act(() => result.current.handlePieceMove('e2', 'e5'));
    expect(onAnswer).not.toHaveBeenCalled();
    act(() => result.current.handleSquareClick('e2'));
    act(() => result.current.handleSquareClick('e5'));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('moves the selection to another piece of the player when it is clicked', () => {
    const { result, onAnswer } = setup();
    act(() => result.current.handleSquareClick('e2'));
    act(() => result.current.handleSquareClick('g1'));
    expect(result.current.selectedSquare).toBe('g1');
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('deselects when an empty square that is not a destination is clicked', () => {
    const { result } = setup();
    act(() => result.current.handleSquareClick('e2'));
    act(() => result.current.handleSquareClick('a5'));
    expect(result.current.selectedSquare).toBeNull();
  });

  it('waits for the choice of the piece on a promotion, then answers with it', () => {
    const { result, onAnswer } = setup(BEFORE_PROMOTION);
    act(() => result.current.handlePieceMove('a7', 'a8'));
    expect(result.current.pendingPromotion).toEqual({ from: 'a7', to: 'a8', color: 'w' });
    expect(onAnswer).not.toHaveBeenCalled();
    act(() => result.current.choosePromotion('n'));
    expect(onAnswer).toHaveBeenCalledWith({ uci: 'a7a8n', san: 'a8=N', from: 'a7', to: 'a8' });
    expect(result.current.pendingPromotion).toBeNull();
  });

  it('drops a promotion that is cancelled', () => {
    const { result, onAnswer } = setup(BEFORE_PROMOTION);
    act(() => result.current.handlePieceMove('a7', 'a8'));
    act(() => result.current.cancelPromotion());
    expect(result.current.pendingPromotion).toBeNull();
    act(() => result.current.choosePromotion('q'));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('plays the sound of a check', () => {
    const { result } = setup('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    act(() => result.current.handlePieceMove('a1', 'a8'));
    expect(chessAudio.playForMove).toHaveBeenLastCalledWith('Ra8+', true);
  });

  it('accepts nothing while it is disabled', () => {
    const { result, onAnswer } = setup(START, false);
    act(() => result.current.handleSquareClick('e2'));
    expect(result.current.selectedSquare).toBeNull();
    act(() => result.current.handlePieceMove('e2', 'e4'));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('clears the selection when it is disabled', () => {
    const { result, rerender } = setup();
    act(() => result.current.handleSquareClick('e2'));
    expect(result.current.selectedSquare).toBe('e2');
    rerender({ enabled: false });
    expect(result.current.selectedSquare).toBeNull();
  });
});
