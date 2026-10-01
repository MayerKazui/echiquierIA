import React from 'react';
import { BarChart3, Dumbbell, X } from 'lucide-react';
import { oneOf, usePersistentState } from '../../hooks/usePersistentState';
import { useWeaknessProfile } from '../../hooks/useWeaknessProfile';
import { ProfileView } from './ProfileView';

interface WeaknessProfileProps {
  onClose: () => void;
  /** Opens the import of online games (shown when there is nothing to count). */
  onImport: () => void;
  /** Opens the training on the player's own mistakes (offered once the profile is shown). */
  onTrain?: () => void;
}

/** How many of the latest games the profile uses; 0 is all of them. */
const WINDOWS = [
  { value: 20, label: '20 dernières' },
  { value: 50, label: '50 dernières' },
  { value: 0, label: 'Toutes' },
] as const;

const BUTTON =
  'px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

/** "Mon profil": what the analysed games say about where the player loses accuracy. */
export const WeaknessProfile: React.FC<WeaknessProfileProps> = ({ onClose, onImport, onTrain }) => {
  const [latest, setLatest] = usePersistentState<number>('chess_profile_window', 0, oneOf(WINDOWS.map((w) => w.value)));
  const state = useWeaknessProfile(latest || undefined);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 max-w-3xl w-full mx-auto max-h-[90dvh]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Mon profil</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ce qui revient dans vos parties analysées : où vous perdez de la précision, et si cela s&apos;améliore.
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

      {state.status !== 'empty' && (
        <div role="group" aria-label="Parties prises en compte" className="flex flex-wrap gap-2">
          {WINDOWS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={latest === value}
              onClick={() => setLatest(value)}
              className={`${BUTTON} ${
                latest === value
                  ? 'bg-indigo-600/30 border-indigo-500 text-white'
                  : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              {label}
            </button>
          ))}
          {onTrain && state.status === 'ready' && state.profile.counted > 0 && (
            <button
              type="button"
              onClick={onTrain}
              className={`${BUTTON} ml-auto flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white`}
            >
              <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" />
              S&apos;entraîner sur ces erreurs
            </button>
          )}
        </div>
      )}

      <div
        role="region"
        aria-label="Contenu du profil"
        tabIndex={0}
        className="overflow-y-auto min-h-0 pr-1 flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
      >
        {state.status === 'loading' && (
          <p role="status" className="text-sm text-slate-400 py-8 text-center">
            Calcul du profil…
          </p>
        )}

        {state.status === 'empty' && (
          <Empty
            onImport={onImport}
            title="Aucune partie enregistrée"
            text="Le profil se construit sur vos parties analysées. Importez les dernières depuis chess.com ou Lichess : elles s'analysent en arrière-plan."
          />
        )}

        {state.status === 'ready' && state.profile.counted === 0 && (
          <Empty
            onImport={onImport}
            title="Aucune partie ne vous nomme"
            text={`${state.stored} partie${state.stored > 1 ? 's sont enregistrées' : ' est enregistrée'}, mais votre pseudo n'apparaît dans aucune (ou elles sont trop courtes). Le profil ne compte que les parties où vous êtes l'un des joueurs : renseignez votre pseudo en haut de l'écran, puis importez vos parties.`}
          />
        )}

        {state.status === 'ready' && state.profile.counted > 0 && (
          <>
            <ProfileView profile={state.profile} />
            <p className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-3">
              {state.profile.counted} partie{state.profile.counted > 1 ? 's' : ''} comptée
              {state.profile.counted > 1 ? 's' : ''} sur {state.stored} enregistrée{state.stored > 1 ? 's' : ''} dans ce
              navigateur.
              {latest === 0 && state.profile.ignored > 0
                ? ` ${state.profile.ignored} partie${state.profile.ignored > 1 ? 's sont laissées' : ' est laissée'} de côté : votre pseudo n'y figure pas, ou elle est trop courte.`
                : ''}{' '}
              Seuls vos coups comptent, la théorie d&apos;ouverture est exclue.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

function Empty({ title, text, onImport }: { title: string; text: string; onImport: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center py-8 px-2">
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      <p className="text-xs text-slate-400 max-w-md">{text}</p>
      <button
        type="button"
        onClick={onImport}
        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
      >
        Importer mes parties
      </button>
    </div>
  );
}
