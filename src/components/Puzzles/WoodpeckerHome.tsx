import React, { useState } from 'react';
import { Trophy } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { ratingCount } from '../../services/puzzleBook';
import type { PuzzleIndex } from '../../utils/puzzleData';
import {
  DEFAULT_RANGE,
  normalizeRange,
  rangeLabel,
  suggestRange,
  toFilter,
  type EloRange,
} from '../../utils/puzzleRun';
import {
  DEFAULT_LOT_SIZE,
  LOT_SIZES,
  bestCycle,
  compareCycle,
  formatDuration,
  nextCycleNumber,
  type ArchivedLot,
  type WoodpeckerSet,
} from '../../utils/woodpecker';
import { EloRangeSelect } from './EloRangeSelect';

interface WoodpeckerHomeProps {
  index: PuzzleIndex;
  /** The lot the player works on, null when there is none yet. */
  set: WoodpeckerSet | null;
  /** The player's rating in games, null when not known. */
  elo: number | null;
  /** The lot is being drawn. */
  isCreating: boolean;
  onCreate: (range: EloRange, size: number) => void;
  onStart: () => void;
  /** The lots the player left, with the cycles done on them. */
  archive: readonly ArchivedLot[];
  /** Takes up a lot that was left, with its cycles; resolves with false when it cannot be played again. */
  onResume: (lot: ArchivedLot) => Promise<boolean>;
  /** Leaves the lot for a new one: its cycles are kept in the lots left, the cycle in progress is lost. */
  onReset: () => void;
}

const CHIP =
  'px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const CHIP_ON = 'bg-indigo-600/30 border-indigo-500 text-white';
const CHIP_OFF = 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80';
const PRIMARY =
  'px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-xs font-semibold text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';
const SECONDARY =
  'px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';
const LINK =
  'underline text-indigo-300 hover:text-indigo-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded';

