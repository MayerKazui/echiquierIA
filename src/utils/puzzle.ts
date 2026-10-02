import { Chess } from 'chess.js';
import type { Puzzle } from './puzzleData';

/**
 * Playing a puzzle. The moves of a Lichess puzzle are UCI and alternate: the opponent's move that leads to the
 * position to solve, then the player's answer, the opponent's reply, and so on until the player's last move. No
 * engine is needed: an answer is right if it is the next move of the solution, or if it mates (Lichess accepts
 * any mate, whatever the solution says).
 */

export interface PuzzleState {
  /** The position the player has to move in. */
  fen: string;
  /** Index in `puzzle.moves` of the move the player has to find. */
  step: number;
  /** The last move played on the board (to highlight it), if any. */
  lastMove: { from: string; to: string } | null;
  solved: boolean;
}

export type PuzzleAnswer =
  /** `reply` is the opponent's answer, null when the puzzle is solved with this move. */
  | { correct: true; state: PuzzleState; reply: { from: string; to: string; promotion?: string } | null }
  | { correct: false; state: PuzzleState };

interface UciMove {
  from: string;
  to: string;
  promotion?: string;
}

export function parseUci(uci: string): UciMove {
  return { from: uci.substring(0, 2), to: uci.substring(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

function play(fen: string, uci: string): Chess | null {
  try {
    const chess = new Chess(fen);
    chess.move(parseUci(uci));
    return chess;
  } catch {
    return null;
  }
}

/** The color of the player: the one who is not moving first in the puzzle. */
export function solverColor(puzzle: Puzzle): 'w' | 'b' {
  return puzzle.fen.split(' ')[1] === 'w' ? 'b' : 'w';
}

/** The position to solve, once the opponent's first move is played. Null if the puzzle is damaged. */
export function startPuzzle(puzzle: Puzzle): PuzzleState | null {
  const chess = play(puzzle.fen, puzzle.moves[0]);
  if (!chess) return null;
  const { from, to } = parseUci(puzzle.moves[0]);
  return { fen: chess.fen(), step: 1, lastMove: { from, to }, solved: false };
}

/** The move the player has to find (for a hint or to show the solution), null once solved. */
export function expectedMove(puzzle: Puzzle, state: PuzzleState): UciMove | null {
  return state.solved || state.step >= puzzle.moves.length ? null : parseUci(puzzle.moves[state.step]);
}

const sameMove = (a: UciMove, b: UciMove): boolean =>
  a.from === b.from && a.to === b.to && (a.promotion ?? '') === (b.promotion ?? '');

/**
 * What an answer of the player does. A wrong answer leaves the state as it was (the screen decides whether the
 * player may try again); a right one plays it and the opponent's reply.
 */
export function answerPuzzle(puzzle: Puzzle, state: PuzzleState, answer: UciMove): PuzzleAnswer {
  const wrong: PuzzleAnswer = { correct: false, state };
  const expected = expectedMove(puzzle, state);
  if (!expected) return wrong;
  const chess = play(state.fen, `${answer.from}${answer.to}${answer.promotion ?? ''}`);
  if (!chess) return wrong;
  // Another way to mate is as good as the one of the solution
  const mates = chess.isCheckmate();
  if (!sameMove(expected, answer) && !mates) return wrong;
  const played = { from: answer.from, to: answer.to };
  const replyUci = puzzle.moves[state.step + 1];
  if (mates || replyUci === undefined) {
    return {
      correct: true,
      reply: null,
      state: { fen: chess.fen(), step: state.step + 1, lastMove: played, solved: true },
    };
  }
  const afterReply = play(chess.fen(), replyUci);
  if (!afterReply) return wrong;
  const reply = parseUci(replyUci);
  const step = state.step + 2;
  // A solution that ends on the opponent's move (not the case in the database) is solved all the same
  const solved = step >= puzzle.moves.length;
  return {
    correct: true,
    reply,
    state: { fen: afterReply.fen(), step, lastMove: { from: reply.from, to: reply.to }, solved },
  };
}
