import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useAnswerBoard, type Answer } from '../../hooks/useAnswerBoard';
import { stockfishService } from '../../services/stockfishEngine';
import { formatPlayedDate } from '../../services/gameImport';
import { formatPvToFrench, toFrenchSan } from '../../utils/chessNotation';
import { FAULT_KIND_TEXT } from '../../utils/faultKinds';
import { themeLabel } from '../../utils/puzzleThemes';
import { isSuccess, judgeAnswer, type Verdict } from '../../utils/judgeAnswer';
import type { PlayStart } from '../../utils/playGame';
import type { TrainingPosition } from '../../utils/trainingPositions';
import { ChessBoard } from '../ChessBoard/ChessBoard';
import type { BoardTheme } from '../../types/ui';

const FAULT_NAMES: Record<TrainingPosition['classification'], string> = {
  blunder: 'une gaffe',
  mistake: 'une erreur',
  missedWin: 'une occasion manquée',
};

interface TrainingExerciseProps {
  position: TrainingPosition;
  index: number;
  total: number;
  boardTheme?: BoardTheme;
  /** Called once, with the verdict on the first answer of the position (or when the solution is asked for). */
  onVerdict: (position: TrainingPosition, verdict: Verdict) => void;
  onNext: () => void;
  /** Shows the game at the position of the error; no button without it. */
  onOpenGame?: (gameId: string, ply: number) => void;
  /** Starts a game against Stockfish from the position; no button without it. */
  onPlay?: (start: PlayStart) => void;
}

const BUTTON =
  'px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

/** What the player is told about a verdict. */
function verdictText(verdict: Verdict, position: TrainingPosition): string {
  const best = toFrenchSan(position.bestSan);
  switch (verdict.kind) {
    case 'best':
      return `${best} est le coup du moteur.`;
    case 'good':
      return `Bon coup. Le moteur préférait ${best}, mais celui-ci tient la position (${Math.round(verdict.loss)} point${
        Math.round(verdict.loss) > 1 ? 's' : ''
      } de moins).`;
    case 'played':
      return `C'est le coup que vous aviez joué en partie : ${toFrenchSan(position.playedSan)}.`;
    case 'bad':
      return verdict.loss === null
        ? "Ce n'est pas le coup du moteur, et il n'a pas pu le vérifier."
        : `Ce coup donne ${Math.max(1, Math.round(verdict.loss))} point${
            verdict.loss >= 1.5 ? 's' : ''
          } de chances de gain à l'adversaire.`;
    case 'revealed':
      return `Solution : ${best}.`;
  }
}

