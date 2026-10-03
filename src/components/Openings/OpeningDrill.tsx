import React, { useCallback, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useOpeningDrill } from '../../hooks/useOpeningDrill';
import { numberedFrenchMove, toFrenchSan } from '../../utils/chessNotation';
import {
  drillPositionsOf,
  isDrillSuccess,
  type DrillKind,
  type DrillPosition,
  type DrillVerdict,
} from '../../utils/openingDrill';
import { toFrenchOpeningName } from '../../utils/openingNames';
import { COSTLY_EXIT, MIN_RECURRENCE } from '../../utils/openingRepertoire';
import { MASTERED_LEVEL, SESSION_SIZE, describeDelay, pickItems, summarizeItems } from '../../utils/spacedRepetition';
import type { BoardTheme } from '../../types/ui';
import { Tile } from '../Training/TrainingSetup';
import { OpeningDrillExercise } from './OpeningDrillExercise';
import { PRIMARY, SECONDARY } from './shared';

interface OpeningDrillProps {
  /** Opens the import of online games (offered while there is nothing to replay). */
  onImport: () => void;
  /** Shows a position of the explorer: the moves leading to it. */
  onShowLine: (line: string[]) => void;
  boardTheme?: BoardTheme;
}

type Color = 'w' | 'b';

const COLORS: Array<{ value: Color; label: string }> = [
  { value: 'w', label: 'Avec les Blancs' },
  { value: 'b', label: 'Avec les Noirs' },
];

const KINDS: Array<{ value: DrillKind; label: string }> = [
  { value: 'exit', label: 'Mes sorties de théorie' },
  { value: 'line', label: 'Mes lignes qui marchent' },
];

interface Session {
  positions: DrillPosition[];
  /** Index of the position on screen; past the last one, the session is over. */
  index: number;
  results: Array<{ position: DrillPosition; isSuccess: boolean }>;
}

const CHIP =
  'px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

