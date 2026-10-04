import { Chess } from 'chess.js';
import type { PlayerColor } from '../types/ui';
import { gamePgn, playMoves, resultTag, type PlayedMove, type PlayOutcome, type DrawReason } from './playGame';
import { parseTimeControlTag, timeControlLabel, timeControlTag, type TimeControl } from './playClock';
import { gameId } from '../services/gameStore';

/**
 * A finished game against the engine, as "Mes parties" keeps it (see `playedGameStore`). It is not an analysis: the
 * moves are kept as played, and the game is analysed when the player asks (the analysed game then has the same id,
 * and carries this record's label).
 */
export interface PlayedGame {
  /** `gameId` of `pgn`: also the id of the analysed game, when it is analysed. */
  id: string;
  /** The game as a PGN. `analysable`: the analysis can read it; else it begins on a position of its own (FEN header). */
  pgn: string;
  analysable: boolean;
  /** The moves as played (English SAN), from the start position. */
  sans: string[];
  startFen: string;
  /** Where the game started from: "Partie complète", "Position de l'étude"… */
  label: string;
  color: PlayerColor;
  levelId: string;
  /** The level as the player saw it ("Club"): kept as written, the levels may change. */
  levelLabel: string;
  elo: number | null;
  userName: string;
  result: '1-0' | '0-1' | '1/2-1/2';
  /** How it ended. */
  ending: 'checkmate' | 'resigned' | 'timeout' | DrawReason;
  /** Hints and evaluations the player asked for during the game. */
  hints: number;
  evals: number;
  /** The `TimeControl` tag ("300+3") when the game had a clock. */
  timeControl?: string;
  /** Milliseconds since the epoch. */
  finishedAt: number;
  /** The last change here: the most recent copy wins when two are merged (see `playedGameStore`). */
  updatedAt: number;
}

/** What is left of a game the player deleted: it lets the deletion reach the other devices of a synced history. */
export interface PlayedTombstone {
  id: string;
  deleted: true;
  updatedAt: number;
}

export type PlayedRecord = PlayedGame | PlayedTombstone;

export const isTombstone = (record: PlayedRecord): record is PlayedTombstone => 'deleted' in record;

const ENDINGS = new Set(['checkmate', 'resigned', 'timeout', 'stalemate', 'material', 'repetition', 'fifty']);
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);
/** A game longer than this is not one the app wrote. */
const MAX_MOVES = 1000;
const MAX_TEXT = 4000;

const isText = (value: unknown, max = MAX_TEXT): value is string => typeof value === 'string' && value.length <= max;
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 100_000;
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function isPlayedTombstone(value: unknown): value is PlayedTombstone {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && record.id !== '' && record.deleted === true && isTime(record.updatedAt);
}

/** Cheap structural check: the data can come from another version of the app or be damaged. */
export function isPlayedGame(value: unknown): value is PlayedGame {
  if (typeof value !== 'object' || value === null) return false;
  const game = value as Record<string, unknown>;
  return (
    typeof game.id === 'string' &&
    game.id !== '' &&
    isText(game.pgn, 100_000) &&
    typeof game.analysable === 'boolean' &&
    Array.isArray(game.sans) &&
    game.sans.length <= MAX_MOVES &&
    game.sans.every((san) => isText(san, 12)) &&
    isText(game.startFen, 200) &&
    isText(game.label, 200) &&
    (game.color === 'w' || game.color === 'b') &&
    isText(game.levelId, 50) &&
    isText(game.levelLabel, 50) &&
    (game.elo === null || isCount(game.elo)) &&
    isText(game.userName, 200) &&
    typeof game.result === 'string' &&
    RESULTS.has(game.result) &&
    typeof game.ending === 'string' &&
    ENDINGS.has(game.ending) &&
    isCount(game.hints) &&
    isCount(game.evals) &&
    (game.timeControl === undefined || isText(game.timeControl, 20)) &&
    isTime(game.finishedAt) &&
    isTime(game.updatedAt)
  );
}

