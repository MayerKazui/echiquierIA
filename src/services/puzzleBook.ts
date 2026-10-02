import { bandsBetween, decodePuzzle, type Puzzle, type PuzzleIndex, type PuzzleShard } from '../utils/puzzleData';
import { assetUrl } from '../utils/siteUrl';

/**
 * Reads the puzzles shipped with the app (see `utils/puzzleData`). Nothing is loaded before it is needed: the index
 * (a few KB) tells what there is, a shard (up to a few MB, 1 MB compressed) is fetched the first time a band of
 * ratings is asked for and kept in memory. The browser and the service worker cache the files, so a band already
 * seen works offline.
 */

type FetchJson = (path: string) => Promise<unknown>;

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(assetUrl(path));
  if (!response.ok) throw new Error(`Could not load ${path}: HTTP ${response.status}`);
  return response.json();
}

const loaded = new Map<string, Promise<unknown>>();

/** One load per file, kept for good once it worked; a failure is forgotten so that a later call tries again. */
function once<T>(path: string, load: FetchJson): Promise<T> {
  let promise = loaded.get(path);
  if (!promise) {
    promise = load(path).catch((error) => {
      loaded.delete(path);
      throw error;
    });
    loaded.set(path, promise);
  }
  return promise as Promise<T>;
}

/** Forgets what was loaded (for the tests). */
export function resetPuzzleBook(): void {
  loaded.clear();
}

export function loadPuzzleIndex(load: FetchJson = fetchJson): Promise<PuzzleIndex> {
  return once<PuzzleIndex>('puzzles/index.json', load);
}

/** The puzzles of a band, the damaged records left out. */
export async function loadBand(band: number, load: FetchJson = fetchJson): Promise<Puzzle[]> {
  const shard = await once<PuzzleShard>(`puzzles/${band}.json`, load);
  if (!shard || !Array.isArray(shard.puzzles)) throw new Error(`Puzzles ${band}: unexpected content`);
  return shard.puzzles.map(decodePuzzle).filter((puzzle): puzzle is Puzzle => puzzle !== null);
}

export interface PuzzleFilter {
  minRating: number;
  maxRating: number;
  /** Empty: any theme. */
  themes: string[];
  /** `any`: at least one of the themes; `all`: every one of them. */
  match: 'any' | 'all';
}

export function matchesFilter(puzzle: Puzzle, filter: PuzzleFilter): boolean {
  if (puzzle.rating < filter.minRating || puzzle.rating > filter.maxRating) return false;
  if (filter.themes.length === 0) return true;
  return filter.match === 'all'
    ? filter.themes.every((theme) => puzzle.themes.includes(theme))
    : filter.themes.some((theme) => puzzle.themes.includes(theme));
}

/** The puzzles that match, in order of rating. Loads the bands the ratings cover. */
export async function loadPuzzles(filter: PuzzleFilter, load: FetchJson = fetchJson): Promise<Puzzle[]> {
  const bands = await Promise.all(bandsBetween(filter.minRating, filter.maxRating).map((band) => loadBand(band, load)));
  return bands.flat().filter((puzzle) => matchesFilter(puzzle, filter));
}

/** How many puzzles a theme has between two ratings, by the index (to the band: the edges are not exact). */
export function themeCount(index: PuzzleIndex, theme: string, minRating: number, maxRating: number): number {
  const perBand = index.themes[theme] ?? {};
  return bandsBetween(minRating, maxRating).reduce((sum, band) => sum + (perBand[band] ?? 0), 0);
}

/** How many puzzles there are between two ratings, by the index. */
export function ratingCount(index: PuzzleIndex, minRating: number, maxRating: number): number {
  return bandsBetween(minRating, maxRating).reduce((sum, band) => sum + (index.bands[band] ?? 0), 0);
}
