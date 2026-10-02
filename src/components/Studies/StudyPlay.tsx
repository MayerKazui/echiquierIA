import React, { useState } from 'react';
import { Lightbulb, LockOpen, RotateCcw } from 'lucide-react';
import type { StudyChapter } from '../../types/study';
import type { BoardTheme, PlayerColor } from '../../types/ui';
import { chessAudio } from '../../utils/chessAudio';
import { toFrenchSan } from '../../utils/chessNotation';
import { useMoveInput } from '../../hooks/useMoveInput';
import { useStudyPlay } from '../../hooks/useStudyPlay';
import { ChessBoard } from '../ChessBoard/ChessBoard';
import { BUTTON, SECONDARY, numbered } from '../Openings/shared';

interface StudyPlayProps {
  chapter: StudyChapter;
  boardTheme?: BoardTheme;
  /** Unlocks the chapter: back to reading and writing. */
  onExit: () => void;
}

const playMove = (san: string) => chessAudio.playForMove(san, /[+#]/.test(san));

/**
 * The chapter locked: the player plays one side and the computer answers with the moves of the study, sometimes
 * a variation. A move the study does not play is taken back. The moves of the study stay hidden.
 */
export const StudyPlay: React.FC<StudyPlayProps> = ({ chapter, boardTheme, onExit }) => {
  const [color, setColor] = useState<PlayerColor>(chapter.orientation);
  // Another side starts a new game
  return (
    <LockedGame
      key={color}
      chapter={chapter}
      boardTheme={boardTheme}
      color={color}
      onColor={setColor}
      onExit={onExit}
    />
  );
};

const LockedGame: React.FC<StudyPlayProps & { color: PlayerColor; onColor: (color: PlayerColor) => void }> = ({
  chapter,
  boardTheme,
  color,
  onColor,
  onExit,
}) => {
  const play = useStudyPlay(chapter.root, color, Math.random, playMove);
  const input = useMoveInput(play.node.fen, play.play);
  const last = play.line.length > 0 ? play.line[play.line.length - 1] : null;

  return (
    <div className="grid md:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] gap-4 items-start">
      <div className="w-full max-w-md mx-auto md:mx-0 flex flex-col gap-2">
        <ChessBoard
          fen={play.node.fen}
          isFlipped={color === 'b'}
          boardTheme={boardTheme}
          lastMove={last ? { from: last.from, to: last.to } : null}
          bestMove={play.hint}
          showArrows={play.hint !== null}
          showThreats={false}
          selectedSquare={input.selectedSquare}
          onSquareClick={input.handleSquareClick}
          onPieceMove={input.handlePieceMove}
          promotion={input.pendingPromotion}
          onPromote={input.choosePromotion}
          onCancelPromotion={input.cancelPromotion}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={SECONDARY} disabled={!play.isPlayerTurn} onClick={play.showHint}>
            <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
            Indice
          </button>
          <button
            type="button"
            className={SECONDARY}
            onClick={() => {
              input.reset();
              play.restart();
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Recommencer
          </button>
          <button
            type="button"
            className={`${BUTTON} bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white`}
            onClick={onExit}
          >
            <LockOpen className="w-3.5 h-3.5" aria-hidden="true" />
            Déverrouiller
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 min-w-0">
        <div role="group" aria-label="Côté joué" className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400 mr-1">Je joue :</span>
          {(['w', 'b'] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={color === side}
              onClick={() => {
                onColor(side);
              }}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                color === side
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {side === 'w' ? 'les Blancs' : 'les Noirs'}
            </button>
          ))}
        </div>

        <div role="status" aria-live="polite" className="min-h-10">
          {play.notice ? (
            <p className={`text-sm ${play.isDone ? 'text-emerald-300' : 'text-amber-300'}`}>{play.notice}</p>
          ) : (
            <p className="text-sm text-slate-300">
              {play.line.length === 0 && !play.isPlayerTurn
                ? "L'ordinateur joue le premier coup…"
                : play.isPlayerTurn
                  ? 'À vous de jouer : le coup de l’étude.'
                  : "L'ordinateur répond…"}
            </p>
          )}
        </div>

        {play.line.length > 0 && (
          <ol aria-label="Coups joués" className="flex flex-wrap gap-x-1 gap-y-1 text-xs">
            {play.line.map((node, i) => {
              const before = i === 0 ? chapter.root.fen : play.line[i - 1].fen;
              return (
                <li key={node.id} className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                  {numbered(before, node.san)}
                </li>
              );
            })}
          </ol>
        )}

        {play.line.length > 0 && last?.comment && (
          <p className="text-xs italic text-slate-400">
            {toFrenchSan(last.san)} : {last.comment}
          </p>
        )}

        <p className="text-[11px] text-slate-500">
          Chapitre verrouillé : l&apos;ordinateur joue les coups de l&apos;étude, en prenant parfois une variante. Un
          coup qui s&apos;en écarte est annulé.
          {play.mistakes > 0 && ` Coups hors étude : ${play.mistakes}.`}
        </p>
      </div>
    </div>
  );
};
