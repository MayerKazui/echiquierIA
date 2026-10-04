import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Flag, Gauge, Lightbulb, RotateCcw, Undo2 } from 'lucide-react';
import { useAnswerBoard, type Answer } from '../../hooks/useAnswerBoard';
import { useBestLine } from '../../hooks/useBestLine';
import { usePlayGame } from '../../hooks/usePlayGame';
import { clearPlaySession, savePlaySession, type PlaySession } from '../../services/playSessionStore';
import { deletePlayedGames, savePlayedGame } from '../../services/playedGameStore';
import type { BoardTheme, PlayerColor } from '../../types/ui';
import { timeControlLabel, type TimeControl } from '../../utils/playClock';
import type { PlayLevel } from '../../utils/playLevels';
import { engineName, makePlayedGame } from '../../utils/playedGames';
import { gamePgn, movesText, outcomeText, type PlayStart } from '../../utils/playGame';
import { describeForPlayer, formatPlayerScore, type HelpRequest } from '../../utils/playHelp';
import { arrowOf, lineMoves } from '../../utils/positionAnalysis';
import { ChessBoard } from '../ChessBoard/ChessBoard';
import type { BoardShape } from '../ChessBoard/useBoardDrawing';
import { PRIMARY, SECONDARY } from '../Openings/shared';
import { PlayClocks } from './PlayClocks';

const HINT_COLOR = '#f59e0b';
const MOVE_COLOR = '#10b981';

interface PlayGameProps {
  /** The position the game starts from (its `fen`), where it comes from and, when known, the moves that lead there. */
  start: PlayStart;
  userColor: PlayerColor;
  level: PlayLevel;
  /** The clock of the game (each side's time and the increment per move); without it, no clock. */
  timeControl?: TimeControl | null;
  boardTheme?: BoardTheme;
  /** A game in progress being resumed: its moves, and the help already asked for. */
  resume?: PlaySession;
  /** The name written in the PGN for the player. */
  userName?: string;
  /** Offered once there are moves, when the game can be analysed (see `gamePgn`). */
  onAnalyze?: (pgn: string) => void;
  onNewGame: () => void;
}

