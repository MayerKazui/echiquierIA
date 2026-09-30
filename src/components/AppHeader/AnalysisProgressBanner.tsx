import React from 'react';
import { AnalysisProgress } from '../../hooks/useGameAnalysis';

export const AnalysisProgressBanner: React.FC<{ progress: AnalysisProgress }> = ({ progress }) => {
  const ratio = progress.current / Math.max(1, progress.total);
  return (
    <div className="bg-indigo-950/60 border-b border-indigo-900/60 px-4 py-2.5 flex items-center justify-between text-xs animate-pulse">
      <div className="flex items-center gap-2 text-indigo-200 font-medium">
        <span className="w-3.5 h-3.5 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
        <span>
          Analyse Stockfish en profondeur... Coup {progress.current} sur {progress.total} ({Math.round(ratio * 100)}%)
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Progression de l'analyse Stockfish"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.current}
        className="w-48 bg-slate-900 rounded-full h-2 overflow-hidden border border-indigo-800/40"
      >
        <div
          className="bg-indigo-500 h-full rounded-full transition-all duration-150"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
};
