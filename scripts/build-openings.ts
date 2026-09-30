/**
 * Regenerates public/openings.json from the lichess chess-openings TSV files in src/data/openings.
 * Usage: bun run build:openings
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOpeningsDataset, parseTsv } from './openingsDataset';

const root = resolve(import.meta.dirname, '..');
const lines = ['a', 'b', 'c', 'd', 'e'].flatMap((letter) =>
  parseTsv(readFileSync(resolve(root, `src/data/openings/${letter}.tsv`), 'utf-8'))
);

const dataset = buildOpeningsDataset(lines);
writeFileSync(resolve(root, 'public/openings.json'), JSON.stringify(dataset));
console.log(`${lines.length} lines -> ${Object.keys(dataset).length} positions`);
