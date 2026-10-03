import { Chess } from 'chess.js';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { checkIsTheoreticalMove, normalizeFen } from '../services/openingBook';
import { openingAtPly } from './openingAtPly';
import type { PositionLookup } from './openingExplorer';
import { BOOK_PLIES, COSTLY_EXIT, MIN_RECURRENCE, findExit } from './openingRepertoire';
import { MIN_GAME_PLIES, parsePgnDate, playerColorIn, type ProfileSource } from './weaknessProfile';

/**
 * Training on the repertoire: the positions to be replayed until the move of the theory comes by itself. Two kinds:
 *  - the exits: where the player left the opening theory with a move that cost them dearly;
 *  - the lines that work: the deepest position that several of their games share in the theory, where they played a
 *    move of the book. They are there so that a line that works is not forgotten.
 * They come from the same games as "Mes ouvertures" (the games that name the player), one position for all the
 * games that went through it, and they use the same spaced repetition as the replayed errors (see
 * `spacedRepetition`).
 *
 * A move is right when the openings database knows it from the position, or when it leads to a position of the
 * database (a transposition): the very test the analysis uses to call a move "book". The engine is not asked.
 */

/** Cards of the repertoire share the store of the other cards: their ids start with this, a game id never does. */
export const DRILL_ID_PREFIX = 'repertoire:';

export const drillId = (fen: string): string => `${DRILL_ID_PREFIX}${normalizeFen(fen)}`;

/** A way out of the theory that cost dearly, or a line of the theory that the player follows. */
export type DrillKind = 'exit' | 'line';

/** A position of the first moves is not worth a question: nearly every move of it is theory. */
export const MIN_LINE_PLIES = 4;

