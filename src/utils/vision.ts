import { Chess, type Color, type PieceSymbol } from 'chess.js';
import type { VisionGame } from '../data/visionGames';
import { pieceName } from './accessibility';
import { formatPvToFrench, numberedFrenchMove } from './chessNotation';

/**
 * Vision training: the pure part. Three exercises (find a square by its name, follow a game without seeing the
 * pieces, calculate a line without playing it), their records, and the questions they ask, built from real games and
 * checked with chess.js so that every answer is the one the rules give.
 */

export type VisionMode = 'coordinates' | 'blind' | 'lines';
export type Random = () => number;

/** Length of a round of "Coordonnées". */
export const COORDINATES_SECONDS = 30;
/** Questions in a round of the other two exercises. */
export const QUESTIONS_PER_ROUND = 5;

export interface VisionLevel {
  id: string;
  label: string;
  hint: string;
  /** Half-moves announced (blind) or calculated (lines). */
  plies?: number;
}

export const VISION_LEVELS: Record<VisionMode, VisionLevel[]> = {
  coordinates: [
    { id: 'white', label: 'Côté des Blancs', hint: 'a1 en bas à gauche' },
    { id: 'black', label: 'Côté des Noirs', hint: 'h8 en bas à gauche' },
  ],
  blind: [
    { id: 'short', label: 'Courte', hint: '6 demi-coups', plies: 6 },
    { id: 'medium', label: 'Moyenne', hint: '12 demi-coups', plies: 12 },
    { id: 'long', label: 'Longue', hint: '20 demi-coups', plies: 20 },
  ],
  lines: [
    { id: 'short', label: 'Courtes', hint: '2 demi-coups', plies: 2 },
    { id: 'medium', label: 'Moyennes', hint: '4 demi-coups', plies: 4 },
    { id: 'long', label: 'Longues', hint: '6 demi-coups', plies: 6 },
  ],
};

export const VISION_MODE_LABELS: Record<VisionMode, string> = {
  coordinates: 'Coordonnées',
  blind: 'Mode aveugle',
  lines: 'Calcul de lignes',
};

/* ---------------------------------------------------------------- records */

/** The best score of one exercise at one level, and how many rounds were played there. */
export interface VisionRecord {
  /** `mode:level`, e.g. `coordinates:white`. */
  key: string;
  best: number;
  /** When the best score was made. */
  bestAt: number;
  runs: number;
}

const RECORD_KEY = /^(coordinates|blind|lines):[a-z]{1,20}$/;
const MAX_SCORE = 1000;
const MAX_RUNS = 1_000_000;

export const recordKey = (mode: VisionMode, level: string): string => `${mode}:${level}`;

export const isVisionRecord = (value: unknown): value is VisionRecord => {
  if (typeof value !== 'object' || value === null) return false;
  const { key, best, bestAt, runs } = value as VisionRecord;
  return (
    typeof key === 'string' &&
    RECORD_KEY.test(key) &&
    Number.isInteger(best) &&
    best >= 0 &&
    best <= MAX_SCORE &&
    typeof bestAt === 'number' &&
    Number.isFinite(bestAt) &&
    bestAt >= 0 &&
    Number.isInteger(runs) &&
    runs >= 1 &&
    runs <= MAX_RUNS
  );
};

export interface RunOutcome {
  record: VisionRecord;
  /** The best score before this round, null for the first round at this level. */
  previousBest: number | null;
  /** Whether this round beat the best score (a score of 0 never does). */
  isRecord: boolean;
}

/** The record after one more round with `score`. */
export function applyRun(existing: VisionRecord | undefined, key: string, score: number, now: number): RunOutcome {
  const isRecord = score > (existing?.best ?? 0);
  return {
    previousBest: existing?.best ?? null,
    isRecord,
    record: {
      key,
      best: Math.max(existing?.best ?? 0, score),
      bestAt: isRecord || !existing ? now : existing.bestAt,
      runs: (existing?.runs ?? 0) + 1,
    },
  };
}

/**
 * Two copies of the same record (this browser's and a backup's): the larger best score wins. The number of rounds
 * is the larger count, not the sum: the same rounds seen twice must not be added up.
 */
export function mergeRecords(a: VisionRecord, b: VisionRecord): VisionRecord {
  const bestAt = a.best === b.best ? Math.min(a.bestAt, b.bestAt) : a.best > b.best ? a.bestAt : b.bestAt;
  return { key: a.key, best: Math.max(a.best, b.best), bestAt, runs: Math.max(a.runs, b.runs) };
}

/* ---------------------------------------------------------------- random */

export const pick = <T>(items: readonly T[], random: Random): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];

export function shuffled<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* ------------------------------------------------------------ coordinates */

export const FILES = 'abcdefgh';
export const SQUARES: string[] = [...FILES].flatMap((file) => [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => `${file}${rank}`));

/** The next square to find: any, but never the one just asked. */
export function nextTarget(previous: string | null, random: Random): string {
  return pick(previous === null ? SQUARES : SQUARES.filter((square) => square !== previous), random);
}

