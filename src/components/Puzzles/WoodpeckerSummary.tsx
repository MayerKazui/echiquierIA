import React from 'react';
import { CheckCircle2, Trophy } from 'lucide-react';
import { compareCycle, formatDuration, type WoodpeckerCycle } from '../../utils/woodpecker';

interface WoodpeckerSummaryProps {
  /** The cycles of the lot, the one just finished included. */
  cycles: readonly WoodpeckerCycle[];
  /** The number of the cycle just finished. */
  number: number;
  onNext: () => void;
  onHome: () => void;
}

const BUTTON =
  'px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

/** The end of a cycle: the total time, and how it compares with the cycle before. */
export const WoodpeckerSummary: React.FC<WoodpeckerSummaryProps> = ({ cycles, number, onNext, onHome }) => {
  const cycle = cycles.find((c) => c.number === number);
  if (!cycle) return null;
  const comparison = compareCycle(cycles, number);
  const retried = cycle.size - cycle.firstTry;
  const firstTryText = `${cycle.firstTry} sur ${cycle.size} du premier coup (${Math.round((cycle.firstTry / Math.max(1, cycle.size)) * 100)} %)`;

  return (
    <div className="flex flex-col gap-4">
      <div role="status" className="flex flex-col gap-1.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          Cycle {cycle.number} terminé en {formatDuration(cycle.totalMs)}.
        </p>
        <p className="text-xs text-slate-300">
          {firstTryText}
          {retried > 0 && ` ; ${retried} repris en fin de cycle jusqu’à être réussi${retried > 1 ? 's' : ''}`}.
        </p>
        {comparison ? (
          <p className={`text-xs ${comparison.deltaMs <= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
            {Math.abs(comparison.deltaMs) < 1000
              ? 'Le même temps que le cycle précédent.'
              : `${formatDuration(Math.abs(comparison.deltaMs))} ${comparison.deltaMs < 0 ? 'de moins' : 'de plus'} que le cycle précédent (${Math.round(Math.abs(comparison.ratio) * 100)} % ${comparison.deltaMs < 0 ? 'plus vite' : 'plus lent'}).`}
          </p>
        ) : (
          <p className="text-xs text-slate-400">
            C’est le premier cycle : son temps sert de référence pour les suivants.
          </p>
        )}
        {comparison?.isBest && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
            <Trophy className="w-3.5 h-3.5" aria-hidden="true" /> Votre meilleur cycle jusqu’ici.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onNext} className={`${BUTTON} bg-indigo-600 hover:bg-indigo-500 text-white`}>
          Commencer le cycle {number + 1}
        </button>
        <button
          type="button"
          onClick={onHome}
          className={`${BUTTON} bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200`}
        >
          Retour au lot
        </button>
      </div>
    </div>
  );
};
