import React from 'react';
import type { PuzzleIndex } from '../../utils/puzzleData';
import { ratingCount, themeCount } from '../../services/puzzleBook';
import { REVIEW_SIZE, summarizeEntries, type PuzzleEntry } from '../../utils/puzzleReview';
import { TIMER_OPTIONS, rangeLabel, suggestRange, toFilter, type EloRange } from '../../utils/puzzleRun';
import { describeDelay } from '../../utils/spacedRepetition';
import { EloRangeSelect } from './EloRangeSelect';
import { groupThemes, themeLabel } from '../../utils/puzzleThemes';

export interface PuzzleChoice {
  range: EloRange;
  themes: string[];
  match: 'any' | 'all';
  /** Minutes of a timed run, null for no limit. */
  minutes: number | null;
}

interface PuzzleSetupProps {
  index: PuzzleIndex;
  choice: PuzzleChoice;
  onChoiceChange: (choice: PuzzleChoice) => void;
  /** The player's rating in games, null when not known. */
  elo: number | null;
  entries: ReadonlyMap<string, PuzzleEntry>;
  now: number;
  /** How many different puzzles the player has played (they come last in a session). */
  playedCount: number;
  onStart: () => void;
  /** Starts a review of the missed puzzles; `isEarly` also takes the ones that are not due yet. */
  onReview: (isEarly: boolean) => void;
}

const CHIP =
  'px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const CHIP_ON = 'bg-indigo-600/30 border-indigo-500 text-white';
const CHIP_OFF = 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80';
const PRIMARY =
  'px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-xs font-semibold text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

const formatCount = (count: number) => count.toLocaleString('fr-FR');

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-100 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