export const isPlayedRecord = (value: unknown): value is PlayedRecord =>
  isPlayedGame(value) || isPlayedTombstone(value);

/** The name written in the PGN for the engine. */
export const engineName = (levelLabel: string): string => `Stockfish (${levelLabel})`;

export interface FinishedGame {
  startFen: string;
  prefix?: readonly string[];
  label: string;
  moves: readonly PlayedMove[];
  outcome: PlayOutcome;
  color: PlayerColor;
  level: { id: string; label: string; elo: number | null };
  userName: string;
  hints: number;
  evals: number;
  /** The clock of the game: its control, and the time left (ms) to the mover after each move. */
  timeControl?: TimeControl | null;
  clocks?: readonly number[];
  now: number;
}

/** A game with its position of its own, as a PGN with `SetUp` and `FEN` headers (what chess.js writes). */
function pgnFromPosition(game: FinishedGame, white: string, black: string): string {
  const chess = new Chess(game.startFen);
  playMoves(chess, game.moves, game.clocks);
  chess.setHeader('White', white);
  chess.setHeader('Black', black);
  chess.setHeader('Result', resultTag(game.outcome));
  if (game.timeControl) chess.setHeader('TimeControl', timeControlTag(game.timeControl));
  return chess.pgn();
}

/** The record of a game that has just ended. */
export function makePlayedGame(game: FinishedGame): PlayedGame {
  const name = game.userName.trim() || 'Moi';
  const engine = engineName(game.level.label);
  const white = game.color === 'w' ? name : engine;
  const black = game.color === 'b' ? name : engine;
  const analysablePgn = gamePgn({
    startFen: game.startFen,
    prefix: game.prefix,
    moves: game.moves,
    outcome: game.outcome,
    white,
    black,
    timeControl: game.timeControl,
    clocks: game.clocks,
  });
  const pgn = analysablePgn ?? pgnFromPosition(game, white, black);
  const result = resultTag(game.outcome) as PlayedGame['result'];
  return {
    id: gameId(pgn),
    pgn,
    analysable: analysablePgn !== null,
    sans: game.moves.map((move) => move.san),
    startFen: game.startFen,
    label: game.label,
    color: game.color,
    levelId: game.level.id,
    levelLabel: game.level.label,
    elo: game.level.elo,
    userName: name,
    result,
    ending: game.outcome.kind === 'draw' ? game.outcome.reason : game.outcome.kind,
    hints: game.hints,
    evals: game.evals,
    ...(game.timeControl ? { timeControl: timeControlTag(game.timeControl) } : {}),
    finishedAt: game.now,
    updatedAt: game.now,
  };
}

/** The result from the player's side. */
export function playedOutcome(game: Pick<PlayedGame, 'result' | 'color'>): 'win' | 'draw' | 'loss' {
  if (game.result === '1/2-1/2') return 'draw';
  return (game.result === '1-0') === (game.color === 'w') ? 'win' : 'loss';
}

/** "Contre Stockfish · Club": the label the game carries in the history. */
export const playedLabel = (game: Pick<PlayedGame, 'levelLabel'>): string => `Contre Stockfish · ${game.levelLabel}`;

/** "avec 2 indices et 1 évaluation", or an empty text when the player asked for nothing. */
export function helpText(game: Pick<PlayedGame, 'hints' | 'evals'>): string {
  const parts = [
    game.hints > 0 ? `${game.hints} indice${game.hints > 1 ? 's' : ''}` : '',
    game.evals > 0 ? `${game.evals} évaluation${game.evals > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  return parts.length === 0 ? '' : `avec ${parts.join(' et ')}`;
}

/** "pendule 5 min + 3 s", from the `TimeControl` tag a game keeps. */
export function timeControlText(tag: string): string {
  const control = parseTimeControlTag(tag);
  return `pendule ${control ? timeControlLabel(control) : tag}`;
}