/** Whether a square is light (a1 is dark). */
export const isLightSquare = (square: string): boolean => (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0;

/* ----------------------------------------------------------------- pieces */

/** What a square holds, as an answer: `empty`, or the colour and the piece (`wn`: white knight). */
export const EMPTY = 'empty';

export const PIECE_CODES: readonly string[] = ['w', 'b'].flatMap((color) =>
  ['k', 'q', 'r', 'b', 'n', 'p'].map((type) => color + type)
);

export const contentCode = (piece: { type: string; color: Color } | null | undefined): string =>
  piece ? `${piece.color}${piece.type}` : EMPTY;

/** "cavalier blanc", or "vide". */
export function contentLabel(code: string): string {
  if (code === EMPTY) return 'vide';
  return pieceName({ color: code[0] as Color, type: code[1] });
}

/** "un cavalier blanc", "une dame noire", "rien": what a square holds, in a sentence. */
export function contentWithArticle(code: string): string {
  if (code === EMPTY) return 'rien';
  return `${code[1] === 'q' || code[1] === 'r' ? 'une' : 'un'} ${contentLabel(code)}`;
}

/** "le cavalier blanc", "la dame noire": a piece with its definite article. */
export function contentDefinite(code: string): string {
  return `${code[1] === 'q' || code[1] === 'r' ? 'la' : 'le'} ${contentLabel(code)}`;
}

/** What every square of a position holds. */
export function contentsOf(fen: string): Record<string, string> {
  const chess = new Chess(fen);
  const contents: Record<string, string> = {};
  for (const row of chess.board()) {
    for (const cell of row) if (cell) contents[cell.square] = contentCode(cell);
  }
  return Object.fromEntries(SQUARES.map((square) => [square, contents[square] ?? EMPTY]));
}

/* ----------------------------------------------------------------- replay */

/** A piece followed through a line: where it started, and where it is now (null: it was taken). */
export interface TrackedPiece {
  origin: string;
  type: PieceSymbol;
  color: Color;
  square: string | null;
  /** How many times it moved (a rook that castled counts). */
  moves: number;
}

export interface Replay {
  start: string;
  end: string;
  /** Each move with its number, in French ("7…Cf6"). */
  labels: string[];
  pieces: TrackedPiece[];
}

/** Plays `sans` from `startFen` and follows every piece. Null when a move is not legal. */
export function replay(startFen: string, sans: readonly string[]): Replay | null {
  let chess: Chess;
  try {
    chess = new Chess(startFen);
  } catch {
    return null;
  }
  const pieces: TrackedPiece[] = [];
  const at = new Map<string, TrackedPiece>();
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      const piece: TrackedPiece = {
        origin: cell.square,
        type: cell.type,
        color: cell.color,
        square: cell.square,
        moves: 0,
      };
      pieces.push(piece);
      at.set(cell.square, piece);
    }
  }
  const relocate = (from: string, to: string) => {
    const piece = at.get(from);
    if (!piece) return;
    at.delete(from);
    at.set(to, piece);
    piece.square = to;
    piece.moves += 1;
  };
  const take = (square: string) => {
    const piece = at.get(square);
    if (!piece) return;
    at.delete(square);
    piece.square = null;
  };

  const labels: string[] = [];
  for (const san of sans) {
    const isWhite = chess.turn() === 'w';
    const number = chess.moveNumber();
    let move;
    try {
      move = chess.move(san);
    } catch {
      return null;
    }
    labels.push(numberedFrenchMove(number, isWhite, move.san));
    if (move.flags.includes('e')) take(`${move.to[0]}${move.from[1]}`);
    else if (move.captured) take(move.to);
    relocate(move.from, move.to);
    if (move.flags.includes('k')) relocate(`h${move.from[1]}`, `f${move.from[1]}`);
    if (move.flags.includes('q')) relocate(`a${move.from[1]}`, `d${move.from[1]}`);
  }
  return { start: startFen, end: chess.fen(), labels, pieces };
}

/** The position after the first `plies` half-moves of a game. */
function positionAfter(moves: readonly string[], plies: number): string {
  const chess = new Chess();
  for (const san of moves.slice(0, plies)) chess.move(san);
  return chess.fen();
}

/* ------------------------------------------------------------------ blind */

export interface SquareQuestion {
  square: string;
  /** `empty` or a piece code. */
  answer: string;
}

export interface BlindRound {
  game: VisionGame;
  /** The moves announced, one by one, in French with their numbers. */
  labels: string[];
  /** The position they lead to, shown after the questions. */
  fen: string;
  questions: SquareQuestion[];
}

/**
 * `count` squares to ask about, the interesting ones first: the squares a move changed (a piece that arrived, a
 * square that was left), then some that did not change, so that "nothing there" is also an answer.
 */
