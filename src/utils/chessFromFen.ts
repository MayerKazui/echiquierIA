import { Chess } from 'chess.js';

/**
 * A game from a FEN. chess.js refuses an en-passant square whose capture is illegal (a pinned pawn, say), which our
 * own FENs can contain: the square is then dropped, which changes nothing about the moves of the position that
 * matter here. Throws, like `new Chess`, for a FEN that is wrong otherwise.
 */
export function chessFromFen(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch (error) {
    const parts = fen.split(' ');
    if (parts.length < 4 || parts[3] === '-') throw error;
    parts[3] = '-';
    return new Chess(parts.join(' '));
  }
}