/** One game against the engine: the player moves on the board, Stockfish answers at the chosen level. */
export const PlayGame: React.FC<PlayGameProps> = ({
  start,
  userColor,
  level,
  timeControl,
  boardTheme,
  resume,
  userName,
  onAnalyze,
  onNewGame,
}) => {
  const game = usePlayGame({
    startFen: start.fen,
    userColor,
    level,
    initialMoves: resume?.moves,
    timeControl,
    initialClock: resume?.clock,
  });
  const clockLog = game.timing?.log;
  const isOpen = !game.isOver && !game.isEngineTurn && !game.engineFailed;

  // Help the player asked for: how many times (kept with the game), and what is shown for this position
  const [hints, setHints] = useState(resume?.hints ?? 0);
  const [evals, setEvals] = useState(resume?.evals ?? 0);
  const [help, setHelp] = useState<HelpRequest | null>(null);
  const current = help !== null && help.fen === game.fen && isOpen ? help : null;
  const best = useBestLine(game.fen, current !== null && (current.hint > 0 || current.isEval));

  const askHint = () => {
    const step = current?.hint ?? 0;
    if (step === 2) return;
    if (step === 0) setHints((n) => n + 1);
    setHelp({ fen: game.fen, hint: step === 0 ? 1 : 2, isEval: current?.isEval ?? false });
  };
  const askEval = () => {
    if (current?.isEval) return;
    setEvals((n) => n + 1);
    setHelp({ fen: game.fen, hint: current?.hint ?? 0, isEval: true });
  };

  const [startedAt] = useState(() => resume?.startedAt ?? Date.now());
  const finishedId = useRef<string | null>(null);
  const [keeping, setKeeping] = useState<'idle' | 'saved' | 'failed'>('idle');

  // The game in progress is kept after every move, to be resumed if the window is closed
  useEffect(() => {
    if (game.isOver) return;
    if (game.uciMoves.length === 0) {
      clearPlaySession();
      return;
    }
    savePlaySession({
      startFen: start.fen,
      label: start.label,
      prefix: start.prefix,
      color: userColor,
      levelId: level.id,
      moves: game.uciMoves,
      hints,
      evals,
      ...(timeControl && game.timing
        ? {
            clock: {
              baseSeconds: timeControl.baseSeconds,
              incrementSeconds: timeControl.incrementSeconds,
              w: game.timing.clock.w,
              b: game.timing.clock.b,
              log: game.timing.log,
            },
          }
        : {}),
      startedAt,
      updatedAt: Date.now(),
    });
  }, [game.isOver, game.uciMoves, game.timing, timeControl, start, userColor, level.id, hints, evals, startedAt]);

  // A finished game is kept in "Mes parties"; one that is taken back after its end is no longer finished
  useEffect(() => {
    if (game.isOver && game.outcome && game.moves.length > 0) {
      if (finishedId.current !== null) return;
      const record = makePlayedGame({
        startFen: start.fen,
        prefix: start.prefix,
        label: start.label,
        moves: game.moves,
        outcome: game.outcome,
        color: userColor,
        level,
        userName: userName ?? '',
        hints,
        evals,
        timeControl,
        clocks: clockLog,
        now: Date.now(),
      });
      finishedId.current = record.id;
      clearPlaySession();
      void savePlayedGame(record).then((isSaved) => setKeeping(isSaved ? 'saved' : 'failed'));
    } else if (!game.isOver && finishedId.current !== null) {
      const id = finishedId.current;
      finishedId.current = null;
      setKeeping('idle');
      void deletePlayedGames([id]);
    }
  }, [game.isOver, game.outcome, game.moves, start, userColor, level, userName, hints, evals, timeControl, clockLog]);

  const onAnswer = useCallback((answer: Answer) => game.play(answer.uci), [game]);
  const board = useAnswerBoard(game.fen, isOpen, onAnswer);

  const last = game.moves[game.moves.length - 1];
  const inCheck = useMemo(() => new Chess(game.fen).isCheck(), [game.fen]);
  const pgn = useMemo(
    () =>
      game.moves.length === 0
        ? null
        : gamePgn({
            startFen: start.fen,
            prefix: start.prefix,
            moves: game.moves,
            outcome: game.outcome,
            white: userColor === 'w' ? userName || 'Moi' : engineName(level.label),
            black: userColor === 'b' ? userName || 'Moi' : engineName(level.label),
            timeControl,
            clocks: clockLog,
          }),
    [game.moves, game.outcome, start, userColor, userName, level.label, timeControl, clockLog]
  );

  const hintMove = best.line ? arrowOf(best.line) : null;
  const shapes = useMemo<BoardShape[]>(() => {
    if (!current || current.hint === 0 || !hintMove) return [];
    return current.hint === 1
      ? [{ from: hintMove.from, to: hintMove.from, color: HINT_COLOR }]
      : [{ from: hintMove.from, to: hintMove.to, color: MOVE_COLOR }];
  }, [current, hintMove]);

  const status = game.outcome
    ? outcomeText(game.outcome, userColor)
    : game.engineFailed
      ? null
      : game.isEngineTurn
        ? 'Stockfish réfléchit…'
        : `À vous de jouer${inCheck ? ' : vous êtes en échec' : ''}.`;

  return (
    <div className="grid md:grid-cols-[var(--modal-board)_minmax(0,1fr)] gap-4 items-start">
      <div className="w-full max-w-md mx-auto md:max-w-none md:mx-0">
        <ChessBoard
          fen={game.fen}
          isFlipped={userColor === 'b'}
          boardTheme={boardTheme}
          lastMove={last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null}
          showArrows={false}
          showThreats={false}
          shapes={shapes}
          selectedSquare={board.selectedSquare}
          onSquareClick={board.handleSquareClick}
          onPieceMove={board.handlePieceMove}
          promotion={board.pendingPromotion}
          onPromote={board.choosePromotion}
          onCancelPromotion={board.cancelPromotion}
        />
      </div>

      <div className="flex flex-col gap-3 min-w-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Contre Stockfish · {level.label}
            {level.elo !== null && <span className="text-slate-400 font-normal"> (≈ {level.elo})</span>}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Vous jouez les {userColor === 'w' ? 'Blancs' : 'Noirs'}. {start.label}.
            {timeControl && ` Pendule : ${timeControlLabel(timeControl)}.`}
          </p>
        </div>

        {game.timing && (
          <PlayClocks
            timing={game.timing}
            turn={game.turn}
            running={game.clockRunning}
            userColor={userColor}
            isOver={game.isOver}
            flagged={game.flagged}
          />
        )}

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
              <p>
                Le moteur n&apos;est pas disponible : sans lui, personne ne répond à vos coups. Vérifiez que votre
                navigateur le permet, puis réessayez.
              </p>
              <div>
                <button type="button" onClick={game.retryEngine} className={SECONDARY}>
                  Réessayer
                </button>
              </div>
            </div>
          )}
        </div>

        {game.isOver && keeping !== 'idle' && (
          <p role="status" className="text-xs text-slate-400">
            {keeping === 'saved'
              ? 'Cette partie est gardée dans « Mes parties » : vous pouvez l’y retrouver et l’analyser.'
              : 'Cette partie n’a pas pu être gardée : le navigateur refuse le stockage.'}
          </p>
        )}

        {current && (current.hint > 0 || current.isEval) && (
          <div
            aria-live="polite"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 flex flex-col gap-1"
          >
            {best.status === 'searching' && !best.line && <p>Stockfish cherche le meilleur coup…</p>}
            {best.status === 'unavailable' && <p>Le moteur d’analyse n’est pas disponible.</p>}
            {best.line && current.hint === 1 && (
              <p>
                <span className="font-semibold">Indice :</span> le meilleur coup part de la case{' '}
                <span className="font-mono">{hintMove?.from}</span> (marquée sur l’échiquier).
              </p>
            )}
            {best.line && current.hint === 2 && (
              <p>
                <span className="font-semibold">Meilleur coup :</span>{' '}
                <span className="font-mono">{lineMoves(game.fen, best.line.pv, 1)[0]?.san}</span> (de{' '}
                <span className="font-mono">{hintMove?.from}</span> vers{' '}
                <span className="font-mono">{hintMove?.to}</span>).
              </p>
            )}
            {best.line && current.isEval && (
              <p>
                <span className="font-semibold">Évaluation :</span>{' '}
                <span className="font-mono">{formatPlayerScore(best.line, userColor)}</span> pour vous.{' '}
                {describeForPlayer(best.line, userColor)}
              </p>
            )}
            {best.status === 'searching' && best.line && (
              <p className="text-amber-200/70">Recherche en cours, profondeur {best.line.depth}…</p>
            )}
          </div>
        )}

        {game.moves.length > 0 && (
          <p className="text-xs text-slate-300 break-words">
            <span className="text-slate-400">Coups :</span>{' '}
            <span className="font-mono">
              {movesText(
                start.fen,
                game.moves.map((m) => m.san)
              )}
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={game.takeBack} disabled={!game.canTakeBack} className={SECONDARY}>
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            Reprendre le coup
          </button>
          {!game.isOver && (
            <>
              <button type="button" onClick={askHint} disabled={!isOpen || current?.hint === 2} className={SECONDARY}>
                <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                {current?.hint === 1 ? 'Voir le coup' : 'Indice'}
              </button>
              <button type="button" onClick={askEval} disabled={!isOpen || current?.isEval} className={SECONDARY}>
                <Gauge className="w-3.5 h-3.5" aria-hidden="true" />
                Évaluer la position
              </button>
            </>
          )}
          {!game.isOver && (
            <button type="button" onClick={game.resign} className={SECONDARY}>
              <Flag className="w-3.5 h-3.5" aria-hidden="true" />
              Abandonner
            </button>
          )}
          {game.isOver && pgn && onAnalyze && (
            <button type="button" onClick={() => onAnalyze(pgn)} className={PRIMARY}>
              Analyser la partie
            </button>
          )}
          <button
            type="button"
            onClick={onNewGame}
            className={game.isOver && !(pgn && onAnalyze) ? PRIMARY : SECONDARY}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Nouvelle partie
          </button>
        </div>
      </div>
    </div>
  );
};
