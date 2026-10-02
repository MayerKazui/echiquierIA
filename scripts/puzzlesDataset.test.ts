import { describe, expect, it } from 'vitest';
import {
  META_THEMES,
  PuzzleSelector,
  buildDataset,
  cellsOf,
  meetsQuality,
  parsePuzzleLine,
  type RawPuzzle,
} from './puzzlesDataset';

const LINE =
  '00008,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,f2g3 e6e7 b2b1 b3c1 b1c1 h6c1,1811,76,95,10282,crushing hangingPiece long middlegame,https://lichess.org/787zsVup/black#48,,';

const raw = (id: string, over: Partial<RawPuzzle> = {}): RawPuzzle => ({
  id,
  fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  moves: ['e2e4', 'e7e5'],
  rating: 1000,
  themes: ['fork'],
  deviation: 70,
  popularity: 90,
  plays: 1000,
  ...over,
});

describe('parsePuzzleLine', () => {
  it('reads a line of the database', () => {
    expect(parsePuzzleLine(LINE)).toEqual({
      id: '00008',
      fen: 'r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24',
      moves: ['f2g3', 'e6e7', 'b2b1', 'b3c1', 'b1c1', 'h6c1'],
      rating: 1811,
      deviation: 76,
      popularity: 95,
      plays: 10282,
      themes: ['crushing', 'hangingPiece', 'long', 'middlegame'],
    });
  });

  it('skips the header, blank and damaged lines', () => {
    expect(parsePuzzleLine('PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl')).toBeNull();
    expect(parsePuzzleLine('')).toBeNull();
    expect(parsePuzzleLine('a,b,c,x,1,2,3,fork')).toBeNull();
  });
});

describe('meetsQuality', () => {
  it('wants a reliable rating, enough players and a liked puzzle', () => {
    expect(meetsQuality(raw('a'))).toBe(true);
    expect(meetsQuality(raw('a', { deviation: 140 }))).toBe(false);
    expect(meetsQuality(raw('a', { plays: 20 }))).toBe(false);
    expect(meetsQuality(raw('a', { popularity: 40 }))).toBe(false);
  });
});

describe('cellsOf', () => {
  it('makes a cell of the band and each theme that says something about the tactic', () => {
    expect(cellsOf(raw('a', { rating: 1250, themes: ['fork', 'short', 'endgame', 'crushing'] }))).toEqual([
      '1200|fork',
      '1200|endgame',
    ]);
  });

  it('puts a puzzle with only meta themes in the `other` cell', () => {
    expect(META_THEMES.has('short')).toBe(true);
    expect(cellsOf(raw('a', { themes: ['short', 'master'] }))).toEqual(['1000|other']);
    expect(cellsOf(raw('a', { themes: [] }))).toEqual(['1000|other']);
  });
});

describe('PuzzleSelector', () => {
  function selectorWith(puzzles: RawPuzzle[], perCell = 100): PuzzleSelector {
    const selector = new PuzzleSelector(perCell);
    for (const puzzle of puzzles) selector.add(puzzle);
    return selector;
  }

  const common = Array.from({ length: 50 }, (_, i) => raw(`f${String(i).padStart(2, '0')}`, { popularity: 50 + i }));
  const rare = [raw('r1', { themes: ['underPromotion'], popularity: 80 }), raw('r2', { themes: ['underPromotion'] })];

  it('takes a rare theme whole and cuts a common one short', () => {
    const ids = selectorWith([...common, ...rare])
      .select(10)
      .map((puzzle) => puzzle.id);
    expect(ids).toHaveLength(10);
    expect(ids).toContain('r1');
    expect(ids).toContain('r2');
  });

  it('takes the most liked of a cell first', () => {
    const ids = selectorWith(common)
      .select(3)
      .map((puzzle) => puzzle.id);
    expect(ids).toEqual(['f49', 'f48', 'f47']);
  });

  it('gives every band its share', () => {
    const low = Array.from({ length: 20 }, (_, i) => raw(`l${i}`, { rating: 800 }));
    const high = Array.from({ length: 20 }, (_, i) => raw(`h${i}`, { rating: 2000 }));
    const picked = selectorWith([...low, ...high]).select(10);
    expect(picked.filter((puzzle) => puzzle.rating === 800)).toHaveLength(5);
    expect(picked.filter((puzzle) => puzzle.rating === 2000)).toHaveLength(5);
  });

  it('counts a puzzle once even when several of its cells pick it', () => {
    const both = raw('x', { themes: ['fork', 'pin'], popularity: 99 });
    const picked = selectorWith([both, raw('y', { themes: ['pin'], popularity: 80 })]).select(10);
    expect(picked.map((puzzle) => puzzle.id).sort()).toEqual(['x', 'y']);
  });

  it('gives the same result whatever the order of the database', () => {
    const all = [...common, ...rare];
    const forward = selectorWith(all)
      .select(15)
      .map((puzzle) => puzzle.id);
    const backward = selectorWith([...all].reverse())
      .select(15)
      .map((puzzle) => puzzle.id);
    expect(backward).toEqual(forward);
  });

  it('keeps no more than `perCell` puzzles for a cell', () => {
    expect(selectorWith(common, 5).select(100)).toHaveLength(5);
  });

  it('returns everything when there is less than the target', () => {
    expect(selectorWith(rare).select(100)).toHaveLength(2);
  });
});

describe('buildDataset', () => {
  const dataset = buildDataset([
    { ...raw('b'), rating: 1010, themes: ['fork', 'short'], moves: ['e2e4', 'e7e5'] },
    { ...raw('a'), rating: 1010, themes: ['fork'], moves: ['e2e4', 'e7e5'] },
    { ...raw('c'), rating: 1500, themes: ['pin'], moves: ['e2e4', 'e7e5'] },
    { ...raw('d'), rating: 300, themes: [], moves: ['e2e4', 'e7e5'] },
  ]);

  it('makes a shard per band, the puzzles sorted by rating then id', () => {
    expect(dataset.shards.map((shard) => shard.band)).toEqual([400, 1000, 1400]);
    expect(dataset.shards[1].puzzles.map((record) => record[0])).toEqual(['a', 'b']);
  });

  it('counts the puzzles by band and by theme in the index', () => {
    expect(dataset.index.total).toBe(4);
    expect(dataset.index.bands).toEqual({ 400: 1, 1000: 2, 1400: 1 });
    expect(dataset.index.themes.fork).toEqual({ 1000: 2 });
    expect(dataset.index.themes.short).toEqual({ 1000: 1 });
    expect(Object.keys(dataset.index.themes)).toEqual(['fork', 'pin', 'short']);
  });
});
