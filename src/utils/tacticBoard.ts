import type { Chess, Color, PieceSymbol, Square } from 'chess.js';

/** What the tactical detectors share: piece values, who is where, and whether an attack wins a piece. */

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

export function pieceSquares(chess: Chess, color: Color): Array<{ square: Square; type: PieceSymbol }> {
  const result: Array<{ square: Square; type: PieceSymbol }> = [];
  for (const row of chess.board()) {
    for (const piece of row)
      if (piece && piece.color === color) result.push({ square: piece.square, type: piece.type });
  }
  return result;
}

export const kingSquareOf = (chess: Chess, color: Color): Square | null =>
  pieceSquares(chess, color).find((p) => p.type === 'k')?.square ?? null;

/** The attacker (of the squares `attackers`) that costs least: the one that would take. */
export const cheapest = (chess: Chess, attackers: readonly Square[]): number =>
  Math.min(...attackers.map((a) => VALUE[chess.get(a)!.type] || 100));

/**
 * Whether `attackers` (of the colour `by`) win the piece standing on `target`: nobody defends it, or the cheapest
 * of them is worth less than the piece.
 */
export function wins(chess: Chess, target: Square, by: Color, attackers: readonly Square[]): boolean {
  const piece = chess.get(target);
  if (!piece || piece.type === 'k' || attackers.length === 0) return false;
  const isDefended = chess.attackers(target, other(by)).length > 0;
  return !isDefended || cheapest(chess, attackers) < VALUE[piece.type];
}

/** The pieces (not pawns) that `by` could win right now. */
export function winnable(chess: Chess, by: Color): Square[] {
  return pieceSquares(chess, other(by))
    .filter(({ type }) => type !== 'k' && VALUE[type] >= 3)
    .map(({ square }) => square)
    .filter((square) => wins(chess, square, by, chess.attackers(square, by)));
}

/** The piece that moved attacks two things at once: the king (a check) or pieces it wins. */
export function forks(after: Chess, mover: Color, to: Square): boolean {
  const targets = pieceSquares(after, other(mover)).filter(({ square, type }) => {
    if (!after.attackers(square, mover).includes(to)) return false;
    return type === 'k' || (VALUE[type] >= 3 && wins(after, square, mover, [to]));
  });
  return targets.length >= 2;
}
