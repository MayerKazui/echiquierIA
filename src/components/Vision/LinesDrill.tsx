import React, { useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  QUESTIONS_PER_ROUND,
  VISION_LEVELS,
  contentDefinite,
  contentLabel,
  contentWithArticle,
  contentsOf,
  contentCode,
  makeLineRound,
  recordKey,
  type LineQuestion,
  type Random,
  type RunOutcome,
} from '../../utils/vision';
import type { BoardTheme } from '../../types/ui';
import { PRIMARY, SECONDARY } from '../Openings/shared';
import { VisionBoard, type SquareMark } from './VisionBoard';
import {
  AnswerGrid,
  LevelPicker,
  ResultPanel,
  SourcePicker,
  gamesFor,
  type GameSource,
  type VisionRecords,
} from './shared';

interface LinesDrillProps {
  records: VisionRecords;
  finish: (key: string, score: number) => Promise<RunOutcome>;
  boardTheme?: BoardTheme;
  random?: Random;
  /** Which games the stretches are taken from: the reserve of famous ones, or the player's own. */
  source: GameSource;
}

/** The answer of a "where" question when the piece was taken (the other answers are squares or piece codes). */
const TAKEN = 'taken';

type Phase =
  | { kind: 'setup' }
  | {
      kind: 'ask';
      level: string;
      questions: LineQuestion[];
      index: number;
      answers: string[];
      /** The square chosen on the board, not validated yet. */
      selected: string | null;
      /** What the player answered to this question; null while it is open. */
      given: string | null;
    }
  | { kind: 'result'; level: string; questions: LineQuestion[]; answers: string[] };

/** What the rules say the answer is, in the same terms as the player's. */
const expected = (q: LineQuestion): string => (q.kind === 'where' ? (q.answer ?? TAKEN) : q.answer);

/** What the player was told to find, in a sentence. */
function askText(q: LineQuestion): React.ReactNode {
  return q.kind === 'where' ? (
    <>
      Sans jouer les coups, où se trouve {contentDefinite(contentCode(q.piece))} de{' '}
      <strong className="text-sky-300 text-lg">{q.piece.origin}</strong> à la fin de la ligne ?
    </>
  ) : (
    <>
      Sans jouer les coups, que contient la case <strong className="text-amber-300 text-lg">{q.square}</strong> à la fin
      de la ligne ?
    </>
  );
}

/** What the right answer was, in a sentence. */
function solutionText(q: LineQuestion): string {
  if (q.kind === 'what') return `${q.square} contient ${contentWithArticle(q.answer)}.`;
  const piece = contentDefinite(contentCode(q.piece));
  return q.answer === null
    ? `${capitalizedFirst(piece)} a été prise.`
    : `${capitalizedFirst(piece)} est en ${q.answer}.`;
}

const capitalizedFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** What the player said, in words, for the list of the result. */
function givenText(q: LineQuestion, given: string): string {
  if (q.kind === 'what') return contentLabel(given);
  return given === TAKEN ? 'prise' : `en ${given}`;
}

