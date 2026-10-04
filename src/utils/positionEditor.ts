import { Chess } from 'chess.js';

/**
 * The position editor works on the six fields of a FEN, not on a `Chess` object: while a position is being built it
 * is usually not a legal one (no king yet, an empty board), and chess.js refuses to load those.
 */
export type PieceColor = 'w' | 'b';
export type PieceKind = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

export interface EditorPiece {
  type: PieceKind;
  color: PieceColor;
}

export interface EditorPosition {
  /** The first field of the FEN: the pieces, rank 8 first. */
  placement: string;
  turn: PieceColor;
  /** The third field: "KQkq" in part or "-". */
  castling: string;
  /** The en-passant square or "-". */
  enPassant: string;
  halfmove: number;
  fullmove: number;
}

export const STANDARD_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
export const EMPTY_PLACEMENT = '8/8/8/8/8/8/8/8';

export const STANDARD_POSITION: EditorPosition = {
  placement: STANDARD_PLACEMENT,
  turn: 'w',
  castling: 'KQkq',
  enPassant: '-',
  halfmove: 0,
  fullmove: 1,
};

export const EMPTY_POSITION: EditorPosition = {
  placement: EMPTY_PLACEMENT,
  turn: 'w',
  castling: '-',
  enPassant: '-',
  halfmove: 0,
  fullmove: 1,
};

const FILES = 'abcdefgh';
const KINDS = 'kqrbnp';

/** The 64 squares, a8 first (the order of a FEN), `null` for an empty one. Anything that is not a placement: null. */
export function parsePlacement(placement: string): Array<EditorPiece | null> | null {
  const ranks = placement.split('/');
  if (ranks.length !== 8) return null;
  const squares: Array<EditorPiece | null> = [];
  for (const rank of ranks) {
    let count = 0;
    for (const char of rank) {
      if (/[1-8]/.test(char)) {
        for (let i = 0; i < Number(char); i++) squares.push(null);
        count += Number(char);
      } else if (KINDS.includes(char.toLowerCase())) {
        squares.push({ type: char.toLowerCase() as PieceKind, color: char === char.toUpperCase() ? 'w' : 'b' });
        count += 1;
      } else {
        return null;
      }
    }
    if (count !== 8) return null;
  }
  return squares;
}

/** The inverse of `parsePlacement`. */
export function formatPlacement(squares: ReadonlyArray<EditorPiece | null>): string {
  const ranks: string[] = [];
  for (let rank = 0; rank < 8; rank++) {
    let text = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = squares[rank * 8 + file];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) text += empty;
      empty = 0;
      text += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    }
    ranks.push(empty > 0 ? text + empty : text);
  }
  return ranks.join('/');
}

/** Index of a square ("e4") in the list of `parsePlacement`; -1 for anything else. */
export function squareIndex(square: string): number {
  const file = FILES.indexOf(square[0] ?? '');
  const rank = Number(square[1]);
  if (file === -1 || square.length !== 2 || !(rank >= 1 && rank <= 8)) return -1;
  return (8 - rank) * 8 + file;
}

/** Sides to keep a castling right: king and rook still on their first squares. */
const CASTLING_SQUARES: Record<string, [king: string, rook: string, piece: EditorPiece, rookPiece: EditorPiece]> = {
  K: ['e1', 'h1', { type: 'k', color: 'w' }, { type: 'r', color: 'w' }],
  Q: ['e1', 'a1', { type: 'k', color: 'w' }, { type: 'r', color: 'w' }],
  k: ['e8', 'h8', { type: 'k', color: 'b' }, { type: 'r', color: 'b' }],
  q: ['e8', 'a8', { type: 'k', color: 'b' }, { type: 'r', color: 'b' }],
};

const same = (a: EditorPiece | null | undefined, b: EditorPiece) => a?.type === b.type && a.color === b.color;

/** The castling rights of the list that the pieces still allow, in the order of a FEN ("KQkq"), or "-". */
export function allowedCastling(placement: string, castling: string): string {
  const squares = parsePlacement(placement);
  if (!squares) return '-';
  let kept = '';
  for (const right of 'KQkq') {
    if (!castling.includes(right)) continue;
    const [kingSquare, rookSquare, king, rook] = CASTLING_SQUARES[right];
    if (same(squares[squareIndex(kingSquare)], king) && same(squares[squareIndex(rookSquare)], rook)) kept += right;
  }
  return kept || '-';
}

