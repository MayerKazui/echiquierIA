/**
 * Regenerates public/puzzles/ from the Lichess puzzle database (CC0, https://database.lichess.org/#puzzles).
 * Usage: bun run build:puzzles [-- [file] [--target 200000] [--per-cell 3000]]
 *
 * `file` is `lichess_db_puzzle.csv.zst` or the decompressed `.csv`; without it the database (about 300 MB) is
 * downloaded from Lichess (and held in memory). Needs Node 22.15 or later for the Zstandard decompression.
 * The result is committed: the app does not need the script to run, and a new selection is not made often (each
 * one adds several MB to the history of the repository).
 */
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { zstdDecompressSync } from 'node:zlib';
import { PuzzleSelector, buildDataset, meetsQuality, parsePuzzleLine } from './puzzlesDataset';

const SOURCE = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';

function option(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  const value = at >= 0 ? Number(process.argv[at + 1]) : fallback;
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
  return value;
}

const target = option('target', 200_000);
const perCell = option('per-cell', 3000);
const file = process.argv.slice(2).find((arg, i, args) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'));

/** `zstdDecompressSync` with `info: true`, which the types of Node 22 do not describe. */
const decodeFrame = zstdDecompressSync as unknown as (
  data: Buffer,
  options: { info: true }
) => { buffer: Buffer; engine: { bytesWritten: number } };

/**
 * The lines of a Zstandard file. The Lichess one is made of many frames (and starts with a skippable one, a comment),
 * and Node's decoder stops after the first frame it decodes: it is called again on what is left, `bytesWritten`
 * telling how much of the input a frame took.
 */
function* zstdLines(data: Buffer): Generator<string> {
  let position = 0;
  let carry = '';
  while (position < data.length) {
    const rest = data.subarray(position);
    // A skippable frame: magic 0x184D2A50..5F, then its size (4 bytes, little-endian), then its content
    if (rest.length >= 8 && (rest.readUInt32LE(0) & 0xfffffff0) >>> 0 === 0x184d2a50) {
      position += 8 + rest.readUInt32LE(4);
      continue;
    }
    const { buffer, engine } = decodeFrame(rest, { info: true });
    position += engine.bytesWritten;
    const parts = (carry + buffer.toString('utf-8')).split('\n');
    carry = parts.pop() ?? '';
    yield* parts;
  }
  if (carry) yield carry;
}

async function* open(): AsyncGenerator<string> {
  if (file && !file.endsWith('.zst')) {
    yield* createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    return;
  }
  if (file) {
    yield* zstdLines(await readFile(file));
    return;
  }
  console.log(`Downloading ${SOURCE}`);
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  yield* zstdLines(Buffer.from(await response.arrayBuffer()));
}

const selector = new PuzzleSelector(perCell);
let read = 0;
let kept = 0;
for await (const line of open()) {
  const puzzle = parsePuzzleLine(line);
  if (!puzzle) continue;
  read++;
  if (!meetsQuality(puzzle)) continue;
  kept++;
  selector.add(puzzle);
  if (read % 1_000_000 === 0) console.log(`${read} puzzles read`);
}

const selection = selector.select(target);
if (selection.length < target)
  console.warn(`Only ${selection.length} puzzles for a target of ${target}: raise --per-cell`);
const { index, shards } = buildDataset(selection);

const directory = resolve(import.meta.dirname, '../public/puzzles');
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, 'index.json'), JSON.stringify(index));
for (const shard of shards) {
  const path = resolve(directory, `${shard.band}.json`);
  await writeFile(path, JSON.stringify(shard));
  console.log(`${shard.band}: ${shard.puzzles.length} puzzles, ${((await stat(path)).size / 1e6).toFixed(2)} MB`);
}
console.log(`${read} read, ${kept} good enough, ${index.total} kept in ${shards.length} shards`);
