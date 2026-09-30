import React from 'react';
import { TacticalThreat } from '../../utils/tacticalThreats';
import { getThreatInfo } from './threatInfo';

/** Crosshair drawn around the target square of a tactical threat. */
export const ThreatTarget: React.FC<{ hasHighThreat: boolean }> = ({ hasHighThreat }) => {
  const tick = hasHighThreat ? 'bg-rose-400' : 'bg-amber-400';
  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
      <div
        className={`absolute inset-0.5 sm:inset-1 rounded-md sm:rounded-lg border-2 ${
          hasHighThreat
            ? 'border-rose-500/90 bg-rose-500/15 shadow-[0_0_10px_rgba(244,63,94,0.35)] animate-pulse'
            : 'border-amber-500/90 bg-amber-500/15 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
        }`}
      />
      <div className={`absolute top-0.5 w-2 h-0.5 ${tick}`} />
      <div className={`absolute bottom-0.5 w-2 h-0.5 ${tick}`} />
      <div className={`absolute left-0.5 w-0.5 h-2 ${tick}`} />
      <div className={`absolute right-0.5 w-0.5 h-2 ${tick}`} />
    </div>
  );
};

interface ThreatBadgeProps {
  threat: TacticalThreat;
  onToggle: () => void;
  onHover: () => void;
  onLeave: () => void;
}

/** Small icon in the top-right corner of a threatened square (hover or click for the tooltip). */
export const ThreatBadge: React.FC<ThreatBadgeProps> = ({ threat, onToggle, onHover, onLeave }) => (
  <div
    className="absolute top-0.5 right-0.5 z-30 pointer-events-auto"
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    onMouseEnter={onHover}
    onMouseLeave={onLeave}
  >
    <div
      className={`flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-md text-[11px] sm:text-xs font-bold shadow-lg cursor-pointer transition-transform hover:scale-125 ${
        getThreatInfo(threat.type).badgeClass
      }`}
    >
      {getThreatInfo(threat.type).icon}
    </div>
  </div>
);

/** Positions the tooltip so it never goes out of the board. */
function getTooltipStyle(fileColIdx: number, rankRowIdx: number): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (fileColIdx <= 3) {
    style.left = `${Math.max(2, fileColIdx * 12.5)}%`;
  } else {
    style.right = `${Math.max(2, (7 - fileColIdx) * 12.5)}%`;
  }
  if (rankRowIdx <= 2) {
    style.top = `${(rankRowIdx + 1) * 12.5 + 1.5}%`;
  } else {
    style.bottom = `${(8 - rankRowIdx) * 12.5 + 1.5}%`;
  }
  return style;
}

interface ThreatTooltipProps {
  threat: TacticalThreat;
  fileColIdx: number;
  rankRowIdx: number;
}

export const ThreatTooltip: React.FC<ThreatTooltipProps> = ({ threat, fileColIdx, rankRowIdx }) => {
  const info = getThreatInfo(threat.type);
  return (
    <div
      style={getTooltipStyle(fileColIdx, rankRowIdx)}
      className="absolute z-50 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95 max-w-[290px] sm:max-w-[340px] w-auto min-w-[240px]"
    >
      <div className="flex flex-col gap-1.5 p-3 sm:p-3.5 rounded-xl bg-slate-950/95 border-2 border-slate-700/90 text-white shadow-[0_15px_30px_rgba(0,0,0,0.85)] backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-base sm:text-lg">{info.icon}</span>
            <span className="font-bold text-xs sm:text-sm text-amber-300">{info.title}</span>
          </div>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-bold uppercase tracking-wider shrink-0 ${
              threat.severity === 'high'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}
          >
            {threat.severity === 'high' ? 'Critique' : 'Pression'}
          </span>
        </div>

        <div className="text-xs sm:text-sm font-semibold text-white">{threat.label}</div>

        <div className="text-[11.5px] sm:text-[12.5px] text-slate-300 leading-relaxed font-normal">
          {threat.description}
        </div>
      </div>
    </div>
  );
};
