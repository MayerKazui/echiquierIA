import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { buildOpeningsDataset, parseTsv } from './openingsDataset';

const key = (sans: string[]) => {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess.fen().split(' ').slice(0, 4).join(' ');
};

const tsv = (...rows: string[]) => ['eco\tname\tpgn', ...rows].join('\n');

describe('parseTsv', () => {
  it('skips the header and blank lines', () => {
    expect(parseTsv(tsv('B00\tKing’s Pawn Game\t1. e4', '', 'C00\tFrench Defense\t1. e4 e6'))).toEqual([
      { eco: 'B00', name: 'King’s Pawn Game', pgn: '1. e4' },
      { eco: 'C00', name: 'French Defense', pgn: '1. e4 e6' },
    ]);
  });
});

describe('buildOpeningsDataset', () => {
  const lines = parseTsv(
    tsv(
      'C00\tFrench Defense\t1. e4 e6',
      'C00\tFrench Defense: Normal\t1. e4 e6 2. d4 d5',
      'C02\tFrench Defense: Advance\t1. e4 e6 2. d4 d5 3. e5',
      'C01\tFrench Defense: Exchange\t1. e4 e6 2. d4 d5 3. exd5',
      'C01\tFrench Defense: Exchange, Other\t1. e4 e6 2. d4 d5 3. exd5 exd5',
      'C00\tFrench Defense: Reti\t1. Nf3 e6 2. e4',
      'B00\tKing’s Pawn Game\t1. e4'
    )
  );
  const dataset = buildOpeningsDataset(lines);

  it('stores the name of a line only on the position where it ends', () => {
    expect(dataset[key(['e4', 'e6'])].slice(2, 4)).toEqual(['C00', 'French Defense']);
    expect(dataset[key(['e4', 'e6', 'd4'])].slice(2, 4)).toEqual(['', '']);
    expect(dataset[key(['e4'])].slice(2, 4)).toEqual(['B00', 'King’s Pawn Game']);
  });

  it('keeps the name AND the continuations of a position that is both an end and a middle', () => {
    const [bestSan, bestUci, eco, name, , nexts] = dataset[key(['e4', 'e6'])];
    expect(eco).toBe('C00');
    expect(name).toBe('French Defense');
    expect(bestSan).toBe('d4');
    expect(bestUci).toBe('d2d4');
    expect(nexts).toEqual(['d4']);
  });

  it('orders continuations by how many lines use them and builds the main line', () => {
    const [bestSan, , , , pv, nexts] = dataset[key(['e4', 'e6', 'd4', 'd5'])];
    expect(nexts).toEqual(['exd5', 'e5']); // Exchange is used by 2 lines, Advance by 1
    expect(bestSan).toBe('exd5');
    expect(pv).toEqual(['exd5', 'exd5']);
  });

  it('has no continuation at the end of the deepest line', () => {
    const [bestSan, bestUci, eco, name, pv, nexts] = dataset[key(['e4', 'e6', 'd4', 'd5', 'exd5', 'exd5'])];
    expect([bestSan, bestUci, pv, nexts]).toEqual(['', '', [], []]);
    expect([eco, name]).toEqual(['C01', 'French Defense: Exchange, Other']);
  });

  it('shares one entry between transpositions, first line in file order naming it', () => {
    // 1.Nf3 e6 2.e4 reaches the same position as 1.e4 e6 2.Nf3 (not a line here), a different one from 1.e4 e6
    const reti = dataset[key(['Nf3', 'e6', 'e4'])];
    expect(reti.slice(2, 4)).toEqual(['C00', 'French Defense: Reti']);
  });

  it('records UCI moves with promotions and the starting position', () => {
    const promo = buildOpeningsDataset([
      { eco: 'X00', name: 'Test', pgn: '1. e4 d5 2. exd5 c6 3. dxc6 Nf6 4. cxb7 Nd5 5. bxa8=Q' },
    ]);
    const before = promo[key(['e4', 'd5', 'exd5', 'c6', 'dxc6', 'Nf6', 'cxb7', 'Nd5'])];
    expect(before[0]).toBe('bxa8=Q');
    expect(before[1]).toBe('b7a8q');
    const start = promo['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'];
    expect(start[0]).toBe('e4');
  });
});

describe('public/openings.json', () => {
  it('is up to date with src/data/openings/*.tsv (run `bun run build:openings`)', () => {
    const root = resolve(import.meta.dirname, '..');
    const lines = ['a', 'b', 'c', 'd', 'e'].flatMap((letter) =>
      parseTsv(readFileSync(resolve(root, `src/data/openings/${letter}.tsv`), 'utf-8'))
    );
    const expected = buildOpeningsDataset(lines);
    const actual = JSON.parse(readFileSync(resolve(root, 'public/openings.json'), 'utf-8'));
    expect(Object.keys(actual)).toHaveLength(Object.keys(expected).length);
    expect(actual).toEqual(expected);
  }, 60_000);

  it('gives every named line a name on its final position', () => {
    const root = resolve(import.meta.dirname, '..');
    const actual = JSON.parse(readFileSync(resolve(root, 'public/openings.json'), 'utf-8'));
    const named = Object.values(actual as Record<string, string[]>).filter((entry) => entry[3]);
    expect(named.length).toBeGreaterThan(3000);
  });
});
