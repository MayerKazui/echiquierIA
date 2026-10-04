import { describe, expect, it } from 'vitest';
import {
  BASE_MINUTES,
  afterMove,
  clockComment,
  engineMoveTime,
  formatClock,
  parseTimeControlTag,
  pauseClock,
  remaining,
  resumeClock,
  startClock,
  timeControlLabel,
  timeControlOf,
  timeControlTag,
} from './playClock';

const FIVE_PLUS_THREE = timeControlOf(5, 3);

describe('the time controls', () => {
  it('go from one to fifteen minutes', () => {
    expect(BASE_MINUTES[0]).toBe(1);
    expect(BASE_MINUTES[BASE_MINUTES.length - 1]).toBe(15);
  });

  it('are written as the PGN tag and read back from it', () => {
    expect(timeControlTag(FIVE_PLUS_THREE)).toBe('300+3');
    expect(timeControlTag(timeControlOf(10, 0))).toBe('600');
    expect(parseTimeControlTag('300+3')).toEqual({ baseSeconds: 300, incrementSeconds: 3 });
    expect(parseTimeControlTag('600')).toEqual({ baseSeconds: 600, incrementSeconds: 0 });
    expect(parseTimeControlTag('1/86400')).toBeNull();
    expect(parseTimeControlTag('0')).toBeNull();
    expect(parseTimeControlTag(undefined)).toBeNull();
  });

  it('are told in a few words', () => {
    expect(timeControlLabel(FIVE_PLUS_THREE)).toBe('5 min + 3 s');
    expect(timeControlLabel(timeControlOf(10, 0))).toBe('10 min');
    expect(timeControlLabel({ baseSeconds: 90, incrementSeconds: 0 })).toBe('90 s');
  });
});

describe('the clock', () => {
  it('starts with the same time on both sides, running', () => {
    expect(startClock(FIVE_PLUS_THREE, 1000)).toEqual({ w: 300_000, b: 300_000, since: 1000 });
  });

  it('runs down the clock of the side to move only', () => {
    const clock = startClock(FIVE_PLUS_THREE, 1000);
    expect(remaining(clock, 'w', 'w', 11_000)).toBe(290_000);
    expect(remaining(clock, 'b', 'w', 11_000)).toBe(300_000);
  });

  it('never goes below zero', () => {
    expect(remaining(startClock(FIVE_PLUS_THREE, 0), 'w', 'w', 999_999)).toBe(0);
  });

  it('charges the mover, adds the increment and starts the other side', () => {
    const clock = afterMove(startClock(FIVE_PLUS_THREE, 0), 'w', 7000, FIVE_PLUS_THREE);
    expect(clock).toEqual({ w: 296_000, b: 300_000, since: 7000 });
    expect(remaining(clock, 'b', 'b', 10_000)).toBe(297_000);
  });

  it('stops when paused and charges what ran, then starts again from there', () => {
    const paused = pauseClock(startClock(FIVE_PLUS_THREE, 0), 'w', 4000);
    expect(paused).toEqual({ w: 296_000, b: 300_000, since: null });
    expect(remaining(paused, 'w', 'w', 99_000)).toBe(296_000);
    expect(resumeClock(paused, 50_000)).toEqual({ w: 296_000, b: 300_000, since: 50_000 });
  });
});

describe('engineMoveTime', () => {
  const noIncrement = timeControlOf(1, 0);

  it('keeps the time of the level when the clock is generous', () => {
    expect(engineMoveTime(1000, 600_000, noIncrement)).toBe(1000);
  });

  it('takes a share of what is left when time is short', () => {
    expect(engineMoveTime(1500, 10_000, noIncrement)).toBe(400);
    expect(engineMoveTime(1500, 10_000, timeControlOf(1, 2))).toBe(1400);
  });

  it('never thinks for nothing', () => {
    expect(engineMoveTime(1500, 0, noIncrement)).toBe(40);
  });
});

describe('formatClock', () => {
  it.each([
    [300_000, '5:00'],
    [272_100, '4:33'],
    [3_725_000, '1:02:05'],
    [20_000, '0:20'],
    [19_950, '0:19.9'],
    [9400, '0:09.4'],
    [0, '0:00.0'],
    [-50, '0:00.0'],
  ])('shows %i ms as %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

describe('clockComment', () => {
  it('is the [%clk] comment the analysis reads', () => {
    expect(clockComment(295_000)).toBe('[%clk 0:04:55]');
    expect(clockComment(3_725_400)).toBe('[%clk 1:02:05]');
    expect(clockComment(-5)).toBe('[%clk 0:00:00]');
  });
});
