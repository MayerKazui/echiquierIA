import { MoveAnalysis, MoveClassification } from '../types/chess';
import { toFrenchSan } from './chessNotation';

export const CLASSIFICATION_LABELS: Record<MoveClassification, string> = {
  brilliant: 'Coup brillant',
  great: 'Très bon coup',
  best: 'Meilleur coup',
  excellent: 'Excellent coup',
  good: 'Bon coup',
  inaccuracy: 'Imprécision',
  mistake: 'Erreur',
  blunder: 'Gaffe critique',
  missedWin: 'Occasion manquée',
  book: 'Coup théorique',
};

/** Classifications worth pointing out with the better move that was available. */
const FAULTS: readonly MoveClassification[] = ['inaccuracy', 'mistake', 'blunder', 'missedWin'];

/** Evaluation as a screen reader should read it: "+0,3" (decimal comma) or "mat en 3". */
export function formatEvaluationForSpeech(cp: number, mate: number | null): string {
  if (mate !== null) return `mat en ${Math.abs(mate)} pour les ${mate > 0 ? 'Blancs' : 'Noirs'}`;
  const pawns = (cp / 100).toFixed(1).replace('.', ',');
  return cp > 0 ? `+${pawns}` : pawns;
}

/** One-sentence announcement of a move, read when the user navigates in the game. */
export function describeMove(move: MoveAnalysis | null, totalMoves: number): string {
  if (!move) return 'Position initiale';

  const parts = [
    `Coup ${move.moveNumber}, ${move.color === 'w' ? 'Blancs' : 'Noirs'} : ${toFrenchSan(move.san)}`,
    CLASSIFICATION_LABELS[move.classification],
    `Évaluation ${formatEvaluationForSpeech(move.evalAfter, move.mateAfter)}`,
  ];
  if (FAULTS.includes(move.classification) && move.bestMoveSan && move.bestMoveSan !== move.san) {
    parts.push(`Meilleur coup : ${toFrenchSan(move.bestMoveSan)}`);
  }
  parts.push(`${move.ply + 1} sur ${totalMoves}`);
  return parts.join('. ');
}

/** Piece names with the colour adjectives that agree with them (tour and dame are feminine). */
const PIECES: Record<string, { name: string; white: string; black: string }> = {
  p: { name: 'pion', white: 'blanc', black: 'noir' },
  n: { name: 'cavalier', white: 'blanc', black: 'noir' },
  b: { name: 'fou', white: 'blanc', black: 'noir' },
  r: { name: 'tour', white: 'blanche', black: 'noire' },
  q: { name: 'dame', white: 'blanche', black: 'noire' },
  k: { name: 'roi', white: 'blanc', black: 'noir' },
};

/** "cavalier blanc", "dame noire": a piece in words, with the colour agreeing with it. */
export function pieceName(piece: { type: string; color: 'w' | 'b' }): string {
  const info = PIECES[piece.type];
  return info ? `${info.name} ${piece.color === 'w' ? info.white : info.black}` : '';
}

/** Accessible name of a board square, e.g. "e4, pion blanc" or "a3, vide, coup possible". */
export function squareLabel(
  square: string,
  piece: { type: string; color: 'w' | 'b' } | null | undefined,
  options: { selected?: boolean; legalDestination?: boolean; threat?: string } = {}
): string {
  const parts = [square, (piece && pieceName(piece)) || 'vide'];
  if (options.selected) parts.push('sélectionné');
  if (options.legalDestination) parts.push('coup possible');
  if (options.threat) parts.push(`menace : ${options.threat}`);
  return parts.join(', ');
}

export type BoardKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

/**
 * Square reached from `square` with an arrow / Home / End key. Directions follow what is on screen,
 * so they are mirrored when the board is flipped. Stays on the edge instead of wrapping.
 */
export function nextSquare(square: string, key: BoardKey, isFlipped: boolean): string {
  const file = square.charCodeAt(0) - 97; // a = 0
  const rank = Number(square[1]) - 1; // 1 = 0
  const sign = isFlipped ? -1 : 1;

  let nextFile = file;
  let nextRank = rank;
  switch (key) {
    case 'ArrowRight':
      nextFile = file + sign;
      break;
    case 'ArrowLeft':
      nextFile = file - sign;
      break;
    case 'ArrowUp':
      nextRank = rank + sign;
      break;
    case 'ArrowDown':
      nextRank = rank - sign;
      break;
    case 'Home': // first square of the row on screen
      nextFile = isFlipped ? 7 : 0;
      break;
    case 'End':
      nextFile = isFlipped ? 0 : 7;
      break;
  }

  const clamp = (n: number) => Math.min(7, Math.max(0, n));
  return `${String.fromCharCode(97 + clamp(nextFile))}${clamp(nextRank) + 1}`;
}

/** Name of each space-control mode, for announcements. */
export const HEATMAP_LABELS = {
  none: 'désactivé',
  both: 'les deux camps',
  white: 'Blancs',
  black: 'Noirs',
} as const;

/** Accessible name of a move button in the move list: who played what, how good it was, and the clock. */
export function moveButtonLabel(move: MoveAnalysis): string {
  const parts = [
    `Coup ${move.moveNumber}, ${move.color === 'w' ? 'Blancs' : 'Noirs'} : ${toFrenchSan(move.san)}`,
    CLASSIFICATION_LABELS[move.classification],
  ];
  if (move.isRushed) parts.push('coup précipité');
  else if (move.isLongThink) parts.push('réflexion longue');
  if (move.thinkTimeFormatted) parts.push(`temps de réflexion ${move.thinkTimeFormatted}`);
  return parts.join(', ');
}
