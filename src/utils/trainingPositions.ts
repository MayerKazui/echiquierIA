import type { MoveAnalysis } from '../types/chess';
import type { Card } from './spacedRepetition';
import { FAULT_CLASSIFICATIONS, type FaultKind, type FaultTheme } from './faultKinds';
import { phaseOf, type GamePhase } from './gamePhase';
import { MIN_GAME_PLIES, faultDiagnosisOf, parsePgnDate, playerColorIn, type ProfileSource } from './weaknessProfile';

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
  /** The tactical theme behind the fault (a fork, a discovered attack…), when there is one. */
  theme?: FaultTheme;
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
  /** In how many other games the same position was also a fault (they are asked once, here). Absent when none. */
  repeats?: number;
}

export interface CollectOptions {
  /** The progress made so far: of several games with the same position, the one already worked on is kept. */
  cards?: ReadonlyMap<string, Card>;
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
  const { kind, theme } = faultDiagnosisOf(`${source.id}:${source.savedAt}`, move);
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
    kind,
    ...(theme && { theme }),
    phase: phaseOf(move),
    loss: move.winPercentLoss,
    winBefore: color === 'w' ? move.winPercentBefore : 100 - move.winPercentBefore,
    opponent,
    date,
    explanation: move.aiExplanation,
  };
}

/** The position itself: the pieces, the side to move, the castling rights and the en-passant square (not the move counters). */
export const positionKey = (fen: string): string => fen.split(' ').slice(0, 4).join(' ');

/**
 * One position per situation: the same position missed in several games is asked once. The one kept is the one
 * already worked on (the last, if several), otherwise the oldest game: a new game with the same position then
 * leaves the position, and its progress, where they are.
 */
export function dedupePositions(
  positions: readonly TrainingPosition[],
  cards: ReadonlyMap<string, Card> = new Map()
): TrainingPosition[] {
  const groups = new Map<string, TrainingPosition[]>();
  for (const position of positions) {
    const key = positionKey(position.fen);
    const group = groups.get(key);
    if (group) group.push(position);
    else groups.set(key, [position]);
  }
  const kept = new Map<string, TrainingPosition>();
  for (const [key, group] of groups) {
    if (group.length === 1) {
      kept.set(key, group[0]);
      continue;
    }
    const worked = group.filter((position) => cards.has(position.id));
    const pool = worked.length > 0 ? worked : group;
    const best = pool.reduce((a, b) => {
      if (worked.length > 0) return cards.get(b.id)!.lastSeen > cards.get(a.id)!.lastSeen ? b : a;
      return b.date < a.date || (b.date === a.date && b.id < a.id) ? b : a;
    });
    kept.set(key, { ...best, repeats: group.length - 1 });
  }
  return positions
    .filter((position) => kept.get(positionKey(position.fen))?.id === position.id)
    .map((position) => kept.get(positionKey(position.fen))!);
}

/** The positions of the games that name the player, the most recent game first, the faults of a game in order. */
export async function collectPositions(
  sources: readonly ProfileSource[],
  { yieldToUi, sliceMs = 12, cards }: CollectOptions = {}
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
  positions.sort((a, b) => b.date - a.date || a.gameId.localeCompare(b.gameId) || a.ply - b.ply);
  return dedupePositions(positions, cards);
}
