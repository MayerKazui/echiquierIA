import { useCallback, useEffect, useRef, useState } from 'react';
import { listGameIds, onGamesChanged } from '../services/gameStore';
import { onPracticeChanged } from '../services/practiceStore';
import { loadPuzzleEntries } from '../services/puzzleStore';
import { loadCards } from '../services/trainingStore';
import { loadWoodpecker } from '../services/woodpeckerStore';
import { updateAppBadge } from '../utils/appBadge';
import { summarizeDue, type DueSummary } from '../utils/dueReviews';

/** Wait this long (ms) after a change before reading again: a session writes a card at every answer. */
const SETTLE_MS = 400;
/** The count is read again at this interval (ms), so that a day that begins while the app stays open is noticed. */
const REFRESH_MS = 10 * 60 * 1000;

/**
 * What is to be reviewed today in the five stocks (see `dueReviews`), read from the browser and read again when
 * something is practised, when the app comes back in front and every few minutes. The number is also put on the icon
 * of the installed app. `summary` is null until it is first read.
 */
export function useDueReviews(now: () => number = Date.now) {
  const [summary, setSummary] = useState<DueSummary | null>(null);
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  });
  // Two reads can overlap: the last one started is the one that counts
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const turn = ++latest.current;
    const [gameIds, cards, puzzles, woodpecker] = await Promise.all([
      listGameIds(),
      loadCards(),
      loadPuzzleEntries(),
      loadWoodpecker(),
    ]);
    if (turn !== latest.current) return;
    setSummary(summarizeDue({ cards, gameIds, puzzles, woodpecker, now: nowRef.current() }));
  }, []);

  useEffect(() => {
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), SETTLE_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') soon();
    };
    const offGames = onGamesChanged(soon);
    const offPractice = onPracticeChanged(soon);
    window.addEventListener('focus', soon);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(soon, REFRESH_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      offGames();
      offPractice();
      window.removeEventListener('focus', soon);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const total = summary?.total ?? null;
  useEffect(() => {
    if (total !== null) void updateAppBadge(total);
  }, [total]);

  return { summary, refresh };
}
