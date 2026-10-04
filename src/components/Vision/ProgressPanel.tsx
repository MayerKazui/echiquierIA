import React from 'react';
import {
  VISION_LEVELS,
  VISION_MODE_LABELS,
  recentAverage,
  recordKey,
  roundsOf,
  type RunEntry,
  type VisionMode,
} from '../../utils/vision';
import { formatScore, plural, type VisionRecords } from './shared';

const MODES: VisionMode[] = ['coordinates', 'blind', 'lines', 'game'];

const WIDTH = 480;
const HEIGHT = 130;
const PAD = { left: 28, right: 10, top: 10, bottom: 20 };
/** How many of the latest rounds make the "recent average". */
const RECENT = 5;

const average = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const day = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/** The top of the vertical axis: the questions of a round and the results of a game have a fixed top. */
const axisTop = (mode: VisionMode, rounds: readonly RunEntry[]): number => {
  if (mode === 'game') return 2;
  if (mode !== 'coordinates') return 5;
  const best = Math.max(0, ...rounds.map((round) => round.score));
  return Math.max(5, Math.ceil(best / 5) * 5);
};

interface CurveProps {
  mode: VisionMode;
  title: string;
  rounds: readonly RunEntry[];
  best: number;
}

/** The score of each round, oldest first, and the record as a dashed line. */
const Curve: React.FC<CurveProps> = ({ mode, title, rounds, best }) => {
  const top = axisTop(mode, rounds);
  const x = (i: number) => PAD.left + (i / (rounds.length - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (score: number) => PAD.top + (1 - score / top) * (HEIGHT - PAD.top - PAD.bottom);
  const ticks = mode === 'game' ? [0, 1, 2] : [0, top / 2, top].map(Math.round);
  const first = rounds[0];
  const last = rounds[rounds.length - 1];
  const label = `${title} : ${plural(rounds.length, 'partie', 'parties')}, de ${formatScore(mode, first.score)} le ${day(first.at)} à ${formatScore(mode, last.score)} le ${day(last.at)}. Record : ${formatScore(mode, best)}.`;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto">
      {[...new Set(ticks)].map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-800" />
          <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
            {tick}
          </text>
        </g>
      ))}
      <line
        x1={PAD.left}
        x2={WIDTH - PAD.right}
        y1={y(best)}
        y2={y(best)}
        strokeDasharray="4 4"
        className="stroke-emerald-500/70"
      />
      <polyline
        points={rounds.map((round, i) => `${x(i).toFixed(1)},${y(round.score).toFixed(1)}`).join(' ')}
        fill="none"
        className="stroke-indigo-400"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {rounds.map((round, i) => (
        <circle key={`${round.at}:${i}`} cx={x(i)} cy={y(round.score)} r="3" className="fill-slate-200">
          <title>{`${day(round.at)} : ${formatScore(mode, round.score)}`}</title>
        </circle>
      ))}
      <text x={PAD.left} y={HEIGHT - 5} className="fill-slate-400 text-[10px]">
        {day(first.at)}
      </text>
      <text x={WIDTH - PAD.right} y={HEIGHT - 5} textAnchor="end" className="fill-slate-400 text-[10px]">
        {day(last.at)}
      </text>
    </svg>
  );
};

/** How the latest rounds compare with the ones before them, in a few words. */
function trendText(mode: VisionMode, rounds: readonly RunEntry[]): string | null {
  const recent = recentAverage(rounds, RECENT);
  if (recent === null) return null;
  const before = recentAverage(rounds.slice(0, -RECENT), RECENT);
  const unit = mode === 'game' ? ' sur 2' : mode === 'coordinates' ? '' : ` sur 5`;
  const now = `Moyenne des ${RECENT} dernières parties : ${average.format(recent)}${unit}`;
  if (before === null) return `${now}.`;
  const diff = recent - before;
  if (Math.abs(diff) < 0.05) return `${now}, comme les ${RECENT} d’avant (${average.format(before)}).`;
  return `${now}, contre ${average.format(before)} pour les ${RECENT} d’avant (${diff > 0 ? 'en progrès' : 'en recul'}).`;
}

interface ProgressPanelProps {
  records: VisionRecords;
}

/** "Progression": for each exercise and level played, the score of every round, and the record. */
export const ProgressPanel: React.FC<ProgressPanelProps> = ({ records }) => {
  if (records === null) return <p className="text-xs text-slate-400">Chargement des scores…</p>;
  const cards = MODES.flatMap((mode) =>
    VISION_LEVELS[mode].flatMap((level) => {
      const record = records.get(recordKey(mode, level.id));
      return record ? [{ mode, level, record }] : [];
    })
  );
  if (cards.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        Rien à montrer pour l’instant : jouez une série dans un des exercices, et son score apparaîtra ici. La courbe se
        dessine à partir de deux séries.
      </p>
    );
  }
  return (
    <ul className="grid gap-3 lg:grid-cols-2" aria-label="Progression par exercice et par niveau">
      {cards.map(({ mode, level, record }) => {
        const rounds = roundsOf(records, record.key);
        const title = `${VISION_MODE_LABELS[mode]} · ${level.label}`;
        const trend = trendText(mode, rounds);
        return (
          <li key={record.key} className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
              <p className="text-xs text-slate-300 tabular-nums">
                Record : {formatScore(mode, record.best)} · {plural(record.runs, 'partie', 'parties')}
              </p>
            </div>
            {rounds.length >= 2 ? (
              <Curve mode={mode} title={title} rounds={rounds} best={record.best} />
            ) : (
              <p className="text-xs text-slate-400">
                {rounds.length === 1
                  ? 'La courbe apparaît à la deuxième série.'
                  : 'Les séries jouées avant la courbe n’y sont pas : elle se dessine à partir des prochaines.'}
              </p>
            )}
            {trend && <p className="text-[11px] text-slate-400">{trend}</p>}
            {rounds.length >= 2 && (
              <p className="text-[11px] text-slate-400">
                Les {plural(rounds.length, 'dernière série', 'dernières séries')} ; le trait vert est votre record.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
};
