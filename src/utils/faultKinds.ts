import { Chess } from 'chess.js';
import { chessFromFen } from './chessFromFen';
import type { MoveAnalysis } from '../types/chess';
import { phaseOfPosition, type GamePhase } from './gamePhase';
import { tacticThemesOfMove, type TacticTheme } from './tacticThemes';

/**
 * What kind of fault a mistake, a blunder or a miss is, from the position before it and the moves involved
 * (so it also works on the light version of an old game, which keeps the position before each fault). The checks go
 * from the most concrete cause to the vaguest, and the first that applies wins:
 *
 * - `mate`: a forced mate missed, or one allowed.
 * - `hanging`: the move leaves material to be taken for nothing (or for a bad exchange) that the engine's move did not.
 * - `tactic`: the engine's move carried a tactical theme (fork, pin, discovered attack…) that was not played.
 * - `wasted`: a clearly better position thrown away without a concrete tactic found.
 * - `exchange`: a capture missed, or a capture made that should not have been (the exchange was misjudged).
 * - `king`: a king move, castling missed or played at the wrong moment.
 * - `principles`: in the opening, a move against the principles (development, centre, safety) with none of the above.
 * - `technique`: in the endgame, a move that loses the thread (activity of the king, pawns) with none of the above.
 * - `other`: what is left: a positional error or a miscalculation in the middlegame.
 */
export type FaultKind = NonNullable<MoveAnalysis['faultKind']>;

export const FAULT_KINDS: readonly FaultKind[] = [
  'mate',
  'hanging',
  'tactic',
  'wasted',
  'exchange',
  'king',
  'principles',
  'technique',
  'other',
];

/**
 * Version of the rules above. When it changes, the faults of the games already stored are classified again (they are
 * derived data, kept only so that the profile does not have to compute them each time).
 */
export const FAULT_KINDS_VERSION = 2;

/** The theme behind a fault: a tactic found, or the length of a mate (Lichess puzzle themes). */
export type FaultTheme = TacticTheme | 'mateIn1' | 'mateIn2' | 'mateIn3' | 'mateIn4' | 'mateIn5';

/** Names and one-line explanations of the kinds, shared by the profile and the training. */
export const FAULT_KIND_TEXT: Record<FaultKind, { label: string; hint: string }> = {
  mate: { label: 'Mat manqué ou subi', hint: "Un mat forcé laissé passer, ou offert à l'adversaire." },
  hanging: {
    label: 'Pièce laissée en prise',
    hint: 'Le coup laisse une pièce (ou un pion) à prendre pour rien, ou pour un mauvais échange.',
  },
  tactic: {
    label: 'Tactique manquée',
    hint: 'Fourchette, clouage, attaque à la découverte… : le moteur voyait un coup tactique.',
  },
  wasted: { label: 'Avantage gâché', hint: 'Une position gagnée devenue égale, sans tactique précise derrière.' },
  exchange: {
    label: 'Échange mal jugé',
    hint: 'Une prise ou un échange manqué, ou une prise faite à tort.',
  },
  king: {
    label: 'Roi mal placé',
    hint: 'Un coup de roi, un roque manqué ou joué au mauvais moment.',
  },
  principles: {
    label: "Principes d'ouverture",
    hint: "Un coup d'ouverture contraire aux principes : développement, centre, sécurité du roi.",
  },
  technique: {
    label: 'Technique de finale',
    hint: 'En finale, un coup qui perd le fil : activité du roi, pions, plan.',
  },
  other: { label: 'Autres erreurs', hint: 'Erreurs de calcul ou de position au milieu de jeu, sans cause repérée.' },
};

export const FAULT_CLASSIFICATIONS: ReadonlySet<MoveAnalysis['classification']> = new Set([
  'mistake',
  'blunder',
  'missedWin',
]);

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/** What the opponent must win (in pawns) for a move to count as leaving material en prise on its own. */
const HANGING_MIN_GAIN = 2;
/** A position "won" for the player before the fault, and "no longer" after it (win %, from the player's side). */
const WASTED_BEFORE = 70;
const WASTED_AFTER = 55;

/** Net material (in pawns) the opponent can win right after the move, assuming the player recaptures when able. */
function materialLeftEnPrise(chess: Chess): number {
  let best = 0;
  for (const reply of chess.moves({ verbose: true })) {
    if (!reply.captured) continue;
    let gain = PIECE_VALUE[reply.captured] ?? 0;
    chess.move(reply);
    const isRecapturable = chess.moves({ verbose: true }).some((m) => m.to === reply.to && m.captured);
    chess.undo();
    if (isRecapturable) gain -= PIECE_VALUE[reply.piece] ?? 0;
    best = Math.max(best, gain);
  }
  return best;
}

interface PlayedMove {
  chess: Chess;
  move: ReturnType<Chess['move']>;
}

