import { describe, expect, it } from 'vitest';
import { moveListScrollBehavior } from './scrollBehavior';

const base = { previousPly: 10, currentPly: 11, isPlaying: false, reducedMotion: false };

describe('moveListScrollBehavior', () => {
  it('animates a single step taken by the user, forward or back', () => {
    expect(moveListScrollBehavior(base)).toBe('smooth');
    expect(moveListScrollBehavior({ ...base, currentPly: 9 })).toBe('smooth');
  });

  it('animates up to two plies (a white and a black move) and no more', () => {
    expect(moveListScrollBehavior({ ...base, currentPly: 12 })).toBe('smooth');
    expect(moveListScrollBehavior({ ...base, currentPly: 13 })).toBe('auto');
    expect(moveListScrollBehavior({ ...base, currentPly: 7 })).toBe('auto');
  });

  it('scrolls at once on a jump to the start, the end, an error or a click on the chart', () => {
    expect(moveListScrollBehavior({ ...base, currentPly: 0 })).toBe('auto');
    expect(moveListScrollBehavior({ ...base, currentPly: 80 })).toBe('auto');
  });

  it('scrolls at once during auto-play, whatever the speed', () => {
    expect(moveListScrollBehavior({ ...base, isPlaying: true })).toBe('auto');
  });

  it('never animates when the user asked for reduced motion', () => {
    expect(moveListScrollBehavior({ ...base, reducedMotion: true })).toBe('auto');
  });
});