const toNumber = (raw: string): number | undefined => {
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-100 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** "−1 min 10 s" / "+25 s": how a cycle compares with the one before. */
export function formatDelta(deltaMs: number): string {
  if (Math.abs(deltaMs) < 1000) return 'à la seconde près, le même temps';
  return `${deltaMs < 0 ? '−' : '+'}${formatDuration(Math.abs(deltaMs))}`;
}

/** Lots shown in the list of the lots left. */
const MAX_LOTS_SHOWN = 5;

/** The lots the player left: when, how big, and how the times went from the first cycle to the best one. */
function LeftLots({
  archive,
  current,
  onResume,
}: {
  archive: readonly ArchivedLot[];
  /** The lot in hand, which taking one up again puts away. */
  current: WoodpeckerSet | null;
  onResume: (lot: ArchivedLot) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  if (archive.length === 0) return null;
  const resume = async (lot: ArchivedLot) => {
    setConfirming(null);
    setFailed(!(await onResume(lot)));
  };
  const lots = [...archive].reverse();
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-slate-300">Lots précédents</p>
      <ul aria-label="Lots précédents" className="flex flex-col gap-1.5">
        {lots.slice(0, MAX_LOTS_SHOWN).map((lot) => {
          const first = lot.cycles[0];
          const best = bestCycle(lot.cycles);
          return (
            <li
              key={lot.createdAt}
              className="flex flex-col gap-0.5 rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2 text-xs"
            >
              <span className="font-semibold text-slate-100">
                {lot.size} puzzle{lot.size > 1 ? 's' : ''}, {rangeLabel(lot.range)} Elo
                <span className="font-normal text-slate-400">
                  {' '}
                  · tiré le {new Date(lot.createdAt).toLocaleDateString('fr-FR')}
                </span>
              </span>
              <span className="text-slate-300">
                {lot.cycles.length} cycle{lot.cycles.length > 1 ? 's' : ''}
                {first && best && lot.cycles.length > 1
                  ? ` : de ${formatDuration(first.totalMs)} au premier à ${formatDuration(best.totalMs)} au meilleur`
                  : first
                    ? ` : ${formatDuration(first.totalMs)}`
                    : ''}
              </span>
              {lot.puzzles && lot.puzzles.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {confirming === lot.createdAt ? (
                    <>
                      <span role="alert" className="text-amber-200">
                        {current && current.cycles.length > 0
                          ? 'Le lot actuel passe dans les lots précédents ; son cycle en cours est perdu.'
                          : 'Le lot actuel n’a aucun cycle terminé : il est remplacé et ses puzzles sont perdus.'}
                      </span>
                      <button type="button" onClick={() => void resume(lot)} className={PRIMARY}>
                        Reprendre ce lot
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className={SECONDARY}>
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => (current ? setConfirming(lot.createdAt) : void resume(lot))}
                      className={SECONDARY}
                    >
                      Reprendre ce lot
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {failed && (
        <p role="alert" className="text-xs text-rose-300">
          Ce lot ne peut plus être repris : ses puzzles sont abîmés.
        </p>
      )}
      {lots.length > MAX_LOTS_SHOWN && (
        <p className="text-[11px] text-slate-400">et {lots.length - MAX_LOTS_SHOWN} de plus anciens.</p>
      )}
    </div>
  );
}

/** The Woodpecker lot: set one up, then play the cycles one after the other, each against the clock of the last. */
export const WoodpeckerHome: React.FC<WoodpeckerHomeProps> = ({
  index,
  set,
  elo,
  isCreating,
  archive,
  onResume,
  onCreate,
  onStart,
  onReset,
}) => {
  const [from, setFrom] = usePersistentState<number>('woodpecker_from', DEFAULT_RANGE.from, toNumber);
  const [to, setTo] = usePersistentState<number>('woodpecker_to', DEFAULT_RANGE.to, toNumber);
  const [size, setSize] = usePersistentState<number>('woodpecker_size', DEFAULT_LOT_SIZE, (raw) => {
    const value = Number(raw);
    return LOT_SIZES.includes(value) ? value : undefined;
  });
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const range = normalizeRange({ from, to });
  const setRange = (next: EloRange) => {
    setFrom(next.from);
    setTo(next.to);
  };

  if (set) {
    const cycles = set.cycles;
    const last = cycles.at(-1);
    const best = bestCycle(cycles);
    const progress = set.progress;
    const number = nextCycleNumber(set);
    const total = set.puzzles.length;
    return (
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-sm font-semibold text-slate-100">
            Votre lot : {total} puzzle{total > 1 ? 's' : ''}, {rangeLabel(set.range)} Elo
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Tiré le {new Date(set.createdAt).toLocaleDateString('fr-FR')}. C’est toujours le même : chaque cycle le
            reprend en entier, les puzzles ratés revenant en fin de cycle jusqu’à être réussis.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Tile label="Cycles terminés" value={String(cycles.length)} />
          <Tile
            label="Dernier cycle"
            value={last ? formatDuration(last.totalMs) : '–'}
            hint={last ? `${percent(last.firstTry, last.size)} % du premier coup` : undefined}
          />
          <Tile
            label="Meilleur cycle"
            value={best ? formatDuration(best.totalMs) : '–'}
            hint={best ? `cycle ${best.number}` : undefined}
          />
        </div>

        <div className="flex flex-col items-start gap-2">
          <button type="button" onClick={onStart} className={PRIMARY}>
            {progress ? `Reprendre le cycle ${number}` : `Commencer le cycle ${number}`}
          </button>
          {progress && (
            <p className="text-xs text-slate-400">
              Déjà {formatDuration(progress.elapsedMs)} sur ce cycle, {progress.queue.length} puzzle
              {progress.queue.length > 1 ? 's' : ''} à résoudre. Le chronomètre repart où il s’était arrêté.
            </p>
          )}
          {!progress && last && (
            <p className="text-xs text-slate-400">
              À battre : {formatDuration(last.totalMs)} (cycle {last.number}).
            </p>
          )}
        </div>

        {cycles.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-slate-300">Cycles</p>
            <ol aria-label="Cycles terminés" className="flex flex-col gap-1.5">
              {[...cycles].reverse().map((cycle) => {
                const comparison = compareCycle(cycles, cycle.number);
                return (
                  <li
                    key={cycle.number}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-slate-100">Cycle {cycle.number}</span>
                    <span className="text-slate-200 tabular-nums">{formatDuration(cycle.totalMs)}</span>
                    <span className="text-slate-400">
                      {cycle.firstTry} sur {cycle.size} du premier coup
                    </span>
                    {comparison && (
                      <span className={comparison.deltaMs <= 0 ? 'text-emerald-300' : 'text-amber-300'}>
                        {formatDelta(comparison.deltaMs)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <LeftLots
          archive={archive.filter((lot) => lot.createdAt !== set.createdAt)}
          current={set}
          onResume={onResume}
        />

        <div className="flex flex-col items-start gap-2 border-t border-slate-800/80 pt-3">
          {isConfirmingReset ? (
            <>
              <p role="alert" className="text-xs text-amber-200">
                Un nouveau lot remplace celui-ci : ses puzzles et le cycle en cours sont perdus, ses cycles terminés
                restent dans les lots précédents. Continuer ?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingReset(false);
                    onReset();
                  }}
                  className={PRIMARY}
                >
                  Effacer et changer de lot
                </button>
                <button type="button" onClick={() => setIsConfirmingReset(false)} className={SECONDARY}>
                  Garder ce lot
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setIsConfirmingReset(true)} className={SECONDARY}>
              Nouveau lot
            </button>
          )}
        </div>
      </div>
    );
  }

  const filter = toFilter(range, [], 'any');
  const available = ratingCount(index, filter.minRating, filter.maxRating);
  const suggestion = elo === null ? null : suggestRange(elo);
  const sizes = LOT_SIZES.filter((option) => option <= available);
  // Every size is too large for a narrow range: the whole range is the lot
  const chosen = Math.min(size, available);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2.5">
        <Trophy className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-slate-300">
          La méthode Woodpecker : un lot de puzzles, toujours le même, que l’on refait en entier cycle après cycle, de
          plus en plus vite. Le temps du cycle est chronométré (la pause ne compte pas) ; un puzzle raté revient en fin
          de cycle jusqu’à être réussi, et ce temps-là compte aussi.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-300">Niveau du lot (Elo Lichess)</p>
        <EloRangeSelect range={range} onChange={setRange} total={available} />
        {suggestion && (
          <p className="text-[11px] text-slate-400">
            Votre Elo en partie : {elo}.{' '}
            <button type="button" onClick={() => setRange(suggestion)} className={LINK}>
              Prendre {rangeLabel(suggestion)}
            </button>
            . Pour la méthode, on prend plutôt des puzzles un peu en dessous de son niveau : ils doivent devenir des
            réflexes.
          </p>
        )}
      </div>

      <div role="group" aria-label="Taille du lot" className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-300">Puzzles par cycle</p>
        <div className="flex flex-wrap gap-2">
          {sizes.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={chosen === option}
              onClick={() => setSize(option)}
              className={`${CHIP} ${chosen === option ? CHIP_ON : CHIP_OFF}`}
            >
              {option}
            </button>
          ))}
        </div>
        {available > 0 && available < LOT_SIZES[0] && (
          <p className="text-[11px] text-slate-400">
            Cette tranche n’a que {available} puzzles : le lot les prendra tous.
          </p>
        )}
      </div>

      <div className="flex flex-col items-start gap-2 border-t border-slate-800/80 pt-3">
        <button
          type="button"
          onClick={() => onCreate(range, chosen)}
          disabled={available === 0 || isCreating}
          className={PRIMARY}
        >
          {isCreating ? 'Tirage du lot…' : 'Créer mon lot'}
        </button>
        {available === 0 && (
          <p role="status" className="text-xs text-slate-300">
            Aucun puzzle dans cette tranche : élargissez l’Elo.
          </p>
        )}
        <p className="text-[11px] text-slate-400">
          Le lot est tiré une fois et gardé dans ce navigateur (et dans la sauvegarde) : il ne change plus ensuite.
        </p>
      </div>

      <LeftLots archive={archive} current={null} onResume={onResume} />
    </div>
  );
};