/** The position after `uci`, with the move as chess.js describes it; null when it cannot be played from `fen`. */
function play(fen: string, uci: string): PlayedMove | null {
  if (!fen || !uci || uci.length < 4) return null;
  try {
    const chess = chessFromFen(fen);
    const move = chess.move({
      from: uci.substring(0, 2),
      to: uci.substring(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return { chess, move };
  } catch {
    return null;
  }
}

/** Material the opponent wins by force (in pawns) after `uci`, null when the move cannot be played. */
function materialGivenBy(played: PlayedMove | null): number | null {
  return played ? materialLeftEnPrise(played.chess) : null;
}

/**
 * The move gives away material the engine's move did not: at least `HANGING_MIN_GAIN`, or less than that (a pawn)
 * when the engine's move gave away less.
 */
function leavesMaterialEnPrise(given: number | null, givenByBest: number | null): boolean {
  if (given === null) return false;
  return given >= HANGING_MIN_GAIN || (given >= 1 && givenByBest !== null && given > givenByBest);
}

/** The first tactical theme of the engine's move that the played move did not have. */
function missedTheme(move: MoveAnalysis): TacticTheme | null {
  if (!move.bestMoveUci || move.bestMoveUci === move.uci) return null;
  const wanted = tacticThemesOfMove(move.fenBefore, move.bestMoveUci);
  if (wanted.length === 0) return null;
  const played = new Set(tacticThemesOfMove(move.fenBefore, move.uci));
  return wanted.find((theme) => !played.has(theme)) ?? null;
}

/** The phase a position looks like, null when it cannot be read. */
function phaseOf(fen: string): GamePhase | null {
  try {
    return fen.split(' ')[0].split('/').length === 8 ? phaseOfPosition(fen) : null;
  } catch {
    return null;
  }
}

/** Win % of the player who moved, before and after the move. */
function ownWinPercent(move: MoveAnalysis): { before: number; after: number } {
  return move.color === 'w'
    ? { before: move.winPercentBefore, after: move.winPercentAfter }
    : { before: 100 - move.winPercentBefore, after: 100 - move.winPercentAfter };
}

/** The mate missed or allowed, if the fault is about one: with the theme, from the length of the mate missed. */
function mateIssue(move: MoveAnalysis): { theme?: FaultTheme } | null {
  const side = move.color === 'w' ? 1 : -1;
  const hadMate = move.mateBefore !== null && move.mateBefore * side > 0;
  const keepsMate = move.mateAfter !== null && move.mateAfter * side > 0;
  const allowsMate = move.mateAfter !== null && move.mateAfter * side < 0;
  const wasMated = move.mateBefore !== null && move.mateBefore * side < 0;
  if (!((hadMate && !keepsMate) || (allowsMate && !wasMated))) return null;
  if (!hadMate) return {};
  const pattern = tacticThemesOfMove(move.fenBefore, move.bestMoveUci).find(
    (theme) => theme === 'backRankMate' || theme === 'smotheredMate'
  );
  if (pattern) return { theme: pattern };
  const length = Math.min(Math.abs(move.mateBefore!), 5);
  return { theme: `mateIn${length}` as FaultTheme };
}

export interface FaultDiagnosis {
  kind: FaultKind;
  /** The theme behind a `mate` or `tactic` fault. */
  theme?: FaultTheme;
}

/**
 * The kind of fault of a move (call it for a mistake, a blunder or a miss), with the theme when there is one. The
 * checks go from the most concrete cause to the vaguest, and the first that applies wins.
 */
export function diagnoseFault(move: MoveAnalysis): FaultDiagnosis {
  const mate = mateIssue(move);
  if (mate) return { kind: 'mate', ...mate };

  const played = play(move.fenBefore, move.uci);
  const best = move.bestMoveUci && move.bestMoveUci !== move.uci ? play(move.fenBefore, move.bestMoveUci) : null;
  if (leavesMaterialEnPrise(materialGivenBy(played), materialGivenBy(best))) return { kind: 'hanging' };

  const theme = move.fenBefore ? missedTheme(move) : null;
  if (theme) return { kind: 'tactic', theme };

  const { before, after } = ownWinPercent(move);
  if (before >= WASTED_BEFORE && after <= WASTED_AFTER) return { kind: 'wasted' };

  if (played?.move.captured || best?.move.captured) return { kind: 'exchange' };
  const isKingMove = (m: PlayedMove | null) => m !== null && m.move.piece === 'k';
  if (isKingMove(played) || isKingMove(best)) return { kind: 'king' };

  const phase = phaseOf(move.fenBefore);
  if (phase === 'endgame') return { kind: 'technique' };
  if (phase === 'opening') return { kind: 'principles' };
  return { kind: 'other' };
}

export const classifyFault = (move: MoveAnalysis): FaultKind => diagnoseFault(move).kind;

/**
 * The moves with the kind of fault (and its theme) filled in, for the faults of `color` that have none yet, or all of
 * them with `again` (when the rules changed). It is the slow part of the profile: a few tens of ms per fault, so it
 * is done once, when the game is stored. Returns the same array when there is nothing to add.
 */
export function withFaultKinds(moves: MoveAnalysis[], color: 'w' | 'b', again = false): MoveAnalysis[] {
  let changed = false;
  const result = moves.map((move) => {
    if (move.color !== color || !FAULT_CLASSIFICATIONS.has(move.classification)) return move;
    if (move.faultKind && !again) return move;
    changed = true;
    const { kind, theme } = diagnoseFault(move);
    const { faultTheme: _previous, ...rest } = move;
    return { ...rest, faultKind: kind, ...(theme && { faultTheme: theme }) };
  });
  return changed ? result : moves;
}

/** Lets the page paint between two slices of work. */
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

/**
 * `withFaultKinds` for a long job (a whole history): the work is cut into slices of `sliceMs`, with `yieldToUi`
 * called between them so that the page stays responsive.
 */
export async function withFaultKindsSliced(
  moves: MoveAnalysis[],
  color: 'w' | 'b',
  { yieldToUi = pause, sliceMs = 12 }: { yieldToUi?: () => Promise<void>; sliceMs?: number } = {}
): Promise<MoveAnalysis[]> {
  const result: MoveAnalysis[] = [];
  let sliceStart = performance.now();
  for (const move of moves) {
    if (move.color === color && FAULT_CLASSIFICATIONS.has(move.classification)) {
      result.push(withFaultKinds([move], color, true)[0]);
      if (performance.now() - sliceStart > sliceMs) {
        await yieldToUi();
        sliceStart = performance.now();
      }
    } else {
      result.push(move);
    }
  }
  return result;
}