function Chip({ isOn, onClick, children }: { isOn: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={isOn}
      onClick={onClick}
      className={`${CHIP} ${
        isOn
          ? 'bg-indigo-600/30 border-indigo-500 text-white'
          : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80'
      }`}
    >
      {children}
    </button>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** "Réviser mes sorties de théorie": replay the positions where the player left the theory at a cost. */
export const OpeningDrill: React.FC<OpeningDrillProps> = ({ onImport, onShowLine, boardTheme }) => {
  const { data, record, retry } = useOpeningDrill();
  // None chosen: both sides
  const [color, setColor] = useState<Color | null>(null);
  const [kind, setKind] = useState<DrillKind | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // Fixed while a screen is shown: the figures must not change under the player's eyes
  const [now, setNow] = useState(() => Date.now());

  const isOver = session !== null && session.index >= session.positions.length;

  const start = (isEarly: boolean) => {
    if (data.status !== 'ready') return;
    const moment = Date.now();
    setNow(moment);
    const positions = pickItems(drillPositionsOf(data.positions, color, kind), data.cards, moment, {
      includeUpcoming: isEarly,
    });
    if (positions.length > 0) setSession({ positions, index: 0, results: [] });
  };

  const onVerdict = useCallback(
    (position: DrillPosition, verdict: DrillVerdict) => {
      const ok = isDrillSuccess(verdict);
      record(position, ok);
      setSession((current) =>
        current ? { ...current, results: [...current.results, { position, isSuccess: ok }] } : current
      );
    },
    [record]
  );

  const next = () => setSession((current) => (current ? { ...current, index: current.index + 1 } : current));
  const backToSetup = () => {
    setNow(Date.now());
    setSession(null);
  };

  if (data.status === 'loading') {
    return (
      <p role="status" className="text-sm text-slate-400 py-8 text-center">
        Recherche de vos positions à rejouer…
      </p>
    );
  }

  if (data.status === 'unavailable') {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-8 px-2">
        <p className="text-sm font-semibold text-slate-200">Les ouvertures ne sont pas disponibles</p>
        <p className="text-xs text-slate-400 max-w-md">
          La base des ouvertures n&apos;a pas pu être téléchargée : sans elle, on ne peut pas dire si un coup est de la
          théorie. Vérifiez la connexion, puis réessayez : une fois chargée, elle reste disponible hors ligne.
        </p>
        <button type="button" onClick={retry} className={SECONDARY}>
          Réessayer
        </button>
      </div>
    );
  }

  if (data.positions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-8 px-2">
        <p className="text-sm font-semibold text-slate-200">
          {data.games === 0 ? 'Aucune partie enregistrée' : 'Aucune position à rejouer'}
        </p>
        <p className="text-xs text-slate-400 max-w-md">
          {data.games === 0
            ? "Cet entraînement se construit sur vos parties analysées. Importez les dernières depuis chess.com ou Lichess : elles s'analysent en arrière-plan."
            : `Deux sortes de positions sont proposées : celles où vous quittez la théorie avec un coup qui coûte au moins ${COSTLY_EXIT} points de chances de gain (en moyenne, si plusieurs parties y passent), et celles où vous suivez une ligne de théorie dans au moins ${MIN_RECURRENCE} parties. Dans vos ${plural(data.games, 'partie enregistrée', 'parties enregistrées')}, il n'y en a aucune pour l'instant : soit votre pseudo n'y figure pas (renseignez-le en haut de l'écran, puis importez vos parties), soit vos parties sont trop différentes ou sortent de la théorie à bon compte.`}
        </p>
        <button type="button" onClick={onImport} className={PRIMARY}>
          Importer mes parties
        </button>
      </div>
    );
  }

  if (session !== null && !isOver) {
    return (
      <OpeningDrillExercise
        key={session.positions[session.index].id}
        position={session.positions[session.index]}
        index={session.index}
        total={session.positions.length}
        boardTheme={boardTheme}
        onVerdict={onVerdict}
        onNext={next}
        onShowLine={onShowLine}
      />
    );
  }

  if (session !== null) {
    const successes = session.results.filter((r) => r.isSuccess).length;
    return (
      <div className="flex flex-col gap-4">
        <div role="status">
          <p className="text-sm font-semibold text-slate-100">
            Séance terminée : {plural(successes, 'réussie', 'réussies')} sur {session.positions.length}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Les positions ratées reviennent demain ; les réussies reviennent après 1, 3 puis 7 jours, et sont retirées
            quand vous les avez trouvées {MASTERED_LEVEL} fois de suite.
          </p>
        </div>
        <ul className="flex flex-col gap-1.5">
          {session.results.map(({ position, isSuccess: ok }) => {
            const card = data.cards.get(position.id);
            const opening = position.opening ? toFrenchOpeningName(position.opening) : 'Sans ouverture reconnue';
            return (
              <li
                key={position.id}
                className="flex items-start gap-2 rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2 text-xs"
              >
                {ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" aria-label="Réussie" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 text-rose-400" aria-label="Ratée" />
                )}
                <span className="text-slate-300">
                  {opening}, coup {position.moveNumber} : la théorie joue{' '}
                  {position.bookMoves
                    .slice(0, 3)
                    .map((san) => numberedFrenchMove(position.moveNumber, position.color === 'w', san))
                    .join(', ')}{' '}
                  ({position.kind === 'line' ? 'vous jouez' : 'vous aviez joué'} {toFrenchSan(position.played[0].san)})
                  <span className="text-slate-400">
                    {card && card.level >= MASTERED_LEVEL
                      ? ' · maîtrisée'
                      : card
                        ? ` · reviendra ${describeDelay(card.dueAt, card.lastSeen)}`
                        : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={backToSetup} className={PRIMARY}>
            Nouvelle séance
          </button>
        </div>
      </div>
    );
  }

  const chosen = drillPositionsOf(data.positions, color, kind);
  const summary = summarizeItems(chosen, data.cards, now);
  const available = summary.due + summary.fresh;
  const sessionSize = Math.min(SESSION_SIZE, available);
  // What a chip would bring, the other choice being kept
  const countOf = (positions: readonly DrillPosition[]) => {
    const s = summarizeItems(positions, data.cards, now);
    return s.due + s.fresh;
  };
  const countForColor = (value: Color) => countOf(drillPositionsOf(data.positions, value, kind));
  const countForKind = (value: DrillKind) => countOf(drillPositionsOf(data.positions, color, value));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-400">
        Trouvez le coup que la base des ouvertures connaît, avant qu&apos;il ne se présente en partie : dans les
        positions où vous avez quitté la théorie en perdant des chances de gain, et dans les lignes qui marchent pour
        vous, afin de ne pas les oublier.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="À revoir" value={summary.due} hint="déjà ratées, de retour" />
        <Tile label="Nouvelles" value={summary.fresh} hint="jamais rejouées" />
        <Tile
          label="Plus tard"
          value={summary.scheduled}
          hint={summary.nextDueAt === null ? undefined : `la prochaine ${describeDelay(summary.nextDueAt, now)}`}
        />
        <Tile label="Maîtrisées" value={summary.mastered} hint={`retrouvées ${MASTERED_LEVEL} fois de suite`} />
      </div>

      <div role="group" aria-label="Positions" className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-300">Positions</p>
        <div className="flex flex-wrap gap-2">
          {KINDS.map(({ value, label }) => (
            <Chip key={value} isOn={kind === value} onClick={() => setKind(kind === value ? null : value)}>
              {label} <span className="text-slate-400 tabular-nums">({countForKind(value)})</span>
            </Chip>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          Les sorties : les coups hors théorie qui vous ont coûté au moins {COSTLY_EXIT} points. Les lignes : la
          position la plus profonde que vos parties partagent dans la théorie ({MIN_RECURRENCE} au moins), où vous avez
          joué un coup du livre.
        </p>
      </div>

      <div role="group" aria-label="Couleur" className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-300">Couleur</p>
        <div className="flex flex-wrap gap-2">
          {COLORS.map(({ value, label }) => (
            <Chip key={value} isOn={color === value} onClick={() => setColor(color === value ? null : value)}>
              {label} <span className="text-slate-400 tabular-nums">({countForColor(value)})</span>
            </Chip>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          Sans choix, tout est pris. Les nombres sont les positions à travailler maintenant.
        </p>
      </div>

      <div className="flex flex-col items-start gap-2 border-t border-slate-800/80 pt-3">
        {available > 0 ? (
          <button type="button" onClick={() => start(false)} className={PRIMARY}>
            Commencer ({plural(sessionSize, 'position', 'positions')})
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
              <button type="button" onClick={() => start(true)} className={PRIMARY}>
                Réviser en avance
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
