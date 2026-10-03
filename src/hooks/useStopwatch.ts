import { useCallback, useEffect, useRef, useState } from 'react';

const TICK_MS = 250;

/**
 * A stopwatch that starts running, with a pause. `read` gives the time at this very moment (to keep it); `elapsedMs`
 * is the same, refreshed four times a second for the screen. The browser tab being hidden pauses it: time away from
 * the screen is not time spent on the puzzles.
 */
export function useStopwatch(initialMs = 0) {
  const base = useRef(initialMs);
  const [startedAt] = useState(() => Date.now());
  const since = useRef<number | null>(startedAt);
  const [isRunning, setIsRunning] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(initialMs);

  const read = useCallback(() => base.current + (since.current === null ? 0 : Date.now() - since.current), []);

  const pause = useCallback(() => {
    if (since.current === null) return;
    base.current = read();
    since.current = null;
    setElapsedMs(base.current);
    setIsRunning(false);
  }, [read]);

  const resume = useCallback(() => {
    if (since.current !== null) return;
    since.current = Date.now();
    setIsRunning(true);
  }, []);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setElapsedMs(read()), TICK_MS);
    return () => clearInterval(timer);
  }, [isRunning, read]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pause]);

  return { elapsedMs, isRunning, read, pause, resume };
}
