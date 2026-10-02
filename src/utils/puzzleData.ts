/**
 * The puzzles shipped with the app: a subset of the Lichess puzzle database (CC0), cut by rating and loaded on demand
 * (see `scripts/build-puzzles.ts` for how it is made and `services/puzzleBook.ts` for how it is read).
 *
 * Files, under `puzzles/` next to the app:
 * - `index.json` ({@link PuzzleIndex}): how many puzzles there are, by band and by theme, so the screens can show
 *   counts without loading anything else;
 * - `<band>.json` ({@link PuzzleShard}): the puzzles of one band of ratings.
 */

/** Width of a band of ratings, and the first and last bands (what is below or above falls in the nearest one). */
export const BAND_WIDTH = 200;
export const MIN_BAND = 400;
export const MAX_BAND = 2800;

/** The band (its lowest rating) a rating belongs to. */
export function bandOf(rating: number): number {
  const band = Math.floor(rating / BAND_WIDTH) * BAND_WIDTH;
  return Math.min(MAX_BAND, Math.max(MIN_BAND, band));
}

/** The bands that cover the ratings from `min` to `max`, lowest first. */
export function bandsBetween(min: number, max: number): number[] {
  const bands: number[] = [];
  for (let band = bandOf(min); band <= bandOf(max); band += BAND_WIDTH) bands.push(band);
  return bands;
}

/**
 * A puzzle as the Lichess database has it: `moves` (UCI) starts with the move of the opponent, which leads to the
 * position of the puzzle, then alternates between the solution (the player) and the replies of the opponent.
 */
export interface Puzzle {
  id: string;
  /** The position before the opponent's first move. */
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
}

/** A puzzle in a shard: [id, the first four fields of the FEN, moves, rating, themes]; the last two are space-separated. */
export type PuzzleRecord = [string, string, string, number, string];

export interface PuzzleShard {
  band: number;
  puzzles: PuzzleRecord[];
}

export interface PuzzleIndex {
  /** Changes when the format changes. */
  version: number;
  total: number;
  bandWidth: number;
  /** Puzzles per band (the lowest rating of the band as the key). */
  bands: Record<string, number>;
  /** Puzzles per theme and per band. */
  themes: Record<string, Record<string, number>>;
}

export const PUZZLE_FORMAT_VERSION = 1;

/** The move counters are not stored: they change nothing to a puzzle. */
const FEN_COUNTERS = ' 0 1';

export function encodePuzzle(puzzle: Puzzle): PuzzleRecord {
  const fen = puzzle.fen.split(' ').slice(0, 4).join(' ');
  return [puzzle.id, fen, puzzle.moves.join(' '), puzzle.rating, puzzle.themes.join(' ')];
}

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** The puzzle of a record, or null when the record is damaged (the data comes from a file that can be wrong). */
export function decodePuzzle(record: unknown): Puzzle | null {
  if (!Array.isArray(record) || record.length < 5) return null;
  const [id, fen, moves, rating, themes] = record;
  if (typeof id !== 'string' || typeof fen !== 'string' || typeof moves !== 'string') return null;
  if (typeof rating !== 'number' || !Number.isFinite(rating) || typeof themes !== 'string') return null;
  const list = moves.split(' ');
  // At least the move of the opponent and one move to find
  if (list.length < 2 || !list.every((move) => UCI_MOVE.test(move))) return null;
  return {
    id,
    fen: fen + FEN_COUNTERS,
    moves: list,
    rating,
    themes: themes === '' ? [] : themes.split(' '),
  };
}
