import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CloudDownload, Search } from 'lucide-react';
import {
  ImportError,
  SOURCE_LABELS,
  SPEED_LABELS,
  SPEED_OPTIONS,
  fetchGamesPage,
  type ImportCursor,
  type ImportSource,
  type ImportedGame,
  type SpeedFilter,
} from '../../services/gameImport';
import { isAbortError } from '../../services/stockfishEngine';
import { oneOf, usePersistentState } from '../../hooks/usePersistentState';

interface OnlineGamesProps {
  /** The player's pseudo, offered for a site where no pseudo was entered yet. */
  userPseudo: string;
  /** `source:id` of the game loaded in the form, marked in the list. */
  selectedKey: string | null;
  /** The game was picked; `username` is the pseudo it was searched with. */
  onSelect: (game: ImportedGame, username: string) => void;
  /** Replaces the network call (tests). */
  fetchPage?: typeof fetchGamesPage;
}

const SOURCES: readonly ImportSource[] = ['chesscom', 'lichess'];
const ALL_SPEEDS: readonly SpeedFilter[] = ['all', 'bullet', 'blitz', 'rapid', 'classical', 'daily'];

const OUTCOMES = {
  win: { label: 'Victoire', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  loss: { label: 'Défaite', className: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  draw: { label: 'Nulle', className: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
} as const;

export const gameKey = (game: Pick<ImportedGame, 'source' | 'id'>) => `${game.source}:${game.id}`;

function formatDate(ms: number): string {
  const date = new Date(ms);
  const isThisYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(isThisYear ? {} : { year: 'numeric' }),
  }).format(date);
}

/** The recent games of a chess.com or Lichess account, to pick one without copying its PGN. */
export const OnlineGames: React.FC<OnlineGamesProps> = ({
  userPseudo,
  selectedKey,
  onSelect,
  fetchPage = fetchGamesPage,
}) => {
  const [source, setSource] = usePersistentState<ImportSource>('chess_import_source', 'chesscom', oneOf(SOURCES));
  // One pseudo per site (they are often different), the player's own pseudo as the starting point
  const [chesscomUser, setChesscomUser] = usePersistentState('chess_import_user_chesscom', userPseudo, (raw) => raw);
  const [lichessUser, setLichessUser] = usePersistentState('chess_import_user_lichess', userPseudo, (raw) => raw);
  const [storedSpeed, setSpeed] = usePersistentState<SpeedFilter>('chess_import_speed', 'all', oneOf(ALL_SPEEDS));

  const username = source === 'chesscom' ? chesscomUser : lichessUser;
  const setUsername = source === 'chesscom' ? setChesscomUser : setLichessUser;
  const speedOptions = SPEED_OPTIONS[source];
  // A speed the site does not have (chess.com has no "classical") counts as "all"
  const speed = speedOptions.some((option) => option.value === storedSpeed) ? storedSpeed : 'all';

  const [games, setGames] = useState<ImportedGame[]>([]);
  const [cursor, setCursor] = useState<ImportCursor | null>(null);
  /** What the list on screen was searched with: the form can change afterwards. */
  const [searched, setSearched] = useState<{ source: ImportSource; username: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedTitle, setLoadedTitle] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setGames([]);
    setCursor(null);
    setSearched(null);
    setIsLoading(false);
    setError(null);
    setLoadedTitle(null);
  }, []);

  const search = async (append: boolean) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const name = username.trim();

    setIsLoading(true);
    setError(null);
    setLoadedTitle(null);
    if (!append) {
      setGames([]);
      setCursor(null);
    }

    try {
      const page = await fetchPage(source, name, {
        speed,
        cursor: append ? cursor : null,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const known = new Set(append ? games.map(gameKey) : []);
      setGames((previous) => [...(append ? previous : []), ...page.games.filter((game) => !known.has(gameKey(game)))]);
      setCursor(page.cursor);
      setSearched({ source, username: name });
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      setError(err instanceof ImportError ? err.message : `Import impossible depuis ${SOURCE_LABELS[source]}.`);
    } finally {
      if (controllerRef.current === controller) setIsLoading(false);
    }
  };

  const changeSource = (next: ImportSource) => {
    if (next === source) return;
    setSource(next);
    reset();
  };

  const pick = (game: ImportedGame) => {
    if (!searched) return;
    setLoadedTitle(`${game.white} – ${game.black}`);
    onSelect(game, searched.username);
  };

  const label = SOURCE_LABELS[source];
  const status = isLoading
    ? `Recherche des parties de ${username.trim()} sur ${label}…`
    : loadedTitle
      ? `Partie chargée : ${loadedTitle}. Lancez l'analyse.`
      : searched && games.length === 0
        ? 'Aucune partie trouvée avec ce filtre.'
        : searched
          ? `${games.length} partie${games.length > 1 ? 's' : ''} affichée${games.length > 1 ? 's' : ''}.`
          : '';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void search(false);
      }}
      className="flex flex-col gap-3 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800"
    >
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
          <CloudDownload className="w-4 h-4 text-indigo-400" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-200">Importer mes parties en ligne</h3>
          <p className="text-[10px] text-slate-400">
            Sans copier-coller : vos dernières parties sont lues directement chez {SOURCE_LABELS.chesscom} ou{' '}
            {SOURCE_LABELS.lichess}.
          </p>
        </div>
      </div>

      <div role="group" aria-label="Site" className="grid grid-cols-2 gap-2">
        {SOURCES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={source === item}
            onClick={() => changeSource(item)}
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
          aria-label={`Pseudo ${label}`}
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            reset(); // the list and any search in progress belong to the previous pseudo
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={`Pseudo ${label}`}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          aria-label="Cadence"
          value={speed}
          onChange={(event) => {
            setSpeed(event.target.value as SpeedFilter);
            reset();
          }}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {speedOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isLoading || !username.trim()}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700 text-xs font-semibold text-slate-100 cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" aria-hidden="true" />
          Chercher
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 p-2.5 bg-rose-950/30 border border-rose-900/50 rounded-lg text-rose-300 text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <p role="status" className={status ? 'text-[11px] text-slate-400' : 'sr-only'}>
        {status}
      </p>

      {games.length > 0 && (
        <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
          {games.map((game) => (
            <li key={gameKey(game)}>
              <GameRow game={game} isSelected={gameKey(game) === selectedKey} onPick={() => pick(game)} />
            </li>
          ))}
          {cursor && (
            <li>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void search(true)}
                className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-indigo-300 hover:bg-slate-800/80 disabled:opacity-50 cursor-pointer"
              >
                Voir des parties plus anciennes
              </button>
            </li>
          )}
        </ul>
      )}
      {games.length === 0 && cursor && !isLoading && (
        <button
          type="button"
          onClick={() => void search(true)}
          className="px-3 py-2 rounded-lg text-xs font-semibold text-indigo-300 hover:bg-slate-800/80 cursor-pointer"
        >
          Chercher plus loin dans l'historique
        </button>
      )}
    </form>
  );
};