/** The choice of a session of puzzles: ratings, themes, timer; and where the missed puzzles stand. */
export const PuzzleSetup: React.FC<PuzzleSetupProps> = ({
  index,
  choice,
  onChoiceChange,
  elo,
  entries,
  now,
  playedCount,
  onStart,
  onReview,
}) => {
  const { range, themes, match, minutes } = choice;
  const filter = toFilter(range, themes, match);
  const maxRating = filter.maxRating;
  const total = ratingCount(index, filter.minRating, maxRating);
  const counts = themes.map((theme) => themeCount(index, theme, filter.minRating, maxRating));
  // The index counts by theme, not by combination: it can only tell when there is surely nothing
  const isEmpty =
    total === 0 || (themes.length > 0 && (match === 'all' ? counts.includes(0) : counts.every((c) => c === 0)));
  const review = summarizeEntries(entries.values(), now);
  const suggestion = elo === null ? null : suggestRange(elo);

  const change = (next: Partial<PuzzleChoice>) => onChoiceChange({ ...choice, ...next });
  const toggleTheme = (theme: string) =>
    change({ themes: themes.includes(theme) ? themes.filter((t) => t !== theme) : [...themes, theme] });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-300">Niveau des puzzles (Elo Lichess)</p>
        <EloRangeSelect range={range} onChange={(next) => change({ range: next })} total={total} />
        {suggestion && (
          <p className="text-[11px] text-slate-400">
            Votre Elo en partie : {elo}.{' '}
            <button
              type="button"
              onClick={() => change({ range: suggestion })}
              className="underline text-indigo-300 hover:text-indigo-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
            >
              Prendre {rangeLabel(suggestion)}
            </button>
            . Les Elo des puzzles ne sont pas ceux des parties : ajustez selon la difficulté ressentie.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-300">
            Thèmes {themes.length > 0 ? `(${themes.length} choisi${themes.length > 1 ? 's' : ''})` : '(tous)'}
          </p>
          {themes.length > 0 && (
            <button
              type="button"
              onClick={() => change({ themes: [] })}
              className="text-[11px] underline text-indigo-300 hover:text-indigo-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
            >
              Tous les thèmes
            </button>
          )}
        </div>
        {groupThemes(Object.keys(index.themes)).map((group, i) => (
          <details key={group.id} open={i === 0 || group.themes.some((t) => themes.includes(t))}>
            <summary className="text-xs text-slate-300 cursor-pointer py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded">
              {group.label}
            </summary>
            <div role="group" aria-label={group.label} className="flex flex-wrap gap-2 pt-1.5 pb-2">
              {group.themes.map((theme) => {
                const isOn = themes.includes(theme);
                const count = themeCount(index, theme, filter.minRating, maxRating);
                return (
                  <button
                    key={theme}
                    type="button"
                    aria-pressed={isOn}
                    disabled={count === 0 && !isOn}
                    onClick={() => toggleTheme(theme)}
                    className={`${CHIP} ${isOn ? CHIP_ON : CHIP_OFF} disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {themeLabel(theme)} <span className="text-slate-400 tabular-nums">({formatCount(count)})</span>
                  </button>
                );
              })}
            </div>
          </details>
        ))}
        {themes.length > 1 && (
          <div role="group" aria-label="Combinaison des thèmes" className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={match === 'any'}
              onClick={() => change({ match: 'any' })}
              className={`${CHIP} ${match === 'any' ? CHIP_ON : CHIP_OFF}`}
            >
              L’un des thèmes
            </button>
            <button
              type="button"
              aria-pressed={match === 'all'}
              onClick={() => change({ match: 'all' })}
              className={`${CHIP} ${match === 'all' ? CHIP_ON : CHIP_OFF}`}
            >
              Tous les thèmes à la fois
            </button>
          </div>
        )}
      </div>

      <div role="group" aria-label="Durée de la séance" className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-300">Durée</p>
        <div className="flex flex-wrap gap-2">
          {TIMER_OPTIONS.map((option) => (
            <button
              key={option ?? 'none'}
              type="button"
              aria-pressed={minutes === option}
              onClick={() => change({ minutes: option })}
              className={`${CHIP} ${minutes === option ? CHIP_ON : CHIP_OFF}`}
            >
              {option === null ? 'Sans limite' : `${option} min`}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          Un puzzle raté ne coûte rien que le temps passé : le suivant arrive tout de suite.
          {playedCount > 0 &&
            ` Vous avez déjà joué ${playedCount.toLocaleString('fr-FR')} puzzle${playedCount > 1 ? 's' : ''} : ils reviennent en dernier.`}
        </p>
      </div>

      <div className="flex flex-col items-start gap-2 border-t border-slate-800/80 pt-3">
        <button type="button" onClick={onStart} disabled={isEmpty} className={PRIMARY}>
          Commencer
        </button>
        {isEmpty && (
          <p role="status" className="text-xs text-slate-300">
            Aucun puzzle pour ce choix : élargissez l’Elo ou changez de thème.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-800/80 pt-3">
        <p className="text-xs font-semibold text-slate-300">Puzzles ratés</p>
        {review.due + review.scheduled + review.mastered === 0 ? (
          <p className="text-xs text-slate-400">
            Aucun pour l’instant. Un puzzle raté est gardé ici et revient après 1, 3 puis 7 jours.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Tile label="À revoir" value={review.due} hint="de retour aujourd’hui" />
              <Tile
                label="Plus tard"
                value={review.scheduled}
                hint={review.nextDueAt === null ? undefined : `le prochain ${describeDelay(review.nextDueAt, now)}`}
              />
              <Tile label="Maîtrisés" value={review.mastered} hint="retrouvés 4 fois de suite" />
            </div>
            {review.due > 0 ? (
              <button type="button" onClick={() => onReview(false)} className={`${PRIMARY} self-start`}>
                Revoir mes puzzles ratés ({Math.min(review.due, REVIEW_SIZE)})
              </button>
            ) : (
              review.scheduled > 0 && (
                <button type="button" onClick={() => onReview(true)} className={`${PRIMARY} self-start`}>
                  Réviser en avance
                </button>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
};
