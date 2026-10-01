// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

function mockMatchMedia(initial: boolean) {
  let listener: (() => void) | null = null;
  const list = {
    matches: initial,
    addEventListener: vi.fn((_: string, cb: () => void) => (listener = cb)),
    removeEventListener: vi.fn(() => (listener = null)),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => list)
  );
  return {
    list,
    change: (matches: boolean) => {
      list.matches = matches;
      listener?.();
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery', () => {
  it('is false where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(false);
  });

  it('follows the query and stops listening on unmount', () => {
    const media = mockMatchMedia(true);
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(true);
    act(() => media.change(false));
    expect(result.current).toBe(false);
    unmount();
    expect(media.list.removeEventListener).toHaveBeenCalled();
  });
});
