import React, { useEffect, useState } from 'react';
import { BookOpen, Trash2, X } from 'lucide-react';
import { MAX_GAMES, clearGames, deleteGame, gameId, listGames, type StoredGame } from '../../services/gameStore';

interface GameHistoryProps {
  /** PGN of the game on screen, marked in the list. */
  currentPgn: string;
  onOpen: (game: StoredGame) => void;
  onClose: () => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** The analysed games kept in this browser: opening one does not run Stockfish again. */
export const GameHistory: React.FC<GameHistoryProps> = ({ currentPgn, onOpen, onClose }) => {
  const [games, setGames] = useState<StoredGame[] | null>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const currentId = currentPgn ? gameId(currentPgn) : null;

  useEffect(() => {
    let isCurrent = true;
    void listGames().then((list) => isCurrent && setGames(list));
    return () => {
      isCurrent = false;
    };
  }, []);

  const remove = async (game: StoredGame) => {
    await deleteGame(game.id);
    setGames((list) => list?.filter((g) => g.id !== game.id) ?? null);
  };

  const clearAll = async () => {
    await clearGames();
    setGames([]);
    setIsConfirmingClear(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 max-w-2xl w-full mx-auto max-h-[85dvh]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-100">Mes parties</h2>
          <p className="text-xs text-slate-400 mt-1">
            Vos {MAX_GAMES} dernières parties analysées, conservées dans ce navigateur. Les rouvrir est instantané.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {games === null ? (
        <p role="status" className="text-sm text-slate-400 py-6 text-center">
          Chargement…
        </p>
      ) : games.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">
          Aucune partie enregistrée. Une partie apparaît ici une fois son analyse terminée.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto min-h-0 pr-1">
          {games.map((game) => (
            <li key={game.id}>
              <GameRow
                game={game}
                isCurrent={game.id === currentId}
                onOpen={() => onOpen(game)}
                onDelete={() => void remove(game)}
              />
            </li>
          ))}
        </ul>
      )}

      {games && games.length > 0 && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-800/80 pt-3 text-xs">
          {isConfirmingClear ? (
            <>
              <span className="text-slate-300">Supprimer les {games.length} parties ?</span>
              <button
                onClick={() => setIsConfirmingClear(false)}
                className="px-2.5 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => void clearAll()}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
              >
                Tout supprimer
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsConfirmingClear(true)}
              className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800 cursor-pointer"
            >
              Tout effacer
            </button>
          )}
        </div>
      )}
    </div>
  );
};

function GameRow({
  game,
  isCurrent,
  onOpen,
  onDelete,
}: {
  game: StoredGame;
  isCurrent: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { metadata, moves, statsWhite, statsBlack, userColor } = game.result;
  const white = metadata.white || 'Blancs';
  const black = metadata.black || 'Noirs';
  const accuracy = (userColor === 'b' ? statsBlack : statsWhite)?.accuracy;
  const title = `${white} contre ${black}${metadata.result ? `, ${metadata.result}` : ''}`;

  return (
    <div
      className={`flex items-stretch rounded-xl border transition-colors ${
        isCurrent ? 'bg-indigo-600/15 border-indigo-500/40' : 'bg-slate-950/60 border-slate-800 hover:border-slate-600'
      }`}
    >
      <button
        onClick={onOpen}
        aria-label={`Ouvrir la partie ${title}`}
        className="flex-1 min-w-0 text-left px-3.5 py-2.5 rounded-xl cursor-pointer flex flex-col gap-1"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-100 min-w-0">
          <span className="truncate">
            {white} <span className="text-slate-500 font-normal">–</span> {black}
          </span>
          {metadata.result && <span className="text-xs font-mono text-slate-300 shrink-0">{metadata.result}</span>}
          {isCurrent && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/25 text-indigo-200 shrink-0">
              Affichée
            </span>
          )}
        </span>
        {metadata.opening && (
          <span className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
            <BookOpen className="w-3 h-3 text-indigo-400 shrink-0" />
            <span className="truncate">
              {metadata.eco ? `[${metadata.eco}] ` : ''}
              {metadata.opening}
            </span>
          </span>
        )}
        <span className="text-[11px] text-slate-400 font-mono">
          {DATE_FORMAT.format(game.savedAt)} · {moves.length} demi-coups · profondeur {game.depth}
          {accuracy !== undefined && ` · précision ${Math.round(accuracy)} %`}
        </span>
      </button>
      <button
        onClick={onDelete}
        aria-label={`Supprimer la partie ${title}`}
        title="Supprimer cette partie"
        className="px-3 rounded-r-xl text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
