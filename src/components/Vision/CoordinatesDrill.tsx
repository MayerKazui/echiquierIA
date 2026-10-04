import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  COORDINATES_SECONDS,
  VISION_LEVELS,
  nextTarget,
  recordKey,
  type Random,
  type RunOutcome,
} from '../../utils/vision';
import type { BoardTheme } from '../../types/ui';
import { VisionBoard, type SquareMark } from './VisionBoard';
import { LevelPicker, ResultPanel, plural, type VisionRecords } from './shared';

interface CoordinatesDrillProps {
  records: VisionRecords;
  finish: (key: string, score: number) => Promise<RunOutcome>;
  boardTheme?: BoardTheme;
  random?: Random;
}

type Phase =
  | { kind: 'setup' }
  | { kind: 'run'; level: string; endsAt: number }
  | { kind: 'result'; level: string; correct: number; wrong: number; outcome: RunOutcome | null };

/** How long the green or red of an answer stays on the board. */
const FLASH_MS = 350;
const TICK_MS = 100;

/** "Trouvez e4": a name on top, an empty board, thirty seconds, and as many right squares as possible. */
export const CoordinatesDrill: React.FC<CoordinatesDrillProps> = ({
  records,
  finish,
  boardTheme,
  random = Math.random,
}) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' });
  const [showLabels, setShowLabels] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [flash, setFlash] = useState<Record<string, SquareMark>>({});
  const [remainingMs, setRemainingMs] = useState(COORDINATES_SECONDS * 1000);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The score the timer reads when time is up (state would be one render behind a click made in the last tick)
  const scoreRef = useRef(score);

  const start = (level: string) => {
    scoreRef.current = { correct: 0, wrong: 0 };
    setScore(scoreRef.current);
    setFlash({});
    setTarget(nextTarget(null, random));
    setRemainingMs(COORDINATES_SECONDS * 1000);
    setPhase({ kind: 'run', level, endsAt: Date.now() + COORDINATES_SECONDS * 1000 });
  };

  const endsAt = phase.kind === 'run' ? phase.endsAt : null;
  const level = phase.kind === 'run' ? phase.level : null;
  useEffect(() => {
    if (endsAt === null || level === null) return;
    let isOver = false; // two ticks queued before the first one is handled must not note the round twice
    const timer = setInterval(() => {
      if (isOver) return;
      const left = endsAt - Date.now();
      if (left > 0) {
        setRemainingMs(left);
        return;
      }
      isOver = true;
      clearInterval(timer);
      setRemainingMs(0);
      const { correct, wrong } = scoreRef.current;
      setPhase({ kind: 'result', level, correct, wrong, outcome: null });
      void finish(recordKey('coordinates', level), correct).then((outcome) =>
        setPhase((current) =>
          current.kind === 'result' && current.level === level ? { ...current, outcome } : current
        )
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [endsAt, level, finish]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    []
  );

  const answer = useCallback(
    (square: string) => {
      if (phase.kind !== 'run' || target === null || Date.now() >= phase.endsAt) return;
      const isRight = square === target;
      scoreRef.current = {
        correct: scoreRef.current.correct + (isRight ? 1 : 0),
        wrong: scoreRef.current.wrong + (isRight ? 0 : 1),
      };
      setScore(scoreRef.current);
      // A miss shows where the square was, so the player learns it
      setFlash(isRight ? { [square]: 'correct' } : { [square]: 'wrong', [target]: 'correct' });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash({}), FLASH_MS);
      setTarget(nextTarget(target, random));
    },
    [phase, target, random]
  );

  const levelInfo = VISION_LEVELS.coordinates.find((l) => l.id === (phase.kind === 'setup' ? 'white' : phase.level));
  const orientation = (phase.kind === 'setup' ? 'white' : phase.level) === 'black' ? 'b' : 'w';
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="flex flex-col gap-4">
      {phase.kind === 'setup' && (
        <>
          <p className="text-xs text-slate-400">
            Un nom de case s’affiche, vous cliquez dessus sur un échiquier sans coordonnées. {COORDINATES_SECONDS}{' '}
            secondes, autant de cases justes que possible : une case manquée vous est montrée en vert, puis on passe à
            la suivante.
          </p>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(event) => setShowLabels(event.target.checked)}
              className="accent-indigo-500"
            />
            Afficher les coordonnées sur les bords de l’échiquier (pour débuter)
          </label>
          <LevelPicker mode="coordinates" records={records} onStart={start} />
        </>
      )}

      {phase.kind !== 'setup' && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,32rem)_1fr] items-start">
          <VisionBoard
            label="Échiquier sans coordonnées : cliquez sur la case demandée"
            orientation={orientation}
            boardTheme={boardTheme}
            showLabels={showLabels}
            marks={flash}
            onSquareClick={phase.kind === 'run' ? answer : undefined}
          />
          <div className="flex flex-col gap-3">
            {phase.kind === 'run' && (
              <>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-slate-400">Trouvez la case</p>
                    <p role="status" className="text-5xl font-bold text-amber-300">
                      {target}
                    </p>
                  </div>
                  <p className="text-sm text-slate-300 tabular-nums">
                    <span aria-hidden="true">{seconds} s</span>
                    <span className="sr-only">Il reste {seconds} secondes</span>
                  </p>
                </div>
                <div aria-hidden="true" className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${(remainingMs / (COORDINATES_SECONDS * 1000)) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-300 tabular-nums">
                  {plural(score.correct, 'bonne réponse', 'bonnes réponses')} ·{' '}
                  {plural(score.wrong, 'erreur', 'erreurs')}
                </p>
                <p className="text-[11px] text-slate-400">
                  {levelInfo?.label} · au clavier : flèches pour se déplacer, Entrée pour choisir.
                </p>
              </>
            )}
            {phase.kind === 'result' && (
              <ResultPanel
                mode="coordinates"
                score={phase.correct}
                outcome={phase.outcome}
                onAgain={() => start(phase.level)}
                onBack={() => setPhase({ kind: 'setup' })}
              >
                <p className="text-xs text-slate-300">
                  {plural(phase.correct, 'case trouvée', 'cases trouvées')}, {plural(phase.wrong, 'erreur', 'erreurs')}
                  {phase.correct + phase.wrong > 0
                    ? ` : ${Math.round((phase.correct / (phase.correct + phase.wrong)) * 100)} % de réussite.`
                    : '.'}
                </p>
              </ResultPanel>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
