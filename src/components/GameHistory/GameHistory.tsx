import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, ClipboardCopy, FileDown, NotebookPen, Swords, Trash2, X } from 'lucide-react';
import {
  MAX_FULL_GAMES,
  MAX_GAMES,
  clearGames,
  deleteGame,
  gameId,
  isFullGame,
  listGames,
  type StoredGame,
} from '../../services/gameStore';
import { clearNotesOf, loadNotes, writeNote } from '../../services/gameNoteStore';
import { MAX_PLAYED_GAMES, deletePlayedGames, listPlayedGames } from '../../services/playedGameStore';
import { engineName, helpText, playedLabel, timeControlText, type PlayedGame } from '../../utils/playedGames';
import { movesText } from '../../utils/playGame';
import { DataBackup } from '../Backup/DataBackup';
import { toFrenchOpeningName } from '../../utils/openingNames';
import {
  NO_FILTERS,
  activeFilterCount,
  applyFilters,
  describeCount,
  describeGame,
  describePlayed,
  filterChoices,
  type GameFacts,
  type HistoryFilters,
} from '../../utils/gameFilters';
import { hasContent, tagCounts, type GameNote } from '../../utils/gameNotes';
import { GameFiltersBar } from './GameFiltersBar';
import { GameNoteEditor } from './GameNoteEditor';

