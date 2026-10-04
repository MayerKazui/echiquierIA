import React, { useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { VISION_GAMES } from '../../data/visionGames';
import {
  QUESTIONS_PER_ROUND,
  VISION_LEVELS,
  contentLabel,
  contentWithArticle,
  contentsOf,
  makeBlindRound,
  recordKey,
  type BlindRound,
  type Random,
  type RunOutcome,
} from '../../utils/vision';
import type { BoardTheme } from '../../types/ui';
import { PRIMARY } from '../Openings/shared';
import { VisionBoard } from './VisionBoard';
import { AnswerGrid, LevelPicker, ResultPanel, type VisionRecords } from './shared';

interface BlindDrillProps {
  records: VisionRecords;
  finish: (key: string, score: number) => Promise<RunOutcome>;
  boardTheme?: BoardTheme;
  random?: Random;
}

type Phase =
  | { kind: 'setup' }
  /** The moves are read one by one; `index` is the one on screen. */
  | { kind: 'announce'; level: string; round: BlindRound; index: number }
  | { kind: 'ask'; level: string; round: BlindRound; index: number; answers: string[]; chosen: string | null }
  | { kind: 'result'; level: string; round: BlindRound; answers: string[] };

/** "Mode aveugle": a game is read move by move on an empty board, then the player says what is on some squares. */
export const BlindDrill: React.FC<BlindDrillProps> = ({ records, finish, boardTheme, random = Math.random }) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' });
  const [keepList, setKeepList] = useState(false);
  // What noting the round gave: it comes back while the player is still reading the last answer
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const roundId = useRef(0);

  const start = (level: string) => {
    const plies = VISION_LEVELS.blind.find((l) => l.id === level)?.plies ?? 6;
    const round = makeBlindRound(VISION_GAMES, plies, random);
    if (!round) return;
    roundId.current += 1;
    setOutcome(null);
    setPhase({ kind: 'announce', level, round, index: 0 });
  };

  const answer = (code: string) => {
    if (phase.kind !== 'ask' || phase.chosen !== null) return;
    const answers = [...phase.answers];
    answers[phase.index] = code;
    setPhase({ ...phase, answers, chosen: code });
    if (phase.index === QUESTIONS_PER_ROUND - 1) {
      // The round is noted as soon as it is answered: closing the window before "Voir le résultat" loses nothing
      const score = phase.round.questions.filter((q, i) => answers[i] === q.answer).length;
      const id = roundId.current;
      void finish(recordKey('blind', phase.level), score).then((noted) => {
        if (id === roundId.current) setOutcome(noted);
      });
    }
  };

  const goOn = () => {
    if (phase.kind === 'announce') {
      if (phase.index + 1 < phase.round.labels.length) setPhase({ ...phase, index: phase.index + 1 });
      else setPhase({ kind: 'ask', level: phase.level, round: phase.round, index: 0, answers: [], chosen: null });
    } else if (phase.kind === 'ask' && phase.chosen !== null) {
      if (phase.index + 1 < QUESTIONS_PER_ROUND) {
        setPhase({ ...phase, index: phase.index + 1, chosen: null });
      } else {
        setPhase({ kind: 'result', level: phase.level, round: phase.round, answers: phase.answers });
      }
    }
  };

  const scoreOf = (round: BlindRound, answers: string[]) =>
    round.questions.filter((q, i) => answers[i] === q.answer).length;

  return (
    <div className="flex flex-col gap-4">
      {phase.kind === 'setup' && (
        <>
          <p className="text-xs text-slate-400">
            Une vraie partie vous est lue coup par coup, sans une seule pièce à l’écran : à vous de les suivre dans
            votre tête. Après le dernier coup, on vous demande ce que contiennent {QUESTIONS_PER_ROUND} cases. Les
            pièces apparaissent à la fin, pour vérifier.
          </p>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={keepList}
              onChange={(event) => setKeepList(event.target.checked)}
              className="accent-indigo-500"
            />
            Garder sous les yeux la liste des coups déjà lus (plus facile)
          </label>
          <LevelPicker mode="blind" records={records} onStart={start} />
        </>
      )}

      {phase.kind === 'announce' && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,32rem)_1fr] items-start">
          <VisionBoard label="Échiquier sans pièces : suivez la partie dans votre tête" boardTheme={boardTheme} />
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-slate-400">
              Coup {phase.index + 1} sur {phase.round.labels.length}
            </p>
            <p role="status" className="text-4xl font-bold text-amber-300">
              {phase.round.labels[phase.index]}
            </p>
            {keepList && phase.index > 0 && (
              <p className="text-xs text-slate-300">
                <span className="text-slate-400">Déjà lus : </span>
                {phase.round.labels.slice(0, phase.index).join(' ')}
              </p>
            )}
            <button type="button" onClick={goOn} autoFocus className={`${PRIMARY} self-start`}>
              {phase.index + 1 < phase.round.labels.length ? 'Coup suivant' : 'Terminé : poser les questions'}
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'ask' && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,32rem)_1fr] items-start">
          <VisionBoard
            label="Échiquier sans pièces"
            boardTheme={boardTheme}
            marks={{ [phase.round.questions[phase.index].square]: 'asked' }}
          />
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-slate-400">
              Question {phase.index + 1} sur {QUESTIONS_PER_ROUND}
            </p>
            <p className="text-sm text-slate-100">
              Que contient la case{' '}
              <strong className="text-amber-300 text-lg">{phase.round.questions[phase.index].square}</strong> ?
            </p>
            <AnswerGrid
              onAnswer={answer}
              isAnswered={phase.chosen !== null}
              chosen={phase.chosen}
              correct={phase.round.questions[phase.index].answer}
            />
            {phase.chosen !== null && (
              <>
                <p role="status" className="text-sm font-semibold">
                  {phase.chosen === phase.round.questions[phase.index].answer ? (
                    <span className="text-emerald-300">Juste.</span>
                  ) : (
                    <span className="text-rose-300">
                      Raté : {phase.round.questions[phase.index].square} contenait{' '}
                      {contentWithArticle(phase.round.questions[phase.index].answer)}.
                    </span>
                  )}
                </p>
                <button type="button" onClick={goOn} autoFocus className={`${PRIMARY} self-start`}>
                  {phase.index + 1 < QUESTIONS_PER_ROUND ? 'Question suivante' : 'Voir le résultat'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {phase.kind === 'result' && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,32rem)_1fr] items-start">
          <VisionBoard
            label="Position à la fin de la partie lue"
            boardTheme={boardTheme}
            contents={contentsOf(phase.round.fen)}
            marks={Object.fromEntries(
              phase.round.questions.map((q, i) => [q.square, phase.answers[i] === q.answer ? 'correct' : 'wrong'])
            )}
          />
          <ResultPanel
            mode="blind"
            score={scoreOf(phase.round, phase.answers)}
            outcome={outcome}
            onAgain={() => start(phase.level)}
            onBack={() => setPhase({ kind: 'setup' })}
          >
            <ul className="flex flex-col gap-1">
              {phase.round.questions.map((q, i) => {
                const isRight = phase.answers[i] === q.answer;
                return (
                  <li key={q.square} className="flex items-start gap-2 text-xs text-slate-300">
                    {isRight ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" aria-label="Juste" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0 text-rose-400" aria-label="Raté" />
                    )}
                    <span>
                      <strong className="text-slate-100">{q.square}</strong> : {contentLabel(q.answer)}
                      {!isRight && (
                        <span className="text-slate-400"> (vous aviez dit : {contentLabel(phase.answers[i])})</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-slate-400">
              Partie lue : {phase.round.game.name}. Les coups : {phase.round.labels.join(' ')}
            </p>
          </ResultPanel>
        </div>
      )}
    </div>
  );
};