function GameRow({ game, isSelected, onPick }: { game: ImportedGame; isSelected: boolean; onPick: () => void }) {
  const isWhite = game.userColor === 'w';
  const opponent = isWhite ? game.black : game.white;
  const opponentRating = isWhite ? game.blackRating : game.whiteRating;
  const outcome = OUTCOMES[game.outcome];
  const details = [
    [SPEED_LABELS[game.speed], game.timeControl].filter(Boolean).join(' '),
    `${Math.ceil(game.plies / 2)} coups`,
    formatDate(game.playedAt),
  ].join(' · ');

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={`Charger la partie contre ${opponent} : ${outcome.label}, avec les ${isWhite ? 'Blancs' : 'Noirs'}, ${details}`}
      onClick={onPick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
        isSelected
          ? 'bg-indigo-600/15 border-indigo-500/50'
          : 'bg-slate-900/60 border-slate-800 hover:border-slate-600 hover:bg-slate-800/60'
      }`}
    >
      <span
        aria-hidden="true"
        title={isWhite ? 'Avec les Blancs' : 'Avec les Noirs'}
        className={`w-3.5 h-3.5 rounded-sm border shrink-0 ${isWhite ? 'bg-slate-100 border-slate-300' : 'bg-slate-900 border-slate-500'}`}
      />
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-slate-100 truncate">
          {opponent}
          {opponentRating !== undefined && <span className="text-slate-400 font-normal"> ({opponentRating})</span>}
        </span>
        <span className="text-[11px] text-slate-400 font-mono truncate">{details}</span>
      </span>
      <span
        className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${outcome.className}`}
      >
        {outcome.label}
      </span>
    </button>
  );
}