/**
 * The en-passant square if the pieces make it one: the pawn that just moved two squares is there, the squares it
 * crossed are empty and a pawn of the side to move stands beside it. "-" otherwise.
 */
export function usableEnPassant(placement: string, turn: PieceColor, enPassant: string): string {
  const squares = parsePlacement(placement);
  if (!squares || enPassant.length !== 2) return '-';
  const file = FILES.indexOf(enPassant[0]);
  const rank = Number(enPassant[1]);
  const [targetRank, pawnRank, startRank, moverColor] =
    turn === 'w' ? [6, 5, 7, 'b' as const] : [3, 4, 2, 'w' as const];
  if (file === -1 || rank !== targetRank) return '-';
  const at = (f: number, r: number) => squares[squareIndex(`${FILES[f]}${r}`)];
  const isPawn = (piece: EditorPiece | null | undefined, color: PieceColor) =>
    piece?.type === 'p' && piece.color === color;
  if (!isPawn(at(file, pawnRank), moverColor) || at(file, targetRank) || at(file, startRank)) return '-';
  const capturers = [file - 1, file + 1].filter((f) => f >= 0 && f < 8);
  return capturers.some((f) => isPawn(at(f, pawnRank), turn)) ? enPassant : '-';
}

/** The castling rights the pieces allow at all (what the editor offers to tick). */
export function possibleCastling(placement: string): string {
  return allowedCastling(placement, 'KQkq');
}

/** The six fields as a FEN. The castling rights the pieces do not allow are dropped. */
export function formatFen(position: EditorPosition): string {
  const castling = allowedCastling(position.placement, position.castling);
  return [
    position.placement,
    position.turn,
    castling,
    usableEnPassant(position.placement, position.turn, position.enPassant),
    Math.max(0, Math.floor(position.halfmove)),
    Math.max(1, Math.floor(position.fullmove)),
  ].join(' ');
}

/**
 * The position of a FEN. Lenient: a position that is not legal (a king missing, say) is read all the same, and the
 * fields after the pieces may be left out ("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR" alone is the start).
 * Null when the pieces themselves cannot be read.
 */
export function parseFen(text: string): EditorPosition | null {
  const [placement, turn = 'w', castling = '-', enPassant = '-', halfmove = '0', fullmove = '1', ...extra] = text
    .trim()
    .split(/\s+/);
  if (!placement || extra.length > 0 || !parsePlacement(placement)) return null;
  if (turn !== 'w' && turn !== 'b') return null;
  if (!/^(-|[KQkq]+)$/.test(castling)) return null;
  if (!/^(-|[a-h][36])$/.test(enPassant)) return null;
  if (!/^\d+$/.test(halfmove) || !/^\d+$/.test(fullmove)) return null;
  return {
    placement,
    turn,
    castling,
    enPassant,
    halfmove: Number(halfmove),
    fullmove: Math.max(1, Number(fullmove)),
  };
}

/** The pieces after putting `piece` on a square (null empties it). A change of the pieces drops the en-passant square. */
export function withPiece(position: EditorPosition, square: string, piece: EditorPiece | null): EditorPosition {
  const squares = parsePlacement(position.placement);
  const index = squareIndex(square);
  if (!squares || index === -1) return position;
  squares[index] = piece;
  return { ...position, placement: formatPlacement(squares), enPassant: '-' };
}

/**
 * Puts `piece` on a square, as the editor's click does: the same piece already there is taken off, and a king that was
 * elsewhere moves (a side has one king, so a second one placed is the first one moved).
 */
export function placePiece(position: EditorPosition, square: string, piece: EditorPiece): EditorPosition {
  const squares = parsePlacement(position.placement);
  const index = squareIndex(square);
  if (!squares || index === -1) return position;
  const current = squares[index];
  if (current && current.type === piece.type && current.color === piece.color) {
    squares[index] = null;
  } else {
    if (piece.type === 'k') {
      squares.forEach((other, i) => {
        if (other && other.type === 'k' && other.color === piece.color) squares[i] = null;
      });
    }
    squares[index] = piece;
  }
  return { ...position, placement: formatPlacement(squares), enPassant: '-' };
}

