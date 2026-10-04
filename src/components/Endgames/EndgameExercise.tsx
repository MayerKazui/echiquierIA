import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { useAnswerBoard, type Answer } from '../../hooks/useAnswerBoard';
import type { Endgame } from '../../data/endgames';
import { stockfishService } from '../../services/stockfishEngine';
import { numberedFrenchMove, toFrenchSan } from '../../utils/chessNotation';
import {
  HOLD_MOVES,
  MAX_MOVES,
  isEndSuccess,
  isGoodMove,
  playMove,
  startRun,
  type EndgameEnd,
  type EndgameRun,
  type EndgameStep,
} from '../../utils/endgameDrill';
import type { BoardTheme } from '../../types/ui';
import { ChessBoard } from '../ChessBoard/ChessBoard';
import { PRIMARY, SECONDARY } from '../Openings/shared';

interface EndgameExerciseProps {
  endgame: Endgame;
  index: number;
  total: number;
  boardTheme?: BoardTheme;
  /** Called once, with the result of the first attempt (a mistake or the solution asked for fails it). */
  onResult: (endgame: Endgame, isSuccess: boolean) => void;
  onNext: () => void;
}

/** What the player has just done, to be told about. */
type Feedback =
  { kind: 'move'; step: EndgameStep; bestSan: string } | { kind: 'revealed'; bestSan: string; bestUci: string };

