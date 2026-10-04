/**
 * Calibration of the accuracy against chess.com. The reference games (`scripts/calibration/reference.json`) are public
 * chess.com games with the accuracy chess.com published for each side, and the evaluation of every position by our
 * engine. Usage:
 *
 *   bun run calibrate                       gap with chess.com, from the recorded evaluations (instant, no engine)
 *   bun run calibrate fetch [perBand]      adds reference games from chess.com (default: 12 per Elo band)
 *   bun run calibrate results              adds the result of the games that lack it (the thresholds use it)
 *   bun run calibrate record [--depth N] [--all]
 *                                           evaluates the games that have no evaluations (all of them with --all) with
 *                                           Stockfish, at depth N (default 12, the app's default)
 *
 * After a change to the engine settings, `record --all` refreshes the evaluations; after a change to the accuracy
 * formulas, the plain report shows what it did to the gap.
 */
import { performance } from 'node:perf_hooks';
import { ensureOpeningBookLoaded } from '../src/services/openingBook';
import { loadOpeningsFromDisk } from '../src/test/openings';
import { fetchReferenceGames, fetchResult } from './calibration/chesscom';
import { createNodeStockfishService } from './calibration/nodeEngine';
import {
  gapOf,
  gapsByBand,
  loadReference,
  positionsOf,
  resultsOf,
  saveReference,
  toRecorded,
  type PlayerResult,
  type Reference,
} from './calibration/reference';

const DEFAULT_DEPTH = 12;
const PER_BAND = 12;

const format = (value: number) => value.toFixed(1).padStart(5);

async function report(reference: Reference): Promise<void> {
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
  const results: PlayerResult[] = [];
  for (const game of reference.games.filter((g) => g.evals)) results.push(...(await resultsOf(game)));
  if (results.length === 0) {
    console.log('No recorded game: run `bun run calibrate fetch` then `bun run calibrate record`.');
    return;
  }
  const { players, meanAbsolute, bias } = gapOf(results);
  console.log(`Gap with chess.com at depth ${reference.depth}: ${meanAbsolute.toFixed(2)} points on average`);
  console.log(`  ${players} players in ${results.length / 2} games, bias ${bias >= 0 ? '+' : ''}${bias.toFixed(2)}`);
  console.log('\nBy Elo band:');
  for (const band of gapsByBand(results)) {
    console.log(
      `  ${band.label.padEnd(10)} ${String(band.players).padStart(3)} players  gap ${format(band.meanAbsolute)}  bias ${format(band.bias)}`
    );
  }
  console.log('\nBy time control:');
  for (const timeClass of [...new Set(results.map((r) => r.timeClass))].sort()) {
    const gap = gapOf(results.filter((r) => r.timeClass === timeClass));
    console.log(
      `  ${timeClass.padEnd(10)} ${String(gap.players).padStart(3)} players  gap ${format(gap.meanAbsolute)}  bias ${format(gap.bias)}`
    );
  }
  const worst = [...results].sort((a, b) => Math.abs(b.ours - b.theirs) - Math.abs(a.ours - a.theirs)).slice(0, 5);
  console.log('\nLargest gaps:');
  for (const r of worst) {
    console.log(
      `  ${r.game}  ${r.color === 'w' ? 'White' : 'Black'} ${r.elo} Elo  ours ${format(r.ours)}  chess.com ${format(r.theirs)}`
    );
  }
}

async function fetchGames(reference: Reference, perBand: number): Promise<void> {
  const known = new Set(reference.games.map((g) => g.url));
  const added = await fetchReferenceGames({ perBand, known, log: console.log });
  reference.games.push(...added);
  saveReference(reference);
  console.log(`${added.length} games added (${reference.games.length} in the file): now \`bun run calibrate record\`.`);
}

async function fillResults(reference: Reference): Promise<void> {
  const todo = reference.games.filter((game) => !game.result);
  let found = 0;
  for (const game of todo) {
    const result = await fetchResult(game.url);
    if (result) {
      game.result = result;
      found++;
    }
  }
  saveReference(reference);
  console.log(
    `${found} results added, ${todo.length - found} not found (${reference.games.length} games in the file).`
  );
}

async function record(reference: Reference, depth: number, all: boolean): Promise<void> {
  const todo = reference.games.filter((game) => all || !game.evals || reference.depth !== depth);
  if (todo.length === 0) {
    console.log('Every game is already recorded.');
    return;
  }
  // The recorded depth is one for the whole file: a different depth means every game is evaluated again
  const redoAll = all || reference.depth !== depth;
  const games = redoAll ? reference.games : todo;
  reference.depth = depth;
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
  const service = createNodeStockfishService();
  const started = performance.now();
  try {
    for (const [index, game] of games.entries()) {
      const fens = positionsOf(game.pgn);
      game.evals = (await Promise.all(fens.map((fen) => service.evaluatePosition(fen, depth)))).map(toRecorded);
      saveReference(reference); // a long run keeps what it did if it is stopped
      console.log(`${index + 1}/${games.length} ${game.url} (${fens.length - 1} plies)`);
    }
  } finally {
    service.destroy();
  }
  console.log(`Done in ${Math.round((performance.now() - started) / 1000)} s.`);
}

const [command = 'report', ...args] = process.argv.slice(2);
const reference = loadReference();
const option = (name: string) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

if (command === 'report') await report(reference);
else if (command === 'fetch') await fetchGames(reference, Number(args[0]) || PER_BAND);
else if (command === 'results') await fillResults(reference);
else if (command === 'record')
  await record(reference, Number(option('--depth')) || DEFAULT_DEPTH, args.includes('--all'));
else {
  console.error(`Unknown command "${command}": report, fetch, results or record.`);
  process.exitCode = 1;
}
