import React from 'react';
import { Trophy } from 'lucide-react';
import { PhaseStat, PhaseStats } from '../../utils/phaseStats';

interface PhaseCardProps {
  title: string;
  range: string;
  description: string;
  stat: PhaseStat;
  /** Shown instead of the accuracy bars when no move was played in this phase. */
  emptyMessage?: string;
}

const AccuracyBar: React.FC<{ label: string; accuracy: number | null; barClass: string }> = ({
  label,
  accuracy,
  barClass,
}) => (
  <div>
    <div className="flex justify-between items-center text-[11px] mb-1">
      <span className="text-slate-300 font-medium">{label}</span>
      <span className="font-mono font-bold text-slate-100">{accuracy !== null ? `${accuracy}%` : '-'}</span>
    </div>
    <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
      <div className={`${barClass} h-full rounded-full`} style={{ width: `${accuracy || 0}%` }} />
    </div>
  </div>
);

const PhaseCard: React.FC<PhaseCardProps> = ({ title, range, description, stat, emptyMessage }) => (
  <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between gap-3">
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-bold text-slate-200 text-sm">{title}</span>
        <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full font-mono">{range}</span>
      </div>
      <p className="text-[11px] text-slate-400">{description}</p>
    </div>

    {emptyMessage && stat.totalMoves === 0 ? (
      <div className="py-4 text-center text-slate-400 text-[11px] italic">{emptyMessage}</div>
    ) : (
      <div className="space-y-2">
        <AccuracyBar label="Blancs" accuracy={stat.whiteAccuracy} barClass="bg-indigo-400" />
        <AccuracyBar label="Noirs" accuracy={stat.blackAccuracy} barClass="bg-emerald-400" />
      </div>
    )}

    <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
      <span>Gaffes / Fautes :</span>
      <span className="font-mono font-bold text-slate-300">
        {stat.totalMoves > 0
          ? `${stat.whiteBlunders + stat.whiteMistakes} (B) / ${stat.blackBlunders + stat.blackMistakes} (N)`
          : '-'}
      </span>
    </div>
  </div>
);

/** Accuracy and faults per phase of the game (opening, middlegame, endgame). */
export const PhaseBreakdown: React.FC<{ phaseStats: PhaseStats }> = ({ phaseStats }) => (
  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
    <div className="flex items-center justify-between flex-wrap gap-2">
      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
        <Trophy className="w-4 h-4 text-amber-400" />
        Analyse par Phase de Jeu
      </h3>
      <span className="text-xs text-slate-400">Précision & fautes réparties par étape</span>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
      <PhaseCard
        title="Ouverture"
        range="Coups 1 à 12"
        description="Développement des pièces, contrôle du centre et roque."
        stat={phaseStats.opening}
      />
      <PhaseCard
        title="Milieu de Jeu"
        range="Coups 13 à 30"
        description="Calculs tactiques, plans stratégiques et attaques de roque."
        stat={phaseStats.middlegame}
        emptyMessage="Partie conclue avant le milieu de jeu"
      />
      <PhaseCard
        title="Finale"
        range="Coups 31+"
        description="Promotion de pions, technique de roi actif et conversion."
        stat={phaseStats.endgame}
        emptyMessage="Finale non atteinte dans cette partie"
      />
    </div>
  </div>
);
