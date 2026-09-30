import React from 'react';
import { AlertTriangle, Award, BookOpen, CheckCircle2, Lightbulb, Sparkles, Target, XCircle } from 'lucide-react';
import { PlayerStats } from '../../types/chess';

interface BreakdownTile {
  label: string;
  icon: React.ElementType;
  /** Color classes of the title (written out in full so Tailwind can detect them). */
  titleClass: string;
  /** Color classes of the white / black counters. */
  whiteClass: string;
  blackClass: string;
  value: (stats: PlayerStats) => number;
}

const NEUTRAL = { whiteClass: 'text-slate-200', blackClass: 'text-slate-400' };

const TILES: BreakdownTile[] = [
  { label: 'Théorie', icon: BookOpen, titleClass: 'text-violet-400', ...NEUTRAL, value: (s) => s.book ?? 0 },
  { label: 'Brillants', icon: Sparkles, titleClass: 'text-cyan-400', ...NEUTRAL, value: (s) => s.brilliant },
  { label: 'Meilleurs', icon: CheckCircle2, titleClass: 'text-emerald-400', ...NEUTRAL, value: (s) => s.best },
  { label: 'Excellents', icon: Award, titleClass: 'text-sky-400', ...NEUTRAL, value: (s) => s.excellent + s.good },
  { label: 'Imprécisions', icon: Lightbulb, titleClass: 'text-yellow-300', ...NEUTRAL, value: (s) => s.inaccuracies },
  { label: 'Erreurs', icon: AlertTriangle, titleClass: 'text-amber-400', ...NEUTRAL, value: (s) => s.mistakes },
  {
    label: 'Gaffes',
    icon: XCircle,
    titleClass: 'text-rose-400',
    whiteClass: 'text-rose-400',
    blackClass: 'text-rose-400',
    value: (s) => s.blunders + s.missedWins,
  },
];

/** White | Black counters for each move classification. */
export const MoveBreakdown: React.FC<{ statsWhite: PlayerStats; statsBlack: PlayerStats }> = ({
  statsWhite,
  statsBlack,
}) => (
  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
      <Target className="w-4 h-4 text-indigo-400" />
      Répartition Détaillée des Coups
    </h3>

    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
      {TILES.map(({ label, icon: Icon, titleClass, whiteClass, blackClass, value }) => (
        <div
          key={label}
          className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between"
        >
          <div className={`flex items-center gap-1.5 ${titleClass} font-semibold mb-2`}>
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </div>
          <div className="flex justify-between items-baseline font-mono font-bold">
            <span className={whiteClass}>{value(statsWhite)}</span>
            <span className="text-slate-500">|</span>
            <span className={blackClass}>{value(statsBlack)}</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1">Blancs | Noirs</span>
        </div>
      ))}
    </div>
  </div>
);
