import { describe, expect, it } from 'vitest';
import { answerPuzzle, expectedMove, sanOf, solverColor, startPuzzle } from './puzzle';
import type { Puzzle } from './puzzleData';

// Lichess puzzle 00008: black takes the rook on g3, then white has to find three moves
const puzzle: Puzzle = {
  id: '00008',
  fen: 'r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24',
  moves: ['f2g3', 'e6e7', 'b2b1', 'b3c1', 'b1c1', 'h6c1'],
  rating: 1811,
  themes: ['crushing', 'hangingPiece', 'long', 'middlegame'],
};

// Two rooks can mate on the back rank: the solution is a1a8, c1c8 is as good
const twoMates: Puzzle = {
  id: 'twomate',
  fen: '6k1/1p3ppp/8/8/8/8/8/R1R3K1 b - - 0 1',
  moves: ['b7b6', 'a1a8'],
  rating: 800,
  themes: ['mate', 'mateIn1', 'backRankMate'],
};

describe('startPuzzle', () => {
  it('plays the opponent’s first move and hands over to the player', () => {
    const state = startPuzzle(puzzle)!;
    expect(state.fen.split(' ')[1]).toBe('w');
    expect(state.step).toBe(1);
    expect(state.lastMove).toEqual({ from: 'f2', to: 'g3' });
    expect(state.solved).toBe(false);
  });

  it('refuses a puzzle whose first move is illegal', () => {
    expect(startPuzzle({ ...puzzle, moves: ['a1a8', 'e6e7'] })).toBeNull();
  });
});

describe('solverColor', () => {
  it('is the side that does not move first', () => {
    expect(solverColor(puzzle)).toBe('w');
    expect(solverColor({ ...puzzle, fen: puzzle.fen.replace(' b ', ' w ') })).toBe('b');
  });
});

describe('answerPuzzle', () => {
  it('accepts the move of the solution and plays the reply of the opponent', () => {
    const state = startPuzzle(puzzle)!;
    expect(expectedMove(puzzle, state)).toEqual({ from: 'e6', to: 'e7', promotion: undefined });
    const answer = answerPuzzle(puzzle, state, { from: 'e6', to: 'e7' });
    expect(answer.correct).toBe(true);
    if (!answer.correct) return;
    expect(answer.reply).toMatchObject({ from: 'b2', to: 'b1' });
    // The position after the move of the player alone, then after the reply of the opponent as well
    expect(answer.playedFen.split(' ')[1]).toBe('b');
    expect(answer.playedFen).not.toBe(answer.state.fen);
    expect(answer.state.step).toBe(3);
    expect(answer.state.solved).toBe(false);
    expect(answer.state.lastMove).toEqual({ from: 'b2', to: 'b1' });
  });

  it('is solved by the last move of the solution', () => {
    let state = startPuzzle(puzzle)!;
    for (const [from, to] of [
      ['e6', 'e7'],
      ['b3', 'c1'],
      ['h6', 'c1'],
    ]) {
      const answer = answerPuzzle(puzzle, state, { from, to });
      expect(answer.correct).toBe(true);
      state = answer.state;
    }
    expect(state.solved).toBe(true);
    expect(expectedMove(puzzle, state)).toBeNull();
  });

  it('refuses another move and leaves the state as it was', () => {
    const state = startPuzzle(puzzle)!;
    const answer = answerPuzzle(puzzle, state, { from: 'h6', to: 'h7' });
    expect(answer.correct).toBe(false);
    expect(answer.state).toBe(state);
  });

  it('refuses an illegal move', () => {
    const state = startPuzzle(puzzle)!;
    expect(answerPuzzle(puzzle, state, { from: 'a1', to: 'a8' }).correct).toBe(false);
  });

  it('accepts another mate than the one of the solution', () => {
    const state = startPuzzle(twoMates)!;
    const answer = answerPuzzle(twoMates, state, { from: 'c1', to: 'c8' });
    expect(answer.correct).toBe(true);
    expect(answer.state.solved).toBe(true);
    if (answer.correct) expect(answer.reply).toBeNull();
  });

  it('still refuses a move that does not mate when the solution does', () => {
    const state = startPuzzle(twoMates)!;
    expect(answerPuzzle(twoMates, state, { from: 'c1', to: 'c7' }).correct).toBe(false);
  });

  it('wants the promotion of the solution, unless the move mates', () => {
    const legal: Puzzle = {
      id: 'promo',
      fen: '7k/4P3/8/8/8/8/8/K7 b - - 0 1',
      moves: ['h8g8', 'e7e8q'],
      rating: 600,
      themes: [],
    };
    const state = startPuzzle(legal)!;
    expect(answerPuzzle(legal, state, { from: 'e7', to: 'e8', promotion: 'n' }).correct).toBe(false);
    expect(answerPuzzle(legal, state, { from: 'e7', to: 'e8', promotion: 'q' }).correct).toBe(true);
  });

  it('does nothing once solved', () => {
    const state = { ...startPuzzle(puzzle)!, solved: true };
    expect(answerPuzzle(puzzle, state, { from: 'e6', to: 'e7' }).correct).toBe(false);
  });
});

describe('sanOf', () => {
  it('writes a legal move in algebraic notation', () => {
    const state = startPuzzle(puzzle)!;
    expect(sanOf(state.fen, 'e6e7')).toBe('Rxe7');
  });

  it('gives null for an illegal move', () => {
    const state = startPuzzle(puzzle)!;
    expect(sanOf(state.fen, 'a1a8')).toBeNull();
  });
});
