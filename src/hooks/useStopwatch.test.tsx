// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStopwatch } from './useStopwatch';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useStopwatch', () => {
  it('counts from the start value', () => {
    const { result } = renderHook(() => useStopwatch(5000));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.elapsedMs).toBe(8000);
    expect(result.current.read()).toBe(8000);
    expect(result.current.isRunning).toBe(true);
  });

  it('does not count the pause', () => {
    const { result } = renderHook(() => useStopwatch());
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.pause());
    expect(result.current.isRunning).toBe(false);
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.read()).toBe(2000);
    expect(result.current.elapsedMs).toBe(2000);
    act(() => result.current.resume());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.read()).toBe(3000);
  });

  it('pauses and resumes more than once without counting twice', () => {
    const { result } = renderHook(() => useStopwatch());
    act(() => result.current.pause());
    act(() => result.current.pause());
    act(() => result.current.resume());
    act(() => result.current.resume());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.read()).toBe(1000);
  });

  it('pauses when the tab is hidden', () => {
    const { result } = renderHook(() => useStopwatch());
    act(() => vi.advanceTimersByTime(1000));
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.isRunning).toBe(false);
    expect(result.current.read()).toBe(1000);
  });
});
