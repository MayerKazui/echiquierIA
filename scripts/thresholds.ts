/**
 * Checks the thresholds that were set by hand against real games (see `scripts/calibration/thresholds.ts`). Usage:
 *
 *   bun run thresholds                     every report below, from the games kept in the repository (no engine, no network)
 *   bun run thresholds accuracy            ACCURACY_PLIES: the window of the accuracy by opening
 *   bun run thresholds endgames            PROMOTION_WIN_PERCENT and MAX_MOVES of the endgame drill
 *   bun run thresholds prep                MIN_LINE_GAMES, MIN_FAMILY_GAMES, WEAK_SCORE and STRONG_SCORE of the opponent preparation
 *   bun run thresholds fetch [players] [--min-rating N] [--titled] [--replace]
 *                                          draws players on chess.com and adds their last 150 games to the file (default: 12 players)
 *   bun run thresholds engine              depth the engine reaches in the thinking time of each level (depends on this machine)
 *
 * The reference games are the ones of `bun run calibrate` (`bun run calibrate results` adds their results).
 */
import { spawn } from 'node:child_process';
import { Chess } from 'chess.js';
import { ensureOpeningBookLoaded, getOpeningPosition } from '../src/services/openingBook';
import { PLAY_LEVELS, levelCommands } from '../src/utils/playLevels';
import { MAX_MOVES, PROMOTION_WIN_PERCENT } from '../src/utils/endgameDrill';
import { MIN_FAMILY_GAMES, MIN_LINE_GAMES, STRONG_SCORE, WEAK_SCORE } from '../src/utils/opponentPrep';
import { ACCURACY_PLIES } from '../src/utils/openingRepertoire';
import { loadOpeningsFromDisk } from '../src/test/openings';
import { fetchPlayerSamples } from './calibration/chesscom';
import { ENGINE_FILE } from './calibration/nodeEngine';
import { loadReference, positionsOf } from './calibration/reference';
import {
  accuracyWindows,
  conversionLengths,
  flagReliability,
  habitReliability,
  loadPlayers,
  savePlayers,
  scoreAcross,
  scoreByWinPercent,
} from './calibration/thresholds';

const pct = (value: number) => `${(value * 100).toFixed(0)} %`.padStart(5);
const fixed = (value: number | null, digits = 2) => (value === null ? '  -  ' : value.toFixed(digits).padStart(5));

async function accuracy(): Promise<void> {
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
  const { games } = loadReference();
  console.log(`ACCURACY_PLIES = ${ACCURACY_PLIES}, on ${games.length} reference games\n`);
  console.log('window   covered  moves  noise (3 games)  link with the rest of the game');
  for (const row of await accuracyWindows(games, [6, 10, 14, 20, 30, 40, 60])) {
    const mark = row.plies === ACCURACY_PLIES ? '  <- today' : '';
    console.log(
      `${String(row.plies).padStart(4)}    ${pct(row.coverage)}   ${fixed(row.meanMoves, 1)}   ${fixed(row.noise, 1)} points       ${fixed(row.correlation)}${mark}`
    );
  }
}

function endgames(): void {
  const { games } = loadReference();
  const decided = games.filter((g) => g.result);
  console.log(
    `PROMOTION_WIN_PERCENT = ${PROMOTION_WIN_PERCENT}, MAX_MOVES = ${MAX_MOVES}, on ${decided.length} games with a result\n`
  );
  for (const [title, endgameOnly] of [
    ['Points the better side really made, all positions from move 15 on', false],
    ['... in endgames only (6 pieces or fewer)', true],
  ] as const) {
    console.log(title);
    for (const band of scoreByWinPercent(decided, endgameOnly)) {
      console.log(
        `  win % ${band.label.padEnd(7)} ${String(band.positions).padStart(5)} positions  ${band.positions ? pct(band.score) : '    -'} of the points`
      );
    }
  }
  const across = scoreAcross(decided, PROMOTION_WIN_PERCENT, true);
  console.log(
    `\nStep at ${PROMOTION_WIN_PERCENT} % (endgames): ${pct(across.below.score)} of the points from ${across.below.label} (${across.below.positions} positions), ${pct(across.above.score)} from ${across.above.label} (${across.above.positions})`
  );
  const conversion = conversionLengths(decided, PROMOTION_WIN_PERCENT, MAX_MOVES);
  console.log(`\nWon games with an endgame at ${PROMOTION_WIN_PERCENT} % or more: ${conversion.games}`);
  console.log(
    `  moves from there to the end: median ${conversion.moves.median}, 75 % within ${conversion.moves.p75}, 90 % within ${conversion.moves.p90}, longest ${conversion.moves.max}`
  );
  console.log(`  within ${MAX_MOVES} moves: ${pct(conversion.withinLimit)}`);
}

