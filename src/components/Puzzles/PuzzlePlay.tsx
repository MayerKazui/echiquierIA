import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useAnswerBoard, type Answer } from '../../hooks/useAnswerBoard';
import type { BoardTheme } from '../../types/ui';
import { toFrenchSan } from '../../utils/chessNotation';
import { answerPuzzle, expectedMove, sanOf, solverColor, startPuzzle, type PuzzleState } from '../../utils/puzzle';
import type { Puzzle } from '../../utils/puzzleData';
import { themeLabel } from '../../utils/puzzleThemes';
import { ChessBoard } from '../ChessBoard/ChessBoard';

/** How long the move of the player stays alone on the board before the reply of the opponent. */
const REPLY_DELAY_MS = 400;
/** A puzzle solved at the first try gives way to the next one after this. */
const ADVANCE_DELAY_MS = 800;

const BUTTON =
  'px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

type Phase = 'playing' | 'replying' | 'solved' | 'failed';

interface PuzzleAttemptProps {
  puzzle: Puzzle;
  boardTheme?: BoardTheme;
  /** `true` once the puzzle was solved, `false` at the first wrong move or when the solution was asked for. */
  onOutcome: (isSuccess: boolean) => void;
  /** The outcome that counts (the one of the first attempt), null before there is one. */
  counted: boolean | null;
  onRetry: () => void;
  onNext: () => void;
  isLast: boolean;
}

