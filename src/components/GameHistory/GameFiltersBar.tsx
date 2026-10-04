import React, { useId, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import {
  ACCURACY_LABELS,
  COLOR_LABELS,
  NO_FILTERS,
  PERIOD_LABELS,
  RESULT_LABELS,
  SORT_LABELS,
  activeFilterCount,
  type AccuracyFilter,
  type ColorFilter,
  type FilterChoices,
  type HistoryFilters,
  type PeriodFilter,
  type ResultFilter,
  type SortKey,
} from '../../utils/gameFilters';

interface GameFiltersBarProps {
  filters: HistoryFilters;
  onChange: (filters: HistoryFilters) => void;
  choices: FilterChoices;
  /** The tags in use, the most used first (the list of tags is hidden when there are none). */
  tags: readonly string[];
}

/** The most opponents the list offers: past that the search box is the way. */
const MAX_OPPONENTS = 200;

const CONTROL =
  'w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label htmlFor={id} className="text-[11px] font-semibold text-slate-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function Options<T extends string>({ labels }: { labels: Record<T, string> }) {
  return (
    <>
      {(Object.keys(labels) as T[]).map((value) => (
        <option key={value} value={value}>
          {labels[value]}
        </option>
      ))}
    </>
  );
}

/** The search box, the sort and the filters of "Mes parties": the filters fold away, the search stays in sight. */
export const GameFiltersBar: React.FC<GameFiltersBarProps> = ({ filters, onChange, choices, tags }) => {
  const [isOpen, setIsOpen] = useState(false);
  const id = useId();
  const panelId = `${id}-panel`;
  const count = activeFilterCount(filters);
  const set = <K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-col gap-2" role="search" aria-label="Rechercher dans mes parties">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search
            className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filters.query}
            onChange={(event) => set('query', event.target.value)}
            aria-label="Rechercher une partie"
            placeholder="Adversaire, ouverture, note, étiquette…"
            className={`${CONTROL} pl-8`}
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filters.sort}
            onChange={(event) => set('sort', event.target.value as SortKey)}
            aria-label="Trier les parties"
            className={`${CONTROL} sm:w-auto`}
          >
            <Options labels={SORT_LABELS} />
          </select>
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className={`flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              count > 0
                ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200'
                : 'bg-slate-950 border-slate-700 text-slate-300 hover:text-slate-100'
            }`}
          >
            Filtres
            {count > 0 && (
              <span className="px-1.5 rounded-full bg-indigo-500 text-white text-[10px]">
                {count}
                <span className="sr-only"> actif{count > 1 ? 's' : ''}</span>
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          id={panelId}
          className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-xl bg-slate-950/60 border border-slate-800 p-3"
        >
          <Field id={`${id}-result`} label="Résultat">
            <select
              id={`${id}-result`}
              value={filters.result}
              onChange={(event) => set('result', event.target.value as ResultFilter)}
              className={CONTROL}
            >
              <Options labels={RESULT_LABELS} />
            </select>
          </Field>
          <Field id={`${id}-color`} label="Couleur">
            <select
              id={`${id}-color`}
              value={filters.color}
              onChange={(event) => set('color', event.target.value as ColorFilter)}
              className={CONTROL}
            >
              <Options labels={COLOR_LABELS} />
            </select>
          </Field>
          <Field id={`${id}-accuracy`} label="Précision">
            <select
              id={`${id}-accuracy`}
              value={filters.accuracy}
              onChange={(event) => set('accuracy', event.target.value as AccuracyFilter)}
              className={CONTROL}
            >
              <Options labels={ACCURACY_LABELS} />
            </select>
          </Field>
          <Field id={`${id}-opponent`} label="Adversaire">
            <select
              id={`${id}-opponent`}
              value={filters.opponent}
              onChange={(event) => set('opponent', event.target.value)}
              className={CONTROL}
            >
              <option value="">Tous les adversaires</option>
              {choices.opponents.slice(0, MAX_OPPONENTS).map(({ name, count: games }) => (
                <option key={name} value={name}>
                  {name} ({games})
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${id}-opening`} label="Ouverture">
            <select
              id={`${id}-opening`}
              value={filters.opening}
              onChange={(event) => set('opening', event.target.value)}
              className={CONTROL}
            >
              <option value="">Toutes les ouvertures</option>
              {choices.openings.map(({ name, count: games }) => (
                <option key={name} value={name}>
                  {name} ({games})
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${id}-period`} label="Période">
            <select
              id={`${id}-period`}
              value={filters.period}
              onChange={(event) => set('period', event.target.value as PeriodFilter)}
              className={CONTROL}
            >
              <Options labels={PERIOD_LABELS} />
            </select>
          </Field>
          {filters.period === 'custom' && (
            <>
              <Field id={`${id}-from`} label="Du">
                <input
                  id={`${id}-from`}
                  type="date"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(event) => set('from', event.target.value)}
                  className={CONTROL}
                />
              </Field>
              <Field id={`${id}-to`} label="Au">
                <input
                  id={`${id}-to`}
                  type="date"
                  value={filters.to}
                  min={filters.from || undefined}
                  onChange={(event) => set('to', event.target.value)}
                  className={CONTROL}
                />
              </Field>
            </>
          )}
          {tags.length > 0 && (
            <Field id={`${id}-tag`} label="Étiquette">
              <select
                id={`${id}-tag`}
                value={filters.tag}
                onChange={(event) => set('tag', event.target.value)}
                className={CONTROL}
              >
                <option value="">Toutes les étiquettes</option>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="col-span-2 sm:col-span-3 flex justify-end">
            <button
              type="button"
              onClick={() => onChange({ ...NO_FILTERS, sort: filters.sort })}
              disabled={count === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <X className="w-3 h-3" aria-hidden="true" />
              Réinitialiser les filtres
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
