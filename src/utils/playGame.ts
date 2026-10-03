import { Chess } from 'chess.js';
import type { PlayerColor } from '../types/ui';

export const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type DrawReason = 'stalemate' | 'material' | 'repetition' | 'fifty';

export type PlayOutcome =
  | { kind: 'checkmate'; winner: PlayerColor }
  | { kind: 'resigned'; winner: PlayerColor }
  | { kind: 'draw'; reason: DrawReason };

export interface PlayedMove {
  uci: string;
  san: string;
  /** The position after the move. */
  fen: string;
}

export interface Replay {
  fen: string;
  moves: PlayedMove[];
  /** Null once the game is over by the rules, as long as nobody resigned. */
  outcome: PlayOutcome | null;
}

/** The outcome of a position by the rules of chess (null: the game goes on). */
export function ruleOutcome(chess: Chess): PlayOutcome | null {
  if (chess.isCheckmate()) return { kind: 'checkmate', winner: chess.turn() === 'w' ? 'b' : 'w' };
  if (chess.isStalemate()) return { kind: 'draw', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { kind: 'draw', reason: 'material' };
  if (chess.isThreefoldRepetition()) return { kind: 'draw', reason: 'repetition' };
  if (chess.isDrawByFiftyMoves()) return { kind: 'draw', reason: 'fifty' };
  return null;
}

/** Plays the moves (UCI) from a start position. The first one that is illegal ends the replay. */
export function replay(startFen: string, uciMoves: readonly string[]): Replay {
  const chess = new Chess(startFen);
  const moves: PlayedMove[] = [];
  for (const uci of uciMoves) {
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      moves.push({ uci, san: move.san, fen: chess.fen() });
    } catch {
      break;
    }
  }
  return { fen: chess.fen(), moves, outcome: ruleOutcome(chess) };
}

/** Whether a string is a position chess.js accepts (a FEN pasted by the player, say). */
export function validFen(fen: string): boolean {
  try {
    new Chess(fen.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * The number of moves left after "Reprendre le coup": the player's last move and the answer to it, but never before the
 * engine's own first move (when it starts the game): the position it opened with is the game's.
 */
export function lengthAfterTakeback(
  moveCount: number,
  startTurn: PlayerColor,
  userColor: PlayerColor,
  turn: PlayerColor
): number {
  const floor = startTurn !== userColor ? 1 : 0;
  const undo = turn === userColor ? 2 : 1;
  return Math.max(floor, moveCount - undo);
}

/** The result as a PGN tag. */
export function resultTag(outcome: PlayOutcome | null): string {
  if (!outcome) return '*';
  if (outcome.kind === 'draw') return '1/2-1/2';
  return outcome.winner === 'w' ? '1-0' : '0-1';
}

/**
 * The game as a PGN the analysis can read, or null when it cannot: the analysis replays from the standard start,
 * so a game begun on another position needs `prefix` (the moves that lead there from the standard start).
 */
export function gamePgn(options: {
  startFen: string;
  prefix?: readonly string[];
  moves: readonly PlayedMove[];
  outcome: PlayOutcome | null;
  white: string;
  black: string;
}): string | null {
  const { startFen, prefix, moves, outcome, white, black } = options;
  const isStandard = startFen.split(' ').slice(0, 4).join(' ') === STANDARD_START_FEN.split(' ').slice(0, 4).join(' ');
  if (!isStandard && !prefix) return null;
  const chess = new Chess();
  try {
    for (const san of isStandard ? [] : (prefix ?? [])) chess.move(san);
    if (!isStandard && chess.fen().split(' ').slice(0, 4).join(' ') !== startFen.split(' ').slice(0, 4).join(' ')) {
      return null;
    }
    for (const move of moves)
      chess.move({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), promotion: move.uci[4] });
  } catch {
    return null;
  }
  chess.setHeader('White', white);
  chess.setHeader('Black', black);
  chess.setHeader('Result', resultTag(outcome));
  return chess.pgn();
}

/** What the setup screen and the game are given: a position to start from, and how to say where it comes from. */
export interface PlayStart {
  fen: string;
  /** Where the position comes from: "Position de l'étude", "Ligne de l'explorateur"… */
  label: string;
  /** The moves (SAN) that lead there from the standard start, when they are known: the game can then be analysed. */
  prefix?: string[];
}