/** One position to replay: find the move, then see the engine's move and why. */
export const TrainingExercise: React.FC<TrainingExerciseProps> = ({
  position,
  index,
  total,
  boardTheme,
  onVerdict,
  onNext,
  onOpenGame,
  onPlay,
}) => {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  /** Attempts so far: a new board (and a new selection) for each. */
  const [attempt, setAttempt] = useState(0);
  /** The verdict on the first answer: the one that counts (the next ones are practice). */
  const [counted, setCounted] = useState<Verdict | null>(null);
  const isCounted = useRef(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const settle = useCallback(
    (next: Verdict) => {
      setVerdict(next);
      if (!isCounted.current) {
        isCounted.current = true;
        setCounted(next);
        onVerdict(position, next);
      }
    },
    [onVerdict, position]
  );

  const onAnswer = useCallback(
    (given: Answer) => {
      setAnswer(given);
      setIsChecking(true);
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      judgeAnswer(
        position,
        given.uci,
        (fen, depth, signal) => stockfishService.evaluatePosition(fen, depth, signal),
        controller.signal
      ).then(
        (result) => {
          if (controller.signal.aborted) return;
          setIsChecking(false);
          settle(result);
        },
        () => {} // cancelled: the player left
      );
    },
    [position, settle]
  );

  const isOpen = verdict === null && !isChecking;
  const board = useAnswerBoard(position.fen, isOpen, onAnswer);
  const retry = () => {
    setVerdict(null);
    setAnswer(null);
    setAttempt((n) => n + 1);
  };

  /** The piece goes to its square at once, while the engine checks and when the move is right; a wrong move goes back. */
  const shownFen = useMemo(() => {
    if (!answer || (verdict !== null && !isSuccess(verdict))) return position.fen;
    try {
      const chess = new Chess(position.fen);
      chess.move({ from: answer.from, to: answer.to, promotion: answer.uci.length > 4 ? answer.uci[4] : undefined });
      return chess.fen();
    } catch {
      return position.fen;
    }
  }, [answer, verdict, position.fen]);

  const side = position.color === 'w' ? 'Blancs' : 'Noirs';
  const isLast = index + 1 === total;
  const success = verdict !== null && isSuccess(verdict);
  const isRetry = verdict !== null && counted !== verdict;
  const pv = formatPvToFrench(position.fen, position.pv, 6);
  const explanation = position.explanation;

  return (
    <div className="grid md:grid-cols-[var(--modal-board)_minmax(0,1fr)] gap-4 items-start">
      <div className="w-full max-w-md mx-auto md:max-w-none md:mx-0">
        <ChessBoard
          key={attempt}
          fen={shownFen}
          isFlipped={position.color === 'b'}
          boardTheme={boardTheme}
          lastMove={answer ? { from: answer.from, to: answer.to, classification: success ? 'best' : 'mistake' } : null}
          bestMove={
            verdict && verdict.kind !== 'best'
              ? { from: position.bestUci.slice(0, 2), to: position.bestUci.slice(2, 4) }
              : null
          }
          showArrows
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
          <p className="text-[11px] text-slate-400">
            Position {index + 1} sur {total} · coup {position.moveNumber} · contre {position.opponent} ·{' '}
            {formatPlayedDate(position.date)}
          </p>
          {position.repeats ? (
            <p className="text-[11px] text-slate-400 mt-0.5">
              Cette position s&apos;est aussi présentée dans {position.repeats} autre{position.repeats > 1 ? 's' : ''}{' '}
              partie{position.repeats > 1 ? 's' : ''} : elle n&apos;est proposée qu&apos;une fois.
            </p>
          ) : null}
          <p className="text-sm font-semibold text-slate-100 mt-1">Vous jouez les {side}. Trouvez un meilleur coup.</p>
          <p className="text-xs text-slate-400 mt-1">
            En partie, vous aviez joué{' '}
            <span className="font-semibold text-slate-200">{toFrenchSan(position.playedSan)}</span>,{' '}
            {FAULT_NAMES[position.classification]} ({Math.round(position.loss)} points de chances de gain perdus).
          </p>
        </div>

        <div role="status" aria-live="polite" className="min-h-6">
          {isChecking && <p className="text-xs text-slate-400">Vérification du coup avec le moteur…</p>}
          {verdict && (
            <div
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              {success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <p>
                <span className="font-semibold">{success ? (isRetry ? 'Trouvé. ' : 'Réussi. ') : 'Raté. '}</span>
                {verdictText(verdict, position)}
                {isRetry && success && ' La position reste à revoir demain.'}
              </p>
            </div>
          )}
        </div>

        {verdict && (
          <div className="flex flex-col gap-2 text-xs text-slate-300">
            {pv && (
              <p>
                <span className="font-semibold text-slate-200">Suite du moteur :</span> {pv}
              </p>
            )}
            <p>
              <span className="inline-block px-2 py-0.5 rounded-md bg-slate-800 text-[11px] font-semibold text-slate-200 mr-1.5">
                {FAULT_KIND_TEXT[position.kind].label}
                {position.theme ? ` · ${themeLabel(position.theme).toLowerCase()}` : ''}
              </span>
              {explanation?.whyPlayedIsBad || FAULT_KIND_TEXT[position.kind].hint}
            </p>
            {explanation?.whyBestIsBetter && <p>{explanation.whyBestIsBetter}</p>}
            {explanation?.plan && (
              <p>
                <span className="font-semibold text-slate-200">Idée à retenir :</span> {explanation.plan}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {verdict === null && (
            <button
              type="button"
              disabled={isChecking}
              onClick={() => settle({ kind: 'revealed' })}
              className={`${BUTTON} bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700`}
            >
              Voir la solution
            </button>
          )}
          {verdict && !success && verdict.kind !== 'revealed' && (
            <button
              type="button"
              onClick={retry}
              className={`${BUTTON} bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700`}
            >
              Réessayer
            </button>
          )}
          {verdict && onOpenGame && (
            <button
              type="button"
              onClick={() => onOpenGame(position.gameId, position.ply)}
              className={`${BUTTON} bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700`}
            >
              Voir dans la partie
            </button>
          )}
          {verdict && onPlay && (
            <button
              type="button"
              onClick={() => onPlay({ fen: position.fen, label: 'Position critique de vos parties' })}
              className={`${BUTTON} bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700`}
            >
              Jouer cette position contre Stockfish
            </button>
          )}
          {verdict && (
            <button type="button" onClick={onNext} className={`${BUTTON} bg-indigo-600 hover:bg-indigo-500 text-white`}>
              {isLast ? 'Terminer la séance' : 'Position suivante'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
