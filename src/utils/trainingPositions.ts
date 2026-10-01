import type { MoveAnalysis } from '../types/chess';
import { FAULT_CLASSIFICATIONS, type FaultKind } from './faultKinds';
import { phaseOfMove, type GamePhase } from './phaseStats';
import { MIN_GAME_PLIES, faultKindOf, parsePgnDate, playerColorIn, type ProfileSource } from './weaknessProfile';

/**
 * The positions to replay: the position before each mistake, blunder or miss of the player, with what is needed to
 * ask for the move again and to correct the answer. They come from the same games as the profile (the ones that
 * name the player), whether they are kept complete or reduced to a summary (which keeps the position before each
 * fault).
 */

export interface TrainingPosition {
  /** Stable key: the game and the ply of the fault. */
  id: string;
  gameId: string;
  ply: number;
  moveNumber: number;
  /** The player's side: the one to move in `fen`. */
  color: 'w' | 'b';
  /** Position before the fault. */
  fen: string;
  playedUci: string;
  playedSan: string;
  bestUci: string;
  /** The engine's move, in English SAN. */
  bestSan: string;
  /** The engine's line from `fen`, in UCI. */
  pv: string[];
  classification: 'mistake' | 'blunder' | 'missedWin';
  kind: FaultKind;
  phase: GamePhase;
  /** Win % given away by the fault. */
  loss: number;
  /** Win % of the player before the fault (what the best move keeps). */
  winBefore: number;
  opponent: string;
  /** Milliseconds since the epoch: the date of the game. */
  date: number;
  /** The explanation written by the coach, when the game was kept complete. */
  explanation?: MoveAnalysis['aiExplanation'];
}

export interface CollectOptions {
  /** Called between games when the work has been long: lets the page breathe. Rejecting stops the work. */
  yieldToUi?: () => Promise<void>;
  sliceMs?: number;
}

function toPosition(
  source: ProfileSource,
  move: MoveAnalysis,
  color: 'w' | 'b',
  opponent: string,
  date: number
): TrainingPosition | null {
  // A position that cannot be asked again: no position kept, or nothing better to find
  if (!move.fenBefore || !move.bestMoveUci || move.bestMoveUci === move.uci) return null;
  return {
    id: `${source.id}:${move.ply}`,
    gameId: source.id,
    ply: move.ply,
    moveNumber: move.moveNumber,
    color,
    fen: move.fenBefore,
    playedUci: move.uci,
    playedSan: move.san,
    bestUci: move.bestMoveUci,
    bestSan: move.bestMoveSan,
    pv: move.pv,
    classification: move.classification as TrainingPosition['classification'],
    kind: faultKindOf(`${source.id}:${source.savedAt}`, move),
    phase: phaseOfMove(move.moveNumber),
    loss: move.winPercentLoss,
    winBefore: color === 'w' ? move.winPercentBefore : 100 - move.winPercentBefore,
    opponent,
    date,
    explanation: move.aiExplanation,
  };
}

/** The positions of the games that name the player, the most recent game first, the faults of a game in order. */
export async function collectPositions(
  sources: readonly ProfileSource[],
  { yieldToUi, sliceMs = 12 }: CollectOptions = {}
): Promise<TrainingPosition[]> {
  const positions: TrainingPosition[] = [];
  let sliceStart = performance.now();
  for (const source of sources) {
    const { metadata, moves } = source.result;
    const color = playerColorIn(source.result);
    if (color === null || moves.length < MIN_GAME_PLIES) continue;
    const opponent = (color === 'w' ? metadata.black : metadata.white) || 'Adversaire';
    const date = parsePgnDate(metadata.date) ?? source.savedAt;
    for (const move of moves) {
      if (move.color !== color || !FAULT_CLASSIFICATIONS.has(move.classification)) continue;
      const position = toPosition(source, move, color, opponent, date);
      if (position) positions.push(position);
    }
    if (yieldToUi && performance.now() - sliceStart > sliceMs) {
      await yieldToUi();
      sliceStart = performance.now();
    }
  }
  return positions.sort((a, b) => b.date - a.date || a.gameId.localeCompare(b.gameId) || a.ply - b.ply);
}
