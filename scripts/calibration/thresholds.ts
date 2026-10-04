import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Chess } from 'chess.js';
import { normalizeFen } from '../../src/services/openingBook';
import { moveAccuracy, accuracyFromMoves } from '../../src/utils/moveAnalysis';
import { phaseOfPosition } from '../../src/utils/gamePhase';
import { winPercentFor } from '../../src/utils/endgameDrill';
import { walkLine, type PositionLookup } from '../../src/utils/openingExplorer';
import { familyOf, movesAfterTheory } from '../../src/utils/openingRepertoire';
import type { PlayerSample, SampleGame } from './chesscom';
import { analyseRecorded, positionsOf, toEvaluation, type ReferenceGame } from './reference';

/**
 * Measures behind the thresholds that were first set by hand (`bun run thresholds`): each function takes the real
 * games of the calibration and answers one question about one threshold, so that the figure in the code can be
 * checked against what games show, and a test can keep it there.
 */

export const PLAYERS_FILE = resolve(import.meta.dirname, 'players.json');

export function loadPlayers(file = PLAYERS_FILE): PlayerSample[] {
  return (JSON.parse(readFileSync(file, 'utf-8')) as { players: PlayerSample[] }).players;
}

/** One player per block, one game per line: readable in a diff, compact enough to commit. */
export function savePlayers(players: readonly PlayerSample[], file = PLAYERS_FILE): void {
  const blocks = players.map(
    ({ rating, games }) =>
      `    {"rating":${rating},"games":[\n${games.map((g) => `      ${JSON.stringify(g)}`).join(',\n')}\n    ]}`
  );
  writeFileSync(file, `{\n  "players": [\n${blocks.join(',\n')}\n  ]\n}\n`);
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const mean = (values: readonly number[]) => (values.length ? sum(values) / values.length : NaN);
const deviation = (values: readonly number[]) => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
};

function correlation(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length < 3) return null;
  const [mx, my] = [mean(xs), mean(ys)];
  const covariance = sum(xs.map((x, i) => (x - mx) * (ys[i] - my)));
  const spread = Math.sqrt(sum(xs.map((x) => (x - mx) ** 2)) * sum(ys.map((y) => (y - my) ** 2)));
  return spread === 0 ? null : covariance / spread;
}

const percentile = (sorted: readonly number[], share: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];

/** The points a game gave the side with `color`: 1, ½ or 0. */
export const pointsOf = (result: SampleGame[1], color: 'w' | 'b'): number =>
  result === '1/2-1/2' ? 0.5 : (result === '1-0') === (color === 'w') ? 1 : 0;

/* ------------------------------------------------------------------------------------------------------------- */
/* ACCURACY_PLIES: the window of plies that follow the end of the book, whose accuracy rates an opening            */
/* ------------------------------------------------------------------------------------------------------------- */

/** Moves of the window under which a game says nothing about the opening. */
export const MIN_WINDOW_MOVES = 4;
/** An opening is rated from this many games (`MIN_ACCURACY_GAMES`): the noise is that of this many games together. */
const RATED_GAMES = 3;
/** Moves after the window that are needed to say how the player plays "afterwards". */
const MIN_REST_MOVES = 10;

export interface WindowRow {
  plies: number;
  /** Share of the games (one side of one game) with at least `MIN_WINDOW_MOVES` moves counted. */
  coverage: number;
  /** Mean moves counted, in the games that have enough. */
  meanMoves: number;
  /**
   * Standard error, in accuracy points, of the accuracy of an opening met `RATED_GAMES` times: how far the figure is
   * from what the player would show over many games, from the spread of the accuracy of single moves.
   */
  noise: number;
  /** Correlation of the window's accuracy with the accuracy of the rest of the game: does the window say how well the player plays? */
  correlation: number | null;
}

export async function accuracyWindows(
  games: readonly ReferenceGame[],
  windows: readonly number[]
): Promise<WindowRow[]> {
  const analysed = await Promise.all(games.map((game) => analyseRecorded(game)));
  const sides = analysed.flatMap(({ moves }) => (['w', 'b'] as const).map((color) => ({ moves, color })));
  return windows.map((plies) => {
    const enough: Array<{ window: number; rest: number | null; perMove: number[] }> = [];
    for (const { moves, color } of sides) {
      const counted = movesAfterTheory(moves, color, plies);
      if (counted.length < MIN_WINDOW_MOVES) continue;
      const end = moves.indexOf(counted.at(-1)!);
      const rest = moves.slice(end + 1).filter((m) => m.color === color && m.classification !== 'book');
      enough.push({
        window: accuracyFromMoves(counted),
        rest: rest.length >= MIN_REST_MOVES ? accuracyFromMoves(rest) : null,
        perMove: counted.map(moveAccuracy),
      });
    }
    const perMove = enough.flatMap((e) => e.perMove);
    const meanMoves = mean(enough.map((e) => e.perMove.length));
    const withRest = enough.filter((e) => e.rest !== null);
    return {
      plies,
      coverage: enough.length / sides.length,
      meanMoves,
      noise: deviation(perMove) / Math.sqrt(RATED_GAMES * meanMoves),
      correlation: correlation(
        withRest.map((e) => e.window),
        withRest.map((e) => e.rest!)
      ),
    };
  });
}

