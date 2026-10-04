import React, { useId, useState } from 'react';
import { Swords, X } from 'lucide-react';
import { oneOf, usePersistentState } from '../../hooks/usePersistentState';
import { clearPlaySession, loadPlaySession, type PlaySession } from '../../services/playSessionStore';
import type { BoardTheme, PlayerColor } from '../../types/ui';
import { DEFAULT_LEVEL_ID, PLAY_LEVELS, levelById, type PlayLevel } from '../../utils/playLevels';
import { STANDARD_START_FEN, validFen, type PlayStart } from '../../utils/playGame';
import { PRIMARY, SECONDARY } from '../Openings/shared';
import { PlayGame } from './PlayGame';

interface PlayStockfishProps {
  /** The position the player comes from (a study, an opening line, a critical position); without it, the usual start. */
  start?: PlayStart;
  boardTheme?: BoardTheme;
  userName?: string;
  /** Analyses the finished game (a PGN from the standard start). */
  onAnalyze?: (pgn: string) => void;
  onClose: () => void;
}

type ColorChoice = PlayerColor | 'random';
type PositionChoice = 'origin' | 'standard' | 'custom';

interface Game {
  start: PlayStart;
  color: PlayerColor;
  level: PlayLevel;
  /** The game in progress being resumed. */
  resume?: PlaySession;
}

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

const LEGEND = 'text-xs font-semibold text-slate-200';
const OPTION =
  'flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 cursor-pointer has-[:checked]:border-indigo-500/60 has-[:checked]:bg-indigo-500/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-400';

const turnOf = (fen: string): PlayerColor => (fen.split(' ')[1] === 'b' ? 'b' : 'w');

