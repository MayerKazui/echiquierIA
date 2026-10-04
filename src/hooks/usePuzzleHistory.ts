import { useCallback, useEffect, useRef, useState } from 'react';
import { recordPractice } from '../services/practiceStore';
import {
  clearPuzzleHistory,
  loadPuzzleHistory,
  savePuzzleAttempt,
  savePuzzleSession,
} from '../services/puzzleHistoryStore';
import {
  EMPTY_HISTORY,
  addAttempt,
  addSession,
  clearedHistory,
  type PuzzleHistory,
  type PuzzleSession,
} from '../utils/puzzleHistory';
import type { Puzzle } from '../utils/puzzleData';

export type PuzzleHistoryData = { status: 'loading' } | { status: 'ready'; history: PuzzleHistory };

/**
 * What the player did with the puzzles, read from the browser. `record` notes one puzzle played and `recordSession`
 * a session ended: the figures move on at once, the writes follow in the background.
 */
export function usePuzzleHistory(now: () => number = Date.now) {
  const [data, setData] = useState<PuzzleHistoryData>({ status: 'loading' });
  // Two results in a row must not start from the same history
  const latest = useRef<PuzzleHistory>(EMPTY_HISTORY);
  const isChanged = useRef(false);
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  });

  useEffect(() => {
    let isCancelled = false;
    void loadPuzzleHistory().then((history) => {
      if (isCancelled) return;
      // Puzzles played before the read came back are only in memory (they are being written): keep those
      if (!isChanged.current) latest.current = history;
      setData({ status: 'ready', history: latest.current });
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  const record = useCallback((puzzle: Puzzle, ok: boolean) => {
    isChanged.current = true;
    const at = nowRef.current();
    const next = addAttempt(latest.current, puzzle, ok, at);
    latest.current = next;
    setData({ status: 'ready', history: next });
    void savePuzzleAttempt(next.seen.get(puzzle.id)!, next.log[next.log.length - 1]);
    void recordPractice(at);
  }, []);

  const recordSession = useCallback((session: Omit<PuzzleSession, 'at'>) => {
    isChanged.current = true;
    const full: PuzzleSession = { ...session, at: nowRef.current() };
    latest.current = addSession(latest.current, full);
    setData({ status: 'ready', history: latest.current });
    void savePuzzleSession(full);
  }, []);

  /** Forgets everything played (and notes when, so that a copy elsewhere cannot bring it back). */
  const clear = useCallback(() => {
    isChanged.current = true;
    const at = nowRef.current();
    latest.current = clearedHistory(at);
    setData({ status: 'ready', history: latest.current });
    void clearPuzzleHistory(at);
  }, []);

  return { data, record, recordSession, clear };
}
