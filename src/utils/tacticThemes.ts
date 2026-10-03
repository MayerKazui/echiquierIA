import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { chessFromFen } from './chessFromFen';
import { SACRIFICE_MIN, materialSacrificed } from './sacrifice';
import { analyzeTacticalThreatsForMove } from './tacticalThreats';

/**
 * The tactical themes a move carries, named as the Lichess puzzles name them (so that a theme found in a game leads to
 * the puzzles of the same theme). They are read from the position before the move and the move itself, which is all
 * that is kept of an old game.
 *
 * It is a detector, not a proof: each theme is a simple, concrete test on the position after the move (a piece that
 * can be won, a check by a piece that did not move, a mate on the back rank…), meant to name what the engine's move
 * did that another move did not.
 */

export type TacticTheme =
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'hangingPiece'
  | 'discoveredAttack'
  | 'discoveredCheck'
  | 'doubleCheck'
  | 'capturingDefender'
  | 'backRankMate'
  | 'smotheredMate'
  | 'promotion'
  | 'sacrifice';

/** Most telling first: when a move has several themes, the first is the one named. */
export const TACTIC_THEMES: readonly TacticTheme[] = [
  'backRankMate',
  'smotheredMate',
  'doubleCheck',
  'discoveredCheck',
  'discoveredAttack',
  'fork',
  'skewer',
  'pin',
  'capturingDefender',
  'hangingPiece',
  'promotion',
  'sacrifice',
];

/** Names and one-line explanations, for the screens that show the theme of an error. */
export const TACTIC_THEME_TEXT: Record<TacticTheme, { label: string; hint: string }> = {
  backRankMate: {
    label: 'Mat du couloir',
    hint: 'Le roi adverse, enfermé derrière ses pions, est maté sur sa dernière rangée.',
  },
  smotheredMate: {
    label: 'Mat étouffé',
    hint: 'Un cavalier mate un roi dont toutes les cases sont occupées par ses propres pièces.',
  },
  doubleCheck: {
    label: 'Double échec',
    hint: 'Deux pièces donnent échec en même temps : seul un coup du roi y répond.',
  },
  discoveredCheck: {
    label: 'Échec à la découverte',
    hint: "Une pièce s'écarte et en démasque une autre qui donne échec.",
  },
  discoveredAttack: {
    label: 'Attaque à la découverte',
    hint: "Une pièce s'écarte et en démasque une autre qui attaque une pièce adverse.",
  },
  fork: { label: 'Fourchette', hint: 'Une pièce en attaque deux à la fois.' },
  skewer: {
    label: 'Enfilade',
    hint: "Une pièce de valeur est attaquée, et en s'écartant laisse prendre celle qui est derrière.",
  },
  pin: {
    label: 'Clouage',
    hint: 'Une pièce ne peut pas bouger sans en laisser prendre une plus précieuse derrière elle.',
  },
  capturingDefender: {
    label: 'Capture du défenseur',
    hint: 'On prend la pièce qui protégeait une autre, qui tombe ensuite.',
  },
  hangingPiece: { label: 'Pièce en prise', hint: 'Une pièce adverse est attaquée et personne ne la défend.' },
  promotion: { label: 'Promotion', hint: 'Un pion arrive sur la dernière rangée et devient une pièce.' },
  sacrifice: {
    label: 'Sacrifice',
    hint: 'On donne du matériel pour obtenir davantage : une attaque, un mat ou un gain plus grand.',
  },
};

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

function pieceSquares(chess: Chess, color: Color): Array<{ square: Square; type: PieceSymbol }> {
  const result: Array<{ square: Square; type: PieceSymbol }> = [];
  for (const row of chess.board()) {
    for (const piece of row)
      if (piece && piece.color === color) result.push({ square: piece.square, type: piece.type });
  }
  return result;
}

const kingSquareOf = (chess: Chess, color: Color): Square | null =>
  pieceSquares(chess, color).find((p) => p.type === 'k')?.square ?? null;

