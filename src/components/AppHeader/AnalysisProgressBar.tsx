import React from 'react';
import { AnalysisProgress } from '../../hooks/useGameAnalysis';

/** Progress bar of the running analysis (positions evaluated so far out of all the positions of the game). */
export const AnalysisProgressBar: React.FC<{ progress: AnalysisProgress; className?: string; label?: string }> = ({
  progress,
  className = 'w-full',
  label = "Progression de l'analyse Stockfish",
}) => {
  const ratio = Math.min(1, progress.current / Math.max(1, progress.total));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.current}
      aria-valuetext={`${Math.round(ratio * 100)} %`}
      className={`${className} bg-slate-900 rounded-full h-2 overflow-hidden border border-indigo-800/40`}
    >
      <div
        className="bg-indigo-500 h-full rounded-full transition-all duration-150"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
};
