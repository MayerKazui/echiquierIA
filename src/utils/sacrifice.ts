import { Chess, type PieceSymbol } from 'chess.js';

/** Material values in centipawns; both minor pieces are worth the same, so that a bishop for a knight is not a sacrifice. */
const VALUE: Record<PieceSymbol, number> = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 0 };

/**
 * What a move must give up, net, to count as a sacrifice: a minor piece for a pawn (200), or the exchange (a rook for
 * a minor piece). A pawn, or a piece for two pawns, is a gambit rather than a sacrifice.
 */
export const SACRIFICE_MIN = 200;

/** How many captures deep the exchange is followed (a long chain on one square has settled well before). */
const MAX_CAPTURES = 8;

function balance(chess: Chess, side: 'w' | 'b'): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece) total += piece.color === side ? VALUE[piece.type] : -VALUE[piece.type];
    }
  }
  return total;
}

/**
 * Material balance for the side to move once the captures have run their course: each side may take or stop
 * (alpha-beta over captures only). It is the static exchange evaluation, but exact on pins and recaptures since the
 * moves are the real legal ones.
 */
function settle(chess: Chess, alpha: number, beta: number, captures: number): number {
  const side = chess.turn();
  const standPat = balance(chess, side);
  if (standPat >= beta) return beta;
  if (captures === 0) return standPat;
  alpha = Math.max(alpha, standPat);
  const takes = chess
    .moves({ verbose: true })
    .filter((m) => m.captured)
    // The most valuable victim by the least valuable attacker first: cuts the search short
    .sort((a, b) => VALUE[b.captured!] - VALUE[b.piece] - (VALUE[a.captured!] - VALUE[a.piece]));
  for (const take of takes) {
    chess.move(take);
    const score = -settle(chess, -beta, -alpha, captures - 1);
    chess.undo();
    if (score >= beta) return beta;
    alpha = Math.max(alpha, score);
  }
  return alpha;
}

/**
 * The material, in centipawns, a move gives up for good: the balance before it, minus the balance once the captures
 * that follow have been played out (both sides take what is best for them). A recapture, an equal trade or a free
 * capture gives 0 or less; leaving a queen to a pawn gives 900; Bxh7+ Kxh7 gives 200.
 */
export function materialSacrificed(fen: string, move: { from: string; to: string; promotion?: string }): number {
  const chess = new Chess(fen);
  const mover = chess.turn();
  const before = balance(chess, mover);
  chess.move(move);
  // The opponent is to move: its balance is the mirror of the mover's
  const after = -settle(chess, -Infinity, Infinity, MAX_CAPTURES);
  return before - after;
}