/* ------------------------------------------------------------------------------------------------------------- */
/* Endgames: PROMOTION_WIN_PERCENT (70 %) and MAX_MOVES (40)                                                       */
/* ------------------------------------------------------------------------------------------------------------- */

export interface ScoreBand {
  label: string;
  positions: number;
  /** Points the side to measure really scored, from these positions on (1 win, ½ draw, 0 loss). */
  score: number;
}

const WIN_BANDS = [50, 55, 60, 65, 70, 75, 80];

/** Every position from move 15 on of the games that have a result, with the points the better side made. */
function betterSideSamples(
  games: readonly ReferenceGame[],
  endgameOnly: boolean
): Array<{ win: number; points: number }> {
  const samples: Array<{ win: number; points: number }> = [];
  for (const game of games) {
    if (!game.evals || !game.result) continue;
    positionsOf(game.pgn).forEach((fen, ply) => {
      if (ply < 30 || (endgameOnly && phaseOfPosition(fen) !== 'endgame')) return;
      const white = winPercentFor(toEvaluation(game.evals![ply]), 'w');
      const color = white >= 50 ? 'w' : 'b';
      samples.push({ win: color === 'w' ? white : 100 - white, points: pointsOf(game.result!, color) });
    });
  }
  return samples;
}

/**
 * What a win % is worth in real games: for each band of the engine's win % (the endgame drill's own measure, from the
 * point of view of the side that is better), the points that side really made. Positions of every game are counted,
 * from move 15 on (the book has no say after) and only in endgames when `endgameOnly`. The positions of one game are
 * not independent: the figures show a trend, not a margin of error.
 */
export function scoreByWinPercent(games: readonly ReferenceGame[], endgameOnly: boolean): ScoreBand[] {
  const samples = betterSideSamples(games, endgameOnly);
  return WIN_BANDS.slice(0, -1).map((from, i) => {
    const points = samples.filter((s) => s.win >= from && s.win < WIN_BANDS[i + 1]).map((s) => s.points);
    return { label: `${from}-${WIN_BANDS[i + 1]}`, positions: points.length, score: mean(points) };
  });
}

/**
 * Is `percent` where a position starts to be won? The points the better side made just under it (10 points of win %)
 * and from it up: a good limit has a clear step between the two.
 */
export function scoreAcross(
  games: readonly ReferenceGame[],
  percent: number,
  endgameOnly: boolean
): { below: ScoreBand; above: ScoreBand } {
  const samples = betterSideSamples(games, endgameOnly);
  const band = (label: string, keep: (win: number) => boolean): ScoreBand => {
    const points = samples.filter((s) => keep(s.win)).map((s) => s.points);
    return { label, positions: points.length, score: mean(points) };
  };
  return {
    below: band(`${percent - 10}-${percent}`, (win) => win >= percent - 10 && win < percent),
    above: band(`${percent}+`, (win) => win >= percent),
  };
}

export interface Conversion {
  /** Games won with an endgame in which the winner had reached the win % (the others never had one). */
  games: number;
  /** Moves of the winner from that position to the end of the game (a lower bound: many games end by resignation). */
  moves: { median: number; p75: number; p90: number; max: number };
  /** Share of those games that end within `limit` moves. */
  withinLimit: number;
}

/**
 * How long a won endgame lasts in real games: from the first endgame position in which the winner stands at `winPercent`
 * or more, up to the last move. It tells whether `limit` moves, for the exercise, ask for more than players do.
 */
export function conversionLengths(games: readonly ReferenceGame[], winPercent: number, limit: number): Conversion {
  const lengths: number[] = [];
  for (const game of games) {
    if (!game.evals || !game.result || game.result === '1/2-1/2') continue;
    const winner = game.result === '1-0' ? 'w' : 'b';
    const fens = positionsOf(game.pgn);
    const start = fens.findIndex(
      (fen, ply) =>
        phaseOfPosition(fen) === 'endgame' && winPercentFor(toEvaluation(game.evals![ply]), winner) >= winPercent
    );
    if (start >= 0) lengths.push(Math.ceil((fens.length - 1 - start) / 2));
  }
  const sorted = [...lengths].sort((a, b) => a - b);
  return {
    games: sorted.length,
    moves: {
      median: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
      max: sorted.at(-1) ?? NaN,
    },
    withinLimit: sorted.filter((moves) => moves <= limit).length / sorted.length,
  };
}

