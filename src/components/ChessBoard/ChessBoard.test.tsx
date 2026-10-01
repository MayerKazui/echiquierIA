// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChessBoard } from './ChessBoard';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;

describe('ChessBoard accessibility', () => {
  it('is a labelled grid of 8 rows and 64 cells', () => {
    render(<ChessBoard fen={START} />);
    const grid = screen.getByRole('grid');
    expect(grid.getAttribute('aria-label')).toContain('trait aux Blancs');
    expect(within(grid).getAllByRole('row')).toHaveLength(8);
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(64);
  });

  it('names every square with its piece, in reading order from the 8th rank', () => {
    render(<ChessBoard fen={START} />);
    const cells = screen.getAllByRole('gridcell');
    expect(cells[0].getAttribute('aria-label')).toBe('a8, tour noire');
    expect(cells[63].getAttribute('aria-label')).toBe('h1, tour blanche');
    expect(cell('e2').getAttribute('aria-label')).toBe('e2, pion blanc');
    expect(cell('d1').getAttribute('aria-label')).toBe('d1, dame blanche');
    expect(cell('e4').getAttribute('aria-label')).toBe('e4, vide');
  });

  it('follows the flipped orientation in reading order', () => {
    render(<ChessBoard fen={START} isFlipped />);
    const cells = screen.getAllByRole('gridcell');
    expect(cells[0].getAttribute('aria-label')).toBe('h1, tour blanche');
    expect(cells[63].getAttribute('aria-label')).toBe('a8, tour noire');
  });

  it('keeps a single square in the tab order (roving tabindex)', () => {
    render(<ChessBoard fen={START} />);
    const tabbable = screen.getAllByRole('gridcell').filter((c) => c.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0].dataset.square).toBe('e4');
  });

  it('moves the focus with the arrow keys, Home and End, and stops at the edges', async () => {
    const user = userEvent.setup();
    render(<ChessBoard fen={START} />);
    await user.tab();
    expect(document.activeElement).toBe(cell('e4'));

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(cell('f4'));
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toBe(cell('f6'));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(cell('a6'));
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(cell('a6'));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(cell('h6'));

    // The focused square is the one now in the tab order
    expect(cell('h6').tabIndex).toBe(0);
    expect(cell('e4').tabIndex).toBe(-1);
  });

  it('mirrors the arrows when the board is flipped', async () => {
    const user = userEvent.setup();
    render(<ChessBoard fen={START} isFlipped />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(cell('d4'));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(cell('d3'));
  });

  it('selects and plays with Enter and Space, like a click', async () => {
    const user = userEvent.setup();
    const onSquareClick = vi.fn();
    render(<ChessBoard fen={START} onSquareClick={onSquareClick} />);
    await user.tab();
    await user.keyboard('{ArrowLeft}{ArrowDown}{ArrowDown}'); // d2
    await user.keyboard('{Enter}');
    expect(onSquareClick).toHaveBeenLastCalledWith('d2');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    await user.keyboard(' ');
    expect(onSquareClick).toHaveBeenLastCalledWith('d4');
    expect(onSquareClick).toHaveBeenCalledTimes(2);
  });

  it('announces the selected square and its possible destinations', () => {
    render(<ChessBoard fen={START} selectedSquare="e2" />);
    expect(cell('e2').getAttribute('aria-label')).toBe('e2, pion blanc, sélectionné');
    expect(cell('e2').getAttribute('aria-selected')).toBe('true');
    expect(cell('e3').getAttribute('aria-label')).toBe('e3, vide, coup possible');
    expect(cell('e4').getAttribute('aria-label')).toBe('e4, vide, coup possible');
    expect(cell('e5').getAttribute('aria-label')).toBe('e5, vide');
    expect(cell('d2').getAttribute('aria-selected')).toBe('false');
  });

  it('hides the decorative pieces and coordinates from assistive technology', () => {
    render(<ChessBoard fen={START} />);
    expect(cell('e2').querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(cell('a1').querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3); // piece + 2 coordinates
  });

  it('includes a tactical threat in the name of its target square', () => {
    const threat = {
      id: 't1',
      type: 'attack' as const,
      sourceSquare: 'e2',
      targetSquare: 'e7',
      label: 'Attaque sur le pion e7',
      description: '',
      severity: 'medium' as const,
    };
    render(<ChessBoard fen={START} tacticalThreats={[threat]} showThreats />);
    expect(cell('e7').getAttribute('aria-label')).toBe('e7, pion noir, menace : Attaque sur le pion e7');
  });

  it('does not keep the focus after a mouse click, so the arrows still navigate the game', async () => {
    const user = userEvent.setup();
    const onSquareClick = vi.fn();
    render(<ChessBoard fen={START} onSquareClick={onSquareClick} />);
    await user.click(cell('e2'));
    expect(onSquareClick).toHaveBeenCalledWith('e2');
    expect(document.activeElement).toBe(document.body);
    // the clicked square is where the keyboard will start from
    expect(cell('e2').tabIndex).toBe(0);
  });

  it('keeps the focus on a square reached with the keyboard', async () => {
    const user = userEvent.setup();
    render(<ChessBoard fen={START} />);
    await user.click(cell('e2')); // mouse, then the keyboard
    await user.tab();
    expect(document.activeElement).toBe(cell('e2'));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(cell('e3'));
  });

  it('keeps the mouse interaction', () => {
    const onSquareClick = vi.fn();
    render(<ChessBoard fen={START} onSquareClick={onSquareClick} />);
    fireEvent.click(cell('g1'));
    expect(onSquareClick).toHaveBeenCalledWith('g1');
  });
});

describe('ChessBoard who can move', () => {
  const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const grid = () => screen.getByRole('grid');
  const pieceOn = (square: string) => cell(square).querySelector('[data-color]') as HTMLElement;

  it('tells the turn to the grid and the colour to each piece, so that styles can follow the turn', () => {
    const { rerender } = render(<ChessBoard fen={START} />);
    expect(grid().dataset.turn).toBe('w');
    expect(pieceOn('e2').dataset.color).toBe('w');
    expect(pieceOn('e7').dataset.color).toBe('b');
    expect(document.querySelectorAll('[data-color]')).toHaveLength(32);

    rerender(<ChessBoard fen={AFTER_E4} />);
    expect(grid().dataset.turn).toBe('b');
  });

  it('starts a drag only from a piece of the side to move', () => {
    document.elementFromPoint = vi.fn(() => cell('e4'));
    const onSquareClick = vi.fn();
    render(<ChessBoard fen={START} onSquareClick={onSquareClick} onPieceMove={() => {}} />);
    const drag = (square: string) => {
      const piece = pieceOn(square);
      fireEvent.pointerDown(piece, { button: 0, isPrimary: true, pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(piece, { isPrimary: true, pointerId: 1, clientX: 80, clientY: 10 });
      fireEvent.pointerUp(piece, { isPrimary: true, pointerId: 1, clientX: 80, clientY: 10 });
    };

    drag('e7'); // a black pawn, white to move
    expect(onSquareClick).not.toHaveBeenCalled();
    drag('e2'); // a white pawn
    expect(onSquareClick).toHaveBeenCalledWith('e2');
  });
});
