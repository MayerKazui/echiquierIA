import React, { useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import type { BoardTheme } from '../../types/ui';
import { OpeningExplorer } from './OpeningExplorer';
import { OpeningRepertoire } from './OpeningRepertoire';

interface OpeningsProps {
  onClose: () => void;
  /** Opens the import of online games (offered while there is no game of the player to count). */
  onImport: () => void;
  boardTheme?: BoardTheme;
}

type View = 'explorer' | 'repertoire';

const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'explorer', label: 'Explorateur' },
  { value: 'repertoire', label: 'Mes ouvertures' },
];

/** "Ouvertures": the tree of the openings to walk through, and the player's own repertoire. */
export const Openings: React.FC<OpeningsProps> = ({ onClose, onImport, boardTheme }) => {
  const [view, setView] = useState<View>('explorer');
  // Kept here so that the repertoire can send the player to a position of the explorer
  const [sans, setSans] = useState<string[]>([]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 max-w-4xl w-full mx-auto max-h-[90dvh]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Ouvertures</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Parcourez l&apos;arbre des ouvertures coup par coup, et voyez celles que vous jouez vraiment.
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
        {view === 'explorer' ? (
          <OpeningExplorer sans={sans} onSansChange={setSans} onImport={onImport} boardTheme={boardTheme} />
        ) : (
          <OpeningRepertoire
            onImport={onImport}
            onShowLine={(line) => {
              setSans(line);
              setView('explorer');
            }}
          />
        )}
      </div>
    </div>
  );
};
