import type { Chess, Color, Move } from 'chess.js';
import { chessFromFen } from './chessFromFen';

/**
 * The quiet faults of the middlegame, told apart by what the move changes on the board rather than by a tactic: a pawn
 * pushed in front of the king, a piece pulled back or left with fewer
 * moves than the engine's move would give. They are read from the position before the move, the move and the
 * engine's move, so they work on the light version of an old game too.
 */

export type PositionalKind = 'king' | 'passive';

/** Moves the mover's side has less after its move than after the engine's: a piece left without a post. */
const MIN_MOBILITY_GAP = 6;

const fileOf = (square: string): number => square.charCodeAt(0) - 97;

interface Played {
  /** The position after the move. */
  after: Chess;
  move: Move;
}

function play(fen: string, uci: string): Played | null {
  if (!fen || uci.length < 4) return null;
  try {
    const after = chessFromFen(fen);
    const move = after.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return { after, move };
  } catch {
    return null;
  }
}

/** How many moves `color` has in the position, as if it were to play. */
function mobility(chess: Chess, color: Color): number {
  try {
    const parts = chess.fen().split(' ');
    parts[1] = color;
    parts[3] = '-';
    return chessFromFen(parts.join(' ')).moves().length;
  } catch {
    return 0;
  }
}

/** The king's file when it has left the centre to a corner (castled, or tucked away), with its back rank. */
function shelteredKing(chess: Chess, color: Color): { file: number } | null {
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.type !== 'k' || piece.color !== color) continue;
      const onBackRank = piece.square[1] === (color === 'w' ? '1' : '8');
      const file = fileOf(piece.square);
      return onBackRank && (file <= 2 || file >= 6) ? { file } : null;
    }
  }
  return null;
}

const rankFrom = (square: string, color: Color): number => (color === 'w' ? Number(square[1]) : 9 - Number(square[1]));

/**
 * What kind of quiet fault the move is, if it is one of these (null otherwise):
 * - `king`: a pawn pushed in front of the castled king, which the engine's move did not do.
 * - `passive`: a piece pulled back, or a move after which the side has far fewer moves than after the engine's.
 */
export function positionalKind(fenBefore: string, playedUci: string, bestUci: string): PositionalKind | null {
  const played = play(fenBefore, playedUci);
  const best = bestUci && bestUci !== playedUci ? play(fenBefore, bestUci) : null;
  if (!played || !best) return null;
  const color = played.move.color;
  const { move } = played;

  const king = shelteredKing(chessFromFen(fenBefore), color);
  if (
    king &&
    move.piece === 'p' &&
    !move.captured &&
    Math.abs(fileOf(move.from) - king.file) <= 1 &&
    !(best.move.piece === 'p' && Math.abs(fileOf(best.move.from) - king.file) <= 1)
  ) {
    return 'king';
  }

  if (move.piece === 'p') return null;

  if (move.piece !== 'k' && !move.captured) {
    const retreat = rankFrom(move.to, color) < rankFrom(move.from, color);
    const gap = mobility(best.after, color) - mobility(played.after, color);
    if (gap >= MIN_MOBILITY_GAP || (retreat && gap > 0)) return 'passive';
  }
  return null;
}