/** "Jouer contre Stockfish": a position, a side, a level, then the game. */
export const PlayStockfish: React.FC<PlayStockfishProps> = ({ start, boardTheme, userName, onAnalyze, onClose }) => {
  const [levelId, setLevelId] = usePersistentState<string>(
    'chess_play_level',
    DEFAULT_LEVEL_ID,
    oneOf(PLAY_LEVELS.map((level) => level.id))
  );
  const [position, setPosition] = useState<PositionChoice>(start ? 'origin' : 'standard');
  const [customFen, setCustomFen] = useState('');
  const [color, setColor] = useState<ColorChoice>(start ? turnOf(start.fen) : 'w');
  const [game, setGame] = useState<Game | null>(null);
  /** The game left unfinished the last time (kept after every move), if any. */
  const [saved, setSaved] = useState<PlaySession | null>(() => loadPlaySession());
  const name = useId();

  const customIsValid = validFen(customFen);
  const canStart = position !== 'custom' || customIsValid;

  const resumeSaved = () => {
    if (!saved) return;
    setGame({
      start: { fen: saved.startFen, label: saved.label, prefix: saved.prefix },
      color: saved.color,
      level: levelById(saved.levelId),
      resume: saved,
    });
  };

  const discardSaved = () => {
    clearPlaySession();
    setSaved(null);
  };

  const begin = () => {
    if (!canStart) return;
    // A new game replaces the one that was left unfinished (the game clears it when it starts)
    setSaved(null);
    const chosen: PlayStart =
      position === 'origin' && start
        ? start
        : position === 'custom'
          ? { fen: customFen.trim(), label: 'Position choisie' }
          : { fen: STANDARD_START_FEN, label: 'Partie complète', prefix: [] };
    setGame({
      start: chosen,
      color: color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color,
      level: levelById(levelId),
    });
  };

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 w-full mx-auto max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] ${
        game ? 'max-w-[min(96vw,84rem)]' : 'max-w-3xl'
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Swords className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Jouer contre Stockfish</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Une partie contre le moteur, à la force que vous choisissez, depuis le début ou depuis une position à
              travailler.
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
        aria-label="Contenu de la partie"
        tabIndex={0}
        className="overflow-y-auto min-h-0 pr-1 flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
      >
        {game ? (
          <PlayGame
            start={game.start}
            userColor={game.color}
            level={game.level}
            boardTheme={boardTheme}
            resume={game.resume}
            userName={userName}
            onAnalyze={onAnalyze}
            onNewGame={() => {
              setGame(null);
              setSaved(loadPlaySession());
            }}
          />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              begin();
            }}
          >
            {saved && (
              <section
                aria-label="Partie en cours"
                className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-3 flex flex-col gap-2"
              >
                <p className="text-xs text-indigo-100">
                  <span className="font-semibold">Une partie est en cours</span> : vous avez les{' '}
                  {saved.color === 'w' ? 'Blancs' : 'Noirs'} contre Stockfish ({levelById(saved.levelId).label}),{' '}
                  {saved.moves.length} demi-coup{saved.moves.length > 1 ? 's' : ''} joué
                  {saved.moves.length > 1 ? 's' : ''}, dernier coup le {DATE_FORMAT.format(saved.updatedAt)}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={resumeSaved} className={PRIMARY}>
                    Reprendre la partie
                  </button>
                  <button type="button" onClick={discardSaved} className={SECONDARY}>
                    Abandonner cette partie
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Lancer une nouvelle partie remplace celle-ci ; une partie abandonnée ici n&apos;est pas gardée.
                </p>
              </section>
            )}

            <fieldset className="flex flex-col gap-2">
              <legend className={`${LEGEND} mb-1`}>Position de départ</legend>
              {start && (
                <label className={OPTION}>
                  <input
                    type="radio"
                    name={`${name}-position`}
                    checked={position === 'origin'}
                    onChange={() => {
                      setPosition('origin');
                      setColor(turnOf(start.fen));
                    }}
                  />
                  <span>
                    {start.label}
                    <span className="block text-slate-400">
                      Les {turnOf(start.fen) === 'w' ? 'Blancs' : 'Noirs'} ont le trait.
                    </span>
                  </span>
                </label>
              )}
              <label className={OPTION}>
                <input
                  type="radio"
                  name={`${name}-position`}
                  checked={position === 'standard'}
                  onChange={() => setPosition('standard')}
                />
                <span>Partie complète, depuis la position initiale</span>
              </label>
              <label className={OPTION}>
                <input
                  type="radio"
                  name={`${name}-position`}
                  checked={position === 'custom'}
                  onChange={() => setPosition('custom')}
                />
                <span className="flex-1 min-w-0">
                  Une autre position (FEN)
                  {position === 'custom' && (
                    <>
                      <input
                        type="text"
                        value={customFen}
                        onChange={(e) => setCustomFen(e.target.value)}
                        aria-label="Position au format FEN"
                        aria-invalid={customFen.trim() !== '' && !customIsValid}
                        placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                        className="mt-2 w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1.5 font-mono text-[11px] text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      />
                      {customFen.trim() !== '' && !customIsValid && (
                        <span role="alert" className="block mt-1 text-rose-300">
                          Cette position n&apos;est pas valide.
                        </span>
                      )}
                    </>
                  )}
                </span>
              </label>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className={`${LEGEND} mb-1`}>Votre camp</legend>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['w', 'Blancs'],
                    ['b', 'Noirs'],
                    ['random', 'Au hasard'],
                  ] as Array<[ColorChoice, string]>
                ).map(([value, label]) => (
                  <label key={value} className={OPTION}>
                    <input
                      type="radio"
                      name={`${name}-color`}
                      checked={color === value}
                      onChange={() => setColor(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className={`${LEGEND} mb-1`}>Niveau de Stockfish</legend>
              <div className="grid sm:grid-cols-2 gap-2">
                {PLAY_LEVELS.map((level) => (
                  <label key={level.id} className={OPTION}>
                    <input
                      type="radio"
                      name={`${name}-level`}
                      checked={levelId === level.id}
                      onChange={() => setLevelId(level.id)}
                    />
                    <span>
                      {level.label}
                      <span className="block text-slate-400">{level.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">
                Les valeurs sont celles du moteur, mesurées contre d&apos;autres moteurs : contre une personne, elles ne
                sont qu&apos;un repère.
              </p>
            </fieldset>

            <div>
              <button type="submit" disabled={!canStart} className={`${PRIMARY} disabled:opacity-50`}>
                Jouer
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
