import { Chess } from 'chess.js';
import type { MoveAnalysis } from '../types/chess';
import { analyzeTacticalThreatsForMove } from './tacticalThreats';

/**
 * What kind of fault a mistake, a blunder or a miss is, from the position before it and the moves involved
 * (so it also works on the light version of an old game, which keeps the position before each fault).
 *
 * - `mate`: a forced mate missed, or one allowed.
 * - `hanging`: the move leaves a piece (or more) to be taken for nothing, or for a bad exchange.
 * - `tactic`: the engine's move was a fork, a pin, or a free piece to take, and was not played.
 * - `wasted`: a clearly better position thrown away without a concrete tactic found.
 * - `other`: none of the above (a positional error, a miscalculation).
 */
export type FaultKind = NonNullable<MoveAnalysis['faultKind']>;

export const FAULT_KINDS: readonly FaultKind[] = ['mate', 'hanging', 'tactic', 'wasted', 'other'];

export const FAULT_CLASSIFICATIONS: ReadonlySet<MoveAnalysis['classification']> = new Set([
  'mistake',
  'blunder',
  'missedWin',
]);

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/** What the opponent must win from the exchange (in pawns) for the move to count as leaving a piece en prise. */
const HANGING_MIN_GAIN = 2;
/** A position "won" for the player before the fault, and "no longer" after it (win %, from the player's side). */
const WASTED_BEFORE = 70;
const WASTED_AFTER = 55;

const TACTIC_THREATS: ReadonlySet<string> = new Set(['fork', 'pin', 'skewer', 'hanging']);

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

function leavesPieceEnPrise(fenBefore: string, uci: string): boolean {
  try {
    const chess = new Chess(fenBefore);
    chess.move({ from: uci.substring(0, 2), to: uci.substring(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    return materialLeftEnPrise(chess) >= HANGING_MIN_GAIN;
  } catch {
    return false;
  }
}

function missesTactic(move: MoveAnalysis): boolean {
  if (!move.bestMoveUci || move.bestMoveUci === move.uci) return false;
  const wanted = analyzeTacticalThreatsForMove(move.fenBefore, move.bestMoveUci).filter((t) =>
    TACTIC_THREATS.has(t.type)
  );
  if (wanted.length === 0) return false;
  // The played move did as much: nothing was missed
  const played = new Set(analyzeTacticalThreatsForMove(move.fenBefore, move.uci).map((t) => t.type));
  return wanted.some((t) => !played.has(t.type));
}

/** Win % of the player who moved, before and after the move. */
function ownWinPercent(move: MoveAnalysis): { before: number; after: number } {
  return move.color === 'w'
    ? { before: move.winPercentBefore, after: move.winPercentAfter }
    : { before: 100 - move.winPercentBefore, after: 100 - move.winPercentAfter };
}

function isMateIssue(move: MoveAnalysis): boolean {
  const side = move.color === 'w' ? 1 : -1;
  const hadMate = move.mateBefore !== null && move.mateBefore * side > 0;
  const keepsMate = move.mateAfter !== null && move.mateAfter * side > 0;
  const allowsMate = move.mateAfter !== null && move.mateAfter * side < 0;
  const wasMated = move.mateBefore !== null && move.mateBefore * side < 0;
  return (hadMate && !keepsMate) || (allowsMate && !wasMated);
}

/**
 * The kind of fault of a move (call it for a mistake, a blunder or a miss). The checks go from the most concrete
 * cause to the vaguest, and the first that applies wins.
 */
export function classifyFault(move: MoveAnalysis): FaultKind {
  if (isMateIssue(move)) return 'mate';
  if (move.fenBefore && leavesPieceEnPrise(move.fenBefore, move.uci)) return 'hanging';
  if (move.fenBefore && missesTactic(move)) return 'tactic';
  const { before, after } = ownWinPercent(move);
  if (before >= WASTED_BEFORE && after <= WASTED_AFTER) return 'wasted';
  return 'other';
}

/**
 * The moves with the kind of fault filled in, for the faults of `color` that have none yet (it is the slow part
 * of the profile: about 10 ms per fault, so it is done once, when the game is stored). Returns the same array
 * when there is nothing to add.
 */
export function withFaultKinds(moves: MoveAnalysis[], color: 'w' | 'b'): MoveAnalysis[] {
  let changed = false;
  const result = moves.map((move) => {
    if (move.color !== color || move.faultKind || !FAULT_CLASSIFICATIONS.has(move.classification)) return move;
    changed = true;
    return { ...move, faultKind: classifyFault(move) };
  });
  return changed ? result : moves;
}