async function prep(): Promise<void> {
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
  const players = loadPlayers();
  const games = players.reduce((n, p) => n + p.games.length, 0);
  console.log(
    `MIN_LINE_GAMES = ${MIN_LINE_GAMES}, MIN_FAMILY_GAMES = ${MIN_FAMILY_GAMES}, WEAK_SCORE = ${WEAK_SCORE}, STRONG_SCORE = ${STRONG_SCORE}`
  );
  console.log(
    `on ${players.length} players, ${games} games (ratings ${players
      .map((p) => p.rating)
      .sort((a, b) => a - b)
      .join(', ')})\n`
  );

  console.log('A move played n times at a position: how often the player plays it again');
  for (const row of habitReliability(players, [1, 2, 3, 4, 5, 8])) {
    console.log(`  n >= ${row.minGames}  ${String(row.predictions).padStart(6)} forecasts  ${pct(row.hitRate)} right`);
  }

  const next = (row: {
    weak: { games: number; score: number };
    strong: { games: number; score: number };
    gap: number;
    error: number;
  }) =>
    `weak ${String(row.weak.games).padStart(4)} games -> ${pct(row.weak.score)}   strong ${String(row.strong.games).padStart(4)} games -> ${pct(row.strong.score)}   gap ${fixed(row.gap * 100, 0)} points +/- ${fixed(row.error * 100, 0)}`;
  console.log('\nPoints of the next game in an opening rated weak / strong by the earlier ones');
  console.log('By games needed before an opening is rated:');
  for (const minGames of [2, 3, 4, 5, 6, 8]) {
    const [row] = flagReliability(players, getOpeningPosition, [
      { minGames, weakBelow: WEAK_SCORE, strongFrom: STRONG_SCORE },
    ]);
    console.log(`  ${minGames} games   ${next(row)}${minGames === MIN_FAMILY_GAMES ? '  <- today' : ''}`);
  }
  console.log(`By limits of the score (${MIN_FAMILY_GAMES} games needed):`);
  for (const [weakBelow, strongFrom] of [
    [0.3, 0.7],
    [0.35, 0.65],
    [0.4, 0.6],
    [0.45, 0.55],
  ] as const) {
    const [row] = flagReliability(players, getOpeningPosition, [{ minGames: MIN_FAMILY_GAMES, weakBelow, strongFrom }]);
    console.log(`  < ${weakBelow} / >= ${strongFrom}   ${next(row)}${weakBelow === WEAK_SCORE ? '  <- today' : ''}`);
  }
  console.log('By games of the player behind the rating (the app warns under 20):');
  for (const [from, to] of [
    [0, 20],
    [20, 50],
    [50, 100],
    [100, Infinity],
  ] as const) {
    const [row] = flagReliability(
      players,
      getOpeningPosition,
      [{ minGames: MIN_FAMILY_GAMES, weakBelow: WEAK_SCORE, strongFrom: STRONG_SCORE }],
      { from, to }
    );
    console.log(`  ${String(from).padStart(3)}-${to === Infinity ? '...' : String(to).padEnd(3)}   ${next(row)}`);
  }
}

async function fetchPlayers(count: number, minRating: number, titled: boolean, replace: boolean): Promise<void> {
  const drawn = await fetchPlayerSamples({ players: count, perPlayer: 150, minRating, titled, log: console.log });
  const players = replace ? drawn : [...loadPlayers(), ...drawn];
  savePlayers(players);
  console.log(`${drawn.length} players added, ${players.length} in the file: now \`bun run thresholds prep\`.`);
}

/** The depth reached in each level's thinking time, from a few positions of the reference games. */
async function engine(): Promise<void> {
  const { games } = loadReference();
  const fens = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => {
    const positions = positionsOf(games[i * 15].pgn);
    return [20, 40, 60].map((ply) => positions[ply]).filter((fen) => fen && !new Chess(fen).isGameOver());
  });
  console.log(`Depth reached by the engine of this machine in each level's time (${fens.length} positions)\n`);
  console.log('level       time     depth: lowest  median');
  for (const level of PLAY_LEVELS) {
    const depths: number[] = [];
    for (const fen of fens) depths.push(await depthIn(fen, level));
    depths.sort((a, b) => a - b);
    console.log(
      `${level.label.padEnd(10)} ${String(level.moveTimeMs).padStart(5)} ms          ${String(depths[0]).padStart(4)}  ${String(depths[depths.length >> 1]).padStart(6)}`
    );
  }
}

function depthIn(fen: string, level: (typeof PLAY_LEVELS)[number]): Promise<number> {
  return new Promise((done, fail) => {
    const process = spawn(globalThis.process.execPath, [ENGINE_FILE], { stdio: ['pipe', 'pipe', 'inherit'] });
    let depth = 0;
    let buffer = '';
    process.stdout.setEncoding('utf-8');
    process.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const match = /^info depth (\d+) .* score/.exec(line);
        if (match) depth = Math.max(depth, Number(match[1]));
        if (line.startsWith('bestmove')) {
          process.kill();
          done(depth);
        }
      }
    });
    process.on('error', fail);
    for (const command of [
      'uci',
      ...levelCommands(level),
      'isready',
      `position fen ${fen}`,
      `go movetime ${level.moveTimeMs}`,
    ]) {
      process.stdin.write(`${command}\n`);
    }
  });
}

const [command = 'all', ...args] = globalThis.process.argv.slice(2);
const reports = ['accuracy', 'endgames', 'prep'];
if (command !== 'all' && !reports.includes(command) && command !== 'fetch' && command !== 'engine') {
  console.error(`Unknown command "${command}": accuracy, endgames, prep, fetch or engine.`);
  globalThis.process.exitCode = 1;
} else if (command === 'fetch') {
  const option = args.indexOf('--min-rating');
  const minRating = option === -1 ? 0 : Number(args[option + 1]) || 0;
  await fetchPlayers(Number(args[0]) || 12, minRating, args.includes('--titled'), args.includes('--replace'));
} else if (command === 'engine') {
  await engine();
} else {
  for (const [index, report] of (command === 'all' ? reports : [command]).entries()) {
    if (index > 0) console.log('');
    if (report === 'accuracy') await accuracy();
    else if (report === 'endgames') endgames();
    else await prep();
  }
}