interface GameHistoryProps {
  /** PGN of the game on screen, marked in the list. */
  currentPgn: string;
  onOpen: (game: StoredGame) => void;
  /** Analyses a game played against the engine that has not been analysed yet (its PGN). */
  onAnalyzePlayed?: (pgn: string) => void;
  /** Exports a game as an annotated PGN (offered for the games kept complete). */
  onExport?: (game: StoredGame) => void;
  onClose: () => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Rows shown at first; the rest comes by steps (the history can hold hundreds of games). */
const PAGE_SIZE = 50;

/** The analysed games kept in this browser: opening one does not run Stockfish again. */
export const GameHistory: React.FC<GameHistoryProps> = ({ currentPgn, onOpen, onAnalyzePlayed, onExport, onClose }) => {
  const [games, setGames] = useState<StoredGame[] | null>(null);
  /** The games played against the engine (the ones that are analysed are shown as the analysed game). */
  const [played, setPlayed] = useState<PlayedGame[]>([]);
  /** The game whose PGN was just copied. */
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<ReadonlyMap<string, GameNote>>(() => new Map());
  const [filters, setFilters] = useState<HistoryFilters>(NO_FILTERS);
  /** The game whose note is being written. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** The moment the periods are counted from: the one the list was read. */
  const [now, setNow] = useState(() => Date.now());
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const currentId = currentPgn ? gameId(currentPgn) : null;

  /** Changes when a backup was restored: the list is read again. */
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    void Promise.all([listGames(), loadNotes(), listPlayedGames()]).then(([list, loadedNotes, playedList]) => {
      if (!isCurrent) return;
      setNow(Date.now());
      setNotes(loadedNotes);
      setPlayed(playedList);
      setGames(list);
    });
    return () => {
      isCurrent = false;
    };
  }, [revision]);

  // An analysed game carries the label of the game against the engine it comes from; the others are shown as they are
  const facts = useMemo(() => {
    const playedById = new Map(played.map((game) => [game.id, game]));
    const analysed = (games ?? []).map((game) => describeGame(game, notes.get(game.id), playedById.get(game.id)));
    const analysedIds = new Set(analysed.map((item) => item.id));
    const waiting = played.filter((game) => !analysedIds.has(game.id));
    return [...analysed, ...waiting.map((game) => describePlayed(game, notes.get(game.id)))];
  }, [games, played, notes]);
  const shown = useMemo(() => applyFilters(facts, filters, now), [facts, filters, now]);
  const choices = useMemo(() => filterChoices(facts), [facts]);
  const tagList = useMemo(() => {
    const tags = tagCounts(notes.values()).map(({ tag }) => tag);
    // The tag a filter asks for stays in the list even when the last note that had it was changed
    return filters.tag !== '' && !tags.includes(filters.tag) ? [...tags, filters.tag] : tags;
  }, [notes, filters.tag]);
  const isFiltered = activeFilterCount(filters) > 0;

  const changeFilters = (next: HistoryFilters) => {
    setFilters(next);
    setVisibleCount(PAGE_SIZE);
  };

  const remove = async (item: GameFacts) => {
    const { id } = item;
    if (item.game) await deleteGame(id);
    if (item.played) await deletePlayedGames([id]);
    await clearNotesOf([id]);
    setGames((list) => list?.filter((g) => g.id !== id) ?? null);
    setPlayed((list) => list.filter((g) => g.id !== id));
    setNotes((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
    setEditingId((editing) => (editing === id ? null : editing));
  };

  const clearAll = async () => {
    await clearGames();
    await deletePlayedGames(played.map((game) => game.id));
    await clearNotesOf([...notes.keys()]);
    setGames([]);
    setPlayed([]);
    setNotes(new Map());
    setEditingId(null);
    setIsConfirmingClear(false);
  };

  const saveNoteOf = async (id: string, text: string, tags: string[]) => {
    const note = await writeNote(id, text, tags);
    if (!note) return;
    setNotes((current) => {
      const next = new Map(current);
      if (hasContent(note)) next.set(id, note);
      else next.delete(id);
      return next;
    });
    setEditingId(null);
  };

  const copyPgn = async (game: PlayedGame) => {
    try {
      await navigator.clipboard.writeText(game.pgn);
      setCopiedId(game.id);
      setTimeout(() => setCopiedId((id) => (id === game.id ? null : id)), 2000);
    } catch {
      // The clipboard is refused (insecure page, permission): nothing is copied
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 max-w-2xl w-full mx-auto max-h-[85dvh]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-100">Mes parties</h2>
          <p className="text-xs text-slate-400 mt-1">
            Vos {MAX_GAMES} dernières parties analysées et vos {MAX_PLAYED_GAMES} dernières parties contre Stockfish,
            dans ce navigateur. Les {MAX_FULL_GAMES} analyses les plus récentes s'ouvrent instantanément ; les plus
            anciennes sont allégées et se réanalysent.
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

      {games !== null && facts.length > 0 && (
        <GameFiltersBar filters={filters} onChange={changeFilters} choices={choices} tags={tagList} />
      )}

      {games === null ? (
        <p role="status" className="text-sm text-slate-400 py-6 text-center">
          Chargement…
        </p>
      ) : facts.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">
          Aucune partie enregistrée. Une partie apparaît ici une fois son analyse terminée, ou une fois jouée jusqu'au
          bout contre Stockfish.
        </p>
      ) : (
        <>
          {isFiltered && (
            <p aria-live="polite" className="text-xs text-slate-400 -mt-1">
              {describeCount(shown.length, facts.length)}
            </p>
          )}
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm text-slate-300">Aucune partie ne correspond à cette recherche.</p>
              <button
                onClick={() => changeFilters({ ...NO_FILTERS, sort: filters.sort })}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-300 hover:bg-slate-800/80 cursor-pointer"
              >
                Afficher toutes les parties
              </button>
            </div>
          ) : (
            <ul className="flex flex-col gap-2 overflow-y-auto min-h-0 pr-1">
              {shown.slice(0, visibleCount).map((item) => (
                <li key={item.id}>
                  <GameRow
                    facts={item}
                    isCurrent={item.id === currentId}
                    isEditing={editingId === item.id}
                    isCopied={copiedId === item.id}
                    knownTags={tagList}
                    onOpen={() => {
                      const { game, played: record } = item;
                      if (game) onOpen(game);
                      else if (record?.analysable) onAnalyzePlayed?.(record.pgn);
                    }}
                    onDelete={() => void remove(item)}
                    onExport={
                      onExport && item.game && isFullGame(item.game)
                        ? () => item.game && onExport(item.game)
                        : undefined
                    }
                    onCopy={item.played && !item.game ? () => item.played && void copyPgn(item.played) : undefined}
                    onEdit={() => setEditingId((id) => (id === item.id ? null : item.id))}
                    onSaveNote={(text, tags) => void saveNoteOf(item.id, text, tags)}
                  />
                </li>
              ))}
              {shown.length > visibleCount && (
                <li>
                  <button
                    onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                    className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-indigo-300 hover:bg-slate-800/80 cursor-pointer"
                  >
                    Voir les {shown.length - visibleCount} parties{' '}
                    {filters.sort === 'recent' ? 'plus anciennes' : 'suivantes'}
                  </button>
                </li>
              )}
            </ul>
          )}
        </>
      )}

      {games && facts.length > 0 && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-800/80 pt-3 text-xs">
          {isConfirmingClear ? (
            <>
              <span className="text-slate-300">
                Supprimer les {facts.length} parties{isFiltered ? ' (les filtres ne comptent pas)' : ''} ?
              </span>
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

      <DataBackup onRestored={() => setRevision((n) => n + 1)} />
    </div>
  );
};

function GameRow({
  facts,
  isCurrent,
  isEditing,
  isCopied,
  knownTags,
  onOpen,
  onDelete,
  onExport,
  onCopy,
  onEdit,
  onSaveNote,
}: {
  facts: GameFacts;
  isCurrent: boolean;
  isEditing: boolean;
  isCopied: boolean;
  knownTags: readonly string[];
  onOpen: () => void;
  onDelete: () => void;
  onExport?: () => void;
  /** Copies the PGN of a game that cannot be opened (offered for a game against the engine that is not analysed). */
  onCopy?: () => void;
  onEdit: () => void;
  onSaveNote: (note: string, tags: string[]) => void;
}) {
  const { game, played, note } = facts;
  const metadata = game?.result.metadata;
  const white = metadata
    ? metadata.white || 'Blancs'
    : played?.color === 'w'
      ? played.userName
      : engineName(played?.levelLabel ?? '');
  const black = metadata
    ? metadata.black || 'Noirs'
    : played?.color === 'b'
      ? played.userName
      : engineName(played?.levelLabel ?? '');
  const result = metadata ? metadata.result : played?.result;
  const moveCount = game ? game.result.moves.length : (played?.sans.length ?? 0);
  const accuracy = facts.accuracy ?? undefined;
  const title = `${white} contre ${black}${result ? `, ${result}` : ''}`;
  const ICON_BUTTON = 'flex-1 px-3 text-slate-500 cursor-pointer';
  /** A game against the engine that begins on a position of its own cannot be analysed move by move. */
  const isClosed = !game && played !== null && !played.analysable;
  const MAIN = 'flex-1 min-w-0 text-left px-3.5 py-2.5 rounded-xl flex flex-col gap-1';

  const body = (
    <>
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-100 min-w-0">
        <span className="truncate">
          {white} <span className="text-slate-500 font-normal">–</span> {black}
        </span>
        {result && <span className="text-xs font-mono text-slate-300 shrink-0">{result}</span>}
        {isCurrent && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/25 text-indigo-200 shrink-0">
            Affichée
          </span>
        )}
      </span>
      {played && (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-200">
            <Swords className="w-3 h-3" aria-hidden="true" />
            {playedLabel(played)}
          </span>
          <span className="text-[11px] text-slate-400">
            {played.label}
            {played.timeControl && ` · ${timeControlText(played.timeControl)}`}
            {helpText(played) && ` · ${helpText(played)}`}
          </span>
        </span>
      )}
      {metadata?.opening && (
        <span className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
          <BookOpen className="w-3 h-3 text-indigo-400 shrink-0" />
          <span className="truncate">
            {metadata.eco ? `[${metadata.eco}] ` : ''}
            {toFrenchOpeningName(metadata.opening)}
          </span>
        </span>
      )}
      <span className="text-[11px] text-slate-400 font-mono">
        {DATE_FORMAT.format(facts.savedAt)} · {moveCount} demi-coups
        {game && ` · profondeur ${game.depth}`}
        {accuracy !== undefined && ` · précision ${Math.round(accuracy)} %`}
      </span>
      {note && note.tags.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/25 text-[11px] text-indigo-200"
            >
              {tag}
            </span>
          ))}
        </span>
      )}
      {note && note.note !== '' && (
        <span className="text-xs text-slate-300/90 italic line-clamp-2 break-words">{note.note}</span>
      )}
      {game && !isFullGame(game) && (
        <span className="text-[11px] text-amber-300/90">Version allégée : l'ouverture relance l'analyse.</span>
      )}
      {!game && played?.analysable && (
        <span className="text-[11px] text-amber-300/90">Pas encore analysée : l'ouverture lance l'analyse.</span>
      )}
      {isClosed && played && (
        <>
          <span className="text-[11px] text-amber-300/90">
            Partie commencée sur une position particulière : elle ne peut pas être analysée coup par coup.
          </span>
          <span className="text-xs text-slate-300 font-mono break-words">
            {movesText(played.startFen, played.sans)}
          </span>
        </>
      )}
    </>
  );

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isCurrent ? 'bg-indigo-600/15 border-indigo-500/40' : 'bg-slate-950/60 border-slate-800 hover:border-slate-600'
      }`}
    >
      <div className="flex items-stretch">
        {isClosed ? (
          <div className={MAIN}>{body}</div>
        ) : (
          <button onClick={onOpen} aria-label={`Ouvrir la partie ${title}`} className={`${MAIN} cursor-pointer`}>
            {body}
          </button>
        )}
        <div className="flex flex-col border-l border-slate-800/80">
          <button
            onClick={onEdit}
            aria-expanded={isEditing}
            aria-label={`${note ? 'Modifier la note' : 'Ajouter une note'} de la partie ${title}`}
            title={note ? 'Modifier la note et les étiquettes' : 'Ajouter une note ou une étiquette'}
            className={`${ICON_BUTTON} rounded-tr-xl hover:text-indigo-300 hover:bg-indigo-500/10 ${
              note ? 'text-indigo-300' : ''
            }`}
          >
            <NotebookPen className="w-4 h-4" />
          </button>
          {onExport && (
            <button
              onClick={onExport}
              aria-label={`Exporter la partie ${title} en PGN annoté`}
              title="Exporter en PGN annoté"
              className={`${ICON_BUTTON} hover:text-indigo-300 hover:bg-indigo-500/10`}
            >
              <FileDown className="w-4 h-4" />
            </button>
          )}
          {onCopy && (
            <button
              onClick={onCopy}
              aria-label={`Copier le PGN de la partie ${title}`}
              title="Copier le PGN"
              className={`${ICON_BUTTON} hover:text-indigo-300 hover:bg-indigo-500/10`}
            >
              {isCopied ? (
                <Check className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              ) : (
                <ClipboardCopy className="w-4 h-4" aria-hidden="true" />
              )}
              <span role="status" className="sr-only">
                {isCopied ? 'PGN copié' : ''}
              </span>
            </button>
          )}
          <button
            onClick={onDelete}
            aria-label={`Supprimer la partie ${title}`}
            title="Supprimer cette partie"
            className={`${ICON_BUTTON} rounded-br-xl hover:text-rose-300 hover:bg-rose-500/10`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {isEditing && (
        <GameNoteEditor
          title={title}
          note={note?.note ?? ''}
          tags={note?.tags ?? []}
          knownTags={knownTags}
          onSave={onSaveNote}
          onCancel={onEdit}
        />
      )}
    </div>
  );
}
