import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Flame,
  Play,
  RotateCcw,
  Shield,
  ShieldAlert,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { EnemyThreatRadarResult } from '../../utils/enemyThreatRadar';

interface EnemyThreatBannerProps {
  threatData: EnemyThreatRadarResult | null;
  isLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  isSimulatingThreat: boolean;
  onToggleSimulateThreat: () => void;
  onRecheck?: () => void;
}

export const EnemyThreatBanner: React.FC<EnemyThreatBannerProps> = ({
  threatData,
  isLoading,
  isOpen,
  onClose,
  isSimulatingThreat,
  onToggleSimulateThreat,
}) => {
  if (!isOpen) return null;

  if (isLoading || !threatData) {
    return (
      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900/95 border border-indigo-500/30 text-xs shadow-lg animate-in fade-in">
        <div className="flex items-center gap-2 text-indigo-300">
          <span className="w-3.5 h-3.5 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
          <span>Calcul du Radar de menace ennemie (Simulation Stockfish Null-Move)...</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:text-white text-slate-400 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const { threatSeverity, threatCategory, summaryTitle, detailedDescription, threatMove, hangingPieces } = threatData;

  const isCritical = threatSeverity === 'critical';
  const isHigh = threatSeverity === 'high';

  const borderColor = isCritical
    ? 'border-rose-500/60 bg-rose-950/40'
    : isHigh
    ? 'border-amber-500/60 bg-amber-950/30'
    : 'border-blue-500/40 bg-slate-900/90';

  const badgeColor = isCritical
    ? 'bg-rose-600 text-white shadow-rose-600/30'
    : isHigh
    ? 'bg-amber-500 text-slate-950 font-bold'
    : 'bg-blue-600/30 text-blue-300 border border-blue-500/40';

  return (
    <div
      className={`flex flex-col gap-2 p-3 sm:p-3.5 rounded-xl border ${borderColor} text-xs shadow-xl animate-in fade-in slide-in-from-top-1`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
              isCritical
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : isHigh
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            }`}
          >
            {isCritical ? <AlertOctagon className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          </div>

          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <span>Radar Menace Adverse</span>
              <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">(Si vous passiez votre tour)</span>
            </span>

            <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono tracking-tight shrink-0 shadow-sm ${badgeColor}`}>
              {isCritical ? '⚡ MENACE CRITIQUE' : isHigh ? '⚠️ DANGER ÉLEVÉ' : '🛡️ PRESSION'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {threatMove && (
            <button
              onClick={onToggleSimulateThreat}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-sm ${
                isSimulatingThreat
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
              title="Simuler sur l'échiquier le coup préparé par l'adversaire"
            >
              {isSimulatingThreat ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revenir à la position</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-rose-400" />
                  <span>Simuler le coup ({threatMove.san})</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1 hover:text-white text-slate-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Fermer le radar de menace"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Threat Content */}
      <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-100 text-xs sm:text-sm">{summaryTitle}</span>
          {threatMove && (
            <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 font-mono text-[11px] text-rose-300">
              {threatMove.from} ➔ {threatMove.to}
            </span>
          )}
        </div>

        <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">{detailedDescription}</p>

        {/* Hanging Friendly Pieces Alert */}
        {hangingPieces.length > 0 && (
          <div className="mt-1 pt-1.5 border-t border-slate-800/80 flex items-center gap-2 flex-wrap text-[11px]">
            <span className="text-amber-400 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Pièce(s) amie(s) en prise :</span>
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {hangingPieces.map((h) => (
                <span
                  key={h.square}
                  className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-200 font-mono font-bold text-[10px]"
                >
                  {h.pieceName} en {h.square.toUpperCase()} ({h.attackers.length} attaquants)
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