export function pieceAt(position: EditorPosition, square: string): EditorPiece | null {
  return parsePlacement(position.placement)?.[squareIndex(square)] ?? null;
}

export type PositionProblem =
  'missingKing' | 'tooManyKings' | 'pawnOnEdge' | 'tooManyPawns' | 'tooManyPieces' | 'opponentInCheck' | 'invalid';

export const PROBLEM_TEXT: Record<PositionProblem, string> = {
  missingKing: 'Chaque camp doit avoir son roi.',
  tooManyKings: 'Chaque camp ne peut avoir qu’un seul roi.',
  pawnOnEdge: 'Un pion ne peut pas être sur la première ni sur la dernière rangée.',
  tooManyPawns: 'Un camp ne peut pas avoir plus de huit pions.',
  tooManyPieces: 'Un camp ne peut pas avoir plus de seize pièces.',
  opponentInCheck: 'Le camp qui n’a pas le trait est en échec : cette position est impossible.',
  invalid: 'Cette position n’est pas valide.',
};

export type PositionCheck = { ok: true; fen: string } | { ok: false; problem: PositionProblem };

/**
 * Whether the engine can be given the position: legal in the sense of the rules of the board (one king each, pawns
 * off the edge rows, the side that does not move is not in check). On success, the FEN is the clean one to send.
 */
export function checkPosition(position: EditorPosition): PositionCheck {
  const squares = parsePlacement(position.placement);
  if (!squares) return { ok: false, problem: 'invalid' };

  const count = (color: PieceColor, type?: PieceKind) =>
    squares.filter((p) => p && p.color === color && (type === undefined || p.type === type)).length;
  for (const color of ['w', 'b'] as const) {
    const kings = count(color, 'k');
    if (kings === 0) return { ok: false, problem: 'missingKing' };
    if (kings > 1) return { ok: false, problem: 'tooManyKings' };
  }
  if (squares.some((p, i) => p?.type === 'p' && (i < 8 || i >= 56))) return { ok: false, problem: 'pawnOnEdge' };
  if (count('w', 'p') > 8 || count('b', 'p') > 8) return { ok: false, problem: 'tooManyPawns' };
  if (count('w') > 16 || count('b') > 16) return { ok: false, problem: 'tooManyPieces' };

  // The side that does not have the move cannot be in check: chess.js lets it through, the engine does not
  const waiting = position.turn === 'w' ? 'b' : 'w';
  try {
    const flipped = new Chess(formatFen({ ...position, turn: waiting, enPassant: '-' }), { skipValidation: true });
    if (flipped.inCheck()) return { ok: false, problem: 'opponentInCheck' };
  } catch {
    return { ok: false, problem: 'invalid' };
  }

  const fen = formatFen(position);
  try {
    new Chess(fen);
    return { ok: true, fen };
  } catch {
    // An en-passant square with no capture that is legal: the position is fine without it
    try {
      const withoutEnPassant = formatFen({ ...position, enPassant: '-' });
      new Chess(withoutEnPassant);
      return { ok: true, fen: withoutEnPassant };
    } catch {
      return { ok: false, problem: 'invalid' };
    }
  }
}

/** How the game stands in a position the engine can be given: nothing to search when it is over. */
export type PositionEnd =
  { kind: 'checkmate'; winner: PieceColor } | { kind: 'draw'; reason: 'stalemate' | 'material' };

export function positionEnd(fen: string): PositionEnd | null {
  try {
    const chess = new Chess(fen);
    if (chess.isCheckmate()) return { kind: 'checkmate', winner: chess.turn() === 'w' ? 'b' : 'w' };
    if (chess.isStalemate()) return { kind: 'draw', reason: 'stalemate' };
    if (chess.isInsufficientMaterial()) return { kind: 'draw', reason: 'material' };
  } catch {
    // Not a position: the caller checks it first
  }
  return null;
}