export interface DrillPosition {
  kind: DrillKind;
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
  /** What the player played, the most often first: instead of the theory for an exit, a move of it for a line. */
  played: Array<{ san: string; games: number }>;
  /** Games in which the player left the theory here (exit), or played here a move of the theory (line). */
  games: number;
  /** Mean win % that cost them (0 for a line). */
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

/** A position of a game where the player played a move of the theory (seen before that move). */
interface Step {
  key: string;
  fen: string;
  ply: number;
  san: string;
}

/** What the games did at a position of the theory. */
interface LineGroup extends Omit<Group, 'losses' | 'moveNumber'> {
  ply: number;
}

/** The positions of a game, up to the ply `end`, where the player played a move of the theory. */
function theorySteps(moves: readonly MoveAnalysis[], color: 'w' | 'b', end: number): Step[] {
  const steps: Step[] = [];
  const seen = new Set<string>();
  const chess = new Chess();
  for (let ply = 0; ply < end; ply++) {
    const move = moves[ply];
    if (ply >= MIN_LINE_PLIES && move.color === color && move.classification === 'book') {
      const fen = chess.fen();
      const key = normalizeFen(fen);
      if (!seen.has(key)) {
        seen.add(key);
        steps.push({ key, fen, ply, san: move.san });
      }
    }
    try {
      chess.move(move.san);
    } catch {
      break; // damaged data
    }
  }
  return steps;
}

/** The moves played (English SAN) that the database does not call theory today, left out; the others, the most often first. */
function stillTheory(
  fen: string,
  played: ReadonlyMap<string, number>,
  isBook: BookCheck,
  keep: 'book' | 'off'
): Array<{ san: string; games: number }> {
  return [...played]
    .filter(([san]) => {
      const chess = new Chess(fen);
      try {
        chess.move(san);
      } catch {
        return false; // damaged data
      }
      return isBook(fen, san, chess.fen()) === (keep === 'book');
    })
    .map(([san, games]) => ({ san, games }))
    .sort((a, b) => b.games - a.games || (a.san < b.san ? -1 : 1));
}

/** The moves of the theory from a position (English SAN, the most common first). */
function theoryMoves(fen: string, lookup: PositionLookup): string[] {
  const legal = new Set(new Chess(fen).moves().map(withoutCheck));
  return (lookup(fen)?.nextSans ?? []).filter((san) => legal.has(withoutCheck(san)));
}

/**
 * The positions to replay. The exits: where the player left the theory with a costly move (at least `COSTLY_EXIT`
 * win % on average). The lines that work: for each game, the deepest position in the theory that at least
 * `MIN_RECURRENCE` games share and where the player played a move of the theory (a game that leaves the theory at
 * a cost gives none: the line that leads to its exit is replayed with the exit, and a position that is an exit too
 * is only an exit). The theory has to have something to say from all of them. The costliest exits first, then the
 * lines the player met most often.
 */
export async function collectDrillPositions(
  sources: readonly ProfileSource[],
  lookup: PositionLookup,
  { isBook = isInBook, yieldToUi }: CollectOptions = {}
): Promise<DrillPosition[]> {
  const groups = new Map<string, Group>();
  const walks: Array<{
    result: GameAnalysisResult;
    color: 'w' | 'b';
    steps: Step[];
    date: number;
    /** The position where the player left the theory in this game, if they did. */
    exitKey: string | null;
  }> = [];
  let sinceYield = 0;

  for (const source of sources) {
    const { result } = source;
    const color = playerColorIn(result);
    if (color !== null && result.moves.length >= MIN_GAME_PLIES) {
      const date = parsePgnDate(result.metadata.date) ?? source.savedAt;
      const exit = findExit(result, color);
      const chess = exit?.byPlayer ? replay(exit.line) : null;
      let exitKey: string | null = null;
      if (exit && chess) {
        const fen = chess.fen();
        const key = normalizeFen(fen);
        exitKey = key;
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
      const theoryEnd = exit ? exit.line.length : Math.min(result.moves.length, BOOK_PLIES);
      const steps = theorySteps(result.moves, color, theoryEnd);
      if (steps.length > 0) walks.push({ result, color, steps, date, exitKey });
    }

    if (yieldToUi && ++sinceYield >= 25) {
      sinceYield = 0;
      await yieldToUi();
    }
  }

  const exits: DrillPosition[] = [];
  for (const [key, group] of groups) {
    const bookMoves = theoryMoves(group.fen, lookup);
    // A move the database knows now (the game was analysed before the database was complete) is not an exit
    const played = stillTheory(group.fen, group.played, isBook, 'off');
    const loss = group.losses / group.games;
    if (bookMoves.length === 0 || played.length === 0 || loss < COSTLY_EXIT) continue;
    exits.push({
      kind: 'exit',
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
  exits.sort((a, b) => b.loss - a.loss || b.games - a.games || (a.id < b.id ? -1 : 1));

  // What the games did at each position where the player followed the theory
  const lineGroups = new Map<string, LineGroup>();
  for (const { result, color, steps, date } of walks) {
    for (const step of steps) {
      let group = lineGroups.get(step.key);
      if (!group) {
        const opening = openingAtPly(result.moves, step.ply - 1);
        group = {
          fen: step.fen,
          color,
          ply: step.ply,
          line: result.moves.slice(0, step.ply).map((m) => m.san),
          opening: opening?.name ?? '',
          eco: opening?.eco ?? '',
          played: new Map(),
          games: 0,
          date,
        };
        lineGroups.set(step.key, group);
      }
      group.games += 1;
      group.date = Math.max(group.date, date);
      group.played.set(step.san, (group.played.get(step.san) ?? 0) + 1);
    }
  }
  // The deepest shared position of each game: the ones before it are on the way to it. A game whose exit is
  // replayed gives none: the line that leads to the exit is replayed with it
  const taken = new Set(exits.map((position) => position.id));
  const deepest = new Set<string>();
  for (const { steps, exitKey } of walks) {
    if (exitKey !== null && taken.has(`${DRILL_ID_PREFIX}${exitKey}`)) continue;
    const shared = [...steps].reverse().find((step) => lineGroups.get(step.key)!.games >= MIN_RECURRENCE);
    if (shared) deepest.add(shared.key);
  }
  const lines: DrillPosition[] = [];
  for (const key of deepest) {
    const group = lineGroups.get(key)!;
    const id = `${DRILL_ID_PREFIX}${key}`;
    if (taken.has(id)) continue;
    const bookMoves = theoryMoves(group.fen, lookup);
    const played = stillTheory(group.fen, group.played, isBook, 'book');
    if (bookMoves.length === 0 || played.length === 0) continue;
    lines.push({
      kind: 'line',
      id,
      fen: group.fen,
      color: group.color,
      moveNumber: Math.floor(group.ply / 2) + 1,
      line: group.line,
      opening: group.opening,
      eco: group.eco,
      bookMoves,
      played,
      games: group.games,
      loss: 0,
      date: group.date,
    });
  }
  lines.sort((a, b) => b.games - a.games || b.date - a.date || (a.id < b.id ? -1 : 1));

  return [...exits, ...lines];
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

/**
 * The verdict on the move `san` (English SAN, legal in the position) played in `position`. The move the player made
 * in a game is wrong for an exit, and right for a line (it is theory).
 */
export function judgeDrillMove(position: DrillPosition, san: string, isBook: BookCheck = isInBook): DrillVerdict {
  if (position.kind === 'exit' && position.played.some((move) => move.san === san)) return { kind: 'played' };
  const chess = new Chess(position.fen);
  try {
    chess.move(san);
  } catch {
    return { kind: 'off' };
  }
  return isBook(position.fen, san, chess.fen()) ? { kind: 'book' } : { kind: 'off' };
}

/** The positions of one side and of one kind; none chosen: all of them. */
export const drillPositionsOf = (
  positions: readonly DrillPosition[],
  color: 'w' | 'b' | null,
  kind: DrillKind | null = null
): DrillPosition[] =>
  positions.filter(
    (position) => (color === null || position.color === color) && (kind === null || position.kind === kind)
  );
