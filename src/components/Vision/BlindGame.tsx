import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Eye, EyeOff, Flag } from 'lucide-react';
import { usePlayGame } from '../../hooks/usePlayGame';
import type { BoardTheme, PlayerColor } from '../../types/ui';
import { levelById } from '../../utils/playLevels';
import { STANDARD_START_FEN, movesText, outcomeText } from '../../utils/playGame';
import {
  BLIND_GAME_SCORES,
  blindGameResult,
  contentsOf,
  parseTypedMove,
  recordKey,
  type Random,
  type RunOutcome,
} from '../../utils/vision';
import { toFrenchSan } from '../../utils/chessNotation';
import { PRIMARY, SECONDARY } from '../Openings/shared';
import { VisionBoard } from './VisionBoard';
import { LevelPicker, ResultPanel, plural, type VisionRecords } from './shared';

interface BlindGameProps {
  records: VisionRecords;
  finish: (key: string, score: number) => Promise<RunOutcome>;
  boardTheme?: BoardTheme;
  random?: Random;
}

type Side = PlayerColor | 'random';

/** "Partie à l'aveugle": a whole game against Stockfish with no piece on the board, the moves typed on the keyboard. */
export const BlindGame: React.FC<BlindGameProps> = ({ records, finish, boardTheme, random = Math.random }) => {
  const [side, setSide] = useState<Side>('w');
  const [round, setRound] = useState<{ level: string; color: PlayerColor; id: number } | null>(null);

  if (round) {
    return (
      <BlindGameRound
        key={round.id}
        levelId={round.level}
        color={round.color}
        finish={finish}
        boardTheme={boardTheme}
        onAgain={() => setRound({ ...round, id: Date.now() })}
        onNewGame={() => setRound(null)}
      />
    );
  }

  const start = (level: string) =>
    setRound({ level, color: side === 'random' ? (random() < 0.5 ? 'w' : 'b') : side, id: Date.now() });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-400">
        Une partie complète contre Stockfish, sans une seule pièce à l’écran : vous tapez vos coups (<code>Cf3</code>,{' '}
        <code>Nf3</code> ou <code>g1f3</code>, le roque <code>O-O</code>), le moteur répond et vous annonce son coup. La
        liste des coups reste affichée ; l’échiquier est vide. Vous pouvez le regarder, mais chaque regard est compté et
        une partie où vous avez regardé ne compte pas pour le record. Un coup illégal est refusé, sans pénalité.
      </p>
      <fieldset className="flex flex-col gap-1.5 min-w-0">
        <legend className="text-xs font-semibold text-slate-300 mb-1">Votre camp</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(
            [
              ['w', 'Blancs'],
              ['b', 'Noirs'],
              ['random', 'Au hasard'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="vision-game-side"
                checked={side === value}
                onChange={() => setSide(value)}
                className="accent-indigo-500"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <LevelPicker mode="game" records={records} onStart={start} />
    </div>
  );
};

interface BlindGameRoundProps {
  levelId: string;
  color: PlayerColor;
  finish: (key: string, score: number) => Promise<RunOutcome>;
  boardTheme?: BoardTheme;
  /** The same level and side, from the start. */
  onAgain: () => void;
  onNewGame: () => void;
}

const FRENCH_ERROR = (text: string) => `« ${text} » n’est pas un coup légal ici. Essayez par exemple Cf3, Nf3 ou g1f3.`;

/** One game: the engine answers by itself, the player types. */
const BlindGameRound: React.FC<BlindGameRoundProps> = ({ levelId, color, finish, boardTheme, onAgain, onNewGame }) => {
  const level = levelById(levelId);
  const game = usePlayGame({ startFen: STANDARD_START_FEN, userColor: color, level });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [illegal, setIllegal] = useState(0);
  const [peeks, setPeeks] = useState(0);
  const [isPeeking, setIsPeeking] = useState(false);
  const [hideList, setHideList] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const isNoted = useRef(false);

  const isMyTurn = !game.isOver && !game.isEngineTurn && !game.engineFailed;
  // The cursor goes back to the field whenever it is the player's turn
  useEffect(() => {
    if (isMyTurn) input.current?.focus();
  }, [isMyTurn, game.moves.length]);

  // The round is noted once, as soon as the game is over, and only when the board was never looked at
  useEffect(() => {
    if (!game.outcome || isNoted.current) return;
    isNoted.current = true;
    if (peeks > 0) return;
    const score = BLIND_GAME_SCORES[blindGameResult(game.outcome, color)];
    void finish(recordKey('game', levelId), score).then(setOutcome);
  }, [game.outcome, peeks, color, levelId, finish]);

  const last = game.moves[game.moves.length - 1];
  const inCheck = useMemo(() => new Chess(game.fen).isCheck(), [game.fen]);
  const isEngineLast = last !== undefined && game.moves.length > 0 && (game.moves.length % 2 === 1) === (color === 'b');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isMyTurn || text.trim() === '') return;
    const move = parseTypedMove(game.fen, text);
    if (!move) {
      setIllegal((n) => n + 1);
      setError(FRENCH_ERROR(text.trim()));
      return;
    }
    setError(null);
    setText('');
    setIsPeeking(false);
    game.play(move.uci);
  };

  const peek = () => {
    if (!isPeeking) setPeeks((n) => n + 1);
    setIsPeeking(!isPeeking);
  };

  const showPieces = isPeeking || game.isOver;
  const status = game.outcome
    ? outcomeText(game.outcome, color)
    : game.engineFailed
      ? null
      : game.isEngineTurn
        ? 'Stockfish réfléchit…'
        : `${isEngineLast ? `Stockfish a joué ${toFrenchSan(last.san)}. ` : ''}À vous de jouer${inCheck ? ' : vous êtes en échec' : ''}.`;
  const result = game.outcome ? blindGameResult(game.outcome, color) : null;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,32rem)_1fr] items-start">
      <VisionBoard
        label={showPieces ? 'Position de la partie' : 'Échiquier sans pièces : la partie se joue de tête, au clavier'}
        orientation={color}
        boardTheme={boardTheme}
        contents={showPieces ? contentsOf(game.fen) : null}
        marks={showPieces && last ? { [last.uci.slice(2, 4)]: 'from' } : undefined}
      />
      <div className="flex flex-col gap-3 min-w-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Partie à l’aveugle · Stockfish {level.label}
            {level.elo !== null && <span className="text-slate-400 font-normal"> (≈ {level.elo})</span>}
          </h3>
          <p className="text-xs text-slate-400 mt-1">Vous jouez les {color === 'w' ? 'Blancs' : 'Noirs'}.</p>
        </div>

        <div role="status" aria-live="polite" className="min-h-6 flex flex-col gap-2">
          {status && (
            <p
              className={`rounded-xl border px-3 py-2 text-xs ${
                game.outcome
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-100 font-semibold'
                  : 'bg-slate-950/60 border-slate-800 text-slate-200'
              }`}
            >
              {status}
            </p>
          )}
          {game.engineFailed && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 flex flex-col gap-2">
              <p>Le moteur n’est pas disponible : sans lui, personne ne répond à vos coups.</p>
              <div>
                <button type="button" onClick={game.retryEngine} className={SECONDARY}>
                  Réessayer
                </button>
              </div>
            </div>
          )}
        </div>

        {!game.isOver && (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <label htmlFor="blind-move" className="text-[11px] text-slate-400">
              Votre coup
            </label>
            <div className="flex gap-2">
              <input
                id="blind-move"
                ref={input}
                type="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={!isMyTurn}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Cf3, e4, O-O, g1f3…"
                aria-describedby={error ? 'blind-move-error' : undefined}
                aria-invalid={error ? true : undefined}
                className="min-w-0 flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50"
              />
              <button type="submit" disabled={!isMyTurn || text.trim() === ''} className={PRIMARY}>
                Jouer
              </button>
            </div>
            {error && (
              <p id="blind-move-error" role="alert" className="text-xs font-semibold text-rose-300">
                {error}
              </p>
            )}
          </form>
        )}

        {game.moves.length > 0 && !hideList && (
          <p className="text-xs text-slate-300 break-words">
            <span className="text-slate-400">Coups :</span>{' '}
            <span className="font-mono">
              {movesText(
                STANDARD_START_FEN,
                game.moves.map((m) => m.san)
              )}
            </span>
          </p>
        )}
        {!game.isOver && (
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={hideList}
              onChange={(event) => setHideList(event.target.checked)}
              className="accent-indigo-500"
            />
            Cacher la liste des coups (il ne reste que le dernier coup annoncé)
          </label>
        )}

        <p className="text-xs text-slate-400 tabular-nums">
          {plural(peeks, 'regard sur l’échiquier', 'regards sur l’échiquier')} ·{' '}
          {plural(illegal, 'coup refusé', 'coups refusés')}
        </p>

        {game.isOver && result && (
          <>
            {peeks === 0 ? (
              <ResultPanel
                mode="game"
                score={BLIND_GAME_SCORES[result]}
                outcome={outcome}
                onAgain={onAgain}
                onBack={onNewGame}
              >
                <p className="text-xs text-slate-400">
                  Les pièces sont revenues sur l’échiquier, pour revoir la fin de la partie.
                </p>
              </ResultPanel>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-300">
                  Vous avez regardé l’échiquier {plural(peeks, 'fois', 'fois')} : cette partie ne compte pas pour le
                  record.
                </p>
                <div>
                  <button type="button" onClick={onNewGame} className={PRIMARY}>
                    Nouvelle partie
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {!game.isOver && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={peek} className={SECONDARY}>
              {isPeeking ? (
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {isPeeking ? 'Recacher l’échiquier' : 'Regarder l’échiquier (compté)'}
            </button>
            <button type="button" onClick={game.resign} className={SECONDARY}>
              <Flag className="w-3.5 h-3.5" aria-hidden="true" />
              Abandonner
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
