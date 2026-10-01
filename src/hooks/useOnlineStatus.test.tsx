// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useOnlineStatus } from './useOnlineStatus';

const setOnline = (value: boolean) => Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });

afterEach(() => setOnline(true));

describe('useOnlineStatus', () => {
  it('starts from what the browser says', () => {
    setOnline(false);
    expect(renderHook(() => useOnlineStatus()).result.current).toBe(false);
    setOnline(true);
    expect(renderHook(() => useOnlineStatus()).result.current).toBe(true);
  });

  it('follows the connection being lost and coming back', () => {
    setOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });

  it('stops listening when unmounted', () => {
    setOnline(true);
    const { result, unmount } = renderHook(() => useOnlineStatus());
    unmount();
    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    expect(result.current).toBe(true);
  });
});
