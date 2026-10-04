import React, { useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { ChessPiece } from '../ChessBoard/ChessPieces';
import { getSquareStyle } from '../ChessBoard/boardTheme';
import { nextSquare, type BoardKey } from '../../utils/accessibility';
import { EMPTY, contentLabel, isLightSquare } from '../../utils/vision';
import type { BoardTheme } from '../../types/ui';

/** What a square shows besides its piece: the one asked about, the player's choice, the right and wrong answers. */
export type SquareMark = 'asked' | 'from' | 'selected' | 'correct' | 'wrong';

interface VisionBoardProps {
  /** Accessible name of the board (what it is for in this exercise). */
  label: string;
  /** The side at the bottom. */
  orientation?: 'w' | 'b';
  boardTheme?: BoardTheme;
  /** The coordinates along the edges (an exercise on the names of the squares hides them). */
  showLabels?: boolean;
  /** What every square holds (`empty` or a piece code like `wn`); none given: no piece is drawn nor named. */
  contents?: Record<string, string> | null;
  marks?: Record<string, SquareMark>;
  /** Given, the squares can be clicked (and reached with the arrow keys). */
  onSquareClick?: (square: string) => void;
  /** An exercise that asks for the name of a square must not say it: the squares are then only "case". */
  hideNames?: boolean;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

const MARK_STYLES: Record<SquareMark, string> = {
  asked: 'ring-4 ring-inset ring-amber-400 bg-amber-300/40',
  from: 'ring-4 ring-inset ring-sky-400 bg-sky-300/40',
  selected: 'ring-4 ring-inset ring-sky-500 bg-sky-400/50',
  correct: 'ring-4 ring-inset ring-emerald-500 bg-emerald-400/50',
  wrong: 'ring-4 ring-inset ring-rose-500 bg-rose-400/50',
};

const MARK_TEXT: Record<SquareMark, string> = {
  asked: 'case demandée',
  from: 'pièce à suivre',
  selected: 'votre choix',
  correct: 'bonne réponse',
  wrong: 'réponse fausse',
};

/**
 * A board for the vision exercises: it can hide the pieces and the coordinates, which the analysis board never does,
 * and it names a square only as the player is allowed to know it (a square of a blind exercise is never said to
 * hold a piece, so that a screen reader gives nothing away). Same grid structure and keyboard as the analysis board.
 */
export const VisionBoard: React.FC<VisionBoardProps> = ({
  label,
  orientation = 'w',
  boardTheme = 'green',
  showLabels = true,
  contents = null,
  marks,
  onSquareClick,
  hideNames = false,
}) => {
  const isFlipped = orientation === 'b';
  const files = isFlipped ? [...FILES].reverse() : FILES;
  const ranks = isFlipped ? [...RANKS].reverse() : RANKS;
  const [focused, setFocused] = useState('e4');
  const cells = useRef<Record<string, HTMLDivElement | null>>({});
  const isPointer = useRef(false);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = nextSquare(focused, event.key as BoardKey, isFlipped);
      setFocused(next);
      cells.current[next]?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSquareClick?.(focused);
    }
  };

  return (
    <div className="relative w-full aspect-square select-none rounded-xl shadow-2xl border-2 sm:border-4 border-slate-800 bg-slate-900 mx-auto">
      <div
        role="grid"
        aria-label={label}
        aria-rowcount={8}
        aria-colcount={8}
        onKeyDown={onKeyDown}
        onPointerDownCapture={() => {
          isPointer.current = true;
        }}
        onPointerUpCapture={() => {
          isPointer.current = false;
        }}
        onPointerCancelCapture={() => {
          isPointer.current = false;
        }}
        className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-lg overflow-hidden"
      >
        {ranks.map((rank, row) => (
          <div key={rank} role="row" aria-rowindex={row + 1} className="contents">
            {files.map((file, col) => {
              const square = `${file}${rank}`;
              const code = contents ? contents[square] : undefined;
              const piece = code && code !== EMPTY ? { color: code[0] as 'w' | 'b', type: code[1] } : null;
              const mark = marks?.[square];
              const { squareBg, coordTextColor } = getSquareStyle(boardTheme, isLightSquare(square), false);
              const name = [
                hideNames ? 'case' : square,
                contents ? contentLabel(code ?? EMPTY) : null,
                mark ? MARK_TEXT[mark] : null,
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <div
                  key={square}
                  role="gridcell"
                  data-square={square}
                  aria-colindex={col + 1}
                  aria-label={name}
                  ref={(element) => {
                    cells.current[square] = element;
                  }}
                  tabIndex={square === focused ? 0 : -1}
                  onFocus={(event) => {
                    setFocused(square);
                    if (isPointer.current) event.currentTarget.blur(); // focus from the mouse: not the keyboard
                  }}
                  onClick={() => onSquareClick?.(square)}
                  className={`relative flex items-center justify-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                    onSquareClick ? 'cursor-pointer' : ''
                  } ${squareBg} ${mark ? MARK_STYLES[mark] : ''}`}
                >
                  {showLabels && file === files[0] && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-0.5 left-1 text-[10px] font-bold pointer-events-none ${coordTextColor}`}
                    >
                      {rank}
                    </span>
                  )}
                  {showLabels && rank === ranks[7] && (
                    <span
                      aria-hidden="true"
                      className={`absolute bottom-0.5 right-1 text-[10px] font-bold pointer-events-none ${coordTextColor}`}
                    >
                      {file}
                    </span>
                  )}
                  {piece && (
                    <div aria-hidden="true" className="relative w-[84%] h-[84%] z-10 pointer-events-none">
                      <ChessPiece type={piece.type} color={piece.color} />
                    </div>
                  )}
                  {(mark === 'correct' || mark === 'wrong') && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-0.5 right-0.5 z-20 rounded-full p-0.5 text-white ${
                        mark === 'correct' ? 'bg-emerald-600' : 'bg-rose-600'
                      }`}
                    >
                      {mark === 'correct' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
