import React, { useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import { Flag, RotateCcw, Undo2 } from 'lucide-react';
import { useAnswerBoard, type Answer } from '../../hooks/useAnswerBoard';
import { usePlayGame } from '../../hooks/usePlayGame';
import type { BoardTheme, PlayerColor } from '../../types/ui';
import type { PlayLevel } from '../../utils/playLevels';
import { gamePgn, movesText, outcomeText, type PlayStart } from '../../utils/playGame';
import { ChessBoard } from '../ChessBoard/ChessBoard';
import { PRIMARY, SECONDARY } from '../Openings/shared';

interface PlayGameProps {
  /** The position the game starts from (its `fen`), where it comes from and, when known, the moves that lead there. */
  start: PlayStart;
  userColor: PlayerColor;
  level: PlayLevel;
  boardTheme?: BoardTheme;
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
  boardTheme,
  userName,
  onAnalyze,
  onNewGame,
}) => {
  const game = usePlayGame({ startFen: start.fen, userColor, level });
  const isOpen = !game.isOver && !game.isEngineTurn && !game.engineFailed;

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
            white: userColor === 'w' ? userName || 'Moi' : `Stockfish (${level.label})`,
            black: userColor === 'b' ? userName || 'Moi' : `Stockfish (${level.label})`,
          }),
    [game.moves, game.outcome, start, userColor, userName, level.label]
  );

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
          </p>
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
