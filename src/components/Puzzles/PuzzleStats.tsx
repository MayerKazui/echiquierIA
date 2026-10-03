import React, { useState } from 'react';
import { Puzzle as PuzzleIcon } from 'lucide-react';
import {
  MAX_LOG,
  MIN_THEME_ATTEMPTS,
  MONTH_MS,
  WEEK_MS,
  overallTally,
  themeTallies,
  type PuzzleHistory,
  type ThemeTally,
} from '../../utils/puzzleHistory';
import { themeLabel } from '../../utils/puzzleThemes';
import { formatDuration } from '../../utils/woodpecker';

interface PuzzleStatsProps {
  history: PuzzleHistory;
  now: number;
  /** Starts puzzles on a theme. */
  onPractice: (theme: string) => void;
  /** Forgets everything played. */
  onClear: () => void;
}

/** Rows shown in the table by theme. */
const MAX_THEMES = 12;
/** Sessions listed. */
const MAX_SESSIONS_SHOWN = 10;

/** The periods the success rates can be told over (`undefined`: every attempt kept). */
const PERIODS: ReadonlyArray<{ id: string; label: string; ms: number | undefined }> = [
  { id: 'week', label: '7 jours', ms: WEEK_MS },
  { id: 'month', label: '30 jours', ms: MONTH_MS },
  { id: 'all', label: 'Tout', ms: undefined },
];

const SESSION_LABELS = { free: 'Séance libre', review: 'Puzzles ratés' } as const;

const percent = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)} %`);

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-100 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function ThemeRow({ tally, onPractice }: { tally: ThemeTally; onPractice: (theme: string) => void }) {
  const rate = tally.rate ?? 0;
  return (
    <li className="flex flex-col gap-1 rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-100">{themeLabel(tally.theme)}</span>
        <span className="flex items-center gap-3">
          <span className="text-slate-300 tabular-nums">
            {percent(tally.rate)}{' '}
            <span className="text-slate-400">
              ({tally.wins} sur {tally.attempts})
            </span>
          </span>
          <button
            type="button"
            onClick={() => onPractice(tally.theme)}
            aria-label={`S’entraîner : ${themeLabel(tally.theme)}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 font-semibold text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            <PuzzleIcon className="w-3 h-3" aria-hidden="true" /> S’entraîner
          </button>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`Réussite : ${themeLabel(tally.theme)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(rate * 100)}
        className="h-1.5 rounded-full bg-slate-800 overflow-hidden"
      >
        <div
          className={`${rate >= 0.7 ? 'bg-emerald-500' : rate >= 0.5 ? 'bg-amber-400' : 'bg-rose-500'} h-full rounded-full`}
          style={{ width: `${rate * 100}%` }}
        />
      </div>
    </li>
  );
}

/** What the player did with the puzzles: the totals, how they do by theme, and their latest sessions. */
export const PuzzleStats: React.FC<PuzzleStatsProps> = ({ history, now, onPractice, onClear }) => {
  const [periodId, setPeriodId] = useState('month');
  const [isConfirming, setIsConfirming] = useState(false);
  const { log, sessions } = history;
  if (log.length === 0 && sessions.length === 0) {
    return (
      <div className="flex flex-col gap-1.5 text-center py-8 px-2">
        <p className="text-sm font-semibold text-slate-200">Pas encore de puzzle joué</p>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Chaque puzzle joué (en séance libre ou en Woodpecker) est noté ici : la réussite par thème, les séances, et ce
          qui revient le plus souvent.
        </p>
      </div>
    );
  }

  const period = PERIODS.find((p) => p.id === periodId) ?? PERIODS[1];
  const periodLabel = period.id === 'all' ? 'depuis le début' : period.label;
  const overall = overallTally(log, now, period.ms);
  const week = overallTally(log, now, WEEK_MS);
  const tallies = themeTallies(log, now, period.ms);
  const enough = tallies
    .filter((t) => t.attempts >= MIN_THEME_ATTEMPTS)
    .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0) || b.attempts - a.attempts)
    .slice(0, MAX_THEMES);
  const few = tallies.filter((t) => t.attempts < MIN_THEME_ATTEMPTS);
  const recent = [...sessions].reverse().slice(0, MAX_SESSIONS_SHOWN);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-2">
        <Tile
          label="Puzzles joués"
          value={String(log.length)}
          hint={
            log.length >= MAX_LOG
              ? `les ${MAX_LOG.toLocaleString('fr-FR')} derniers`
              : `${history.seen.size} différents`
          }
        />
        <Tile
          label={period.id === 'all' ? 'Réussite' : `Réussite, ${period.label}`}
          value={percent(overall.rate)}
          hint={`${overall.attempts} puzzles`}
        />
        <Tile label="Cette semaine" value={String(week.attempts)} hint={`${percent(week.rate)} réussis`} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-300">Réussite par thème, {periodLabel}</p>
          <div role="group" aria-label="Période" className="flex gap-1.5">
            {PERIODS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={periodId === id}
                onClick={() => setPeriodId(id)}
                className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  periodId === id
                    ? 'bg-indigo-600/30 border-indigo-500 text-white'
                    : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {enough.length > 0 ? (
          <ul aria-label="Réussite par thème" className="flex flex-col gap-1.5">
            {enough.map((tally) => (
              <ThemeRow key={tally.theme} tally={tally} onPractice={onPractice} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">
            Aucun thème n’a encore {MIN_THEME_ATTEMPTS} puzzles joués : la réussite n’a de sens qu’à partir de là.
          </p>
        )}
        {few.length > 0 && (
          <p className="text-[11px] text-slate-400">
            Pas encore assez de puzzles :{' '}
            {few
              .slice(0, 8)
              .map((t) => `${themeLabel(t.theme)} (${t.attempts})`)
              .join(', ')}
            {few.length > 8 ? '…' : '.'}
          </p>
        )}
      </div>

      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-300">Dernières séances</p>
          <ol aria-label="Dernières séances" className="flex flex-col gap-1.5">
            {recent.map((session) => {
              const perMinute =
                session.elapsedMs > 0
                  ? (session.total / (session.elapsedMs / 60_000)).toFixed(1).replace('.', ',')
                  : null;
              return (
                <li
                  key={session.at}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-slate-100">
                    {new Date(session.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-slate-300">{SESSION_LABELS[session.mode]}</span>
                  <span className="text-slate-200 tabular-nums">
                    {session.solved} sur {session.total}
                    {session.total > 0 && ` (${Math.round((session.solved / session.total) * 100)} %)`}
                  </span>
                  <span className="text-slate-400 tabular-nums">
                    {formatDuration(session.elapsedMs)}
                    {perMinute && ` · ${perMinute} par minute`}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="flex flex-col items-start gap-2 border-t border-slate-800/80 pt-3">
        {isConfirming ? (
          <>
            <p role="alert" className="text-xs text-amber-200">
              Cela efface les statistiques, les séances et la liste des puzzles déjà joués (ils pourront revenir). Avec
              la synchronisation Google Drive, l’effacement gagne aussi vos autres appareils. Vos puzzles ratés à revoir
              et votre lot Woodpecker ne changent pas.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsConfirming(false);
                  onClear();
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                Effacer l’historique
              </button>
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
              >
                Garder
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setIsConfirming(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            Effacer l’historique
          </button>
        )}
      </div>
    </div>
  );
};
