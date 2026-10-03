import { Chess } from 'chess.js';
import { checkIsTheoreticalMove, normalizeFen } from '../services/openingBook';
import { openingAtPly } from './openingAtPly';
import type { PositionLookup } from './openingExplorer';
import { COSTLY_EXIT, findExit } from './openingRepertoire';
import { MIN_GAME_PLIES, parsePgnDate, playerColorIn, type ProfileSource } from './weaknessProfile';

/**
 * Training on the repertoire: the positions where the player left the opening theory with a move that cost them
 * dearly, to be replayed until the move of the theory comes by itself. They come from the same games as
 * "Mes ouvertures" (the games that name the player), one position for all the games that went through it, and they
 * use the same spaced repetition as the replayed errors (see `spacedRepetition`).
 *
 * A move is right when the openings database knows it from the position, or when it leads to a position of the
 * database (a transposition): the very test the analysis uses to call a move "book". The engine is not asked.
 */

/** Cards of the repertoire share the store of the other cards: their ids start with this, a game id never does. */
export const DRILL_ID_PREFIX = 'repertoire:';

export const drillId = (fen: string): string => `${DRILL_ID_PREFIX}${normalizeFen(fen)}`;

export interface DrillPosition {
  /** Stable key: the position itself, whatever game and move order led to it. */
  id: string;
  /** The position where the player left the theory. */
  fen: string;
  /** The player's side: the one to move in `fen`. */
  color: 'w' | 'b';
  /** 1 for the first move of the game. */
  moveNumber: number;
  /** The moves played to get here (English SAN), from the first one of the game that was met. */
  line: string[];
  /** The opening reached by the line (English, as the book names it): empty when none is named. */
  opening: string;
  eco: string;
  /** The moves of the theory from here (English SAN, the most common first). */
  bookMoves: string[];
  /** What the player played instead, the most often first. */
  played: Array<{ san: string; games: number }>;
  /** Games in which the player left the theory here. */
  games: number;
  /** Mean win % that cost them. */
  loss: number;
  /** Milliseconds since the epoch: the most recent of these games. */
  date: number;
}

/** Whether a move is theory: from where it is played (`fen`) to where it leads (`fenAfter`). */
export type BookCheck = (fen: string, san: string, fenAfter: string) => boolean;

const isInBook: BookCheck = (fen, san, fenAfter) => checkIsTheoreticalMove(fen, san, fenAfter).isBook;

export interface CollectOptions {
  /** Decides what is theory; the openings database itself unless given. */
  isBook?: BookCheck;
  /** Called every few games: lets the page breathe on a long history. */
  yieldToUi?: () => Promise<void>;
}

const withoutCheck = (san: string): string => san.replace(/[+#]$/, '');

/** The position after `line`, or null when a move of it is not legal. */
function replay(line: readonly string[]): Chess | null {
  const chess = new Chess();
  try {
    for (const san of line) chess.move(san);
  } catch {
    return null;
  }
  return chess;
}

interface Group {
  fen: string;
  color: 'w' | 'b';
  moveNumber: number;
  line: string[];
  opening: string;
  eco: string;
  played: Map<string, number>;
  games: number;
  losses: number;
  date: number;
}

/**
 * The positions where the player left the theory with a costly move (at least `COSTLY_EXIT` win % on average), and
 * from which the theory has something to say. The costliest first.
 */
export async function collectDrillPositions(
  sources: readonly ProfileSource[],
  lookup: PositionLookup,
  { isBook = isInBook, yieldToUi }: CollectOptions = {}
): Promise<DrillPosition[]> {
  const groups = new Map<string, Group>();
  let sinceYield = 0;

  for (const source of sources) {
    const { result } = source;
    const color = playerColorIn(result);
    if (color !== null && result.moves.length >= MIN_GAME_PLIES) {
      const exit = findExit(result, color);
      const chess = exit?.byPlayer ? replay(exit.line) : null;
      if (exit && chess) {
        const fen = chess.fen();
        const key = normalizeFen(fen);
        const date = parsePgnDate(result.metadata.date) ?? source.savedAt;
        let group = groups.get(key);
        if (!group) {
          const opening = exit.line.length > 0 ? openingAtPly(result.moves, exit.line.length - 1) : null;
          group = {
            fen,
            color,
            moveNumber: exit.moveNumber,
            line: exit.line,
            opening: opening?.name ?? '',
            eco: opening?.eco ?? '',
            played: new Map(),
            games: 0,
            losses: 0,
            date,
          };
          groups.set(key, group);
        }
        group.games += 1;
        group.losses += exit.loss;
        group.date = Math.max(group.date, date);
        group.played.set(exit.san, (group.played.get(exit.san) ?? 0) + 1);
      }
    }

    if (yieldToUi && ++sinceYield >= 25) {
      sinceYield = 0;
      await yieldToUi();
    }
  }

  const positions: DrillPosition[] = [];
  for (const [key, group] of groups) {
    const legal = new Set(new Chess(group.fen).moves().map(withoutCheck));
    const bookMoves = (lookup(group.fen)?.nextSans ?? []).filter((san) => legal.has(withoutCheck(san)));
    // A move the database knows now (the game was analysed before the database was complete) is not an exit
    const played = [...group.played]
      .filter(([san]) => {
        const chess = new Chess(group.fen);
        try {
          chess.move(san);
        } catch {
          return false; // damaged data
        }
        return !isBook(group.fen, san, chess.fen());
      })
      .map(([san, games]) => ({ san, games }))
      .sort((a, b) => b.games - a.games || (a.san < b.san ? -1 : 1));
    const loss = group.losses / group.games;
    if (bookMoves.length === 0 || played.length === 0 || loss < COSTLY_EXIT) continue;
    positions.push({
      id: `${DRILL_ID_PREFIX}${key}`,
      fen: group.fen,
      color: group.color,
      moveNumber: group.moveNumber,
      line: group.line,
      opening: group.opening,
      eco: group.eco,
      bookMoves,
      played,
      games: group.games,
      loss,
      date: group.date,
    });
  }
  return positions.sort((a, b) => b.loss - a.loss || b.games - a.games || (a.id < b.id ? -1 : 1));
}

export type DrillVerdict =
  /** A move of the theory. */
  | { kind: 'book' }
  /** The move the player made in their games. */
  | { kind: 'played' }
  /** A move the openings database does not know from here. */
  | { kind: 'off' }
  /** The player gave up and asked for the solution. */
  | { kind: 'revealed' };

export const isDrillSuccess = (verdict: DrillVerdict): boolean => verdict.kind === 'book';

/** The verdict on the move `san` (English SAN, legal in the position) played in `position`. */
export function judgeDrillMove(position: DrillPosition, san: string, isBook: BookCheck = isInBook): DrillVerdict {
  if (position.played.some((move) => move.san === san)) return { kind: 'played' };
  const chess = new Chess(position.fen);
  try {
    chess.move(san);
  } catch {
    return { kind: 'off' };
  }
  return isBook(position.fen, san, chess.fen()) ? { kind: 'book' } : { kind: 'off' };
}

/** The positions of one side, or of both when no side is chosen. */
export const drillPositionsOf = (positions: readonly DrillPosition[], color: 'w' | 'b' | null): DrillPosition[] =>
  color === null ? [...positions] : positions.filter((position) => position.color === color);
