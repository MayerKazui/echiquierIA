import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Chess } from 'chess.js';
import { StockfishService, type EngineEvaluation, type GameAnalysisOutput } from '../../src/services/stockfishEngine';

/**
 * The reference games of the calibration: public chess.com games whose accuracy chess.com published (its "Game
 * Review"), with what our engine said about each position. Keeping the evaluations makes the check instant and exact:
 * the regression test replays them through the app's own analysis (opening book, classification, accuracy) without
 * running Stockfish, so any change to the formulas shows up as a change of the gap with chess.com.
 */

export const REFERENCE_FILE = resolve(import.meta.dirname, 'reference.json');

/**
 * One position of a game as the engine reported it: centipawns (White's view), mate, best move (UCI and English SAN),
 * and the second choice (centipawns, mate, UCI) when there is one.
 */
export type RecordedEvaluation = [
  cp: number,
  mate: number | null,
  bestUci: string,
  bestSan: string,
  second: [cp: number, mate: number | null, uci: string] | null,
];

export interface ReferenceGame {
  /** The game on chess.com, where its accuracy comes from. */
  url: string;
  timeClass: string;
  whiteElo: number;
  blackElo: number;
  /** The accuracy chess.com published for each side (0-100). */
  accuracies: { white: number; black: number };
  /** The moves, in English SAN, without headers or comments. */
  pgn: string;
  /** One per position, the starting one first: `plies + 1` entries. Absent until the game was recorded. */
  evals?: RecordedEvaluation[];
}

export interface Reference {
  /** Search depth of the recorded evaluations. */
  depth: number;
  games: ReferenceGame[];
}

export function loadReference(file = REFERENCE_FILE): Reference {
  return JSON.parse(readFileSync(file, 'utf-8')) as Reference;
}

/** One game per line: the file stays readable in a diff and compact enough to commit. */
export function saveReference(reference: Reference, file = REFERENCE_FILE): void {
  const lines = reference.games.map((game) => `    ${JSON.stringify(game)}`);
  writeFileSync(file, `{\n  "depth": ${reference.depth},\n  "games": [\n${lines.join(',\n')}\n  ]\n}\n`);
}

/** The positions of a game: the starting one, then the one after each move. */
export function positionsOf(pgn: string): string[] {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const replay = new Chess();
  const fens = [replay.fen()];
  for (const move of chess.history({ verbose: true })) {
    replay.move(move);
    fens.push(replay.fen());
  }
  return fens;
}

/** Moves of a game as plain movetext (`1. e4 e5 2. Nf3 …`). */
export function movetextOf(pgn: string): string {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const sans = chess.history();
  return sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ');
}

function toEvaluation([cp, mate, bestUci, bestSan, second]: RecordedEvaluation): EngineEvaluation {
  return {
    cp,
    mate,
    bestMoveUci: bestUci,
    bestMoveSan: bestSan,
    pv: bestUci ? [bestUci] : [],
    ...(second && { second: { cp: second[0], mate: second[1], moveUci: second[2] } }),
  };
}

export function toRecorded({ cp, mate, bestMoveUci, bestMoveSan, second }: EngineEvaluation): RecordedEvaluation {
  return [cp, mate, bestMoveUci, bestMoveSan, second ? [second.cp, second.mate, second.moveUci] : null];
}

/** The service with the engine replaced by the recorded evaluations: everything else is the app's own code. */
class RecordedService extends StockfishService {
  constructor(private readonly recorded: Map<string, EngineEvaluation>) {
    super({ workerCount: 0 });
  }

  override async evaluatePosition(fen: string): Promise<EngineEvaluation> {
    const evaluation = this.recorded.get(fen);
    if (!evaluation) throw new Error(`No recorded evaluation for ${fen}`);
    return evaluation;
  }
}

export interface PlayerResult {
  game: string;
  color: 'w' | 'b';
  elo: number;
  timeClass: string;
  plies: number;
  /** The accuracy the app computes. */
  ours: number;
  /** The accuracy chess.com published. */
  theirs: number;
}

/** The app's analysis of a recorded game: moves, classifications and statistics, without running the engine. */
export function analyseRecorded(game: ReferenceGame): Promise<GameAnalysisOutput> {
  if (!game.evals) throw new Error(`${game.url} has no recorded evaluations`);
  const fens = positionsOf(game.pgn);
  if (game.evals.length !== fens.length) {
    throw new Error(`${game.url}: ${game.evals.length} evaluations for ${fens.length} positions`);
  }
  const recorded = new Map(fens.map((fen, i) => [fen, toEvaluation(game.evals![i])]));
  return new RecordedService(recorded).analyzeFullGame(game.pgn, 0);
}

/** Runs the app's analysis of a recorded game and compares the accuracy of both players with chess.com's. */
export async function resultsOf(game: ReferenceGame): Promise<PlayerResult[]> {
  const analysis = await analyseRecorded(game);
  const base = { game: game.url, timeClass: game.timeClass, plies: analysis.moves.length };
  return [
    { ...base, color: 'w', elo: game.whiteElo, ours: analysis.statsWhite.accuracy, theirs: game.accuracies.white },
    { ...base, color: 'b', elo: game.blackElo, ours: analysis.statsBlack.accuracy, theirs: game.accuracies.black },
  ];
}

/** The Elo bands the gap is reported by (the beginners are the hard case). */
export const ELO_BANDS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: '< 700', min: 0, max: 700 },
  { label: '700-1100', min: 700, max: 1100 },
  { label: '1100-1500', min: 1100, max: 1500 },
  { label: '1500-1900', min: 1500, max: 1900 },
  { label: '1900-2300', min: 1900, max: 2300 },
  { label: '> 2300', min: 2300, max: Infinity },
];

export interface Gap {
  players: number;
  /** Mean absolute difference with chess.com, in accuracy points. */
  meanAbsolute: number;
  /** Mean signed difference (ours - theirs): positive when we are more generous. */
  bias: number;
}

export function gapOf(results: PlayerResult[]): Gap {
  const diffs = results.map((r) => r.ours - r.theirs);
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  return {
    players: results.length,
    meanAbsolute: results.length ? sum(diffs.map(Math.abs)) / results.length : 0,
    bias: results.length ? sum(diffs) / results.length : 0,
  };
}

export function gapsByBand(results: PlayerResult[]): Array<{ label: string } & Gap> {
  return ELO_BANDS.map(({ label, min, max }) => ({
    label,
    ...gapOf(results.filter((r) => r.elo >= min && r.elo < max)),
  })).filter((band) => band.players > 0);
}
