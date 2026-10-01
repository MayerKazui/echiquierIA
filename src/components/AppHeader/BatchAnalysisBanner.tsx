import React from 'react';
import { CheckCircle2, History } from 'lucide-react';
import type { BatchView } from '../../hooks/useBatchAnalysis';
import { AnalysisProgressBar } from './AnalysisProgressBar';

interface BatchAnalysisBannerProps {
  batch: BatchView;
  /** Continues a queue left by a previous visit. */
  onResume: () => void;
  /** Stops the queue (running, waiting or left by a previous visit). */
  onCancel: () => void;
  /** Closes the summary of a finished queue. */
  onDismiss: () => void;
}

const games = (count: number) => `${count} partie${count > 1 ? 's' : ''}`;

const BUTTON =
  'shrink-0 px-2.5 py-1 rounded-lg border font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

/**
 * Shown above the app while several games are analysed in the background: where the queue is, a way to stop it,
 * the offer to resume a queue a previous visit left, and the summary once it is done.
 */
export const BatchAnalysisBanner: React.FC<BatchAnalysisBannerProps> = ({ batch, onResume, onCancel, onDismiss }) => {
  const { status, total, done, failed, failedLabels, current, fraction } = batch;
  if (status === 'idle') return null;

  const settled = done + failed;
  const remaining = Math.max(0, total - settled);

  if (status === 'finished') {
    return (
      <div className="bg-emerald-950/50 border-b border-emerald-900/60 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs">
        <p role="status" className="flex items-center gap-2 text-emerald-200 font-medium min-w-0">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <span>
            Analyse en lot terminée : {games(done)} analysée{done > 1 ? 's' : ''}
            {failed > 0 && <span className="text-amber-300"> · {games(failed)} en échec</span>}.
            <span className="hidden sm:inline"> Elles sont dans « Mes parties ».</span>
            {failedLabels.length > 0 && (
              <span className="block text-[11px] font-normal text-amber-300/90">
                Non analysée{failedLabels.length > 1 ? 's' : ''} : {failedLabels.join(' ; ')}.
              </span>
            )}
          </span>
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className={`${BUTTON} border-emerald-700/60 text-emerald-100 hover:bg-emerald-900/50`}
        >
          Fermer
        </button>
      </div>
    );
  }

  if (status === 'interrupted') {
    return (
      <div className="bg-amber-950/40 border-b border-amber-900/60 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs">
        <p role="status" className="flex items-center gap-2 text-amber-200 font-medium min-w-0">
          <History className="w-4 h-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span>
            Une analyse en lot a été interrompue : {games(remaining)} restante{remaining > 1 ? 's' : ''} sur {total}.
          </span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResume}
            className={`${BUTTON} border-amber-600/70 bg-amber-900/40 text-amber-50 hover:bg-amber-800/50`}
          >
            Reprendre
          </button>
          <button
            type="button"
            onClick={onCancel}
            className={`${BUTTON} border-amber-800/60 text-amber-200 hover:bg-amber-900/40`}
          >
            Abandonner
          </button>
        </div>
      </div>
    );
  }

  const percent = Math.round(Math.min(1, (settled + fraction) / Math.max(1, total)) * 100);
  const isPaused = status === 'paused';
  return (
    <div className="bg-indigo-950/60 border-b border-indigo-900/60 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs">
      <p role="status" className="flex items-center gap-2 text-indigo-200 font-medium min-w-0">
        {!isPaused && (
          <span
            className="w-3.5 h-3.5 shrink-0 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin"
            aria-hidden="true"
          />
        )}
        <span className="flex flex-col min-w-0">
          <span className="truncate">
            {isPaused
              ? `Analyse en lot en pause pendant votre analyse : ${games(remaining)} restante${remaining > 1 ? 's' : ''}, elle reprend ensuite.`
              : `Analyse en lot : partie ${Math.min(total, settled + 1)} sur ${total}`}
            {failed > 0 && <span className="text-amber-300"> · {games(failed)} en échec</span>}
          </span>
          {!isPaused && current && (
            <span className="truncate text-[11px] font-normal text-indigo-300/80">{current.label}</span>
          )}
        </span>
      </p>
      <div className="flex items-center gap-3 flex-1 sm:flex-none justify-end">
        <AnalysisProgressBar
          progress={{ current: percent, total: 100 }}
          label="Progression de l'analyse en lot"
          className="w-full sm:w-48"
        />
        <button
          type="button"
          onClick={onCancel}
          className={`${BUTTON} border-indigo-700/60 text-indigo-100 hover:bg-indigo-900/60`}
        >
          Annuler
        </button>
      </div>
    </div>
  );
};
