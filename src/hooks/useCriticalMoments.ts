import { useMemo } from 'react';
import { MoveAnalysis } from '../types/chess';

const CRITICAL_CLASSIFICATIONS = ['inaccuracy', 'mistake', 'blunder', 'missedWin'];

/** Plies of the inaccuracies / mistakes / blunders, with the previous and next one around `currentPly`. */
export function useCriticalMoments(moves: MoveAnalysis[] | undefined, currentPly: number) {
  const criticalPlies = useMemo(() => {
    const list: number[] = [];
    moves?.forEach((m, idx) => {
      if (CRITICAL_CLASSIFICATIONS.includes(m.classification)) list.push(idx);
    });
    return list;
  }, [moves]);

  const prevErrorPly = useMemo(() => {
    for (let i = criticalPlies.length - 1; i >= 0; i--) {
      if (criticalPlies[i] < currentPly) return criticalPlies[i];
    }
    return null;
  }, [criticalPlies, currentPly]);

  const nextErrorPly = useMemo(() => {
    for (let i = 0; i < criticalPlies.length; i++) {
      if (criticalPlies[i] > currentPly) return criticalPlies[i];
    }
    return null;
  }, [criticalPlies, currentPly]);

  const currentErrorIndex = useMemo(() => {
    const idx = criticalPlies.indexOf(currentPly);
    return idx !== -1 ? idx + 1 : null;
  }, [criticalPlies, currentPly]);

  return { criticalPlies, prevErrorPly, nextErrorPly, currentErrorIndex };
}
