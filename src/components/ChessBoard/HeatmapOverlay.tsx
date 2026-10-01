import React from 'react';
import { HeatmapMode } from '../../types/ui';
import { SquareControl } from '../../utils/chessHeatmap';

type ActiveHeatmapMode = Exclude<HeatmapMode, 'none'>;

/** Tooltip text of a square while the space-control overlay is active. */
export function heatmapSquareTitle(square: string, mode: ActiveHeatmapMode, ctrl: SquareControl | undefined): string {
  const name = square.toUpperCase();
  const white = ctrl?.whiteCount || 0;
  const black = ctrl?.blackCount || 0;
  if (mode === 'white') return `${name} : ${white} attaquant(s) blanc(s)`;
  if (mode === 'black') return `${name} : ${black} attaquant(s) noir(s)`;

  const net = ctrl?.net;
  const balance =
    net !== undefined && net > 0
      ? `+${net} Blancs`
      : net !== undefined && net < 0
        ? `${net} Noirs`
        : ctrl?.isContested
          ? 'Contestée'
          : 'Neutre';
  return `${name} : ${white} attaquant(s) blancs vs ${black} noirs (${balance})`;
}

const BADGE_BASE =
  'inline-flex items-center justify-center min-w-[18px] h-[18px] sm:min-w-[22px] sm:h-[22px] px-1 rounded-md bg-slate-950/95 font-mono font-black text-[11px] sm:text-xs shadow-md leading-none border';

// Class names are written out in full so Tailwind can detect them
const SINGLE_SIDE = {
  white: { bg: 'bg-blue-500', badge: 'text-blue-200 border-blue-400/70' },
  black: { bg: 'bg-rose-500', badge: 'text-rose-200 border-rose-400/70' },
};

const Tint: React.FC<{ bg: string; opacity: number; badge: string; label: React.ReactNode }> = ({
  bg,
  opacity,
  badge,
  label,
}) => (
  <>
    <div className={`absolute inset-0 pointer-events-none transition-all duration-200 z-5 ${bg}`} style={{ opacity }} />
    <div
      aria-hidden="true"
      className="absolute bottom-0.5 left-0.5 sm:bottom-1 sm:left-1 pointer-events-none z-25 flex items-center justify-center"
    >
      <span className={`${BADGE_BASE} ${badge}`}>{label}</span>
    </div>
  </>
);

/** Colored tint + attacker count drawn on one square by the space-control overlay. */
export const HeatmapSquareOverlay: React.FC<{ ctrl: SquareControl | undefined; mode: ActiveHeatmapMode }> = ({
  ctrl,
  mode,
}) => {
  if (!ctrl) return null;

  if (mode === 'white' || mode === 'black') {
    const count = mode === 'white' ? ctrl.whiteCount : ctrl.blackCount;
    if (count <= 0) return null;
    const { bg, badge } = SINGLE_SIDE[mode];
    const opacity = Math.min(0.55, 0.18 + Math.min(count, 4) * 0.09);
    return <Tint bg={bg} opacity={opacity} badge={badge} label={count} />;
  }

  // Both (differential) mode
  if (ctrl.whiteCount <= 0 && ctrl.blackCount <= 0) return null;
  const bg = ctrl.net > 0 ? 'bg-blue-500' : ctrl.net < 0 ? 'bg-rose-500' : 'bg-amber-400';
  const opacity =
    ctrl.net !== 0 ? Math.min(0.48, 0.16 + Math.min(Math.abs(ctrl.net), 4) * 0.08) : ctrl.isContested ? 0.22 : 0;
  const badge =
    ctrl.net > 0
      ? 'text-blue-200 border-blue-400/70'
      : ctrl.net < 0
        ? 'text-rose-200 border-rose-400/70'
        : 'text-amber-300 border-amber-400/70';

  return (
    <Tint
      bg={bg}
      opacity={opacity}
      badge={badge}
      label={ctrl.net > 0 ? `+${ctrl.net}` : ctrl.net < 0 ? `${ctrl.net}` : '='}
    />
  );
};