/** Evaluates with the engine, and only with it: a position judged by the fallback heuristic would mean nothing here. */
async function evaluateWithEngine(fen: string, depth: number, signal?: AbortSignal) {
  stockfishService.warmUp();
  if (stockfishService.activeWorkerCount === 0) throw new Error('The engine is not available');
  const evaluation = await stockfishService.evaluatePosition(fen, depth, signal);
  if (stockfishService.activeWorkerCount === 0) throw new Error('The engine stopped');
  return evaluation;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** The moves of the run, each with its number: "1.Dd4+ 1…Rf5 2.Dd6". */
function movesText(run: EndgameRun): string {
  const [, turn, , , , fullmove] = run.endgame.fen.split(' ');
  let number = Number(fullmove) || 1;
  let isWhite = turn === 'w';
  const parts: string[] = [];
  const add = (san: string) => {
    parts.push(numberedFrenchMove(number, isWhite, san));
    if (!isWhite) number += 1;
    isWhite = !isWhite;
  };
  for (const { move, reply } of run.history) {
    add(move.san);
    if (reply) add(reply.san);
  }
  return parts.join(' ');
}

function badText(step: EndgameStep, bestSan: string, endgame: Endgame): string {
  if (step.verdict.kind !== 'bad') return '';
  const best = toFrenchSan(bestSan);
  switch (step.verdict.reason) {
    case 'loss': {
      const points = Math.max(1, Math.round(step.verdict.loss));
      return endgame.goal === 'win'
        ? `Ce coup laisse échapper la victoire (${plural(points, 'point', 'points')} de chances de gain perdus). Le moteur jouait ${best}.`
        : `Ce coup donne ${plural(points, 'point', 'points')} de chances de gain à l'adversaire : la nulle est en danger. Le moteur jouait ${best}.`;
    }
    case 'slower':
      return `Ce coup ne perd pas la victoire, mais il retarde le mat : le moteur voyait plus direct avec ${best}.`;
    case 'drawn':
      return 'Ce coup mène à la nulle (pat, matériel insuffisant ou répétition) alors que la position était gagnée.';
    case 'mated':
      return 'Ce coup permet le mat.';
  }
}

function goalText(endgame: Endgame): string {
  return endgame.goal === 'win'
    ? `Gagnez cette position : par le mat, ou en promouvant un pion sans laisser échapper la victoire (en ${MAX_MOVES} coups au plus). Le moteur défend de son mieux.`
    : `Faites nulle : tenez ${HOLD_MOVES} coups sans laisser le moteur prendre l'avantage (ou jusqu'à une nulle par les règles). Il attaque de son mieux.`;
}

function endText(end: EndgameEnd, fen: string): string {
  switch (end) {
    case 'won':
      return new Chess(fen).isCheckmate()
        ? 'Échec et mat : la position est gagnée.'
        : 'Le pion est promu et la position reste gagnée : le plus dur est fait.';
    case 'held':
      return new Chess(fen).isDraw()
        ? 'Nulle : la position est tenue.'
        : `La nulle est tenue : ${HOLD_MOVES} coups sans que le moteur ait pu faire mieux.`;
    case 'slow':
      return `Trop long : la position était gagnée, mais elle n'a pas été convertie en ${MAX_MOVES} coups.`;
  }
}

/** One endgame to play against the engine: it judges each move, answers it, and the exercise ends on the result. */
export const EndgameExercise: React.FC<EndgameExerciseProps> = ({
  endgame,
  index,
  total,
  boardTheme,
  onResult,
  onNext,
}) => {
  const [run, setRun] = useState<EndgameRun | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  /** The position right after the player's move, shown while the engine judges it: the piece does not wait. */
  const [played, setPlayed] = useState<{ fen: string; from: string; to: string } | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [end, setEnd] = useState<EndgameEnd | null>(null);
  /** Times the position was started again. */
  const [attempt, setAttempt] = useState(0);
  /** Times a move was taken back: a new board each, so that no selection is left on it. */
  const [takebacks, setTakebacks] = useState(0);
  const isCounted = useRef(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  /** A new cancellable job: the one that was running is cancelled. */
  const controller = useCallback(() => {
    abort.current?.abort();
    const next = new AbortController();
    abort.current = next;
    return next;
  }, []);

  /** Notes the result of the first attempt, once. */
  const count = useCallback(
    (isSuccess: boolean) => {
      if (isCounted.current) return;
      isCounted.current = true;
      if (!isSuccess) setHasFailed(true);
      onResult(endgame, isSuccess);
    },
    [endgame, onResult]
  );

  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    const own = controller();
    startRun(endgame, evaluateWithEngine, own.signal).then(
      (started) => {
        if (!own.signal.aborted) setRun(started);
      },
      () => {
        if (!own.signal.aborted) setLoadError(true);
      }
    );
    // `attempt` starts the exercise again
  }, [endgame, attempt, controller]);

  const onAnswer = useCallback(
    (given: Answer) => {
      if (!run) return;
      const own = controller();
      const before = run;
      setIsChecking(true);
      try {
        const chess = new Chess(before.fen);
        chess.move({ from: given.from, to: given.to, promotion: given.uci.length > 4 ? given.uci[4] : undefined });
        setPlayed({ fen: chess.fen(), from: given.from, to: given.to });
      } catch {
        // not legal: the engine will say so
      }
      playMove(before, given.uci, evaluateWithEngine, own.signal).then(
        (step) => {
          if (own.signal.aborted) return;
          setIsChecking(false);
          setPlayed(null);
          if (!step) return;
          setFeedback({ kind: 'move', step, bestSan: before.evaluation.bestMoveSan });
          if (!isGoodMove(step.verdict)) {
            count(false);
            return;
          }
          setRun(step.run);
          if (step.end) {
            setEnd(step.end);
            count(isEndSuccess(step.end));
          }
        },
        () => {
          if (own.signal.aborted) return;
          setIsChecking(false);
          setPlayed(null);
          setLoadError(true);
        }
      );
    },
    [run, count, controller]
  );

  const lastWasBad = feedback?.kind === 'move' && !isGoodMove(feedback.step.verdict);
  const isOpen = run !== null && !isChecking && end === null && !lastWasBad && !loadError;
  const board = useAnswerBoard(run?.fen ?? endgame.fen, isOpen, onAnswer);

  const retryMove = () => {
    setFeedback(null);
    setTakebacks((n) => n + 1);
  };
  const reveal = () => {
    if (!run) return;
    count(false);
    setFeedback({ kind: 'revealed', bestSan: run.evaluation.bestMoveSan, bestUci: run.evaluation.bestMoveUci });
  };
  /** Starts the position again (for practice: the result already counted stays). */
  const restart = () => {
    setRun(null);
    setLoadError(false);
    setFeedback(null);
    setEnd(null);
    setIsChecking(false);
    setPlayed(null);
    setAttempt((n) => n + 1);
  };

  const isLast = index + 1 === total;
  const color = run?.color ?? new Chess(endgame.fen).turn();
  const moves = useMemo(() => (run ? movesText(run) : ''), [run]);

  const lastMove = (() => {
    if (played) return { from: played.from, to: played.to };
    if (feedback?.kind === 'move') {
      const { step } = feedback;
      if (!isGoodMove(step.verdict)) {
        return { from: step.move.uci.slice(0, 2), to: step.move.uci.slice(2, 4), classification: 'mistake' };
      }
      if (step.reply) return { from: step.reply.uci.slice(0, 2), to: step.reply.uci.slice(2, 4) };
      return { from: step.move.uci.slice(0, 2), to: step.move.uci.slice(2, 4), classification: 'best' };
    }
    return null;
  })();
  const solution =
    feedback?.kind === 'revealed'
      ? { from: feedback.bestUci.slice(0, 2), to: feedback.bestUci.slice(2, 4) }
      : lastWasBad && run
        ? { from: run.evaluation.bestMoveUci.slice(0, 2), to: run.evaluation.bestMoveUci.slice(2, 4) }
        : null;

  const progress =
    run === null
      ? ''
      : endgame.goal === 'win'
        ? `Coup ${Math.min(run.moves + 1, MAX_MOVES)} sur ${MAX_MOVES} au plus`
        : `${plural(run.moves, 'coup tenu', 'coups tenus')} sur ${HOLD_MOVES}`;

  return (
    <div className="grid md:grid-cols-[var(--modal-board)_minmax(0,1fr)] gap-4 items-start">
      <div className="w-full max-w-md mx-auto md:max-w-none md:mx-0">
        <ChessBoard
          key={`${attempt}-${takebacks}`}
          fen={played?.fen ?? run?.fen ?? endgame.fen}
          isFlipped={color === 'b'}
          boardTheme={boardTheme}
          lastMove={lastMove}
          bestMove={solution}
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
            Finale {index + 1} sur {total}
            {progress && <> · {progress}</>}
          </p>
          <h3 className="text-sm font-semibold text-slate-100 mt-1">{endgame.title}</h3>
          <p className="text-xs text-slate-300 mt-1">
            Vous jouez les {color === 'w' ? 'Blancs' : 'Noirs'}. {goalText(endgame)}
          </p>
          <p className="text-xs text-slate-400 mt-1">{endgame.idea}</p>
        </div>

        <div role="status" aria-live="polite" className="min-h-6 flex flex-col gap-2">
          {loadError && (
            <p className="text-xs text-rose-300">
              Le moteur n&apos;est pas disponible : sans lui, on ne peut pas juger vos coups. Vérifiez que votre
              navigateur le permet, puis réessayez.
            </p>
          )}
          {run === null && !loadError && <p className="text-xs text-slate-400">Le moteur prépare la position…</p>}
          {isChecking && <p className="text-xs text-slate-400">Le moteur vérifie votre coup et répond…</p>}
          {feedback?.kind === 'move' && (
            <div
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                isGoodMove(feedback.step.verdict)
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              {isGoodMove(feedback.step.verdict) ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <p>
                {isGoodMove(feedback.step.verdict) ? (
                  <>
                    <span className="font-semibold">
                      {feedback.step.verdict.kind === 'best' ? 'Coup du moteur. ' : 'Bon coup. '}
                    </span>
                    {feedback.step.verdict.kind === 'good' &&
                      `Le moteur préférait ${toFrenchSan(feedback.bestSan)}, mais celui-ci garde la position. `}
                    {feedback.step.reply && `Le moteur répond ${toFrenchSan(feedback.step.reply.san)}.`}
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Raté. </span>
                    {badText(feedback.step, feedback.bestSan, endgame)}
                    {hasFailed && ' La position reste à revoir demain.'}
                  </>
                )}
              </p>
            </div>
          )}
          {feedback?.kind === 'revealed' && (
            <div className="flex items-start gap-2 rounded-xl border px-3 py-2 text-xs bg-slate-500/10 border-slate-500/30 text-slate-200">
              <p>
                <span className="font-semibold">Solution : </span>
                {toFrenchSan(feedback.bestSan)}. La position reste à revoir demain ; jouez-la pour voir la suite.
              </p>
            </div>
          )}
          {end !== null && run !== null && (
            <div
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                isEndSuccess(end) && !hasFailed
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-slate-500/10 border-slate-500/30 text-slate-200'
              }`}
            >
              <p>
                <span className="font-semibold">{isEndSuccess(end) && !hasFailed ? 'Réussi. ' : 'Terminé. '}</span>
                {endText(end, run.fen)}
                {end === 'slow' && ' La position reste à revoir demain.'}
              </p>
            </div>
          )}
        </div>

        {moves && (
          <p className="text-xs text-slate-300">
            <span className="text-slate-400">Coups :</span> <span className="font-mono">{moves}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {run !== null && end === null && feedback?.kind !== 'revealed' && !lastWasBad && (
            <button type="button" onClick={reveal} disabled={isChecking} className={SECONDARY}>
              Voir la solution
            </button>
          )}
          {lastWasBad && (
            <button type="button" onClick={retryMove} className={SECONDARY}>
              Réessayer ce coup
            </button>
          )}
          {(loadError || end !== null || (run !== null && run.moves > 0)) && (
            <button type="button" onClick={restart} className={SECONDARY}>
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Recommencer la position
            </button>
          )}
          {(end !== null || hasFailed) && (
            <button type="button" onClick={onNext} className={PRIMARY}>
              {isLast ? 'Terminer la séance' : 'Finale suivante'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
