import React from 'react';
import { formatPlayedDate } from '../../services/gameImport';
import type { ProfileGame } from '../../utils/weaknessProfile';

interface TrendChartProps {
  games: ProfileGame[];
}

const WIDTH = 600;
const HEIGHT = 150;
const PAD = { left: 34, right: 10, top: 10, bottom: 22 };
/** Games averaged for the smoothed line. */
const SMOOTHING = 5;

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Accuracy of each game over time, with the average of the last few games drawn through it. */
export const TrendChart: React.FC<TrendChartProps> = ({ games }) => {
  if (games.length < 2) {
    return <p className="text-xs text-slate-400">Il faut au moins deux parties pour tracer l&apos;évolution.</p>;
  }
  const values = games.map((g) => g.accuracy);
  const low = Math.max(0, Math.floor((Math.min(...values) - 5) / 5) * 5);
  const high = Math.min(100, Math.ceil((Math.max(...values) + 5) / 5) * 5);
  const x = (i: number) => PAD.left + (i / (games.length - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - low) / Math.max(1, high - low)) * (HEIGHT - PAD.top - PAD.bottom);

  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const smoothed = values
    .map((_, i) => {
      const slice = values.slice(Math.max(0, i - SMOOTHING + 1), i + 1);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    })
    .map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');

  const first = games[0];
  const last = games[games.length - 1];
  const label = `Précision de vos ${games.length} parties, de la plus ancienne (${number.format(first.accuracy)} %) à la plus récente (${number.format(last.accuracy)} %).`;

  return (
    <figure className="m-0">
      <svg role="img" aria-label={label} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto">
        {[low, (low + high) / 2, high].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-800" />
            <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
              {number.format(tick)}
            </text>
          </g>
        ))}
        <polyline points={points} fill="none" className="stroke-slate-500" strokeWidth="1" />
        <polyline
          points={smoothed}
          fill="none"
          className="stroke-indigo-400"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {games.map((g, i) => (
          <circle key={g.id} cx={x(i)} cy={y(g.accuracy)} r="3" className="fill-slate-300">
            <title>{`Contre ${g.opponent}, ${formatPlayedDate(g.date)} : ${number.format(g.accuracy)} %`}</title>
          </circle>
        ))}
        <text x={PAD.left} y={HEIGHT - 6} className="fill-slate-400 text-[10px]">
          {formatPlayedDate(first.date)}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" className="fill-slate-400 text-[10px]">
          {formatPlayedDate(last.date)}
        </text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-slate-300" /> Une partie
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-4 h-0.5 bg-indigo-400" /> Moyenne des {SMOOTHING} dernières
        </span>
      </figcaption>
    </figure>
  );
};
