import React from 'react';
import { Check, X } from 'lucide-react';
import { ChessPiece } from '../ChessBoard/ChessPieces';
import { PRIMARY, SECONDARY } from '../Openings/shared';
import {
  EMPTY,
  PIECE_CODES,
  QUESTIONS_PER_ROUND,
  VISION_LEVELS,
  contentLabel,
  recordKey,
  type RunOutcome,
  type VisionMode,
  type VisionRecord,
} from '../../utils/vision';

export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** "21" for the coordinates (a count in 30 seconds), "4/5" for a round of questions. */
export const formatScore = (mode: VisionMode, score: number): string =>
  mode === 'coordinates' ? String(score) : `${score}/${QUESTIONS_PER_ROUND}`;

export const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export type VisionRecords = ReadonlyMap<string, VisionRecord> | null;

interface LevelPickerProps {
  mode: VisionMode;
  records: VisionRecords;
  onStart: (levelId: string) => void;
}

/** The levels of an exercise, each with its record, and the button that starts a round there. */
export const LevelPicker: React.FC<LevelPickerProps> = ({ mode, records, onStart }) => (
  <ul className="grid gap-2 sm:grid-cols-3" aria-label="Niveaux">
    {VISION_LEVELS[mode].map((level) => {
      const record = records?.get(recordKey(mode, level.id));
      return (
        <li key={level.id} className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 flex flex-col gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-100">{level.label}</p>
            <p className="text-[11px] text-slate-400">{level.hint}</p>
          </div>
          <p className="text-xs text-slate-300 tabular-nums">
            {records === null
              ? 'Chargement du record…'
              : record
                ? `Record : ${formatScore(mode, record.best)} · ${plural(record.runs, 'partie', 'parties')}`
                : 'Pas encore de score'}
          </p>
          <button
            type="button"
            onClick={() => onStart(level.id)}
            aria-label={`Commencer : ${level.label}, ${level.hint}`}
            className={`${PRIMARY} self-start`}
          >
            Commencer
          </button>
        </li>
      );
    })}
  </ul>
);

interface ResultPanelProps {
  mode: VisionMode;
  score: number;
  /** Null while the round is being noted. */
  outcome: RunOutcome | null;
  children?: React.ReactNode;
  onAgain: () => void;
  onBack: () => void;
}

/** The score of a round, whether it is a record, and what to do next. */
export const ResultPanel: React.FC<ResultPanelProps> = ({ mode, score, outcome, children, onAgain, onBack }) => (
  <div className="flex flex-col gap-3">
    <div role="status" className="flex flex-col gap-1">
      <p className="text-lg font-bold text-slate-100 tabular-nums">Score : {formatScore(mode, score)}</p>
      {outcome === null ? (
        <p className="text-xs text-slate-400">Enregistrement du score…</p>
      ) : outcome.isRecord ? (
        <p className="text-sm font-semibold text-emerald-300">
          {outcome.previousBest === null
            ? 'Premier score enregistré : c’est votre record à battre.'
            : `Nouveau record ! L’ancien était ${formatScore(mode, outcome.previousBest)}.`}
        </p>
      ) : (
        <p className="text-xs text-slate-300">Votre record à ce niveau : {formatScore(mode, outcome.record.best)}.</p>
      )}
    </div>
    {children}
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onAgain} className={PRIMARY}>
        Rejouer ce niveau
      </button>
      <button type="button" onClick={onBack} className={SECONDARY}>
        Changer de niveau
      </button>
    </div>
  </div>
);

interface AnswerGridProps {
  onAnswer: (code: string) => void;
  /** After an answer: the buttons stop, the right one and the player's wrong one show. */
  isAnswered?: boolean;
  chosen?: string | null;
  correct?: string | null;
}

const BUTTON_BASE =
  'relative flex items-center justify-center rounded-lg border h-12 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-default';

/** What a square holds: empty, or one of the twelve pieces. */
export const AnswerGrid: React.FC<AnswerGridProps> = ({
  onAnswer,
  isAnswered = false,
  chosen = null,
  correct = null,
}) => {
  // Light buttons for the pieces: the black ones are lost on a dark background
  const style = (code: string) => {
    if (isAnswered && code === correct) return 'bg-emerald-200 border-emerald-500 text-emerald-950';
    if (isAnswered && code === chosen) return 'bg-rose-200 border-rose-500 text-rose-950';
    if (code === EMPTY) {
      return `bg-slate-800 border-slate-700 text-slate-200 ${isAnswered ? 'opacity-50' : 'hover:bg-slate-700 cursor-pointer'}`;
    }
    return `bg-slate-200 border-slate-400 text-slate-900 ${isAnswered ? 'opacity-50' : 'hover:bg-white cursor-pointer'}`;
  };
  const mark = (code: string) =>
    isAnswered && (code === correct || code === chosen) ? (
      <span
        aria-hidden="true"
        className={`absolute top-0.5 right-0.5 rounded-full p-0.5 text-white ${code === correct ? 'bg-emerald-600' : 'bg-rose-600'}`}
      >
        {code === correct ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      </span>
    ) : null;
  return (
    <div role="group" aria-label="Réponses possibles" className="flex flex-col gap-2">
      <button
        type="button"
        disabled={isAnswered}
        onClick={() => onAnswer(EMPTY)}
        className={`${BUTTON_BASE} w-full ${style(EMPTY)}`}
      >
        Case vide
        {mark(EMPTY)}
      </button>
      <div className="grid grid-cols-6 gap-1.5">
        {PIECE_CODES.map((code) => (
          <button
            key={code}
            type="button"
            disabled={isAnswered}
            onClick={() => onAnswer(code)}
            aria-label={capitalized(contentLabel(code))}
            className={`${BUTTON_BASE} ${style(code)}`}
          >
            <span aria-hidden="true" className="w-8 h-8">
              <ChessPiece type={code[1]} color={code[0] as 'w' | 'b'} />
            </span>
            {mark(code)}
          </button>
        ))}
      </div>
    </div>
  );
};
