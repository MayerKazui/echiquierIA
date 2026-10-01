// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChessBoard } from './ChessBoard';
import { getSquareStyle } from './boardTheme';

// `getSquareStyle` is called once each time a square is rendered: its calls count the squares that re-render
vi.mock('./boardTheme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./boardTheme')>();
  return { ...actual, getSquareStyle: vi.fn(actual.getSquareStyle) };
});

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
const AFTER_CASTLE_SETUP = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
const WHITE_CASTLED = 'r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1';

const squareRenders = vi.mocked(getSquareStyle);

beforeEach(() => {
  squareRenders.mockClear();
});

describe('ChessBoard renders', () => {
  it('renders each of the 64 squares once at the start', () => {
    render(<ChessBoard fen={START} />);
    expect(squareRenders).toHaveBeenCalledTimes(64);
  });

  it('re-renders only the squares that change when a move is played', () => {
    const { rerender } = render(<ChessBoard fen={START} />);
    squareRenders.mockClear();
    rerender(<ChessBoard fen={AFTER_E4} lastMove={{ from: 'e2', to: 'e4' }} />);
    expect(squareRenders).toHaveBeenCalledTimes(2); // e2 and e4
  });

  it('re-renders only the squares of the move when stepping forward again, and when going back', () => {
    const { rerender } = render(<ChessBoard fen={AFTER_E4} lastMove={{ from: 'e2', to: 'e4' }} />);
    squareRenders.mockClear();
    rerender(<ChessBoard fen={AFTER_E4_E5} lastMove={{ from: 'e7', to: 'e5' }} />);
    // e7 and e5 change; e2 and e4 only lose their last-move highlight
    expect(squareRenders).toHaveBeenCalledTimes(4);

    squareRenders.mockClear();
    rerender(<ChessBoard fen={AFTER_E4} lastMove={{ from: 'e2', to: 'e4' }} />);
    expect(squareRenders).toHaveBeenCalledTimes(4);
  });

  it('re-renders the four squares of a castling and nothing else', () => {
    const { rerender } = render(<ChessBoard fen={AFTER_CASTLE_SETUP} />);
    squareRenders.mockClear();
    rerender(<ChessBoard fen={WHITE_CASTLED} lastMove={{ from: 'e1', to: 'g1' }} />);
    expect(squareRenders).toHaveBeenCalledTimes(4); // e1, f1, g1, h1
  });

  it('does not re-render any square when the parent re-renders with the same content', () => {
    const { rerender } = render(<ChessBoard fen={AFTER_E4} lastMove={{ from: 'e2', to: 'e4' }} tacticalThreats={[]} />);
    squareRenders.mockClear();
    // New objects and arrays with the same content, as a parent that re-renders passes them
    rerender(
      <ChessBoard
        fen={AFTER_E4}
        lastMove={{ from: 'e2', to: 'e4' }}
        bestMove={null}
        tacticalThreats={[]}
        onSquareClick={() => {}}
        onPieceMove={() => {}}
      />
    );
    expect(squareRenders).not.toHaveBeenCalled();
  });

  it('re-renders only the selected square and its destinations when a piece is selected', () => {
    const { rerender } = render(<ChessBoard fen={START} />);
    squareRenders.mockClear();
    rerender(<ChessBoard fen={START} selectedSquare="e2" />);
    expect(squareRenders).toHaveBeenCalledTimes(3); // e2, e3, e4
  });

  it('re-renders only the target of the best move when the quality of the played move changes', () => {
    const lastMove = { from: 'e2', to: 'e4', classification: 'best' };
    const bestMove = { from: 'g1', to: 'f3' };
    const { rerender } = render(<ChessBoard fen={AFTER_E4} lastMove={lastMove} bestMove={bestMove} />);
    squareRenders.mockClear();
    // The target of the best move is drawn differently when the played move was not the best one
    rerender(<ChessBoard fen={AFTER_E4} lastMove={{ ...lastMove, classification: 'blunder' }} bestMove={bestMove} />);
    expect(squareRenders).toHaveBeenCalledTimes(1); // f3
  });

  it('re-renders every square when the whole board changes (flip, theme)', () => {
    const { rerender } = render(<ChessBoard fen={START} />);
    squareRenders.mockClear();
    rerender(<ChessBoard fen={START} isFlipped />);
    expect(squareRenders).toHaveBeenCalledTimes(64);

    squareRenders.mockClear();
    rerender(<ChessBoard fen={START} isFlipped boardTheme="wood" />);
    expect(squareRenders).toHaveBeenCalledTimes(64);
  });
});
