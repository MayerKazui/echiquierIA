import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPuzzleEntries, savePuzzleEntry } from '../services/puzzleStore';
import type { Puzzle } from '../utils/puzzleData';
import { recordPuzzle, type PuzzleEntry } from '../utils/puzzleReview';

export type PuzzleReviewData = { status: 'loading' } | { status: 'ready'; entries: ReadonlyMap<string, PuzzleEntry> };

/**
 * The puzzles the player missed, read from the browser. `record` notes the result of one puzzle (the entry moves on
 * at once, and is written in the background): a puzzle missed gets an entry, a puzzle solved moves its entry on if
 * it has one.
 */
export function usePuzzleReview(now: () => number = Date.now) {
  const [data, setData] = useState<PuzzleReviewData>({ status: 'loading' });
  const dataRef = useRef<PuzzleReviewData>(data);
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  });

  useEffect(() => {
    let isCancelled = false;
    void loadPuzzleEntries().then((entries) => {
      if (isCancelled) return;
      const ready: PuzzleReviewData = { status: 'ready', entries };
      dataRef.current = ready;
      setData(ready);
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  const record = useCallback((puzzle: Puzzle, isSuccess: boolean): PuzzleEntry | null => {
    const previous = dataRef.current;
    if (previous.status !== 'ready') return null;
    const entry = recordPuzzle(previous.entries.get(puzzle.id), puzzle, isSuccess, nowRef.current());
    if (!entry) return null;
    // Two results in a row must not start from the same entries
    const next: PuzzleReviewData = { status: 'ready', entries: new Map(previous.entries).set(entry.id, entry) };
    dataRef.current = next;
    setData(next);
    void savePuzzleEntry(entry);
    return entry;
  }, []);

  return { data, record };
}
