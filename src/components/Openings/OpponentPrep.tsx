import React, { useRef, useState } from 'react';
import { AlertCircle, Eye, Search } from 'lucide-react';
import type { OpponentSearch, OpponentState } from '../../hooks/useOpponentPrep';
import { oneOf, usePersistentState } from '../../hooks/usePersistentState';
import {
  SOURCE_LABELS,
  SPEED_LABELS,
  SPEED_OPTIONS,
  formatPlayedDate,
  type ImportSource,
  type SpeedFilter,
} from '../../services/gameImport';
import type { BoardTheme } from '../../types/ui';
import { scoreOf } from '../../utils/openingExplorer';
import { toFrenchOpeningName } from '../../utils/openingNames';
import type { ColorPrep, OpponentPrep as Prep, PrepFamily } from '../../utils/opponentPrep';
import { MIN_FAMILY_GAMES } from '../../utils/opponentPrep';
import type { PlayStart } from '../../utils/playGame';
import { OpeningExplorer, type Side } from './OpeningExplorer';
import { SECONDARY, TallyBar, numberedLine, percent } from './shared';

interface OpponentPrepProps {
  state: OpponentState;
  onSearch: (search: OpponentSearch) => void;
  /** Stops the search in progress, or forgets the games read. */
  onReset: () => void;
  /** Opens the import of online games (offered by the explorer while there is none of the player's own). */
  onImport: () => void;
  /** Starts a game against Stockfish from a position of the explorer. */
  onPlay?: (start: PlayStart) => void;
  /** Opens the free analysis on a position of the explorer. */
  onAnalyze?: (fen: string) => void;
  boardTheme?: BoardTheme;
}

const SOURCES: readonly ImportSource[] = ['chesscom', 'lichess'];
const ALL_SPEEDS: readonly SpeedFilter[] = ['all', 'bullet', 'blitz', 'rapid', 'classical', 'daily'];
/** How many games can be read for an opponent. */
export const TARGETS = [50, 100, 200] as const;
/** Under this many games the tendencies are too uncertain to lean on. */
const FEW_GAMES = 20;

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const COLOR_LABELS = { w: 'Blancs', b: 'Noirs' } as const;
const labelOf = (name: string) => (name ? toFrenchOpeningName(name) : 'Sans ouverture reconnue');

/** "3 sept. – 2 oct.", or the single date when all the games are from the same day. */
function spanText(from: number, to: number): string {
  const [a, b] = [formatPlayedDate(from), formatPlayedDate(to)];
  return a === b ? a : `${a} – ${b}`;
}

