import React from 'react';
import { FAULT_KINDS, FAULT_KIND_TEXT, type FaultKind } from '../../utils/faultKinds';
import type { GamePhase } from '../../utils/phaseStats';
import { SESSION_SIZE, describeDelay, summarize, type Card, type TrainingFilter } from '../../utils/spacedRepetition';
import type { TrainingPosition } from '../../utils/trainingPositions';

export const PHASE_OPTIONS: ReadonlyArray<{ id: GamePhase; label: string }> = [
  { id: 'opening', label: 'Ouverture' },
  { id: 'middlegame', label: 'Milieu de jeu' },
  { id: 'endgame', label: 'Finale' },
];

interface TrainingSetupProps {
  positions: readonly TrainingPosition[];
  cards: ReadonlyMap<string, Card>;
  now: number;
  filter: TrainingFilter;
  onFilterChange: (filter: TrainingFilter) => void;
  /** Starts a session; `isEarly` also takes positions that are not due yet. */
  onStart: (isEarly: boolean) => void;
}

const CHIP =
  'px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const PRIMARY =
  'px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-xs font-semibold text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-100 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

/** Where the replayed positions stand, the themes to work on, and the start of a session. */
export const TrainingSetup: React.FC<TrainingSetupProps> = ({
  positions,
  cards,
  now,
  filter,
  onFilterChange,
  onStart,
}) => {
  const summary = summarize(positions, cards, now, filter);
  const available = summary.due + summary.fresh;
  const sessionSize = Math.min(SESSION_SIZE, available);
  // What a chip would bring, the other group's choice being kept
  const countWith = (next: TrainingFilter) => {
    const s = summarize(positions, cards, now, next);
    return s.due + s.fresh;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="À revoir" value={summary.due} hint="déjà ratées, de retour" />
        <Tile label="Nouvelles" value={summary.fresh} hint="jamais rejouées" />
        <Tile
          label="Plus tard"
          value={summary.scheduled}
          hint={summary.nextDueAt === null ? undefined : `la prochaine ${describeDelay(summary.nextDueAt, now)}`}
        />
        <Tile label="Maîtrisées" value={summary.mastered} hint="retrouvées 4 fois de suite" />
      </div>

      <div role="group" aria-label="Type d'erreur" className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-300">Type d&apos;erreur</p>
        <div className="flex flex-wrap gap-2">
          {FAULT_KINDS.map((kind: FaultKind) => {
            const isOn = filter.kinds.has(kind);
            const count = countWith({ ...filter, kinds: new Set([kind]) });
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={isOn}
                title={FAULT_KIND_TEXT[kind].hint}
                onClick={() => onFilterChange({ ...filter, kinds: toggled(filter.kinds, kind) })}
                className={`${CHIP} ${
                  isOn
                    ? 'bg-indigo-600/30 border-indigo-500 text-white'
                    : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                {FAULT_KIND_TEXT[kind].label} <span className="text-slate-400 tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div role="group" aria-label="Phase de la partie" className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-300">Phase de la partie</p>
        <div className="flex flex-wrap gap-2">
          {PHASE_OPTIONS.map(({ id, label }) => {
            const isOn = filter.phases.has(id);
            const count = countWith({ ...filter, phases: new Set([id]) });
            return (
              <button
                key={id}
                type="button"
                aria-pressed={isOn}
                onClick={() => onFilterChange({ ...filter, phases: toggled(filter.phases, id) })}
                className={`${CHIP} ${
                  isOn
                    ? 'bg-indigo-600/30 border-indigo-500 text-white'
                    : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                {label} <span className="text-slate-400 tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400">
          Sans choix, toutes les erreurs sont prises. Les nombres sont les positions à travailler maintenant.
        </p>
      </div>

      <div className="flex flex-col items-start gap-2 border-t border-slate-800/80 pt-3">
        {available > 0 ? (
          <button type="button" onClick={() => onStart(false)} className={PRIMARY}>
            Commencer ({sessionSize} position{sessionSize > 1 ? 's' : ''})
          </button>
        ) : (
          <>
            <p role="status" className="text-xs text-slate-300">
              {summary.scheduled > 0
                ? `Tout est à jour pour ce choix${
                    summary.nextDueAt === null
                      ? ''
                      : ` : la prochaine position revient ${describeDelay(summary.nextDueAt, now)}`
                  }.`
                : 'Aucune position à travailler pour ce choix.'}
            </p>
            {summary.scheduled > 0 && (
              <button type="button" onClick={() => onStart(true)} className={PRIMARY}>
                Réviser en avance
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
