import React, { useState } from 'react';
import { Puzzle } from 'lucide-react';
import { usePuzzleHistory } from '../../hooks/usePuzzleHistory';
import { MIN_THEME_ATTEMPTS, MONTH_MS, overallTally, themeTallies, weakestTheme } from '../../utils/puzzleHistory';
import { themeLabel } from '../../utils/puzzleThemes';

interface PuzzleSectionProps {
  /** Opens the puzzles on themes. Without it the section only tells. */
  onPuzzles?: (themes: string[]) => void;
}

const percent = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)} %`);

/** "Vos puzzles": how the player does at the puzzles of the last 30 days, and the theme to work on. Nothing without any. */
export const PuzzleSection: React.FC<PuzzleSectionProps> = ({ onPuzzles }) => {
  const { data } = usePuzzleHistory();
  const [now] = useState(() => Date.now());
  if (data.status !== 'ready') return null;
  const { log } = data.history;
  const month = overallTally(log, now, MONTH_MS);
  if (month.attempts === 0) return null;
  const weakest = weakestTheme(themeTallies(log, now, MONTH_MS));

  return (
    <section aria-label="Vos puzzles" className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold text-slate-100">Vos puzzles</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">Sur les 30 derniers jours, indépendamment des parties.</p>
      </div>
      <p className="text-xs text-slate-300">
        {month.attempts} puzzle{month.attempts > 1 ? 's' : ''} joué{month.attempts > 1 ? 's' : ''},{' '}
        {percent(month.rate)} réussis du premier coup.
        {weakest
          ? ` Le thème le plus fragile : ${themeLabel(weakest.theme)}, ${percent(weakest.rate)} sur ${weakest.attempts} puzzles.`
          : ` Aucun thème n’a encore ${MIN_THEME_ATTEMPTS} puzzles joués pour dire où vous perdez des points.`}
      </p>
      {weakest && onPuzzles && (
        <div>
          <button
            type="button"
            onClick={() => onPuzzles([weakest.theme])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            <Puzzle className="w-3.5 h-3.5" aria-hidden="true" />
            Puzzles : {themeLabel(weakest.theme)}
          </button>
        </div>
      )}
    </section>
  );
};
