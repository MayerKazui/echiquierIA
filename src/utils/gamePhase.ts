import type { GamePhase, MoveAnalysis } from '../types/chess';

export type { GamePhase };

/** Opening: moves 1-12, middlegame: 13-30, endgame: 31+. Only for moves analysed before the phase was stored. */
export function phaseOfMoveNumber(moveNumber: number): GamePhase {
  if (moveNumber <= 12) return 'opening';
  return moveNumber <= 30 ? 'middlegame' : 'endgame';
}

/** The phase of a move: the one stored with it, or (for a game analysed before) the one its move number suggests. */
export function phaseOf(move: Pick<MoveAnalysis, 'phase' | 'moveNumber'>): GamePhase {
  return move.phase ?? phaseOfMoveNumber(move.moveNumber);
}

/** Queens, rooks, bishops and knights of both sides at or under which the game is an endgame. */
export const ENDGAME_MAX_PIECES = 6;
/** ... and a middlegame (the pieces have been traded) when there are no more than this many. */
export const MIDDLEGAME_MAX_PIECES = 10;
/** A side with fewer pieces than this on its first rank has developed them: the opening is over. */
export const DEVELOPED_BACK_RANK = 4;

const PHASE_ORDER: Record<GamePhase, number> = { opening: 0, middlegame: 1, endgame: 2 };

/**
 * The phase a position looks like, from its pieces alone (the rules Lichess uses to divide a game): an endgame when
 * few pieces are left, a middlegame once pieces have been traded or developed off the first rank, the opening
 * before. A king-and-pawn ending or a queen trade at move 8 counts as such, which a move number cannot tell.
 */
export function phaseOfPosition(fen: string): GamePhase {
  const [placement] = fen.split(' ');
  const ranks = placement.split('/'); // rank 8 first
  const pieces = placement.replace(/[^qrbnQRBN]/g, '').length;
  if (pieces <= ENDGAME_MAX_PIECES) return 'endgame';
  if (pieces <= MIDDLEGAME_MAX_PIECES) return 'middlegame';
  const blackBack = ranks[0].replace(/[^a-z]/g, '').length;
  const whiteBack = ranks[7].replace(/[^A-Z]/g, '').length;
  return blackBack < DEVELOPED_BACK_RANK || whiteBack < DEVELOPED_BACK_RANK ? 'middlegame' : 'opening';
}

/**
 * The phase of each position, in order: a game never goes back (a rook lift or a pawn promotion cannot reopen the
 * opening), so each position is at least as advanced as the one before it.
 */
export function phasesOfPositions(fens: string[]): GamePhase[] {
  let reached: GamePhase = 'opening';
  return fens.map((fen) => {
    const phase = phaseOfPosition(fen);
    if (PHASE_ORDER[phase] > PHASE_ORDER[reached]) reached = phase;
    return reached;
  });
}
