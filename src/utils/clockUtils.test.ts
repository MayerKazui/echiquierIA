import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  extractGameClocks,
  formatClockRemaining,
  formatThinkTime,
  parseDurationToSeconds,
  parseTimeControl,
} from './clockUtils';

describe('parseDurationToSeconds', () => {
  it.each<[string, number]>([
    ['1:29:45', 5385],
    ['0:09:58', 598],
    ['9:58', 598],
    ['9:58.4', 598.4],
    ['45', 45],
    ['[%clk 0:04:58]', 298],
    ['[%emt 0:00:07]', 7],
  ])('parses %s', (input, expected) => {
    expect(parseDurationToSeconds(input)).toBeCloseTo(expected, 5);
  });

  it.each(['', 'abc', 'a:b', '1:2:3:4'])('returns null for %j', (input) => {
    expect(parseDurationToSeconds(input)).toBeNull();
  });
});

describe('formatThinkTime', () => {
  it.each<[number, string]>([
    [0, '0s'],
    [8, '8s'],
    [59.4, '59s'],
    [60, '1m 00s'],
    [75, '1m 15s'],
    [185, '3m 05s'],
  ])('%s s -> %s', (seconds, expected) => {
    expect(formatThinkTime(seconds)).toBe(expected);
  });
});

describe('formatClockRemaining', () => {
  it.each<[number, string]>([
    [-5, '0:00'],
    [9, '0:09'],
    [585, '9:45'],
    [3600, '1:00:00'],
    [4530, '1:15:30'],
  ])('%s s -> %s', (seconds, expected) => {
    expect(formatClockRemaining(seconds)).toBe(expected);
  });
});

describe('parseTimeControl', () => {
  it('parses base + increment and base only', () => {
    expect(parseTimeControl('600+2')).toEqual({ baseTime: 600, increment: 2 });
    expect(parseTimeControl(' 300 ')).toEqual({ baseTime: 300, increment: 0 });
  });

  it('returns null when there is nothing usable', () => {
    expect(parseTimeControl(undefined)).toBeNull();
    expect(parseTimeControl('')).toBeNull();
    expect(parseTimeControl('-')).toBeNull();
    expect(parseTimeControl('0')).toBeNull();
  });
});

function historyOf(pgn: string) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return chess.history({ verbose: true });
}

describe('extractGameClocks', () => {
  it('returns nothing for an empty game', () => {
    expect(extractGameClocks('', [])).toEqual({
      moveClocks: [],
      avgWhiteThink: 0,
      avgBlackThink: 0,
      hasClockData: false,
    });
  });

  it('reports no clock data when the PGN has no clock comments', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6';
    const result = extractGameClocks(pgn, historyOf(pgn));
    expect(result.hasClockData).toBe(false);
    expect(result.moveClocks).toEqual([{}, {}, {}, {}]);
  });

  it('derives think times from the remaining clock, using the TimeControl header', () => {
    const pgn = `[TimeControl "300+0"]

1. e4 { [%clk 0:04:58] } e5 { [%clk 0:04:55] } 2. Nf3 { [%clk 0:04:50] } Nc6 { [%clk 0:03:50] } *`;
    const result = extractGameClocks(pgn, historyOf(pgn));

    expect(result.hasClockData).toBe(true);
    expect(result.moveClocks.map((m) => m.thinkTimeSeconds)).toEqual([2, 5, 8, 65]);
    expect(result.moveClocks.map((m) => m.clock)).toEqual(['0:04:58', '0:04:55', '0:04:50', '0:03:50']);
    expect(result.moveClocks[3].thinkTimeFormatted).toBe('1m 05s');
    expect(result.avgWhiteThink).toBe(5);
    expect(result.avgBlackThink).toBe(35);
    // 65 s is over the 60 s threshold, the others are not long thinks
    expect(result.moveClocks.map((m) => m.isLongThink)).toEqual([false, false, false, true]);
  });

  it('adds the increment back when computing think time', () => {
    const pgn = `[TimeControl "300+5"]

1. e4 { [%clk 0:04:58] } e5 { [%clk 0:04:57] } *`;
    const result = extractGameClocks(pgn, historyOf(pgn));
    // 300 - 298 + 5 = 7 ; 300 - 297 + 5 = 8
    expect(result.moveClocks.map((m) => m.thinkTimeSeconds)).toEqual([7, 8]);
  });

  it('prefers the explicit %emt value over clock differences', () => {
    const pgn = '1. e4 { [%clk 0:09:50] [%emt 0:00:03] } e5 { [%clk 0:09:40] [%emt 0:00:12] } *';
    const result = extractGameClocks(pgn, historyOf(pgn));
    expect(result.moveClocks.map((m) => m.thinkTimeSeconds)).toEqual([3, 12]);
  });

  it('infers the starting time from the first clock when there is no TimeControl', () => {
    const pgn = '1. e4 { [%clk 0:09:58] } e5 { [%clk 0:09:57] } *';
    const result = extractGameClocks(pgn, historyOf(pgn));
    // Base inferred as 600 s
    expect(result.moveClocks.map((m) => m.thinkTimeSeconds)).toEqual([2, 3]);
  });
});