/** One attempt at a puzzle: the state starts afresh with the component (a new `key` for a new attempt). */
const PuzzleAttempt: React.FC<PuzzleAttemptProps> = ({
  puzzle,
  boardTheme,
  onOutcome,
  counted,
  onRetry,
  onNext,
  isLast,
}) => {
  const [start] = useState(() => startPuzzle(puzzle));
  const [state, setState] = useState<PuzzleState | null>(start);
  /** What the board shows: the position of the state, or the one right after the player's move (before the reply). */
  const [shown, setShown] = useState<{ fen: string; lastMove: PuzzleState['lastMove'] } | null>(null);
  const [phase, setPhase] = useState<Phase>('playing');
  const [wrongMove, setWrongMove] = useState<{ from: string; to: string } | null>(null);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const onAnswer = useCallback(
    (given: Answer) => {
      if (!state) return;
      const promotion = given.uci.length > 4 ? given.uci[4] : undefined;
      const answer = answerPuzzle(puzzle, state, { from: given.from, to: given.to, promotion });
      if (!answer.correct) {
        setWrongMove({ from: given.from, to: given.to });
        setPhase('failed');
        onOutcome(false);
        return;
      }
      if (answer.reply === null) {
        setState(answer.state);
        setShown(null);
        setPhase('solved');
        onOutcome(true);
        return;
      }
      setShown({ fen: answer.playedFen, lastMove: { from: given.from, to: given.to } });
      setPhase('replying');
      timers.current.push(
        setTimeout(() => {
          setState(answer.state);
          setShown(null);
          setPhase('playing');
        }, REPLY_DELAY_MS)
      );
    },
    [puzzle, state, onOutcome]
  );

  const isOpen = phase === 'playing';
  const board = useAnswerBoard(state?.fen ?? puzzle.fen, isOpen, onAnswer);

  const isFirstTrySuccess = phase === 'solved' && counted === true;
  useEffect(() => {
    if (!isFirstTrySuccess) return;
    const timer = setTimeout(onNext, ADVANCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isFirstTrySuccess, onNext]);

  if (!state) {
    return (
      <div role="alert" className="text-xs text-rose-300">
        Ce puzzle est abîmé : passez au suivant.
        <button type="button" onClick={onNext} className={`${BUTTON} ml-2 bg-indigo-600 text-white`}>
          Puzzle suivant
        </button>
      </div>
    );
  }

  const side = solverColor(puzzle);
  const expected = expectedMove(puzzle, state);
  const expectedUci = expected ? `${expected.from}${expected.to}${expected.promotion ?? ''}` : null;
  const solution = expectedUci ? sanOf(state.fen, expectedUci) : null;
  const display = shown ?? { fen: state.fen, lastMove: state.lastMove };
  const isEnded = phase === 'solved' || phase === 'failed';

  const reveal = () => {
    setPhase('failed');
    if (counted === null) onOutcome(false);
  };

  return (
    <div className="grid md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-4 items-start">
      <div className="w-full max-w-md mx-auto md:mx-0">
        <ChessBoard
          fen={display.fen}
          isFlipped={side === 'b'}
          boardTheme={boardTheme}
          lastMove={
            wrongMove
              ? { ...wrongMove, classification: 'mistake' }
              : display.lastMove
                ? { ...display.lastMove, classification: shown ? 'best' : undefined }
                : null
          }
          bestMove={phase === 'failed' && expected ? { from: expected.from, to: expected.to } : null}
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
          <p className="text-sm font-semibold text-slate-100">
            {side === 'w' ? 'Les Blancs' : 'Les Noirs'} jouent : trouvez la meilleure suite.
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Puzzle Lichess · {puzzle.rating} Elo</p>
        </div>

        <div role="status" aria-live="polite" className="min-h-6">
          {phase === 'solved' && (
            <div className="flex items-start gap-2 rounded-xl border px-3 py-2 text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <p>
                <span className="font-semibold">{counted === true ? 'Réussi. ' : 'Trouvé. '}</span>
                {counted === true ? '' : 'Ce puzzle reste compté comme raté.'}
              </p>
            </div>
          )}
          {phase === 'failed' && (
            <div className="flex items-start gap-2 rounded-xl border px-3 py-2 text-xs bg-rose-500/10 border-rose-500/30 text-rose-200">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <p>
                <span className="font-semibold">Raté. </span>
                {solution ? `Le coup attendu était ${toFrenchSan(solution)}.` : 'Voyez le coup attendu sur le plateau.'}
                {counted === false && ' Il reviendra dans vos puzzles à revoir.'}
              </p>
            </div>
          )}
        </div>

        {isEnded && puzzle.themes.length > 0 && (
          <ul aria-label="Thèmes du puzzle" className="flex flex-wrap gap-1.5">
            {puzzle.themes.map((theme) => (
              <li key={theme} className="px-2 py-0.5 rounded-md bg-slate-800 text-[11px] font-semibold text-slate-200">
                {themeLabel(theme)}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {!isEnded && (
            <button
              type="button"
              disabled={phase === 'replying'}
              onClick={reveal}
              className={`${BUTTON} bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700`}
            >
              Voir la solution
            </button>
          )}
          {phase === 'failed' && (
            <button
              type="button"
              onClick={onRetry}
              className={`${BUTTON} bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700`}
            >
              Réessayer
            </button>
          )}
          {isEnded && (
            <button type="button" onClick={onNext} className={`${BUTTON} bg-indigo-600 hover:bg-indigo-500 text-white`}>
              {isLast ? 'Voir le résultat' : 'Puzzle suivant'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface PuzzlePlayProps {
  puzzle: Puzzle;
  boardTheme?: BoardTheme;
  /** Called once, with the first outcome of the puzzle: solved without a wrong move, or not. */
  onResult: (puzzle: Puzzle, isSuccess: boolean) => void;
  onNext: () => void;
  isLast: boolean;
}

/**
 * A puzzle on its board. The first outcome is what counts (a wrong move, or the solution asked for, is a miss);
 * after a miss the player may try again, for practice. A puzzle solved at the first try gives way to the next one.
 */
export const PuzzlePlay: React.FC<PuzzlePlayProps> = ({ puzzle, boardTheme, onResult, onNext, isLast }) => {
  const [attempt, setAttempt] = useState(0);
  const [counted, setCounted] = useState<boolean | null>(null);
  const isCounted = useRef(false);

  const onOutcome = useCallback(
    (isSuccess: boolean) => {
      // Only the first outcome counts; the ones of a new attempt are practice
      if (isCounted.current) return;
      isCounted.current = true;
      setCounted(isSuccess);
      onResult(puzzle, isSuccess);
    },
    [onResult, puzzle]
  );

  return (
    <PuzzleAttempt
      key={attempt}
      puzzle={puzzle}
      boardTheme={boardTheme}
      onOutcome={onOutcome}
      counted={counted}
      onRetry={() => setAttempt((n) => n + 1)}
      onNext={onNext}
      isLast={isLast}
    />
  );
};