/** "Calcul de lignes": a stretch of a real game is written out; the player works out where things end up. */
export const LinesDrill: React.FC<LinesDrillProps> = ({
  records,
  finish,
  boardTheme,
  random = Math.random,
  source,
}) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' });
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const roundId = useRef(0);

  const start = (level: string) => {
    const plies = VISION_LEVELS.lines.find((l) => l.id === level)?.plies ?? 2;
    const { games, isFallback: usesReserve } = gamesFor(source, plies, random);
    const questions = makeLineRound(games, plies, random);
    if (questions.length === 0) return;
    setIsFallback(usesReserve);
    roundId.current += 1;
    setOutcome(null);
    setPhase({ kind: 'ask', level, questions, index: 0, answers: [], selected: null, given: null });
  };

  const give = (answer: string) => {
    if (phase.kind !== 'ask' || phase.given !== null) return;
    const answers = [...phase.answers];
    answers[phase.index] = answer;
    setPhase({ ...phase, answers, given: answer });
    if (phase.index === phase.questions.length - 1) {
      // Noted as soon as it is answered: closing the window before "Voir le résultat" loses nothing
      const score = phase.questions.filter((q, i) => answers[i] === expected(q)).length;
      const id = roundId.current;
      void finish(recordKey('lines', phase.level), score).then((noted) => {
        if (id === roundId.current) setOutcome(noted);
      });
    }
  };

  const goOn = () => {
    if (phase.kind !== 'ask' || phase.given === null) return;
    if (phase.index + 1 < phase.questions.length) {
      setPhase({ ...phase, index: phase.index + 1, selected: null, given: null });
    } else {
      setPhase({ kind: 'result', level: phase.level, questions: phase.questions, answers: phase.answers });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {phase.kind === 'setup' && (
        <>
          <p className="text-xs text-slate-400">
            Un bout de vraie partie (célèbre, ou une des vôtres) s’écrit sous l’échiquier : vous ne le jouez pas, vous
            le calculez. Puis on vous demande où une pièce a fini, ou ce que contient une case. L’échiquier montre
            ensuite la position atteinte. Série de {QUESTIONS_PER_ROUND} questions.
          </p>
          <SourcePicker source={source} isFallback={isFallback} />
          <LevelPicker
            mode="lines"
            records={records}
            onStart={start}
            isDisabled={source.id === 'own' && source.own.status !== 'ready'}
          />
        </>
      )}

      {phase.kind === 'ask' && (
        <AskStep
          phase={phase}
          boardTheme={boardTheme}
          onSelect={(square) => setPhase({ ...phase, selected: square })}
          onGive={give}
          onNext={goOn}
        />
      )}

      {phase.kind === 'result' && (
        <ResultPanel
          mode="lines"
          score={phase.questions.filter((q, i) => phase.answers[i] === expected(q)).length}
          outcome={outcome}
          onAgain={() => start(phase.level)}
          onBack={() => setPhase({ kind: 'setup' })}
        >
          <ul className="flex flex-col gap-2">
            {phase.questions.map((q, i) => {
              const isRight = phase.answers[i] === expected(q);
              return (
                <li key={`${q.game.id}:${q.from}`} className="flex items-start gap-2 text-xs text-slate-300">
                  {isRight ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" aria-label="Juste" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0 text-rose-400" aria-label="Raté" />
                  )}
                  <span>
                    <span className="text-slate-100">{q.line}</span> — {solutionText(q)}
                    {!isRight && (
                      <span className="text-slate-400"> (vous aviez dit : {givenText(q, phase.answers[i])})</span>
                    )}
                    <span className="block text-slate-400">{q.game.name}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </ResultPanel>
      )}
    </div>
  );
};

interface AskStepProps {
  phase: Extract<Phase, { kind: 'ask' }>;
  boardTheme?: BoardTheme;
  onSelect: (square: string) => void;
  onGive: (answer: string) => void;
  onNext: () => void;
}

/** One question: the board at the start of the line, then, once answered, at its end. */
const AskStep: React.FC<AskStepProps> = ({ phase, boardTheme, onSelect, onGive, onNext }) => {
  const q = phase.questions[phase.index];
  const isAnswered = phase.given !== null;
  const right = expected(q);
  const isRight = phase.given === right;

  const marks: Record<string, SquareMark> = {};
  if (q.kind === 'where') {
    marks[q.piece.origin] = 'from';
    if (!isAnswered && phase.selected) marks[phase.selected] = 'selected';
    if (isAnswered) {
      if (phase.given !== TAKEN && phase.given !== right) marks[phase.given!] = 'wrong';
      if (q.answer !== null) marks[q.answer] = 'correct';
    }
  } else {
    marks[q.square] = !isAnswered ? 'asked' : isRight ? 'correct' : 'wrong';
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,32rem)_1fr] items-start">
      <VisionBoard
        label={isAnswered ? 'Position à la fin de la ligne' : 'Position au début de la ligne'}
        orientation={q.startFen.split(' ')[1] === 'b' ? 'b' : 'w'}
        boardTheme={boardTheme}
        contents={contentsOf(isAnswered ? q.endFen : q.startFen)}
        marks={marks}
        onSquareClick={q.kind === 'where' && !isAnswered ? onSelect : undefined}
      />
      <div className="flex flex-col gap-3">
        <p className="text-[11px] text-slate-400">
          Question {phase.index + 1} sur {phase.questions.length}
        </p>
        <div className="rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2">
          <p className="text-[11px] text-slate-400">La ligne ({q.plies} demi-coups)</p>
          <p className="text-lg font-semibold text-amber-300">{q.line}</p>
        </div>
        <p className="text-sm text-slate-100">{askText(q)}</p>

        {q.kind === 'where' && !isAnswered && (
          <>
            <p className="text-xs text-slate-400">
              Cliquez sur la case d’arrivée de la pièce (flèches et Entrée au clavier), puis validez.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={phase.selected === null}
                onClick={() => onGive(phase.selected!)}
                className={PRIMARY}
              >
                {phase.selected ? `Valider : ${phase.selected}` : 'Valider ma réponse'}
              </button>
              <button type="button" onClick={() => onGive(TAKEN)} className={SECONDARY}>
                La pièce est prise
              </button>
            </div>
          </>
        )}

        {q.kind === 'what' && (
          <AnswerGrid
            onAnswer={onGive}
            isAnswered={isAnswered}
            chosen={phase.given}
            correct={isAnswered ? right : null}
          />
        )}

        {isAnswered && (
          <>
            <p role="status" className="text-sm font-semibold">
              <span className={isRight ? 'text-emerald-300' : 'text-rose-300'}>
                {isRight ? 'Juste. ' : 'Raté. '}
                {solutionText(q)}
              </span>
            </p>
            <button type="button" onClick={onNext} autoFocus className={`${PRIMARY} self-start`}>
              {phase.index + 1 < phase.questions.length ? 'Question suivante' : 'Voir le résultat'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
