import React, { useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import type { BoardTheme } from '../../types/ui';
import type { PlayStart } from '../../utils/playGame';
import { OpeningDrill } from './OpeningDrill';
import { OpeningExplorer } from './OpeningExplorer';
import { OpeningRepertoire } from './OpeningRepertoire';

export type View = 'explorer' | 'repertoire' | 'drill';

interface OpeningsProps {
  onClose: () => void;
  /** Opens the import of online games (offered while there is no game of the player to count). */
  onImport: () => void;
  /** Starts a game against Stockfish from a position of the explorer. */
  onPlay?: (start: PlayStart) => void;
  boardTheme?: BoardTheme;
  /** What to show first (the plan sends the player to a position of the explorer). */
  start?: { view: View; sans: string[] };
}

export const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'explorer', label: 'Explorateur' },
  { value: 'repertoire', label: 'Mes ouvertures' },
  { value: 'drill', label: "S'entraîner" },
];

/** "Ouvertures": the tree of the openings to walk through, the player's own repertoire, and training on it. */
export const Openings: React.FC<OpeningsProps> = ({ onClose, onImport, boardTheme, start, onPlay }) => {
  const [view, setView] = useState<View>(start?.view ?? 'explorer');
  // Kept here so that the repertoire can send the player to a position of the explorer
  const [sans, setSans] = useState<string[]>(start?.sans ?? []);
  const showInExplorer = (line: string[]) => {
    setSans(line);
    setView('explorer');
  };

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 w-full mx-auto max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] ${
        view === 'repertoire' ? 'max-w-4xl' : 'max-w-[min(96vw,84rem)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Ouvertures</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Parcourez l&apos;arbre des ouvertures coup par coup, voyez celles que vous jouez vraiment et révisez vos
              lignes et vos sorties de théorie.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div role="group" aria-label="Vue" className="flex flex-wrap gap-2">
        {VIEWS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => setView(value)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              view === value
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="region"
        aria-label="Contenu des ouvertures"
        tabIndex={0}
        className="overflow-y-auto min-h-0 pr-1 flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
      >
        {view === 'explorer' && (
          <OpeningExplorer
            sans={sans}
            onSansChange={setSans}
            onImport={onImport}
            onPlay={onPlay}
            boardTheme={boardTheme}
          />
        )}
        {view === 'repertoire' && <OpeningRepertoire onImport={onImport} onShowLine={showInExplorer} />}
        {view === 'drill' && <OpeningDrill onImport={onImport} onShowLine={showInExplorer} boardTheme={boardTheme} />}
      </div>
    </div>
  );
};
