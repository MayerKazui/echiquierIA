import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Timer, XCircle } from 'lucide-react';
import type { BoardTheme } from '../../types/ui';
import type { Puzzle } from '../../utils/puzzleData';
import { formatClock } from '../../utils/puzzleRun';
import { PuzzlePlay } from './PuzzlePlay';

export interface PuzzleResult {
  puzzle: Puzzle;
  isSuccess: boolean;
}

export interface RunReport {
  results: PuzzleResult[];
  elapsedMs: number;
  /** `done`: no puzzle left; `time`: the timer ran out; `quit`: the player stopped. */
  reason: 'done' | 'time' | 'quit';
}

interface PuzzleRunProps {
  puzzles: readonly Puzzle[];
  /** Length of the run in minutes, null for no limit. */
  minutes: number | null;
  /** A review has a fixed number of puzzles, told to the player; a run of practice goes on as long as there are some. */
  isReview: boolean;
  boardTheme?: BoardTheme;
  /** Notes the first outcome of a puzzle (the missed ones go to the puzzles to review). */
  onResult: (puzzle: Puzzle, isSuccess: boolean) => void;
  onFinish: (report: RunReport) => void;
}

const TICK_MS = 250;

/**
 * A run of puzzles, one after the other. A miss costs nothing but the time it takes: the next puzzle comes at once,
 * the point being to get through as many as possible. With a timer, the run ends when it runs out.
 */
export const PuzzleRun: React.FC<PuzzleRunProps> = ({ puzzles, minutes, isReview, boardTheme, onResult, onFinish }) => {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<PuzzleResult[]>([]);
  const resultsRef = useRef<PuzzleResult[]>([]);
  const finished = useRef(false);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  const finish = useCallback(
    (reason: RunReport['reason']) => {
      if (finished.current) return;
      finished.current = true;
      onFinishRef.current({ results: resultsRef.current, elapsedMs: Date.now() - startedAt, reason });
    },
    [startedAt]
  );

  const durationMs = minutes === null ? null : minutes * 60_000;
  useEffect(() => {
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (durationMs !== null && current - startedAt >= durationMs) finish('time');
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [durationMs, finish, startedAt]);

  const handleResult = useCallback(
    (puzzle: Puzzle, isSuccess: boolean) => {
      resultsRef.current = [...resultsRef.current, { puzzle, isSuccess }];
      setResults(resultsRef.current);
      onResult(puzzle, isSuccess);
    },
    [onResult]
  );

  const isLast = index + 1 >= puzzles.length;
  const next = useCallback(() => {
    if (isLast) finish('done');
    else setIndex((i) => i + 1);
  }, [isLast, finish]);

  const puzzle = puzzles[index];
  const solved = results.filter((r) => r.isSuccess).length;
  const missed = results.length - solved;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-slate-300">
          Puzzle {index + 1}
          {isReview && ` sur ${puzzles.length}`}
        </p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-emerald-300 tabular-nums" aria-label={`${solved} réussis`}>
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> {solved}
          </span>
          <span className="flex items-center gap-1 text-rose-300 tabular-nums" aria-label={`${missed} ratés`}>
            <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> {missed}
          </span>
          {durationMs !== null && (
            <span
              role="timer"
              aria-label="Temps restant"
              className="flex items-center gap-1 font-semibold text-slate-100 tabular-nums"
            >
              <Timer className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
              {formatClock(durationMs - (now - startedAt))}
            </span>
          )}
          <button
            type="button"
            onClick={() => finish('quit')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 font-semibold text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            Arrêter la séance
          </button>
        </div>
      </div>

      <PuzzlePlay
        key={puzzle.id}
        puzzle={puzzle}
        boardTheme={boardTheme}
        onResult={handleResult}
        onNext={next}
        isLast={isLast}
      />
    </div>
  );
};
