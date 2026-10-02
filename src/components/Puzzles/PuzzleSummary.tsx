import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { themeLabel } from '../../utils/puzzleThemes';
import { formatClock } from '../../utils/puzzleRun';
import type { RunReport } from './PuzzleRun';

interface PuzzleSummaryProps {
  report: RunReport;
  /** Missed puzzles are kept to be reviewed (not in a review session, where they already are). */
  keepsMissed: boolean;
  onAgain: () => void;
  onClose: () => void;
}

const REASONS: Record<RunReport['reason'], string> = {
  done: 'Plus de puzzle à jouer.',
  time: 'Le temps est écoulé.',
  quit: 'Séance arrêtée.',
};

/** The end of a run: the score, the time, and the puzzles that were missed. */
export const PuzzleSummary: React.FC<PuzzleSummaryProps> = ({ report, keepsMissed, onAgain, onClose }) => {
  const solved = report.results.filter((r) => r.isSuccess).length;
  const total = report.results.length;
  const missed = report.results.filter((r) => !r.isSuccess);
  const minutes = report.elapsedMs / 60_000;
  const perMinute = minutes > 0 ? (total / minutes).toFixed(1).replace('.', ',') : '0';

  return (
    <div className="flex flex-col gap-4">
      <div role="status">
        <p className="text-sm font-semibold text-slate-100">
          {REASONS[report.reason]} {solved} réussi{solved > 1 ? 's' : ''} sur {total}
          {total > 0 && ` (${Math.round((solved / total) * 100)} %)`}.
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Durée : {formatClock(report.elapsedMs)} · rythme : {perMinute} par minute.
        </p>
        {keepsMissed && missed.length > 0 && (
          <p className="text-xs text-slate-400 mt-1">
            Les puzzles ratés reviennent demain ; les réussis reviennent après 1, 3 puis 7 jours.
          </p>
        )}
      </div>

      {missed.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-slate-300">Puzzles ratés</p>
          <ul className="flex flex-col gap-1.5">
            {missed.map(({ puzzle }) => (
              <li
                key={puzzle.id}
                className="flex items-start gap-2 rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2 text-xs"
              >
                <XCircle className="w-4 h-4 shrink-0 text-rose-400" aria-label="Raté" />
                <span className="text-slate-300">
                  {puzzle.rating} Elo
                  <span className="text-slate-400">
                    {' · '}
                    {puzzle.themes.slice(0, 4).map(themeLabel).join(', ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missed.length === 0 && total > 0 && (
        <p className="flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Aucun puzzle raté.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAgain}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          Nouvelle séance
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          Fermer
        </button>
      </div>
    </div>
  );
};
