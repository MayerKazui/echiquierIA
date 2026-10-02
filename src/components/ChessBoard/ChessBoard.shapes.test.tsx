// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChessBoard } from './ChessBoard';
import { toggleShape } from './useBoardDrawing';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;
const arrows = (marker: string) => document.querySelectorAll(`svg line[marker-end="url(#${marker})"]`);
const circles = () => document.querySelectorAll('[style*="border-color"]');

function drag(from: string, to: string, init: MouseEventInit = {}) {
  fireEvent.mouseDown(cell(from), { button: 2, ...init });
  fireEvent.mouseEnter(cell(to));
  fireEvent.mouseUp(cell(to), { button: 2, ...init });
}

describe('toggleShape', () => {
  const green = { from: 'e2', to: 'e4', color: '#10b981' };

  it('adds a shape, removes the same one drawn again, and recolors it when the color differs', () => {
    expect(toggleShape([], green)).toEqual([green]);
    expect(toggleShape([green], green)).toEqual([]);
    expect(toggleShape([green], { ...green, color: '#ef4444' })).toEqual([{ ...green, color: '#ef4444' }]);
    expect(toggleShape([green], { from: 'e2', to: 'e2', color: '#10b981' })).toHaveLength(2);
  });
});

describe('ChessBoard shapes', () => {
  it('draws the shapes of the position: arrows with their color, circles on their square', () => {
    render(
      <ChessBoard
        fen={START}
        shapes={[
          { from: 'e2', to: 'e4', color: '#10b981' },
          { from: 'g1', to: 'f3', color: '#ef4444' },
          { from: 'd4', to: 'd4', color: '#06b6d4' },
        ]}
      />
    );
    expect(arrows('userArrowGreen')).toHaveLength(1);
    expect(arrows('userArrowRed')).toHaveLength(1);
    expect(circles()).toHaveLength(1);
    expect(cell('d4').querySelector('[style*="border-color"]')).not.toBeNull();
  });

  it('keeps the shapes it is given when the position changes, and shows its own drawings with them', () => {
    const shapes = [{ from: 'e2', to: 'e4', color: '#10b981' }];
    const { rerender } = render(<ChessBoard fen={START} shapes={shapes} />);
    drag('a1', 'a3');
    expect(arrows('userArrowGreen')).toHaveLength(2);
    rerender(<ChessBoard fen={AFTER_E4} shapes={shapes} />);
    // Its own drawing went with the position; the one that belongs to it stays
    expect(arrows('userArrowGreen')).toHaveLength(1);
  });

  it('hands the drawings over instead of keeping them when it is told to', () => {
    const onShapesChange = vi.fn();
    render(<ChessBoard fen={START} shapes={[]} onShapesChange={onShapesChange} />);
    drag('g1', 'f3', { shiftKey: true });
    expect(onShapesChange).toHaveBeenLastCalledWith([{ from: 'g1', to: 'f3', color: '#f59e0b' }]);
    drag('e4', 'e4', { altKey: true });
    expect(onShapesChange).toHaveBeenLastCalledWith([{ from: 'e4', to: 'e4', color: '#06b6d4' }]);
    // Nothing is drawn by the board itself: the caller owns the list
    expect(arrows('userArrowAmber')).toHaveLength(0);
  });

  it('removes a shape drawn again, and does not clear the shapes on a left click of an empty square', () => {
    const onShapesChange = vi.fn();
    const shapes = [{ from: 'e2', to: 'e4', color: '#10b981' }];
    render(<ChessBoard fen={START} shapes={shapes} onShapesChange={onShapesChange} />);
    fireEvent.mouseDown(cell('e5'), { button: 0 });
    expect(onShapesChange).not.toHaveBeenCalled();
    drag('e2', 'e4');
    expect(onShapesChange).toHaveBeenLastCalledWith([]);
  });

  it('still clears its own drawings with a left click of an empty square', () => {
    render(<ChessBoard fen={START} />);
    drag('g1', 'f3');
    expect(arrows('userArrowGreen')).toHaveLength(1);
    fireEvent.mouseDown(cell('e5'), { button: 0 });
    expect(arrows('userArrowGreen')).toHaveLength(0);
  });
});
