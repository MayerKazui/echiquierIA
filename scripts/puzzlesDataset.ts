import {
  BAND_WIDTH,
  PUZZLE_FORMAT_VERSION,
  bandOf,
  encodePuzzle,
  type Puzzle,
  type PuzzleIndex,
  type PuzzleShard,
} from '../src/utils/puzzleData';

/**
 * Picks the puzzles the app ships out of the Lichess database (millions of them), and cuts them in shards.
 *
 * The aim is variety, not a sample of the database: every theme must be there at every rating. So the puzzles are
 * grouped in cells (a band of ratings and a theme) and the cells take turns, each giving its best remaining puzzle
 * (the most liked), until there are enough. A rare theme is taken whole, a common one is cut short.
 */

export interface RawPuzzle extends Puzzle {
  deviation: number;
  popularity: number;
  plays: number;
}

/**
 * Themes that say nothing about the tactic: how long the solution is, how the position stands, who played. They
 * do not make cells (a puzzle with only these ones goes in the `other` cell) but are kept with the puzzle.
 */
export const META_THEMES: ReadonlySet<string> = new Set([
  'short',
  'long',
  'veryLong',
  'oneMove',
  'crushing',
  'advantage',
  'equality',
  'master',
  'masterVsMaster',
  'superGM',
]);

/** What a puzzle must be to be worth keeping: a reliable rating, enough players, liked by them. */
export interface Quality {
  maxDeviation: number;
  minPlays: number;
  minPopularity: number;
}

export const DEFAULT_QUALITY: Quality = { maxDeviation: 100, minPlays: 100, minPopularity: 80 };

/** A line of `lichess_db_puzzle.csv` (the fields have no quotes), or null for the header and damaged lines. */
export function parsePuzzleLine(line: string): RawPuzzle | null {
  const fields = line.split(',');
  if (fields.length < 8) return null;
  const [id, fen, moves, rating, deviation, popularity, plays, themes] = fields;
  const numbers = [rating, deviation, popularity, plays].map(Number);
  if (!id || !fen || !moves || numbers.some((n) => !Number.isFinite(n)) || fields[3] === 'Rating') return null;
  return {
    id,
    fen,
    moves: moves.split(' '),
    rating: numbers[0],
    deviation: numbers[1],
    popularity: numbers[2],
    plays: numbers[3],
    themes: themes.split(' ').filter(Boolean),
  };
}

export function meetsQuality(puzzle: RawPuzzle, quality: Quality = DEFAULT_QUALITY): boolean {
  return (
    puzzle.deviation <= quality.maxDeviation &&
    puzzle.plays >= quality.minPlays &&
    puzzle.popularity >= quality.minPopularity
  );
}

/** The most liked first; at equal popularity, the most played. */
const score = (puzzle: RawPuzzle): number => puzzle.popularity * 1e8 + Math.min(puzzle.plays, 99_999_999);

/** The cells a puzzle belongs to. */
export function cellsOf(puzzle: RawPuzzle): string[] {
  const band = bandOf(puzzle.rating);
  const themes = puzzle.themes.filter((theme) => !META_THEMES.has(theme));
  return (themes.length > 0 ? themes : ['other']).map((theme) => `${band}|${theme}`);
}

/** A bounded min-heap on the score: it keeps the best `capacity` puzzles of a cell. */
class BestOf {
  private readonly items: RawPuzzle[] = [];
  constructor(private readonly capacity: number) {}

  add(puzzle: RawPuzzle): void {
    const items = this.items;
    if (items.length < this.capacity) {
      items.push(puzzle);
      this.up(items.length - 1);
    } else if (score(puzzle) > score(items[0])) {
      items[0] = puzzle;
      this.down(0);
    }
  }

  /** The best first (ties broken by id, so that the result does not depend on the order of the file). */
  sorted(): RawPuzzle[] {
    return [...this.items].sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1));
  }

  private up(index: number): void {
    const items = this.items;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (score(items[parent]) <= score(items[index])) break;
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }

  private down(index: number): void {
    const items = this.items;
    for (;;) {
      const left = 2 * index + 1;
      const right = left + 1;
      let smallest = index;
      if (left < items.length && score(items[left]) < score(items[smallest])) smallest = left;
      if (right < items.length && score(items[right]) < score(items[smallest])) smallest = right;
      if (smallest === index) return;
      [items[smallest], items[index]] = [items[index], items[smallest]];
      index = smallest;
    }
  }
}

/**
 * Collects the best puzzles of every cell while the database is read, so that memory stays small: `perCell` bounds
 * what is kept for each cell, and it must be large enough for `select` to reach its target.
 */
export class PuzzleSelector {
  private readonly cells = new Map<string, BestOf>();
  constructor(private readonly perCell: number) {}

  add(puzzle: RawPuzzle): void {
    for (const cell of cellsOf(puzzle)) {
      let best = this.cells.get(cell);
      if (!best) {
        best = new BestOf(this.perCell);
        this.cells.set(cell, best);
      }
      best.add(puzzle);
    }
  }

  /** At most `target` puzzles, the cells taking turns. */
  select(target: number): RawPuzzle[] {
    const lists = [...this.cells.keys()].sort().map((cell) => this.cells.get(cell)!.sorted());
    const taken = new Map<string, RawPuzzle>();
    for (let rank = 0; taken.size < target; rank++) {
      let any = false;
      for (const list of lists) {
        if (rank >= list.length) continue;
        any = true;
        const puzzle = list[rank];
        if (!taken.has(puzzle.id)) taken.set(puzzle.id, puzzle);
        if (taken.size >= target) break;
      }
      if (!any) break;
    }
    return [...taken.values()];
  }
}

/** The shards (by band, the puzzles sorted by rating) and the index of a selection. */
export function buildDataset(puzzles: Puzzle[]): { index: PuzzleIndex; shards: PuzzleShard[] } {
  const byBand = new Map<number, Puzzle[]>();
  const themes: PuzzleIndex['themes'] = {};
  for (const puzzle of puzzles) {
    const band = bandOf(puzzle.rating);
    const list = byBand.get(band) ?? [];
    list.push(puzzle);
    byBand.set(band, list);
    for (const theme of puzzle.themes) {
      const counts = (themes[theme] ??= {});
      counts[band] = (counts[band] ?? 0) + 1;
    }
  }
  const shards: PuzzleShard[] = [...byBand.keys()]
    .sort((a, b) => a - b)
    .map((band) => ({
      band,
      puzzles: byBand
        .get(band)!
        .sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : 1))
        .map(encodePuzzle),
    }));
  const index: PuzzleIndex = {
    version: PUZZLE_FORMAT_VERSION,
    total: puzzles.length,
    bandWidth: BAND_WIDTH,
    bands: Object.fromEntries(shards.map((shard) => [shard.band, shard.puzzles.length])),
    themes: Object.fromEntries(Object.entries(themes).sort(([a], [b]) => (a < b ? -1 : 1))),
  };
  return { index, shards };
}
