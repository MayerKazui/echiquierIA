import type { Chess, Color, Move, Square } from 'chess.js';
import { chessFromFen } from './chessFromFen';
import { SACRIFICE_MIN, materialSacrificed } from './sacrifice';
import { VALUE, forks, kingSquareOf, other, pieceSquares, winnable, wins } from './tacticBoard';

/**
 * The tactical themes that need a few moves of the opponent to be seen, not only the position after the move: a
 * trapped piece, a line cut (interference), a defender drawn away (deflection), a king drawn onto a square
 * (attraction), an exchange won by the piece behind (x-ray), a check put in before a capture (intermezzo) and a
 * defender asked to guard two things (overloading). Each one plays the replies out and tests what they leave.
 *
 * Every function takes the position before the move, the position after it (the opponent to move) and the move, and
 * answers whether the move carries the theme.
 */

interface Context {
  before: Chess;
  after: Chess;
  move: Move;
  mover: Color;
}

/** The position with `side` to move (the other things kept): to play the mover's moves again from the position after its own. */
function withTurn(chess: Chess, side: Color): Chess | null {
  try {
    const parts = chess.fen().split(' ');
    parts[1] = side;
    parts[3] = '-';
    return chessFromFen(parts.join(' '));
  } catch {
    return null;
  }
}

/** The position after a legal move of `chess`, `chess` left as it is; null when the move is not legal. */
function played(chess: Chess, from: string, to: string, promotion?: string): Chess | null {
  try {
    const next = chessFromFen(chess.fen());
    next.move({ from, to, promotion });
    return next;
  } catch {
    return null;
  }
}

const fileOf = (square: string): number => square.charCodeAt(0) - 97;
const rankOf = (square: string): number => Number(square[1]) - 1;

/** The squares strictly between two squares on a line (a file, a rank or a diagonal); null when they are not on one. */
function between(a: Square, b: Square): Square[] | null {
  const df = fileOf(b) - fileOf(a);
  const dr = rankOf(b) - rankOf(a);
  if (!(df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr)) || (df === 0 && dr === 0)) return null;
  const stepF = Math.sign(df);
  const stepR = Math.sign(dr);
  const squares: Square[] = [];
  for (let f = fileOf(a) + stepF, r = rankOf(a) + stepR; f !== fileOf(b) || r !== rankOf(b); f += stepF, r += stepR) {
    squares.push((String.fromCharCode(97 + f) + (r + 1)) as Square);
  }
  return squares;
}

const isSlider = (type: string): boolean => type === 'b' || type === 'r' || type === 'q';

/** Whether the line from `from` to `to` can be travelled by that kind of slider (a bishop on a rank is no line). */
function sliderFits(type: string, from: Square, to: Square): boolean {
  const straight = fileOf(from) === fileOf(to) || rankOf(from) === rankOf(to);
  return type === 'q' || (type === 'r' && straight) || (type === 'b' && !straight);
}

/**
 * A piece (a knight, a bishop, a rook or a queen) the mover attacks and wins, and that cannot run away: every one of
 * its moves, and every other move of the opponent, leaves it lost. A piece already lost before the move does not
 * count: the move is the one that shut it in.
 */
export function trappedPiece({ before, after, mover }: Context): boolean {
  if (after.inCheck() || after.isGameOver()) return false;
  const enemy = other(mover);
  const lostBefore = new Set(winnable(before, mover));
  const replies = after.moves({ verbose: true });
  for (const { square, type } of pieceSquares(after, enemy)) {
    if (type === 'k' || type === 'p' || VALUE[type] < 3 || lostBefore.has(square)) continue;
    if (!wins(after, square, mover, after.attackers(square, mover))) continue;
    const isSaved = replies.some((reply) => {
      // A capture of something worth as much as the piece is a trade, not an escape worth testing further
      if (reply.captured && VALUE[reply.captured] >= VALUE[type]) return true;
      const next = played(after, reply.from, reply.to, reply.promotion);
      if (!next) return false;
      const target = reply.from === square ? reply.to : square;
      return !wins(next, target, mover, next.attackers(target, mover));
    });
    if (!isSaved) return true;
  }
  return false;
}

/**
 * A piece of the mover's lands between an enemy slider and the piece it guarded, which was safe and now falls: the
 * line is cut. (Taking the guard is another theme.)
 */
export function interference({ before, after, move, mover }: Context): boolean {
  const enemy = other(mover);
  for (const { square, type } of pieceSquares(after, enemy)) {
    if (type === 'k' || VALUE[type] < 3) continue;
    const lost = before.attackers(square, enemy).filter((guard) => {
      if (after.attackers(square, enemy).includes(guard)) return false;
      const piece = before.get(guard);
      const line =
        piece && isSlider(piece.type) && sliderFits(piece.type, guard, square) ? between(guard, square) : null;
      return line !== null && line.includes(move.to);
    });
    if (lost.length === 0) continue;
    const wasSafe = !wins(before, square, mover, before.attackers(square, mover));
    if (wasSafe && wins(after, square, mover, after.attackers(square, mover))) return true;
  }
  return false;
}

/** The legal moves of the opponent that take the piece standing on the square the mover moved to. */
const takesOnLanding = (after: Chess, to: Square): Move[] =>
  after.moves({ verbose: true }).filter((reply) => reply.to === to && reply.captured);

/**
 * A guard drawn away: the mover offers a piece, and whoever takes it (every taker) leaves behind a piece that it
 * guarded, which the mover now wins. (A guard taken on the spot is the capture of the defender.)
 */
