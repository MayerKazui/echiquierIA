// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { STANDARD_START_FEN } from '../utils/playGame';
import {
  clearPlaySession,
  isPlaySession,
  loadPlaySession,
  savePlaySession,
  type PlaySession,
} from './playSessionStore';

const session = (over: Partial<PlaySession> = {}): PlaySession => ({
  startFen: STANDARD_START_FEN,
  label: 'Partie complète',
  prefix: [],
  color: 'w',
  levelId: 'club',
  moves: ['e2e4', 'e7e5'],
  hints: 1,
  evals: 0,
  startedAt: 1000,
  updatedAt: 2000,
  ...over,
});

beforeEach(() => localStorage.clear());

describe('playSessionStore', () => {
  it('keeps the game in progress and reads it back', () => {
    expect(loadPlaySession()).toBeNull();
    savePlaySession(session());
    expect(loadPlaySession()).toEqual(session());
  });

  it('keeps only the last game, and forgets it when cleared', () => {
    savePlaySession(session());
    savePlaySession(session({ moves: ['d2d4', 'd7d5'], color: 'b' }));
    expect(loadPlaySession()?.moves).toEqual(['d2d4', 'd7d5']);
    clearPlaySession();
    expect(loadPlaySession()).toBeNull();
  });

  it('ignores what is not JSON or not a game', () => {
    localStorage.setItem('chess_play_session', '{nope');
    expect(loadPlaySession()).toBeNull();
    localStorage.setItem('chess_play_session', JSON.stringify({ moves: ['e2e4'] }));
    expect(loadPlaySession()).toBeNull();
  });

  it.each([
    ['an illegal move', { moves: ['e2e4', 'e2e4'] }],
    ['no move at all', { moves: [] }],
    ['a game that is over', { moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] }],
    ['a start that is not a position', { startFen: 'nope' }],
    ['a side that is not one', { color: 'x' }],
    ['a negative count', { hints: -1 }],
  ])('refuses %s', (_name, over) => {
    expect(isPlaySession({ ...session(), ...over })).toBe(false);
  });

  it('accepts a game that starts from a position of its own', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    expect(isPlaySession(session({ startFen: fen, prefix: undefined, moves: ['e2e4'] }))).toBe(true);
  });

  it('keeps the clock of the game, with one time per move', () => {
    const clock = { baseSeconds: 300, incrementSeconds: 3, w: 290_000, b: 285_000, log: [295_000, 298_000] };
    savePlaySession(session({ clock }));
    expect(loadPlaySession()?.clock).toEqual(clock);
  });

  it.each([
    ['times that do not match the moves', { log: [295_000] }],
    ['a time that is not a number', { log: [295_000, 'vite'] }],
    ['a negative time', { w: -1 }],
    ['a base time of nothing', { baseSeconds: 0 }],
  ])('refuses a clock with %s', (_name, over) => {
    const clock = { baseSeconds: 300, incrementSeconds: 3, w: 290_000, b: 285_000, log: [295_000, 298_000], ...over };
    expect(isPlaySession(session({ clock: clock as PlaySession['clock'] }))).toBe(false);
  });

  it('does not throw when the storage is refused', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      expect(() => savePlaySession(session())).not.toThrow();
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});
