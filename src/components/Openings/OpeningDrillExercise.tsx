import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { CheckCircle2, Eye, XCircle } from 'lucide-react';
import { useAnswerBoard, type Answer } from '../../hooks/useAnswerBoard';
import { formatPlayedDate } from '../../services/gameImport';
import { formatPvToFrench, numberedFrenchMove, toFrenchSan } from '../../utils/chessNotation';
import { judgeDrillMove, isDrillSuccess, type DrillPosition, type DrillVerdict } from '../../utils/openingDrill';
import { START_FEN } from '../../utils/openingExplorer';
import { toFrenchOpeningName } from '../../utils/openingNames';
import type { BoardTheme } from '../../types/ui';
import { ChessBoard } from '../ChessBoard/ChessBoard';
import { PRIMARY, SECONDARY } from './shared';

interface OpeningDrillExerciseProps {
  position: DrillPosition;
  index: number;
  total: number;
  boardTheme?: BoardTheme;
  /** Called once, with the verdict on the first answer of the position (or when the solution is asked for). */
  onVerdict: (position: DrillPosition, verdict: DrillVerdict) => void;
  onNext: () => void;
  /** Shows the position in the explorer (the training stays where it is). */
  onShowLine: (line: string[]) => void;
}

/** Theory moves written in the list of the answer: no more than this many. */
const SHOWN_BOOK_MOVES = 5;

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const times = (n: number) => `${n} fois`;

/** What the player is told about a verdict. */
function verdictText(verdict: DrillVerdict, position: DrillPosition, answerSan: string | null): string {
  switch (verdict.kind) {
    case 'book':
      return `${toFrenchSan(answerSan ?? position.bookMoves[0])} est un coup de la théorie.`;
    case 'played':
      return `C'est le coup que vous avez joué en partie : ${toFrenchSan(answerSan ?? position.played[0].san)}.`;
    case 'off':
      return `La base des ouvertures ne connaît pas ${answerSan ? toFrenchSan(answerSan) : 'ce coup'} ici.`;
    case 'revealed':
      return `Solution : ${toFrenchSan(position.bookMoves[0])}.`;
  }
}

/** The squares of a move given as SAN, to draw its arrow. */
function squaresOf(fen: string, san: string): { from: string; to: string } | null {
  try {
    const move = new Chess(fen).move(san);
    return { from: move.from, to: move.to };
  } catch {
    return null;
  }
}

/** One position to replay: find a move of the theory, then see the moves the database knows and how it went in the games. */
export const OpeningDrillExercise: React.FC<OpeningDrillExerciseProps> = ({
  position,
  index,
  total,
  boardTheme,
  onVerdict,
  onNext,
  onShowLine,
}) => {
  const [verdict, setVerdict] = useState<DrillVerdict | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  /** Attempts so far: a new board (and a new selection) for each. */
  const [attempt, setAttempt] = useState(0);
  /** The verdict on the first answer: the one that counts (the next ones are practice). */
  const [counted, setCounted] = useState<DrillVerdict | null>(null);
  const isCounted = useRef(false);

  const settle = useCallback(
    (next: DrillVerdict) => {
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
      settle(judgeDrillMove(position, given.san));
    },
    [position, settle]
  );

  const board = useAnswerBoard(position.fen, verdict === null, onAnswer);
  const retry = () => {
    setVerdict(null);
    setAnswer(null);
    setAttempt((n) => n + 1);
  };

  const side = position.color === 'w' ? 'Blancs' : 'Noirs';
  const isLast = index + 1 === total;
  const success = verdict !== null && isDrillSuccess(verdict);
  const isRetry = verdict !== null && counted !== verdict;
  const line = useMemo(() => formatPvToFrench(START_FEN, position.line, position.line.length), [position.line]);
  const solution = useMemo(() => squaresOf(position.fen, position.bookMoves[0]), [position]);
  const opening = position.opening ? toFrenchOpeningName(position.opening) : '';
  const bookList = position.bookMoves
    .slice(0, SHOWN_BOOK_MOVES)
    .map((san) => toFrenchSan(san))
    .join(', ');
  const hiddenBookMoves = Math.max(0, position.bookMoves.length - SHOWN_BOOK_MOVES);

  return (
    <div className="grid md:grid-cols-[var(--modal-board)_minmax(0,1fr)] gap-4 items-start">
      <div className="w-full max-w-md mx-auto md:max-w-none md:mx-0">
        <ChessBoard
          key={attempt}
          fen={position.fen}
          isFlipped={position.color === 'b'}
          boardTheme={boardTheme}
          lastMove={answer ? { from: answer.from, to: answer.to, classification: success ? 'book' : 'mistake' } : null}
          bestMove={verdict && !success ? solution : null}
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
            Position {index + 1} sur {total} · coup {position.moveNumber}
            {opening && (
              <>
                {' · '}
                {position.eco && <span className="text-indigo-300">[{position.eco}] </span>}
                {opening}
              </>
            )}
          </p>
          <p className="text-sm font-semibold text-slate-100 mt-1">
            Vous jouez les {side}. Quel est le coup de la théorie ?
          </p>
          {line && (
            <p className="text-xs text-slate-300 mt-1">
              <span className="text-slate-400">Ligne :</span> <span className="font-mono">{line}</span>
            </p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            {position.games > 1
              ? `Dans ${position.games} de vos parties, vous avez quitté la théorie ici`
              : 'Dans une de vos parties, vous avez quitté la théorie ici'}
            {' : '}
            {position.played
              .map(
                ({ san, games }) =>
                  `${numberedFrenchMove(position.moveNumber, position.color === 'w', san)}${
                    position.played.length > 1 || games > 1 ? ` (${times(games)})` : ''
                  }`
              )
              .join(', ')}
            , ce qui a coûté en moyenne {decimal.format(position.loss)} points de chances de gain
            {position.date > 0 && ` (dernière fois le ${formatPlayedDate(position.date)})`}.
          </p>
        </div>

        <div role="status" aria-live="polite" className="min-h-6">
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
                {verdictText(verdict, position, answer?.san ?? null)}
                {isRetry && success && ' La position reste à revoir demain.'}
              </p>
            </div>
          )}
        </div>

        {verdict && (
          <p className="text-xs text-slate-300">
            <span className="font-semibold text-slate-200">Coups de la théorie :</span> {bookList}
            {hiddenBookMoves > 0 && ` et ${hiddenBookMoves} autre${hiddenBookMoves > 1 ? 's' : ''}`}.
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {verdict === null && (
            <button type="button" onClick={() => settle({ kind: 'revealed' })} className={SECONDARY}>
              Voir la solution
            </button>
          )}
          {verdict && !success && verdict.kind !== 'revealed' && (
            <button type="button" onClick={retry} className={SECONDARY}>
              Réessayer
            </button>
          )}
          {verdict && (
            <button
              type="button"
              onClick={() => onShowLine(position.line)}
              aria-label="Voir la position dans l'explorateur"
              className={SECONDARY}
            >
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              Voir dans l&apos;explorateur
            </button>
          )}
          {verdict && (
            <button type="button" onClick={onNext} className={PRIMARY}>
              {isLast ? 'Terminer la séance' : 'Position suivante'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
