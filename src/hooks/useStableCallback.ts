import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A function with a stable identity that always calls the latest version of `callback`.
 * For handlers handed to memoised children: they do not re-render each time the parent does, yet the handler
 * never works with stale props or state. Only call it from events, not during the render.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result
): (...args: Args) => Result {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
