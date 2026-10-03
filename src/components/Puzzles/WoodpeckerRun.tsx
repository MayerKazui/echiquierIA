import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Repeat, Timer } from 'lucide-react';
import { useStableCallback } from '../../hooks/useStableCallback';
import { useStopwatch } from '../../hooks/useStopwatch';
import type { BoardTheme } from '../../types/ui';
import type { Puzzle } from '../../utils/puzzleData';
import {
  finishCycle,
  formatStopwatch,
  isCycleDone,
  saveProgress,
  settle,
  type WoodpeckerProgress,
  type WoodpeckerSet,
} from '../../utils/woodpecker';
import { PuzzlePlay } from './PuzzlePlay';

interface WoodpeckerRunProps {
  /** The lot, with the cycle to play in `progress`. */
  set: WoodpeckerSet & { progress: WoodpeckerProgress };
  boardTheme?: BoardTheme;
  /** The lot changed: a puzzle was played, the cycle was paused or left, or it ended. */
  onChange: (set: WoodpeckerSet) => void;
  /** A puzzle played for the first time in this cycle, with its outcome (for the history of the puzzles). */
  onAttempt?: (puzzle: Puzzle, isSuccess: boolean) => void;
  /** The cycle is over: its number, to show its result. */
  onFinish: (cycleNumber: number) => void;
  /** The player leaves the cycle, to come back to it later. */
  onLeave: () => void;
}

const BUTTON =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 font-semibold text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

/**
 * A cycle of the lot: every puzzle once, then the ones missed again, until all are solved. The stopwatch runs all along
 * (the pause and the time away excluded). The cycle is kept after each puzzle, so closing the window or the browser
 * loses at most the puzzle on the board.
 */
export const WoodpeckerRun: React.FC<WoodpeckerRunProps> = ({
  set,
  boardTheme,
  onChange,
  onAttempt,
  onFinish,
  onLeave,
}) => {
  const { progress } = set;
  const { elapsedMs, isRunning, read, pause, resume } = useStopwatch(progress.elapsedMs);
  const byId = useMemo(() => new Map(set.puzzles.map((puzzle) => [puzzle.id, puzzle])), [set.puzzles]);
  // What the player did with the puzzle on the board: counted when they move on, not before they have seen the answer
  const outcome = useRef<boolean | null>(null);
  const isOver = useRef(false);
  // A new turn for every puzzle shown, so that the one that comes back is played afresh
  const [turn, setTurn] = useState(0);

  const keep = useStableCallback((paused: boolean) => {
    if (isOver.current) return;
    onChange(saveProgress(set, { ...set.progress, elapsedMs: read() }, Date.now()));
    if (paused) pause();
  });

  // The window closes, or the player goes elsewhere: the time so far is kept
  const keepOnLeaving = useStableCallback(() => keep(false));
  useEffect(() => () => keepOnLeaving(), [keepOnLeaving]);

  // The stopwatch pauses by itself when the tab is hidden: the time is kept at that moment too
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) keep(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [keep]);

  const next = useStableCallback(() => {
    const settled = { ...settle(set.progress, outcome.current), elapsedMs: read() };
    outcome.current = null;
    if (isCycleDone(settled)) {
      isOver.current = true;
      onChange(finishCycle(set, settled, Date.now()));
      onFinish(settled.number);
      return;
    }
    onChange(saveProgress(set, settled, Date.now()));
    setTurn((t) => t + 1);
  });

  const onResult = useStableCallback((played: Puzzle, isSuccess: boolean) => {
    outcome.current = isSuccess;
    // A puzzle that comes back after a miss is not a new attempt
    if (!set.progress.missed.includes(played.id)) onAttempt?.(played, isSuccess);
  });

  const puzzle = byId.get(progress.queue[0]);
  const total = set.puzzles.length;
  const left = progress.queue.length;
  const retries = progress.queue.filter((id) => progress.missed.includes(id)).length;

  if (!puzzle) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 text-xs text-rose-300">
        Ce cycle est abîmé : un puzzle du lot manque.
        <button type="button" onClick={onLeave} className={BUTTON}>
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-slate-300 tabular-nums">
          Cycle {progress.number} · {total - left} sur {total} résolus
          {retries > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-amber-300">
              <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
              {retries} à reprendre
            </span>
          )}
        </p>
        <div className="flex items-center gap-3">
          <span
            role="timer"
            aria-label="Temps du cycle"
            className="flex items-center gap-1 font-semibold text-slate-100 tabular-nums"
          >
            <Timer className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
            {formatStopwatch(elapsedMs)}
          </span>
          {isRunning ? (
            <button type="button" onClick={() => keep(true)} className={BUTTON}>
              <Pause className="w-3.5 h-3.5" aria-hidden="true" /> Pause
            </button>
          ) : (
            <button type="button" onClick={resume} className={BUTTON}>
              <Play className="w-3.5 h-3.5" aria-hidden="true" /> Reprendre
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              keep(false);
              // Kept just now: the window closing behind must not write it again
              isOver.current = true;
              onLeave();
            }}
            className={BUTTON}
          >
            Quitter le cycle
          </button>
        </div>
      </div>

      {!isRunning && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-slate-200 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3"
        >
          <Pause className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          Cycle en pause : le chronomètre est arrêté et le plateau masqué. Reprenez quand vous êtes prêt.
        </p>
      )}

      {/* Kept in place while paused, so that a puzzle half played is found as it was; hidden so that it cannot be thought over for free */}
      <div
        className={isRunning ? undefined : 'invisible h-0 overflow-hidden'}
        inert={!isRunning}
        aria-hidden={!isRunning}
      >
        <PuzzlePlay
          key={`${turn}-${puzzle.id}`}
          puzzle={puzzle}
          boardTheme={boardTheme}
          onResult={onResult}
          onNext={next}
          isLast={left === 1}
          repeatsMisses
          missedNotice="Il reviendra en fin de cycle."
        />
      </div>
    </div>
  );
};