function Form({ state, onSearch, onReset }: Pick<OpponentPrepProps, 'state' | 'onSearch' | 'onReset'>) {
  const [source, setSource] = usePersistentState<ImportSource>('chess_prep_source', 'chesscom', oneOf(SOURCES));
  const [storedSpeed, setSpeed] = usePersistentState<SpeedFilter>('chess_prep_speed', 'all', oneOf(ALL_SPEEDS));
  const [target, setTarget] = usePersistentState<number>('chess_prep_target', 100, oneOf(TARGETS));
  // The pseudo of the opponent is not kept: it is typed again for each one
  const [username, setUsername] = useState(() => ('search' in state ? state.search.username : ''));
  const speedOptions = SPEED_OPTIONS[source];
  // A speed the site does not have (chess.com has no "classical") counts as "all"
  const speed = speedOptions.some((option) => option.value === storedSpeed) ? storedSpeed : 'all';
  const isLoading = state.status === 'loading';
  const label = SOURCE_LABELS[source];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSearch({ source, username, speed, target });
      }}
      className="flex flex-col gap-3 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800"
    >
      <div role="group" aria-label="Site" className="grid grid-cols-2 gap-2">
        {SOURCES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={source === item}
            onClick={() => setSource(item)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              source === item
                ? 'bg-indigo-600/30 border-indigo-500 text-white ring-1 ring-indigo-500/50'
                : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:border-slate-700'
            }`}
          >
            {SOURCE_LABELS[item]}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          aria-label={`Pseudo de l'adversaire sur ${label}`}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={`Pseudo ${label} de l'adversaire`}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          aria-label="Cadence"
          value={speed}
          onChange={(event) => setSpeed(event.target.value as SpeedFilter)}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {speedOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Nombre de parties à lire"
          value={target}
          onChange={(event) => setTarget(Number(event.target.value))}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {TARGETS.map((size) => (
            <option key={size} value={size}>
              {size} parties
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isLoading || !username.trim()}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-500 text-xs font-semibold text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          <Search className="w-3.5 h-3.5" aria-hidden="true" />
          Préparer
        </button>
      </div>

      {isLoading && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="text-[11px] text-slate-300">
            Lecture des parties de {state.search.username} sur {SOURCE_LABELS[state.search.source]}…{' '}
            {state.fetched > 0 && `${state.fetched} sur ${state.search.target}`}
          </p>
          <button type="button" onClick={onReset} className={`${SECONDARY} ml-auto px-2 py-1`}>
            Annuler
          </button>
        </div>
      )}

      {state.status === 'error' && (
        <div
          role="alert"
          className="flex items-center gap-2 p-2.5 bg-rose-950/30 border border-rose-900/50 rounded-lg text-rose-300 text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      )}
    </form>
  );
}

function FamilyRow({ family, colorGames }: { family: PrepFamily; colorGames: number }) {
  const top = family.variations[0];
  return (
    <li className="flex flex-col gap-0.5 border-t border-slate-800/80 pt-1.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs text-slate-200 min-w-0">
          {family.eco && <span className="text-indigo-300 mr-1">[{family.eco}]</span>}
          {labelOf(family.name)}
          <span className="text-slate-400"> · {percent.format(family.tally.games / colorGames)}</span>
        </span>
        <TallyBar tally={family.tally} />
      </div>
      {top && top.name && top.name !== family.name && (
        <span className="text-[11px] text-slate-400">
          le plus souvent : {toFrenchOpeningName(top.name)} ({top.tally.games})
        </span>
      )}
    </li>
  );
}

/** What the games say of one colour: how the opponent starts, which openings they play, and where it works least. */
function ColorCard({
  prep,
  onShow,
}: {
  prep: ColorPrep;
  /** Shows a line of the explorer for this colour. */
  onShow: (line: string[]) => void;
}) {
  const { color, tally, starts, families, favourite, weakest, strongest, meanBookMoves } = prep;
  const name = COLOR_LABELS[color];
  const isWhite = color === 'w';
  const score = (family: PrepFamily) => percent.format(scoreOf(family.tally) ?? 0);

  return (
    <section
      aria-label={`Avec les ${name}`}
      className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <span
            aria-hidden="true"
            className={`w-3.5 h-3.5 rounded-sm border ${isWhite ? 'bg-slate-100 border-slate-300' : 'bg-slate-900 border-slate-500'}`}
          />
          Avec les {name}
        </h4>
        {tally.games > 0 && <TallyBar tally={tally} />}
      </div>

      {tally.games === 0 ? (
        <p className="text-xs text-slate-400">Aucune partie avec les {name} parmi les parties lues.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {isWhite ? 'Ses premiers coups' : 'Ses réponses'}
            </h5>
            <ul className="flex flex-col gap-1">
              {starts.map((start) => (
                <li key={start.line.join(' ')} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={() => onShow(start.line)}
                    aria-label={`Voir ${numberedLine(start.line)} dans l'explorateur`}
                    className="px-1.5 py-0.5 rounded-md font-mono text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-indigo-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    {numberedLine(start.line)}
                  </button>
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {percent.format(start.tally.games / tally.games)}
                    </span>
                    <TallyBar tally={start.tally} />
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-1.5">
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ses ouvertures</h5>
            <ul className="flex flex-col gap-1.5">
              {families.map((family) => (
                <FamilyRow key={family.name} family={family} colorGames={tally.games} />
              ))}
            </ul>
          </div>

          {favourite && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-2">
              <p className="text-xs text-slate-200 min-w-0 flex-1">
                <span className="font-semibold text-indigo-200">Sa ligne favorite : </span>
                <span className="font-mono">{numberedLine(favourite.sans)}</span>
                <span className="text-slate-400">
                  {' '}
                  ({plural(favourite.tally.games, 'partie', 'parties')} jusque-là)
                </span>
              </p>
              <button
                type="button"
                onClick={() => onShow(favourite.sans)}
                aria-label={`Voir sa ligne favorite avec les ${name} dans l'explorateur`}
                className={`${SECONDARY} px-2 py-1`}
              >
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                Voir
              </button>
            </div>
          )}

          <ul className="flex flex-col gap-1 text-xs text-slate-300 list-disc pl-4 marker:text-slate-600">
            {weakest && (
              <li>
                Ses moins bons résultats : <span className="font-semibold text-rose-300">{labelOf(weakest.name)}</span>{' '}
                ({plural(weakest.tally.games, 'partie', 'parties')}, {score(weakest)} de points) : ses parties passées y
                sont moins réussies, sans que cela dise comment la prochaine ira.
              </li>
            )}
            {strongest && (
              <li>
                Son ouverture la plus solide :{' '}
                <span className="font-semibold text-emerald-300">{labelOf(strongest.name)}</span> (
                {plural(strongest.tally.games, 'partie', 'parties')}, {score(strongest)} de points) : c&apos;est là
                qu&apos;il a le mieux réussi jusqu&apos;ici, sans garantie pour la prochaine.
              </li>
            )}
            {meanBookMoves !== null && (
              <li>Il reste dans la théorie pendant {decimal.format(meanBookMoves)} coups en moyenne.</li>
            )}
            {!weakest && !strongest && (
              <li className="text-slate-400">
                Pas assez de parties dans une même ouverture ({MIN_FAMILY_GAMES} au moins) pour dire laquelle lui
                réussit.
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}

function Summary({ search, prep }: { search: OpponentSearch; prep: Prep }) {
  const details = [
    plural(prep.games, 'partie lue', 'parties lues'),
    prep.from !== null && prep.to !== null ? spanText(prep.from, prep.to) : null,
    prep.rating !== null ? `classement ${prep.rating}` : null,
    prep.speeds.map(({ speed, games }) => `${SPEED_LABELS[speed]} ${games}`).join(', '),
  ].filter(Boolean);

  return (
    <div role="status" className="flex flex-col gap-1">
      <h3 className="text-sm font-bold text-slate-100">
        {search.username} <span className="font-normal text-slate-400">sur {SOURCE_LABELS[search.source]}</span>
      </h3>
      <p className="text-xs text-slate-300">{details.join(' · ')}</p>
      {prep.games > 0 && prep.games < FEW_GAMES && (
        <p className="text-xs text-amber-300">
          Peu de parties lues : ces tendances reposent sur peu d&apos;exemples, prenez-les avec prudence.
        </p>
      )}
    </div>
  );
}

/**
 * "Adversaire": reads the recent games of a chess.com or Lichess account, shows the openings they play with each
 * colour and how those went, and lets the explorer walk through their games next to the player's own.
 */
export const OpponentPrep: React.FC<OpponentPrepProps> = ({
  state,
  onSearch,
  onReset,
  onImport,
  onPlay,
  onAnalyze,
  boardTheme,
}) => {
  const [sans, setSans] = useState<string[]>([]);
  const [side, setSide] = useState<Side>('all');
  const explorerRef = useRef<HTMLHeadingElement>(null);

  const show = (color: 'w' | 'b', line: string[]) => {
    setSide(color);
    setSans(line);
    const heading = explorerRef.current;
    heading?.focus({ preventScroll: true });
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    heading?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-400">
        Entrez le pseudo d&apos;un adversaire : ses dernières parties sont lues directement chez{' '}
        {SOURCE_LABELS.chesscom} ou {SOURCE_LABELS.lichess}, sans passer par un serveur, et ne sont ni analysées ni
        enregistrées. Vous voyez les ouvertures qu&apos;il joue avec chaque couleur et ce qui lui réussit le moins.
      </p>
      <Form state={state} onSearch={onSearch} onReset={onReset} />

      {state.status === 'ready' && (
        <>
          <Summary search={state.search} prep={state.prep} />

          {state.prep.games === 0 ? (
            <p className="text-xs text-slate-400">Aucune partie trouvée avec ce filtre.</p>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-3">
                <ColorCard prep={state.prep.colors.w} onShow={(line) => show('w', line)} />
                <ColorCard prep={state.prep.colors.b} onShow={(line) => show('b', line)} />
              </div>

              <section aria-labelledby="opponent-explorer" className="flex flex-col gap-3">
                <h4
                  id="opponent-explorer"
                  ref={explorerRef}
                  tabIndex={-1}
                  className="text-sm font-bold text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
                >
                  Explorateur : les coups de {state.search.username}
                </h4>
                <OpeningExplorer
                  sans={sans}
                  onSansChange={setSans}
                  onImport={onImport}
                  onPlay={onPlay}
                  onAnalyze={onAnalyze}
                  boardTheme={boardTheme}
                  opponent={{ name: state.search.username, index: state.prep.index }}
                  side={side}
                  onSideChange={setSide}
                />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
};
