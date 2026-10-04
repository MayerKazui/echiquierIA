import { useEffect, useState } from 'react';
import { exportPracticeDays, onPracticeChanged } from '../services/practiceStore';
import { loadPuzzleHistory } from '../services/puzzleHistoryStore';
import { loadCards } from '../services/trainingStore';
import { loadWoodpecker } from '../services/woodpeckerStore';
import { daysFromTimes, mergeDays } from '../utils/practiceDays';

/**
 * The days the player practised: the ones logged since the calendar exists, completed with what the work already
 * saved shows (the last time each position was replayed, the puzzles played, the Woodpecker cycles finished), so
 * that a player who has been training for months does not start from an empty calendar. A day known to both keeps
 * the larger count. `days` is null until it is read.
 */
export function usePracticeCalendar(): { days: ReadonlyMap<string, number> | null } {
  const [days, setDays] = useState<ReadonlyMap<string, number> | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const read = async () => {
      const [logged, cards, history, woodpecker] = await Promise.all([
        exportPracticeDays(),
        loadCards(),
        loadPuzzleHistory(),
        loadWoodpecker(),
      ]);
      if (isCancelled) return;
      const times: number[] = [];
      for (const card of cards.values()) times.push(card.lastSeen);
      for (const attempt of history.log) times.push(attempt.at);
      for (const session of history.sessions) times.push(session.at);
      for (const cycle of woodpecker?.cycles ?? []) times.push(cycle.finishedAt);
      const derived = daysFromTimes(times);
      setDays(
        mergeDays(
          logged,
          [...derived].map(([day, count]) => ({ day, count }))
        )
      );
    };
    void read();
    const off = onPracticeChanged(() => void read());
    return () => {
      isCancelled = true;
      off();
    };
  }, []);

  return { days };
}
