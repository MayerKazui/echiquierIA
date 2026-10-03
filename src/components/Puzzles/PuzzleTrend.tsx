import React from 'react';
import { MIN_WEEK_ATTEMPTS, weeklyTallies, type PuzzleAttempt } from '../../utils/puzzleHistory';

interface PuzzleTrendProps {
  log: readonly PuzzleAttempt[];
  now: number;
}

const WIDTH = 600;
const HEIGHT = 150;
const PAD = { left: 34, right: 10, top: 10, bottom: 22 };

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const day = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/** The success rate week after week, drawn through the weeks with enough puzzles played to mean something. */
export const PuzzleTrend: React.FC<PuzzleTrendProps> = ({ log, now }) => {
  const weeks = weeklyTallies(log, now);
  const counted = weeks.flatMap((week, i) =>
    week.rate !== null && week.attempts >= MIN_WEEK_ATTEMPTS ? [{ ...week, rate: week.rate, i }] : []
  );
  if (counted.length < 2) {
    return (
      <p className="text-xs text-slate-400">
        La courbe apparaît quand deux semaines ont au moins {MIN_WEEK_ATTEMPTS} puzzles joués.
      </p>
    );
  }
  const x = (i: number) => PAD.left + (i / (weeks.length - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (percent: number) => PAD.top + (1 - percent / 100) * (HEIGHT - PAD.top - PAD.bottom);
  // A line is cut where a week was skipped or too thin, rather than drawn across it
  const runs: (typeof counted)[] = [];
  for (const week of counted) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1].i === week.i - 1) run.push(week);
    else runs.push([week]);
  }
  const first = counted[0];
  const last = counted[counted.length - 1];
  const label = `Réussite aux puzzles, semaine après semaine : ${number.format(first.rate * 100)} % la semaine du ${day(first.start)}, ${number.format(last.rate * 100)} % la semaine du ${day(last.start)}.`;

  return (
    <figure className="m-0">
      <svg role="img" aria-label={label} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto">
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-800" />
            <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
              {tick}
            </text>
          </g>
        ))}
        {runs
          .filter((run) => run.length > 1)
          .map((run) => (
            <polyline
              key={run[0].i}
              points={run.map((w) => `${x(w.i).toFixed(1)},${y(w.rate * 100).toFixed(1)}`).join(' ')}
              fill="none"
              className="stroke-indigo-400"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          ))}
        {counted.map((w) => (
          <circle key={w.i} cx={x(w.i)} cy={y(w.rate * 100)} r="3.5" className="fill-slate-200">
            <title>{`Semaine du ${day(w.start)} : ${number.format(w.rate * 100)} % (${w.wins} sur ${w.attempts})`}</title>
          </circle>
        ))}
        <text x={PAD.left} y={HEIGHT - 6} className="fill-slate-400 text-[10px]">
          {day(weeks[0].start)}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" className="fill-slate-400 text-[10px]">
          {day(now)}
        </text>
      </svg>
      <figcaption className="text-[11px] text-slate-400">
        Un point par semaine d’au moins {MIN_WEEK_ATTEMPTS} puzzles joués (survolez-le pour le détail).
      </figcaption>
    </figure>
  );
};