export function deflection({ before, after, move, mover }: Context): boolean {
  if (move.captured || after.inCheck()) return false;
  const enemy = other(mover);
  const takers = takesOnLanding(after, move.to);
  if (takers.length === 0) return false;
  return takers.every((taker) => {
    const next = played(after, taker.from, taker.to, taker.promotion);
    if (!next) return false;
    return pieceSquares(next, enemy).some(({ square, type }) => {
      if (type === 'k' || VALUE[type] < 3 || square === taker.to) return false;
      if (!before.attackers(square, enemy).includes(taker.from)) return false;
      if (wins(before, square, mover, before.attackers(square, mover))) return false;
      return wins(next, square, mover, next.attackers(square, mover));
    });
  });
}

/**
 * The king drawn onto a square: the mover gives a piece the king alone can take, and once it has, a mate or a check
 * that forks follows.
 */
export function attraction({ after, move, mover }: Context): boolean {
  if (!after.inCheck()) return false;
  const king = kingSquareOf(after, other(mover));
  if (!king) return false;
  const takers = takesOnLanding(after, move.to);
  if (takers.length !== 1 || takers[0].piece !== 'k') return false;
  const next = played(after, takers[0].from, takers[0].to);
  if (!next) return false;
  return next.moves({ verbose: true }).some((follow) => {
    const reply = played(next, follow.from, follow.to, follow.promotion);
    if (!reply || !reply.inCheck()) return false;
    return reply.isCheckmate() || forks(reply, mover, follow.to);
  });
}

/**
 * An exchange won thanks to a slider that reaches the square only through another piece (the x-ray): with it the
 * capture holds, without it the capture loses material.
 */
export function xRayAttack({ before, after, move, mover }: Context): boolean {
  if (!move.captured) return false;
  const given = materialSacrificed(before.fen(), { from: move.from, to: move.to, promotion: move.promotion });
  if (given >= SACRIFICE_MIN) return false;
  for (const { square, type } of pieceSquares(after, mover)) {
    if (!isSlider(type) || square === move.to || !sliderFits(type, square, move.to)) continue;
    const path = between(square, move.to);
    // It must see the square through exactly one piece, and an enemy one: through its own it is a battery
    const blockers = path?.filter((s) => after.get(s)) ?? [];
    if (blockers.length !== 1 || after.get(blockers[0])?.color === mover) continue;
    // The same exchange without that slider
    const without = chessFromFen(before.fen());
    without.remove(square);
    let alone: number;
    try {
      alone = materialSacrificed(without.fen(), { from: move.from, to: move.to, promotion: move.promotion });
    } catch {
      continue;
    }
    if (alone - given >= SACRIFICE_MIN) return true;
  }
  return false;
}

/**
 * A check put in before the capture that was waiting: the mover could take a piece and gives check first, and
 * whatever the opponent answers, the capture is still there.
 */
export function intermezzo({ before, after, move, mover }: Context): boolean {
  if (move.captured || !after.inCheck() || after.isCheckmate()) return false;
  const waiting = before
    .moves({ verbose: true })
    .filter((m) => m.captured && VALUE[m.captured] >= 3 && m.from !== move.from)
    .filter(
      (m) => materialSacrificed(before.fen(), { from: m.from, to: m.to, promotion: m.promotion }) <= -SACRIFICE_MIN
    );
  if (waiting.length === 0) return false;
  const replies = after.moves({ verbose: true });
  return waiting.some((capture) =>
    replies.every((reply) => {
      const next = played(after, reply.from, reply.to, reply.promotion);
      const again = next && withTurn(next, mover);
      return Boolean(again?.moves({ verbose: true }).some((m) => m.from === capture.from && m.to === capture.to));
    })
  );
}

/**
 * A guard with two jobs: two pieces the mover attacks that the same piece alone guards. The mover takes one, the
 * guard recaptures, and the other falls.
 */
export function overloading({ after, mover }: Context): boolean {
  const enemy = other(mover);
  const attacked = pieceSquares(after, enemy)
    .filter(({ type }) => type !== 'k' && VALUE[type] >= 3)
    .map(({ square, type }) => ({
      square,
      type,
      attackers: after.attackers(square, mover),
      guards: after.attackers(square, enemy),
    }))
    .filter((p) => p.attackers.length > 0 && p.guards.length === 1)
    // A piece that is simply won is the hanging-piece theme
    .filter((p) => !wins(after, p.square, mover, p.attackers));
  for (const first of attacked) {
    const second = attacked.find((p) => p.square !== first.square && p.guards[0] === first.guards[0]);
    if (!second) continue;
    const taker = first.attackers
      .map((square) => ({ square, value: VALUE[after.get(square)!.type] || 100 }))
      .sort((a, b) => a.value - b.value)[0];
    if (taker.value > VALUE[first.type]) continue;
    const mine = withTurn(after, mover);
    const taken = mine && played(mine, taker.square, first.square);
    if (!taken) continue;
    // The guard takes back, which leaves the other piece alone
    const back = taken.moves({ verbose: true }).find((m) => m.from === first.guards[0] && m.to === first.square);
    const recaptured = back && played(taken, back.from, back.to, back.promotion);
    if (!recaptured) continue;
    const next = withTurn(recaptured, mover);
    if (next && wins(next, second.square, mover, next.attackers(second.square, mover))) return true;
  }
  return false;
}
