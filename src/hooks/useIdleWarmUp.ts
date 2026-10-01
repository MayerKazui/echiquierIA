import { useEffect } from 'react';

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Runs `tasks` once, when the browser is idle after the first render (or after `fallbackDelayMs` where
 * requestIdleCallback does not exist, e.g. Safari). Used to download the engine, the openings database
 * and the lazy views while the user is still looking at the start screen, without delaying the first paint.
 */
export function useIdleWarmUp(tasks: Array<() => void>, fallbackDelayMs = 1500) {
  useEffect(() => {
    const win = window as IdleWindow;
    const run = () => {
      for (const task of tasks) {
        try {
          task();
        } catch (err) {
          console.warn('Warm-up task failed:', err);
        }
      }
    };

    if (win.requestIdleCallback) {
      const handle = win.requestIdleCallback(run, { timeout: 4000 });
      return () => win.cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(run, fallbackDelayMs);
    return () => clearTimeout(timer);
    // The tasks are fixed for the life of the app: run them once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