/** The attacker (of the squares `attackers`) that costs least: the one that would take. */
const cheapest = (chess: Chess, attackers: readonly Square[]): number =>
  Math.min(...attackers.map((a) => VALUE[chess.get(a)!.type] || 100));

/**
 * Whether `attackers` (of the colour `by`) win the piece standing on `target`: nobody defends it, or the cheapest
 * of them is worth less than the piece.
 */
function wins(chess: Chess, target: Square, by: Color, attackers: readonly Square[]): boolean {
  const piece = chess.get(target);
  if (!piece || piece.type === 'k' || attackers.length === 0) return false;
  const isDefended = chess.attackers(target, other(by)).length > 0;
  return !isDefended || cheapest(chess, attackers) < VALUE[piece.type];
}

/** The pieces (not pawns) that `by` could win right now. */
function winnable(chess: Chess, by: Color): Square[] {
  return pieceSquares(chess, other(by))
    .filter(({ type }) => type !== 'k' && VALUE[type] >= 3)
    .map(({ square }) => square)
    .filter((square) => wins(chess, square, by, chess.attackers(square, by)));
}

function checkThemes(after: Chess, mover: Color, to: Square, isCastling: boolean): TacticTheme[] {
  if (!after.inCheck()) return [];
  const king = kingSquareOf(after, other(mover));
  if (!king) return [];
  const checkers = after.attackers(king, mover);
  if (checkers.length >= 2) return ['doubleCheck'];
  return !isCastling && !checkers.includes(to) ? ['discoveredCheck'] : [];
}

function mateThemes(after: Chess, mover: Color, to: Square, piece: PieceSymbol): TacticTheme[] {
  if (!after.isCheckmate()) return [];
  const king = kingSquareOf(after, other(mover));
  if (!king) return [];
  const themes: TacticTheme[] = [];
  const backRank = mover === 'w' ? '8' : '1';
  if (king[1] === backRank && (piece === 'r' || piece === 'q') && to[1] === backRank) themes.push('backRankMate');
  if (piece === 'n') {
    // Checkmate: nothing takes the knight, so it is mate when every neighbour of the king is its own piece
    const file = king.charCodeAt(0) - 97;
    const rank = Number(king[1]) - 1;
    let smothered = true;
    for (let df = -1; df <= 1 && smothered; df++) {
      for (let dr = -1; dr <= 1 && smothered; dr++) {
        const f = file + df;
        const r = rank + dr;
        if ((df === 0 && dr === 0) || f < 0 || f > 7 || r < 0 || r > 7) continue;
        const neighbour = after.get((String.fromCharCode(97 + f) + (r + 1)) as Square);
        if (!neighbour || neighbour.color !== other(mover)) smothered = false;
      }
    }
    if (smothered) themes.push('smotheredMate');
  }
  return themes;
}

/** An attack that was not there before the move, by a piece other than the one that moved. */
function discoveredAttack(before: Chess, after: Chess, mover: Color, to: Square): boolean {
  const isNew = (square: Square) => (attacker: Square) =>
    attacker !== to && !before.attackers(square, mover).includes(attacker);
  return pieceSquares(after, other(mover))
    .filter(({ type }) => type !== 'k' && VALUE[type] >= 3)
    .some(({ square }) => {
      const fresh = after.attackers(square, mover).filter(isNew(square));
      return wins(after, square, mover, fresh);
    });
}

/**
 * The defender taken: the move captures a piece that protected another one, which the mover now wins. (A piece
 * already attacked and won before the move does not count.)
 */
