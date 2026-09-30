import React from 'react';
import { Clock } from 'lucide-react';
import { PlayerStats } from '../../types/chess';

interface PlayerAccuracyCardProps {
  /** "Joueur Blancs" / "Joueur Noirs" */
  roleLabel: string;
  name: string;
  stats: PlayerStats;
}

const Metric: React.FC<{ label: string; value: number; valueClass: string }> = ({ label, value, valueClass }) => (
  <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/60">
    <span className="text-slate-400 block text-[10px]">{label}</span>
    <span className={`font-mono font-bold ${valueClass} text-sm`}>{value}</span>
  </div>
);

/** Global accuracy, blunder/mistake/best counts and time management of one player. */
export const PlayerAccuracyCard: React.FC<PlayerAccuracyCardProps> = ({ roleLabel, name, stats }) => (
  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
    <div className="flex items-center justify-between mb-3">
      <div>
        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">{roleLabel}</span>
        <h3 className="text-base font-bold text-slate-100 truncate">{name}</h3>
      </div>
      <div className="text-right">
        <span className="text-2xl font-black font-mono text-slate-100">{stats.accuracy}%</span>
        <span className="text-[10px] text-slate-400 block">Précision globale</span>
      </div>
    </div>

    {/* Precision Bar */}
    <div className="w-full bg-slate-800 rounded-full h-2 mb-4 overflow-hidden">
      <div
        className="bg-emerald-400 h-full rounded-full transition-all duration-500"
        style={{ width: `${stats.accuracy}%` }}
      />
    </div>

    {/* Quick Metrics */}
    <div className="grid grid-cols-3 gap-2 text-center text-xs">
      <Metric label="Gaffes" value={stats.blunders + stats.missedWins} valueClass="text-rose-400" />
      <Metric label="Erreurs" value={stats.mistakes} valueClass="text-amber-400" />
      <Metric label="Meilleurs" value={stats.best + stats.brilliant} valueClass="text-emerald-400" />
    </div>

    {/* Time Management Metrics */}
    {stats.avgThinkTimeSeconds !== undefined && (
      <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>Gestion du temps :</span>
        </span>
        <span className="font-mono font-bold text-slate-200">
          ~{stats.avgThinkTimeSeconds}s / coup
          {stats.longThinksCount ? ` · ${stats.longThinksCount} longue(s)` : ''}
          {stats.rushedMovesCount ? (
            <span className="text-rose-400 font-semibold"> · {stats.rushedMovesCount} précipité(s) ⚡</span>
          ) : (
            ''
          )}
        </span>
      </div>
    )}
  </div>
);
