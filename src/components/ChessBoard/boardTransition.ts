import { Chess, type Color, type PieceSymbol } from 'chess.js';

export interface BoardPiece {
  type: PieceSymbol;
  color: Color;
}

/** What changes on the board between two positions, to animate the step (forward or backward). */
export interface BoardTransition {
  /** Pieces that slide: destination square -> square they come from (the king and the rook when castling). */
  slides: Record<string, string>;
  /** Pieces that disappear (captured by the move): square -> piece, shown fading out under the mover. */
  vanished: Record<string, BoardPiece>;
  /** Squares where a piece reappears (a capture taken back). */
  appeared: string[];
}

/** More changed squares than a castling (4) is a jump, not a step: no animation. */
const MAX_CHANGED_SQUARES = 4;

type Placement = Record<string, BoardPiece>;

function placementOf(fen: string): Placement | null {
  try {
    const placement: Placement = {};
    for (const row of new Chess(fen).board()) {
      for (const cell of row) if (cell) placement[cell.square] = { type: cell.type, color: cell.color };
    }
    return placement;
  } catch {
    return null;
  }
}

const same = (a?: BoardPiece, b?: BoardPiece) => a?.type === b?.type && a?.color === b?.color;

/**
 * Compares two positions and describes how to go from the first to the second. It does not matter whether
 * the second one comes after the first in the game or before: a piece always slides from the square it was
 * on to the square it is on now, and only a capture (or a capture taken back) needs to know the direction,
 * which the squares tell (a piece that is gone fades out, a piece that is back fades in).
 * Returns null when nothing changed or when the positions differ by more than one move.
 */
export function diffPositions(previousFen: string, nextFen: string): BoardTransition | null {
  const before = placementOf(previousFen);
  const after = placementOf(nextFen);
  if (!before || !after) return null;

  const removed: string[] = []; // squares whose piece is no longer there
  const added: string[] = []; // squares that now hold a different piece
  for (const square of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[square], after[square])) continue;
    if (before[square]) removed.push(square);
    if (after[square]) added.push(square);
  }
  if (removed.length === 0 && added.length === 0) return null;
  if (new Set([...removed, ...added]).size > MAX_CHANGED_SQUARES) return null;

  const slides: Record<string, string> = {};
  const unmatched = new Set(removed);
  const unplaced: string[] = [];

  for (const destination of added) {
    const piece = after[destination];
    // The same piece left another square; failing that, a pawn that promoted on its last rank
    const source =
      removed.find((s) => unmatched.has(s) && same(before[s], piece)) ??
      removed.find(
        (s) =>
          unmatched.has(s) &&
          before[s].type === 'p' &&
          before[s].color === piece.color &&
          piece.type !== 'p' &&
          (destination[1] === '8' || destination[1] === '1')
      );
    if (source) {
      slides[destination] = source;
      unmatched.delete(source);
    } else {
      unplaced.push(destination);
    }
  }

  const vanished: Record<string, BoardPiece> = {};
  for (const square of unmatched) vanished[square] = before[square];

  return { slides, vanished, appeared: unplaced };
}
