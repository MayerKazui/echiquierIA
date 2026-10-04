import type { PlayerColor } from '../types/ui';

/** A time control: what each side starts with, and what it gains after each move. */
export interface TimeControl {
  baseSeconds: number;
  incrementSeconds: number;
}

/** The base times offered, in minutes (1 to 15), and the increments, in seconds. */
export const BASE_MINUTES: readonly number[] = Array.from({ length: 15 }, (_, i) => i + 1);
export const INCREMENT_SECONDS: readonly number[] = [0, 1, 2, 3, 5, 10, 15, 30];
export const DEFAULT_BASE_MINUTES = 10;
export const DEFAULT_INCREMENT_SECONDS = 0;

export const timeControlOf = (minutes: number, incrementSeconds: number): TimeControl => ({
  baseSeconds: minutes * 60,
  incrementSeconds,
});

/** The `TimeControl` PGN tag ("300", "300+3"): what the analysis reads to class the game and to find the thinking times. */
export const timeControlTag = ({ baseSeconds, incrementSeconds }: TimeControl): string =>
  incrementSeconds > 0 ? `${baseSeconds}+${incrementSeconds}` : `${baseSeconds}`;

/** "5 min + 3 s", "10 min". */
export function timeControlLabel({ baseSeconds, incrementSeconds }: TimeControl): string {
  const base = baseSeconds % 60 === 0 ? `${baseSeconds / 60} min` : `${baseSeconds} s`;
  return incrementSeconds > 0 ? `${base} + ${incrementSeconds} s` : base;
}

/** A time control read from its PGN tag ("300+3"), as the games keep it; null when it is not one this app plays. */
export function parseTimeControlTag(tag: string | undefined): TimeControl | null {
  const match = tag?.match(/^(\d{1,5})(?:\+(\d{1,3}))?$/);
  if (!match) return null;
  const baseSeconds = Number(match[1]);
  return baseSeconds > 0 ? { baseSeconds, incrementSeconds: Number(match[2] ?? 0) } : null;
}

/**
 * The two clocks. `w` and `b` are what each side had when `since` (a time in ms) began; the side to move is the one
 * whose time is running down from then. `since` is null when nothing runs (the engine is unavailable).
 */
export interface ClockState {
  w: number;
  b: number;
  since: number | null;
}

export function startClock(control: TimeControl, now: number): ClockState {
  const base = control.baseSeconds * 1000;
  return { w: base, b: base, since: now };
}

/** Milliseconds left to `color`, `turn` being the side to move (the only one whose clock runs). Never below 0. */
export function remaining(clock: ClockState, color: PlayerColor, turn: PlayerColor, now: number): number {
  const spent = clock.since !== null && color === turn ? now - clock.since : 0;
  return Math.max(0, clock[color] - spent);
}

/** `mover` has just played: their time is charged, the increment is added, and the other side's clock starts. */
export function afterMove(clock: ClockState, mover: PlayerColor, now: number, control: TimeControl): ClockState {
  const left = remaining(clock, mover, mover, now) + control.incrementSeconds * 1000;
  return { ...clock, [mover]: left, since: now };
}

/** Stops the clock of `turn`, charging what it has run. */
export function pauseClock(clock: ClockState, turn: PlayerColor, now: number): ClockState {
  return { ...clock, [turn]: remaining(clock, turn, turn, now), since: null };
}

export const resumeClock = (clock: ClockState, now: number): ClockState => ({ ...clock, since: now });

/**
 * How long the engine may think: the time of its level, but never more than a share of what is left on its clock
 * (a twenty-fifth, with half the increment), and never nothing.
 */
export function engineMoveTime(levelMs: number, leftMs: number, control: TimeControl): number {
  const share = leftMs / 25 + (control.incrementSeconds * 1000) / 2;
  return Math.round(Math.max(40, Math.min(levelMs, share)));
}

/** "4:32", and with tenths under twenty seconds ("0:09.4"), when every second counts. */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 20_000) {
    const tenths = Math.floor(clamped / 100);
    return `0:${String(Math.floor(tenths / 10)).padStart(2, '0')}.${tenths % 10}`;
  }
  const seconds = Math.ceil(clamped / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** The `[%clk h:mm:ss]` comment of a move, from the time left after it (ms): what the analysis reads. */
export function clockComment(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `[%clk ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
}