function capturingDefender(before: Chess, after: Chess, mover: Color, to: Square, captured: PieceSymbol): boolean {
  if (VALUE[captured] === 0) return false;
  // The squares of the captured piece's side that it protected
  const capturedFrom = to;
  const wonBefore = new Set(winnable(before, mover));
  return pieceSquares(after, other(mover))
    .filter(({ type, square }) => type !== 'k' && VALUE[type] >= 3 && square !== capturedFrom)
    .some(({ square }) => {
      if (!before.attackers(square, other(mover)).includes(capturedFrom)) return false;
      if (wonBefore.has(square)) return false;
      return wins(after, square, mover, after.attackers(square, mover));
    });
}

/** The piece that moved attacks two things at once: the king (a check) or pieces it wins. */
function forks(after: Chess, mover: Color, to: Square): boolean {
  const targets = pieceSquares(after, other(mover)).filter(({ square, type }) => {
    if (!after.attackers(square, mover).includes(to)) return false;
    return type === 'k' || (VALUE[type] >= 3 && wins(after, square, mover, [to]));
  });
  return targets.length >= 2;
}

/** A piece that attacks a valuable piece with a less valuable one behind it (the pin the other way round). */
function skewers(after: Chess, mover: Color, to: Square): boolean {
  const piece = after.get(to);
  const directions: Record<string, number[][]> = {
    b: [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ],
    r: [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ],
    q: [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ],
  };
  const lines = piece ? directions[piece.type] : undefined;
  if (!lines) return false;
  const file0 = to.charCodeAt(0) - 97;
  const rank0 = Number(to[1]) - 1;
  for (const [df, dr] of lines) {
    const hit: Array<{ square: Square; type: PieceSymbol; color: Color }> = [];
    for (let f = file0 + df, r = rank0 + dr; f >= 0 && f < 8 && r >= 0 && r < 8 && hit.length < 2; f += df, r += dr) {
      const square = (String.fromCharCode(97 + f) + (r + 1)) as Square;
      const found = after.get(square);
      if (found) hit.push({ square, type: found.type, color: found.color });
    }
    const [first, second] = hit;
    if (!first || !second || first.color === mover || second.color === mover || second.type === 'k') continue;
    // The front piece is worth more than the one behind it (the king counts for the most): it has to move, and the
    // piece behind falls when the attacker wins it
    const frontValue = first.type === 'k' ? Infinity : VALUE[first.type];
    if (frontValue > VALUE[second.type] && frontValue >= 5 && wins(after, second.square, mover, [to])) return true;
  }
  return false;
}

/**
 * The themes of the move `uci` played from `fenBefore`, most telling first. Nothing when the move cannot be played
 * from that position.
 */
export function tacticThemesOfMove(fenBefore: string, uci: string): TacticTheme[] {
  if (!fenBefore || !uci || uci.length < 4) return [];
  try {
    const before = chessFromFen(fenBefore);
    const after = chessFromFen(fenBefore);
    const move = after.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    const mover = move.color;
    const to = move.to;
    const isCastling = move.isKingsideCastle() || move.isQueensideCastle();
    const found = new Set<TacticTheme>([
      ...checkThemes(after, mover, to, isCastling),
      ...mateThemes(after, mover, to, move.piece),
    ]);

    for (const threat of analyzeTacticalThreatsForMove(fenBefore, uci)) {
      if (threat.type === 'pin') found.add('pin');
      if (threat.type === 'hanging') found.add('hangingPiece');
    }
    if (!after.isCheckmate()) {
      if (forks(after, mover, to)) found.add('fork');
      if (!isCastling && discoveredAttack(before, after, mover, to)) found.add('discoveredAttack');
      if (skewers(after, mover, to)) found.add('skewer');
      if (move.captured && capturingDefender(before, after, mover, to, move.captured)) found.add('capturingDefender');
    }
    if (move.promotion) found.add('promotion');
    if (materialSacrificed(fenBefore, { from: move.from, to: move.to, promotion: move.promotion }) >= SACRIFICE_MIN) {
      found.add('sacrifice');
    }
    return TACTIC_THEMES.filter((theme) => found.has(theme));
  } catch {
    return [];
  }
}
