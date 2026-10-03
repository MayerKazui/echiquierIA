import React, { useCallback, useState } from 'react';
import { CheckCircle2, Crown, X, XCircle } from 'lucide-react';
import { ENDGAME_CATEGORIES, type Endgame } from '../../data/endgames';
import { useEndgameCards } from '../../hooks/useEndgameCards';
import { endgameCardId, endgameItems, type EndgameItem } from '../../utils/endgameDrill';
import {
  MASTERED_LEVEL,
  describeDelay,
  pickItems,
  statusOf,
  summarizeItems,
  type Card,
} from '../../utils/spacedRepetition';
import type { BoardTheme } from '../../types/ui';
import { PRIMARY, SECONDARY } from '../Openings/shared';
import { Tile } from '../Training/TrainingSetup';
import { EndgameExercise } from './EndgameExercise';

interface EndgamesProps {
  onClose: () => void;
  boardTheme?: BoardTheme;
}

/** Finales in a session: each one is long (a dozen moves against the engine), so a session is short. */
export const ENDGAME_SESSION_SIZE = 5;

interface Session {
  items: EndgameItem[];
  /** Index of the endgame on screen; past the last one, the session is over. */
  index: number;
  results: Array<{ endgame: Endgame; isSuccess: boolean }>;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Where an endgame stands, in words. */
function statusText(card: Card | undefined, now: number): string {
  switch (statusOf(card, now)) {
    case 'new':
      return 'Nouvelle';
    case 'due':
      return 'À revoir';
    case 'scheduled':
      return `Reviendra ${describeDelay(card!.dueAt, now)}`;
    case 'mastered':
      return 'Maîtrisée';
  }
}

/** "Finales": the theoretical endgames (mates, pawns, rooks), played against the engine and revisited at growing intervals. */
export const Endgames: React.FC<EndgamesProps> = ({ onClose, boardTheme }) => {
  const { cards, record } = useEndgameCards();
  const [session, setSession] = useState<Session | null>(null);
  // Fixed while a screen is shown: the figures must not change under the player's eyes
  const [now, setNow] = useState(() => Date.now());
  const items = endgameItems();

  const start = (chosen: EndgameItem[]) => {
    if (chosen.length === 0) return;
    setNow(Date.now());
    setSession({ items: chosen, index: 0, results: [] });
  };

  const onResult = useCallback(
    (endgame: Endgame, isSuccess: boolean) => {
      record(endgame, isSuccess);
      setSession((current) =>
        current ? { ...current, results: [...current.results, { endgame, isSuccess }] } : current
      );
    },
    [record]
  );

  const next = () => setSession((current) => (current ? { ...current, index: current.index + 1 } : current));
  const backToSetup = () => {
    setNow(Date.now());
    setSession(null);
  };

  const isOver = session !== null && session.index >= session.items.length;

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 w-full mx-auto max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] ${
        session !== null && !isOver ? 'max-w-[min(96vw,84rem)]' : 'max-w-4xl'
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Crown className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Finales</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Les positions théoriques à connaître (mats, pions, tours), jouées contre le moteur qui juge chaque coup.
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
        aria-label="Contenu des finales"
        tabIndex={0}
        className="overflow-y-auto min-h-0 pr-1 flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
      >
        {cards === null && (
          <p role="status" className="text-sm text-slate-400 py-8 text-center">
            Chargement de votre progression…
          </p>
        )}

        {cards !== null && session !== null && !isOver && (
          <EndgameExercise
            key={session.items[session.index].id}
            endgame={session.items[session.index].endgame}
            index={session.index}
            total={session.items.length}
            boardTheme={boardTheme}
            onResult={onResult}
            onNext={next}
          />
        )}

        {cards !== null && session !== null && isOver && (
          <div className="flex flex-col gap-4">
            <div role="status">
              <p className="text-sm font-semibold text-slate-100">
                Séance terminée : {plural(session.results.filter((r) => r.isSuccess).length, 'réussie', 'réussies')} sur{' '}
                {session.items.length}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Les finales ratées reviennent demain ; les réussies reviennent après 1, 3 puis 7 jours, et sont retirées
                quand vous les avez réussies {MASTERED_LEVEL} fois de suite.
              </p>
            </div>
            <ul className="flex flex-col gap-1.5">
              {session.results.map(({ endgame, isSuccess: ok }) => {
                const card = cards.get(endgameCardId(endgame));
                return (
                  <li
                    key={endgame.id}
                    className="flex items-start gap-2 rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2 text-xs"
                  >
                    {ok ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" aria-label="Réussie" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0 text-rose-400" aria-label="Ratée" />
                    )}
                    <span className="text-slate-300">
                      {endgame.title}
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

        {cards !== null && session === null && <Setup items={items} cards={cards} now={now} onStart={start} />}
      </div>
    </div>
  );
};

interface SetupProps {
  items: EndgameItem[];
  cards: ReadonlyMap<string, Card>;
  now: number;
  onStart: (items: EndgameItem[]) => void;
}

/** Where the endgames stand, a session to start, and the list of the positions to play at will. */
const Setup: React.FC<SetupProps> = ({ items, cards, now, onStart }) => {
  const summary = summarizeItems(items, cards, now);
  const available = summary.due + summary.fresh;
  const sessionSize = Math.min(ENDGAME_SESSION_SIZE, available);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-400">
        Vous jouez la position contre le moteur, qui répond à chaque coup et dit si le vôtre garde le résultat : gagner
        (mat ou promotion sûre) ou tenir la nulle. Une position réussie revient après 1, 3 puis 7 jours.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="À revoir" value={summary.due} hint="déjà ratées, de retour" />
        <Tile label="Nouvelles" value={summary.fresh} hint="jamais jouées" />
        <Tile
          label="Plus tard"
          value={summary.scheduled}
          hint={summary.nextDueAt === null ? undefined : `la prochaine ${describeDelay(summary.nextDueAt, now)}`}
        />
        <Tile label="Maîtrisées" value={summary.mastered} hint={`réussies ${MASTERED_LEVEL} fois de suite`} />
      </div>

      <div className="flex flex-col items-start gap-2 border-b border-slate-800/80 pb-4">
        {available > 0 ? (
          <button
            type="button"
            onClick={() => onStart(pickItems(items, cards, now, { size: ENDGAME_SESSION_SIZE }))}
            className={PRIMARY}
          >
            Commencer ({plural(sessionSize, 'finale', 'finales')})
          </button>
        ) : (
          <>
            <p role="status" className="text-xs text-slate-300">
              Tout est à jour
              {summary.nextDueAt === null
                ? ''
                : ` : la prochaine finale revient ${describeDelay(summary.nextDueAt, now)}`}
              .
            </p>
            {summary.scheduled > 0 && (
              <button
                type="button"
                onClick={() =>
                  onStart(pickItems(items, cards, now, { size: ENDGAME_SESSION_SIZE, includeUpcoming: true }))
                }
                className={PRIMARY}
              >
                Réviser en avance
              </button>
            )}
          </>
        )}
      </div>

      {ENDGAME_CATEGORIES.map(({ value, label }) => (
        <section key={value} aria-label={label} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-slate-300">{label}</h3>
          <ul className="flex flex-col gap-1.5">
            {items
              .filter((item) => item.endgame.category === value)
              .map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200">{item.endgame.title}</p>
                    <p className="text-[11px] text-slate-400">
                      {item.endgame.goal === 'win' ? 'Gagner' : 'Faire nulle'} · {statusText(cards.get(item.id), now)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStart([item])}
                    aria-label={`Jouer : ${item.endgame.title}`}
                    className={SECONDARY}
                  >
                    Jouer
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
};
