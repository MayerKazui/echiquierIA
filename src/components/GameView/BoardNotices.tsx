import React from 'react';
import { Check, FlaskConical, Undo2, X } from 'lucide-react';

/** Shown after a Lichess import (or fallback to the manual paste page). */
export const LichessNotice: React.FC<{ onDismiss: () => void }> = ({ onDismiss }) => (
  <div
    role="status"
    className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-200 text-xs shadow-lg animate-in fade-in slide-in-from-top-2"
  >
    <div className="flex items-center gap-2">
      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
      <span>
        <strong>Partie ouverte sur Lichess !</strong> Votre partie a été importée automatiquement dans l'autre onglet
        avec l'analyse, le replay et les statistiques. Le texte PGN complet est également dans votre presse-papier.
      </span>
    </div>
    <button
      onClick={onDismiss}
      aria-label="Fermer la notification"
      className="p-1 hover:text-white text-indigo-400 text-xs ml-2 cursor-pointer"
    >
      ✕
    </button>
  </div>
);

interface SandboxBannerProps {
  moves: Array<{ san: string }>;
  onUndo: () => void;
  onExit: () => void;
}

/** Free exploration mode banner ("Et si j'avais joué... ?"). */
export const SandboxBanner: React.FC<SandboxBannerProps> = ({ moves, onUndo, onExit }) => (
  <div
    role="region"
    aria-label="Exploration libre"
    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs shadow-lg animate-in fade-in slide-in-from-top-2"
  >
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-6 h-6 rounded-md bg-amber-500/25 flex items-center justify-center text-amber-300 shrink-0">
        <FlaskConical className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <div className="font-bold text-amber-300 flex items-center gap-1.5">
          <span>Exploration libre</span>
          <span className="text-[10px] font-normal text-amber-200/80 hidden sm:inline">
            (« Et si j'avais joué... ? »)
          </span>
        </div>
        <div className="font-mono text-slate-200 text-[11px] truncate">
          {moves.map((m, idx) => `${idx + 1}. ${m.san}`).join(' ')}
        </div>
      </div>
    </div>

    <div className="flex items-center gap-1.5 shrink-0 ml-2">
      <button
        onClick={onUndo}
        aria-label="Annuler le dernier coup exploré"
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
        title="Annuler le dernier coup exploré"
      >
        <Undo2 className="w-3.5 h-3.5 text-amber-400" />
        <span className="hidden sm:inline">Annuler</span>
      </button>

      <button
        onClick={onExit}
        aria-label="Quitter l'exploration libre"
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600/25 hover:bg-rose-600/35 text-rose-200 border border-rose-500/40 text-xs font-semibold transition-colors cursor-pointer"
        title="Revenir à la position de la partie (Touche Échap)"
      >
        <X className="w-3.5 h-3.5" />
        <span>Quitter</span>
      </button>
    </div>
  </div>
);
