import React, { useCallback, useState } from 'react';
import { CheckCircle2, Dumbbell, X, XCircle } from 'lucide-react';
import { useTrainingData } from '../../hooks/useTrainingData';
import { toFrenchSan } from '../../utils/chessNotation';
import { FAULT_KIND_TEXT } from '../../utils/faultKinds';
import { isSuccess, type Verdict } from '../../utils/judgeAnswer';
import {
  MASTERED_LEVEL,
  NO_FILTER,
  describeDelay,
  pickSession,
  type TrainingFilter,
} from '../../utils/spacedRepetition';
import type { TrainingPosition } from '../../utils/trainingPositions';
import type { BoardTheme } from '../../types/ui';
import { TrainingExercise } from './TrainingExercise';
import { TrainingSetup } from './TrainingSetup';

interface TrainingProps {
  onClose: () => void;
  /** Opens the import of online games (shown when there is nothing to replay). */
  onImport: () => void;
  boardTheme?: BoardTheme;
  /** Shows the game at the position of the error (the training closes): the id of the game and the move index. */
  onOpenGame?: (gameId: string, ply: number) => void;
  /** The themes to start with (the plan sends the player to one), none to take all the errors. */
  initialFilter?: TrainingFilter;
}

interface Session {
  positions: TrainingPosition[];
  /** Index of the position on screen; past the last one, the session is over. */
  index: number;
  results: Array<{ position: TrainingPosition; isSuccess: boolean }>;
}

const PRIMARY =
  'px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';
const SECONDARY =
  'px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

/** "S'entraîner": replay the positions where the player went wrong, and come back to them at growing intervals. */
export const Training: React.FC<TrainingProps> = ({ onClose, onImport, boardTheme, onOpenGame, initialFilter }) => {
  const { data, record } = useTrainingData();
  const [filter, setFilter] = useState<TrainingFilter>(initialFilter ?? NO_FILTER);
  const [session, setSession] = useState<Session | null>(null);
  // Fixed while a screen is shown: the figures must not change under the player's eyes
  const [now, setNow] = useState(() => Date.now());

  const start = (isEarly: boolean) => {
    if (data.status !== 'ready') return;
    const moment = Date.now();
    setNow(moment);
    const positions = pickSession(data.positions, data.cards, moment, { filter, includeUpcoming: isEarly });
    if (positions.length > 0) setSession({ positions, index: 0, results: [] });
  };

  const onVerdict = useCallback(
    (position: TrainingPosition, verdict: Verdict) => {
      const ok = isSuccess(verdict);
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

  const isOver = session !== null && session.index >= session.positions.length;

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 w-full mx-auto max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] ${
        session !== null && !isOver ? 'max-w-[min(96vw,84rem)]' : 'max-w-4xl'
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Dumbbell className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">S&apos;entraîner sur mes erreurs</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Les positions où vous vous êtes trompé : cherchez le bon coup, puis comparez avec le moteur.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        role="region"
        aria-label="Contenu de l'entraînement"
        tabIndex={0}
        className="overflow-y-auto min-h-0 pr-1 flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
      >
        {data.status === 'loading' && (
          <p role="status" className="text-sm text-slate-400 py-8 text-center">
            Recherche de vos erreurs…
          </p>
        )}

        {data.status === 'ready' && data.positions.length === 0 && (
          <div className="flex flex-col items-center gap-3 text-center py-8 px-2">
            <p className="text-sm font-semibold text-slate-200">
              {data.games === 0 ? 'Aucune partie enregistrée' : 'Aucune erreur à rejouer'}
            </p>
            <p className="text-xs text-slate-400 max-w-md">
              {data.games === 0
                ? "L'entraînement se construit sur vos parties analysées. Importez les dernières depuis chess.com ou Lichess : elles s'analysent en arrière-plan."
                : `Dans vos ${data.games} partie${data.games > 1 ? 's' : ''} enregistrée${data.games > 1 ? 's' : ''}, aucune erreur n'est à rejouer. Soit votre pseudo n'y figure pas (renseignez-le en haut de l'écran, puis importez vos parties), soit vous n'y avez fait ni erreur ni gaffe.`}
            </p>
            <button type="button" onClick={onImport} className={PRIMARY}>
              Importer mes parties
            </button>
          </div>
        )}

        {data.status === 'ready' && data.positions.length > 0 && session === null && (
          <TrainingSetup
            positions={data.positions}
            cards={data.cards}
            now={now}
            filter={filter}
            onFilterChange={setFilter}
            onStart={start}
          />
        )}

        {data.status === 'ready' && session !== null && !isOver && (
          <TrainingExercise
            key={session.positions[session.index].id}
            position={session.positions[session.index]}
            index={session.index}
            total={session.positions.length}
            boardTheme={boardTheme}
            onVerdict={onVerdict}
            onNext={next}
            onOpenGame={onOpenGame}
          />
        )}

        {data.status === 'ready' && session !== null && isOver && (
          <div className="flex flex-col gap-4">
            <div role="status">
              <p className="text-sm font-semibold text-slate-100">
                Séance terminée : {session.results.filter((r) => r.isSuccess).length} réussie
                {session.results.filter((r) => r.isSuccess).length > 1 ? 's' : ''} sur {session.positions.length}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Les positions ratées reviennent demain ; les réussies reviennent après 1, 3 puis 7 jours, et sont
                retirées quand vous les avez trouvées {MASTERED_LEVEL} fois de suite.
              </p>
            </div>
            <ul className="flex flex-col gap-1.5">
              {session.results.map(({ position, isSuccess: ok }) => {
                const card = data.cards.get(position.id);
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
                      Coup {position.moveNumber} contre {position.opponent} : {toFrenchSan(position.bestSan)} (vous
                      aviez joué {toFrenchSan(position.playedSan)}) ·{' '}
                      {FAULT_KIND_TEXT[position.kind].label.toLowerCase()}
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
              <button type="button" onClick={onClose} className={SECONDARY}>
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
