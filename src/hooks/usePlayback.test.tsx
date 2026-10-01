// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayback, type PlaybackOptions } from './usePlayback';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

const INTERVAL = 1100; // speed 1

function setup(totalMoves: number, options?: PlaybackOptions, initialPly = 0) {
  const hook = renderHook(({ opts }) => usePlayback(totalMoves, opts), { initialProps: { opts: options } });
  act(() => hook.result.current.setCurrentPly(initialPly));
  return hook;
}

const play = (hook: ReturnType<typeof setup>) => act(() => hook.result.current.setIsPlaying(true));
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('usePlayback', () => {
  it('does nothing until it is started', () => {
    const hook = setup(10);
    wait(INTERVAL * 5);
    expect(hook.result.current.currentPly).toBe(0);
  });

  it('moves one ply per interval, faster at a higher speed', () => {
    const hook = setup(10);
    play(hook);
    wait(INTERVAL - 1);
    expect(hook.result.current.currentPly).toBe(0);
    wait(1);
    expect(hook.result.current.currentPly).toBe(1);
    wait(INTERVAL * 2);
    expect(hook.result.current.currentPly).toBe(3);

    act(() => hook.result.current.setPlaybackSpeed(2));
    wait(550 * 2);
    expect(hook.result.current.currentPly).toBe(5);
  });

  it('stops by itself as soon as it reaches the last move', () => {
    const hook = setup(4, undefined, 1);
    play(hook);
    wait(INTERVAL);
    expect(hook.result.current).toMatchObject({ currentPly: 2, isPlaying: true });
    wait(INTERVAL);
    expect(hook.result.current).toMatchObject({ currentPly: 3, isPlaying: false }); // not one tick later
    wait(INTERVAL * 3);
    expect(hook.result.current.currentPly).toBe(3);
  });

  it('can be stopped by the caller', () => {
    const hook = setup(10);
    play(hook);
    wait(INTERVAL);
    act(() => hook.result.current.setIsPlaying(false));
    wait(INTERVAL * 3);
    expect(hook.result.current.currentPly).toBe(1);
  });

  it('does not wait for the next tick to restart after a manual jump', () => {
    const hook = setup(10);
    play(hook);
    wait(INTERVAL);
    act(() => hook.result.current.setCurrentPly(6)); // a jump while playing
    wait(INTERVAL);
    expect(hook.result.current.currentPly).toBe(7);
  });
});

describe('usePlayback pausing on some plies', () => {
  it('stops on arriving at a flagged ply and says so', () => {
    const onPaused = vi.fn();
    const hook = setup(10, { pauseAt: (ply) => ply === 3, onPaused });
    play(hook);
    wait(INTERVAL * 2);
    expect(hook.result.current).toMatchObject({ currentPly: 2, isPlaying: true });
    expect(onPaused).not.toHaveBeenCalled();

    wait(INTERVAL);
    expect(hook.result.current).toMatchObject({ currentPly: 3, isPlaying: false });
    expect(onPaused).toHaveBeenCalledExactlyOnceWith(3);

    wait(INTERVAL * 3);
    expect(hook.result.current.currentPly).toBe(3); // it stays there
  });

  it('goes on past the flagged ply when started from it', () => {
    const hook = setup(10, { pauseAt: (ply) => ply === 3 }, 3);
    play(hook);
    wait(INTERVAL);
    expect(hook.result.current).toMatchObject({ currentPly: 4, isPlaying: true });
  });

  it('stops on each flagged ply in turn', () => {
    const hook = setup(10, { pauseAt: (ply) => ply % 3 === 0 }, 0);
    play(hook);
    wait(INTERVAL * 3);
    expect(hook.result.current).toMatchObject({ currentPly: 3, isPlaying: false });
    play(hook);
    wait(INTERVAL * 3);
    expect(hook.result.current).toMatchObject({ currentPly: 6, isPlaying: false });
  });

  it('does not stop when there is nothing to pause on', () => {
    const hook = setup(10, { pauseAt: () => false });
    play(hook);
    wait(INTERVAL * 4);
    expect(hook.result.current).toMatchObject({ currentPly: 4, isPlaying: true });
  });

  it('uses the latest options without restarting the timer', () => {
    const hook = setup(10, undefined);
    play(hook);
    wait(INTERVAL);
    expect(hook.result.current.currentPly).toBe(1);

    hook.rerender({ opts: { pauseAt: (ply) => ply === 3 } }); // the setting is switched on while playing
    wait(INTERVAL);
    expect(hook.result.current).toMatchObject({ currentPly: 2, isPlaying: true });
    wait(INTERVAL);
    expect(hook.result.current).toMatchObject({ currentPly: 3, isPlaying: false });
  });

  it('reports the end of the game as a stop, not as a pause', () => {
    const onPaused = vi.fn();
    const hook = setup(3, { pauseAt: () => false, onPaused }, 1);
    play(hook);
    wait(INTERVAL);
    expect(hook.result.current).toMatchObject({ currentPly: 2, isPlaying: false });
    expect(onPaused).not.toHaveBeenCalled();
  });
});