/* ------------------------------------------------------------------------------------------------------------- */
/* Opponent preparation: MIN_LINE_GAMES, MIN_FAMILY_GAMES, WEAK_SCORE, STRONG_SCORE                                */
/* ------------------------------------------------------------------------------------------------------------- */

const key = (fen: string) => normalizeFen(fen);

export interface HabitRow {
  /** The most played move at a position has been played this many times (at least) in the earlier games. */
  minGames: number;
  predictions: number;
  /** How often the next game plays that move again. */
  hitRate: number;
}

/**
 * Is a line that was played `minGames` times a habit? At every position of a game where the player is to move and an
 * earlier game went through, the most played move is the forecast; it is right or not. Moves of the player only: the
 * moves of their opponents are not theirs to repeat.
 */
export function habitReliability(players: readonly PlayerSample[], minGamesList: readonly number[]): HabitRow[] {
  const forecasts: Array<{ top: number; hit: boolean }> = [];
  for (const { games } of players) {
    const seen: Record<'w' | 'b', Map<string, Map<string, number>>> = { w: new Map(), b: new Map() };
    for (const [color, , line] of games) {
      const chess = new Chess();
      for (const [ply, san] of line.split(' ').entries()) {
        const fen = key(chess.fen());
        const own = (ply % 2 === 0) === (color === 'w');
        const played = seen[color].get(fen) ?? new Map<string, number>();
        if (own) {
          const top = [...played].sort((a, b) => b[1] - a[1])[0];
          if (top) forecasts.push({ top: top[1], hit: top[0] === san });
          played.set(san, (played.get(san) ?? 0) + 1);
          seen[color].set(fen, played);
        }
        try {
          chess.move(san);
        } catch {
          break;
        }
      }
    }
  }
  return minGamesList.map((minGames) => {
    const kept = forecasts.filter((f) => f.top >= minGames);
    return { minGames, predictions: kept.length, hitRate: kept.filter((f) => f.hit).length / kept.length };
  });
}

export interface FlagConfig {
  /** Games of the opening before it is rated. */
  minGames: number;
  weakBelow: number;
  strongFrom: number;
}

export interface FlagRow extends FlagConfig {
  weak: { games: number; score: number };
  strong: { games: number; score: number };
  /** Next-game score of the "strong" openings minus that of the "weak" ones, and its standard error. */
  gap: number;
  error: number;
}

interface FlagObservation {
  history: number;
  played: number;
  score: number;
  points: number;
}

const observed = new WeakMap<readonly PlayerSample[], FlagObservation[]>();

/**
 * The player's games, in order, each with what the earlier games of the same colour and opening family said. Kept
 * for the players it was computed for (replaying thousands of games is slow), so `lookup` must be the same each time.
 */
function observations(players: readonly PlayerSample[], lookup: PositionLookup): FlagObservation[] {
  const known = observed.get(players);
  if (known) return known;
  const found: FlagObservation[] = [];
  observed.set(players, found);
  for (const { games } of players) {
    const tallies = new Map<string, { games: number; points: number }>();
    for (const [index, [color, result, line]] of games.entries()) {
      const name = walkLine(line.split(' '), lookup).name;
      if (!name) continue;
      const tally = tallies.get(`${color}|${familyOf(name)}`) ?? { games: 0, points: 0 };
      const points = pointsOf(result, color);
      if (tally.games > 0) {
        found.push({ history: index, played: tally.games, score: tally.points / tally.games, points });
      }
      tally.games++;
      tally.points += points;
      tallies.set(`${color}|${familyOf(name)}`, tally);
    }
  }
  return found;
}

function flagRow(all: readonly FlagObservation[], config: FlagConfig): FlagRow {
  const weak = all.filter((o) => o.played >= config.minGames && o.score < config.weakBelow).map((o) => o.points);
  const strong = all.filter((o) => o.played >= config.minGames && o.score >= config.strongFrom).map((o) => o.points);
  return {
    ...config,
    weak: { games: weak.length, score: mean(weak) },
    strong: { games: strong.length, score: mean(strong) },
    gap: mean(strong) - mean(weak),
    error: Math.sqrt(deviation(weak) ** 2 / weak.length + deviation(strong) ** 2 / strong.length),
  };
}

/**
 * Do the labels "to aim for" (a weak score) and "solid" (a strong one) say anything about the next game? Each game is
 * judged on what the earlier games of that player, with that colour and that opening family, had made. `history`
 * keeps the games that have between `from` and `to` games behind them (the player's whole record, any opening).
 */
export function flagReliability(
  players: readonly PlayerSample[],
  lookup: PositionLookup,
  configs: readonly FlagConfig[],
  history: { from: number; to: number } = { from: 0, to: Infinity }
): FlagRow[] {
  const inside = observations(players, lookup).filter((o) => o.history >= history.from && o.history < history.to);
  return configs.map((config) => flagRow(inside, config));
}
