import React from 'react';
import { AnalysisProgress } from '../../hooks/useGameAnalysis';
import { AnalysisProgressBar } from './AnalysisProgressBar';

/** Shown above the game while an analysis runs: its progress, and a way to stop it. */
export const AnalysisProgressBanner: React.FC<{ progress: AnalysisProgress; onCancel?: () => void }> = ({
  progress,
  onCancel,
}) => {
  const percent = Math.round((Math.min(1, progress.current / Math.max(1, progress.total)) || 0) * 100);
  return (
    <div className="bg-indigo-950/60 border-b border-indigo-900/60 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs">
      <div className="flex items-center gap-2 text-indigo-200 font-medium min-w-0">
        <span
          className="w-3.5 h-3.5 shrink-0 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin"
          aria-hidden="true"
        />
        <span className="truncate">
          Analyse en cours : {percent} %
          <span className="hidden sm:inline"> · les coups s'affichent au fur et à mesure</span>
        </span>
      </div>
      <div className="flex items-center gap-3 flex-1 sm:flex-none justify-end">
        <AnalysisProgressBar progress={progress} className="w-full sm:w-48" />
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 px-2.5 py-1 rounded-lg border border-indigo-700/60 text-indigo-100 font-semibold hover:bg-indigo-900/60 cursor-pointer"
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
};
