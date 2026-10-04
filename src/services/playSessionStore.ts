import type { PlayerColor } from '../types/ui';
import { replay } from '../utils/playGame';

/**
 * The game against the engine that is going on, kept in localStorage after every move: closing the window (or the
 * browser) does not lose it, and "Jouer contre Stockfish" offers to carry on. One game at a time; it is not part of
 * the backups (it is a game in progress on this device, not a record). Best effort: when storage is unavailable
 * nothing is kept and nothing throws.
 */

const KEY = 'chess_play_session';
const MAX_MOVES = 1000;

export interface PlaySession {
  startFen: string;
  /** Where the game started from: "Partie complète", "Position de l'étude"… */
  label: string;
  /** The moves (SAN) that lead to the start position from the standard start, when they are known. */
  prefix?: string[];
  color: PlayerColor;
  levelId: string;
  /** The moves played since the start position (UCI). */
  moves: string[];
  /** Hints and evaluations asked for so far. */
  hints: number;
  evals: number;
  /** The clock of the game, when it has one: its control, the time left to each side (ms) and the time after each move. */
  clock?: SessionClock;
  /** Milliseconds since the epoch. */
  startedAt: number;
  updatedAt: number;
}

export interface SessionClock {
  baseSeconds: number;
  incrementSeconds: number;
  w: number;
  b: number;
  /** The time left (ms) to the mover after each move: one per move. */
  log: number[];
}

const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 100_000;
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isDuration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400_000;

function isSessionClock(value: unknown, moveCount: number): value is SessionClock {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    isCount(c.baseSeconds) &&
    c.baseSeconds > 0 &&
    isCount(c.incrementSeconds) &&
    isDuration(c.w) &&
    isDuration(c.b) &&
    Array.isArray(c.log) &&
    c.log.length === moveCount &&
    c.log.every(isDuration)
  );
}

/** Whether the value is a game in progress the app wrote: well formed, and every move legal from its start. */
export function isPlaySession(value: unknown): value is PlaySession {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  if (
    !isText(s.startFen, 200) ||
    !isText(s.label, 200) ||
    (s.color !== 'w' && s.color !== 'b') ||
    !isText(s.levelId, 50) ||
    !Array.isArray(s.moves) ||
    s.moves.length === 0 ||
    s.moves.length > MAX_MOVES ||
    !s.moves.every((move) => isText(move, 5)) ||
    !isCount(s.hints) ||
    !isCount(s.evals) ||
    !isTime(s.startedAt) ||
    !isTime(s.updatedAt)
  ) {
    return false;
  }
  if (s.clock !== undefined && !isSessionClock(s.clock, s.moves.length)) return false;
  if (s.prefix !== undefined && (!Array.isArray(s.prefix) || !s.prefix.every((san) => isText(san, 12)))) return false;
  try {
    const state = replay(s.startFen, s.moves as string[]);
    // Every move is legal, and the game is still going on (a finished one is a record, not a game to resume)
    return state.moves.length === s.moves.length && state.outcome === null;
  } catch {
    return false;
  }
}

/** The game in progress, or null (none, damaged, or storage unavailable). */
export function loadPlaySession(): PlaySession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPlaySession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Keeps the game in progress (replacing the previous one). */
export function savePlaySession(session: PlaySession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Quota or availability: the game goes on, it just cannot be resumed
  }
}

export function clearPlaySession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: nothing was kept
  }
}