function questionSquares(before: Record<string, string>, after: Record<string, string>, count: number, random: Random) {
  const pools: Record<'moved' | 'left' | 'still' | 'void', string[]> = { moved: [], left: [], still: [], void: [] };
  for (const square of SQUARES) {
    const changed = before[square] !== after[square];
    const isEmpty = after[square] === EMPTY;
    pools[changed ? (isEmpty ? 'left' : 'moved') : isEmpty ? 'void' : 'still'].push(square);
  }
  const queues = {
    moved: shuffled(pools.moved, random),
    left: shuffled(pools.left, random),
    still: shuffled(pools.still, random),
    void: shuffled(pools.void, random),
  };
  const order = ['moved', 'left', 'moved', 'moved', 'still', 'left', 'still', 'void'] as const;
  const chosen: string[] = [];
  while (chosen.length < count) {
    const size = chosen.length;
    for (const name of order) {
      const next = chosen.length < count ? queues[name].shift() : undefined;
      if (next !== undefined) chosen.push(next);
    }
    if (chosen.length === size) break; // no square left (cannot happen on a board)
  }
  return shuffled(chosen, random);
}

/** A game cut after `plies` half-moves, and the squares to ask about. Null when no game is long enough. */
export function makeBlindRound(games: readonly VisionGame[], plies: number, random: Random): BlindRound | null {
  const usable = games.filter((game) => game.moves.length >= plies);
  if (usable.length === 0) return null;
  const game = pick(usable, random);
  const played = replay(new Chess().fen(), game.moves.slice(0, plies));
  if (!played) return null;
  const before = contentsOf(played.start);
  const after = contentsOf(played.end);
  return {
    game,
    labels: played.labels,
    fen: played.end,
    questions: questionSquares(before, after, QUESTIONS_PER_ROUND, random).map((square) => ({
      square,
      answer: after[square],
    })),
  };
}

/* ------------------------------------------------------------------ lines */

interface LineBase {
  game: VisionGame;
  startFen: string;
  endFen: string;
  /** The line, in French with its numbers ("12. Cf3 Cc6 13. d4"). */
  line: string;
  /** How many half-moves it holds. */
  plies: number;
  /** Half-moves of the game played before the line starts. */
  from: number;
}

export type LineQuestion = LineBase &
  (
    | {
        /** Where is this piece at the end of the line? */
        kind: 'where';
        piece: { origin: string; type: PieceSymbol; color: Color };
        /** The square it ends on, null when it was taken. */
        answer: string | null;
      }
    | {
        /** What is on this square at the end of the line? */
        kind: 'what';
        square: string;
        /** `empty` or a piece code. */
        answer: string;
      }
  );

/** The first half-moves of a game are always the same openings: lines start a little way in. */
const MIN_LINE_START = 4;

/** A stretch of a game of `plies` half-moves, and a question that needs it played out. Null when none fits. */
export function makeLineQuestion(games: readonly VisionGame[], plies: number, random: Random): LineQuestion | null {
  const usable = games.filter((game) => game.moves.length >= plies);
  if (usable.length === 0) return null;
  const game = pick(usable, random);
  const latest = game.moves.length - plies;
  const first = Math.min(MIN_LINE_START, latest);
  const from = first + Math.min(latest - first, Math.floor(random() * (latest - first + 1)));
  const startFen = positionAfter(game.moves, from);
  const sans = game.moves.slice(from, from + plies);
  const played = replay(startFen, sans);
  if (!played) return null;
  const base: LineBase = {
    game,
    startFen,
    endFen: played.end,
    line: formatPvToFrench(startFen, sans, sans.length),
    plies,
    from,
  };

  const candidates = played.pieces.filter((piece) => piece.moves > 0 || piece.square === null);
  const before = contentsOf(startFen);
  const after = contentsOf(played.end);
  const changed = SQUARES.filter((square) => before[square] !== after[square]);
  if (candidates.length > 0 && (changed.length === 0 || random() < 0.5)) {
    const piece = pick(candidates, random);
    return {
      ...base,
      kind: 'where',
      piece: { origin: piece.origin, type: piece.type, color: piece.color },
      answer: piece.square,
    };
  }
  if (changed.length === 0) return null;
  // Squares that ended with a piece are the more telling ones, a square left empty is the trap
  const occupied = changed.filter((square) => after[square] !== EMPTY);
  const square = pick(occupied.length > 0 && random() < 0.7 ? occupied : changed, random);
  return { ...base, kind: 'what', square, answer: after[square] };
}

/** A round: `QUESTIONS_PER_ROUND` stretches of games, never the same stretch twice (fewer if the games run out). */
export function makeLineRound(games: readonly VisionGame[], plies: number, random: Random): LineQuestion[] {
  const questions: LineQuestion[] = [];
  const seen = new Set<string>();
  for (let attempt = 0; attempt < 40 && questions.length < QUESTIONS_PER_ROUND; attempt++) {
    const question = makeLineQuestion(games, plies, random);
    if (!question) continue;
    const id = `${question.game.id}:${question.from}`;
    if (seen.has(id)) continue;
    seen.add(id);
    questions.push(question);
  }
  return questions;
}
