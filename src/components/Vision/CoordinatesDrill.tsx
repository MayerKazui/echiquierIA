import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  COORDINATES_SECONDS,
  FILES,
  VISION_LEVELS,
  coordinatesKind,
  isLightSquare,
  nextTarget,
  recordKey,
  type CoordinatesKind,
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

const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

/** The answer to the "colour" question for a square, in the words of its buttons. */
const colorOf = (square: string): 'light' | 'dark' => (isLightSquare(square) ? 'light' : 'dark');

const INTRO: Record<CoordinatesKind, string> = {
  find: `Un nom de case s’affiche, vous cliquez dessus sur un échiquier sans coordonnées. ${COORDINATES_SECONDS} secondes, autant de cases justes que possible : une case manquée vous est montrée en vert, puis on passe à la suivante.`,
  name: `Une case s’éclaire sur un échiquier sans coordonnées : vous donnez son nom (une lettre et un chiffre, au clavier ou avec les boutons). ${COORDINATES_SECONDS} secondes, autant de cases justes que possible. Cet exercice est visuel : il n’a pas d’équivalent pour un lecteur d’écran.`,
  color: `Un nom de case apparaît, vous dites si elle est claire ou foncée, sans échiquier sous les yeux. ${COORDINATES_SECONDS} secondes, autant de réponses justes que possible.`,
};

/** "Coordonnées": a name (or a lit square), thirty seconds, and as many right answers as possible. */
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
  const [miss, setMiss] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(COORDINATES_SECONDS * 1000);
  /** What was left of the countdown when the tab was hidden; the clock is stopped as long as it is not null. */
  const [pausedMs, setPausedMs] = useState<number | null>(null);
  /** The file and the rank typed so far for a "name the square" question. */
  const [typed, setTyped] = useState<{ file: string | null; rank: string | null }>({ file: null, rank: null });
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The score the timer reads when time is up (state would be one render behind a click made in the last tick)
  const scoreRef = useRef(score);

  const start = (level: string) => {
    scoreRef.current = { correct: 0, wrong: 0 };
    setScore(scoreRef.current);
    setFlash({});
    setMiss(null);
    setTyped({ file: null, rank: null });
    setPausedMs(null);
    setTarget(nextTarget(null, random));
    setRemainingMs(COORDINATES_SECONDS * 1000);
    setPhase({ kind: 'run', level, endsAt: Date.now() + COORDINATES_SECONDS * 1000 });
  };

  const endsAt = phase.kind === 'run' ? phase.endsAt : null;
  const level = phase.kind === 'run' ? phase.level : null;
  useEffect(() => {
    if (endsAt === null || level === null || pausedMs !== null) return;
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
  }, [endsAt, level, finish, pausedMs]);

  // The clock stops while the tab is hidden (the player left the exercise, nothing they could answer) and goes on
  // from where it was when the tab is back
  useEffect(() => {
    if (endsAt === null) return;
    const onVisibility = () => {
      if (pausedMs === null && document.visibilityState === 'hidden') {
        setPausedMs(Math.max(0, endsAt - Date.now()));
      } else if (pausedMs !== null && document.visibilityState === 'visible') {
        setPhase((current) => (current.kind === 'run' ? { ...current, endsAt: Date.now() + pausedMs } : current));
        setPausedMs(null);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [endsAt, pausedMs]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    []
  );

  const kind = coordinatesKind(phase.kind === 'setup' ? 'white' : phase.level);

  /** One answer: a square (`find`, `name`) or `light` / `dark` (`color`). */
  const answer = useCallback(
    (given: string) => {
      if (phase.kind !== 'run' || target === null || pausedMs !== null || Date.now() >= phase.endsAt) return;
      const levelKind = coordinatesKind(phase.level);
      const expected = levelKind === 'color' ? colorOf(target) : target;
      const isRight = given === expected;
      scoreRef.current = {
        correct: scoreRef.current.correct + (isRight ? 1 : 0),
        wrong: scoreRef.current.wrong + (isRight ? 0 : 1),
      };
      setScore(scoreRef.current);
      setTyped({ file: null, rank: null });
      if (levelKind === 'color') {
        setFlash({});
        setMiss(isRight ? null : `Raté : ${target} est une case ${expected === 'light' ? 'claire' : 'foncée'}.`);
      } else if (levelKind === 'name') {
        // The square that was lit, green or red
        setFlash({ [target]: isRight ? 'correct' : 'wrong' });
        setMiss(isRight ? null : `Raté : c’était ${target}.`);
      } else {
        // A miss shows where the square was, so the player learns it
        setFlash(isRight ? { [given]: 'correct' } : { [given]: 'wrong', [target]: 'correct' });
        setMiss(null);
      }
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash({}), FLASH_MS);
      setTarget(nextTarget(target, random));
    },
    [phase, target, random, pausedMs]
  );

  // A file and a rank make the square named: whichever comes first, the second one answers
  const type = useCallback(
    (part: { file: string } | { rank: string }) => {
      const next = { ...typed, ...part };
      if (next.file !== null && next.rank !== null) answer(`${next.file}${next.rank}`);
      else setTyped(next);
    },
    [typed, answer]
  );

  const isNaming = phase.kind === 'run' && kind === 'name';
  useEffect(() => {
    if (!isNaming) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName))) return;
      const key = event.key.toLowerCase();
      if (FILES.includes(key) && key.length === 1) type({ file: key });
      else if (RANKS.includes(key)) type({ rank: key });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNaming, type]);

  const levelInfo = VISION_LEVELS.coordinates.find((l) => l.id === (phase.kind === 'setup' ? 'white' : phase.level));
  const orientation = (phase.kind === 'setup' ? 'white' : phase.level) === 'black' ? 'b' : 'w';
  const seconds = Math.ceil(remainingMs / 1000);
  const marks: Record<string, SquareMark> = {
    ...(isNaming && target ? { [target]: 'asked' as const } : {}),
    ...flash,
  };
  const hasBoard = phase.kind !== 'run' || kind !== 'color';

  return (
    <div className="flex flex-col gap-4">
      {phase.kind === 'setup' && (
        <>
          <p className="text-xs text-slate-400">{INTRO.find}</p>
          <ul className="text-xs text-slate-400 list-disc pl-5 flex flex-col gap-1">
            <li>{INTRO.name}</li>
            <li>{INTRO.color}</li>
          </ul>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(event) => setShowLabels(event.target.checked)}
              className="accent-indigo-500"
            />
            Afficher les coordonnées sur les bords de l’échiquier (pour débuter)
          </label>
          <LevelPicker mode="coordinates" records={records} onStart={start} columns="sm:grid-cols-2" />
        </>
      )}

      {phase.kind !== 'setup' && (
        <div className={hasBoard ? 'grid gap-4 md:grid-cols-[minmax(0,32rem)_1fr] items-start' : 'max-w-xl'}>
          {hasBoard && (
            <VisionBoard
              label={
                kind === 'name'
                  ? 'Échiquier sans coordonnées : une case est éclairée, donnez son nom'
                  : 'Échiquier sans coordonnées : cliquez sur la case demandée'
              }
              orientation={orientation}
              boardTheme={boardTheme}
              showLabels={showLabels}
              marks={marks}
              hideNames={kind === 'name'}
              onSquareClick={phase.kind === 'run' && kind === 'find' ? answer : undefined}
            />
          )}
          <div className="flex flex-col gap-3">
            {phase.kind === 'run' && (
              <>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-slate-400">
                      {kind === 'name'
                        ? 'Nommez la case éclairée'
                        : kind === 'color'
                          ? 'Claire ou foncée ?'
                          : 'Trouvez la case'}
                    </p>
                    <p role="status" className="text-5xl font-bold text-amber-300">
                      {kind === 'name' ? (typed.file ?? '_') + (typed.rank ?? '_') : target}
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

                {kind === 'name' && (
                  <div className="flex flex-col gap-2" role="group" aria-label="Nom de la case">
                    <div className="grid grid-cols-8 gap-1.5" role="group" aria-label="Colonne">
                      {[...FILES].map((file) => (
                        <PadButton key={file} label={file} isOn={typed.file === file} onClick={() => type({ file })} />
                      ))}
                    </div>
                    <div className="grid grid-cols-8 gap-1.5" role="group" aria-label="Rangée">
                      {RANKS.map((rank) => (
                        <PadButton key={rank} label={rank} isOn={typed.rank === rank} onClick={() => type({ rank })} />
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Au clavier : une lettre de a à h et un chiffre de 1 à 8, dans l’ordre que vous voulez.
                    </p>
                  </div>
                )}
                {kind === 'color' && (
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="Couleur de la case">
                    <button
                      type="button"
                      onClick={() => answer('light')}
                      className="h-14 rounded-xl border border-amber-200 bg-amber-100 text-amber-950 text-sm font-bold cursor-pointer hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                      Claire
                    </button>
                    <button
                      type="button"
                      onClick={() => answer('dark')}
                      className="h-14 rounded-xl border border-emerald-800 bg-emerald-800 text-emerald-50 text-sm font-bold cursor-pointer hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                      Foncée
                    </button>
                  </div>
                )}

                {miss && (
                  <p aria-live="polite" className="text-xs font-semibold text-rose-300">
                    {miss}
                  </p>
                )}
                <p className="text-xs text-slate-300 tabular-nums">
                  {plural(score.correct, 'bonne réponse', 'bonnes réponses')} ·{' '}
                  {plural(score.wrong, 'erreur', 'erreurs')}
                </p>
                <p className="text-[11px] text-slate-400">
                  {levelInfo?.label}
                  {kind === 'find' && ' · au clavier : flèches pour se déplacer, Entrée pour choisir'}
                  {' · le chronomètre s’arrête si vous quittez l’onglet.'}
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

const PadButton: React.FC<{ label: string; isOn: boolean; onClick: () => void }> = ({ label, isOn, onClick }) => (
  <button
    type="button"
    aria-pressed={isOn}
    onClick={onClick}
    className={`h-10 rounded-lg border text-sm font-bold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
      isOn
        ? 'bg-indigo-600/40 border-indigo-400 text-white'
        : 'bg-slate-900/90 border-slate-700 text-slate-200 hover:bg-slate-800'
    }`}
  >
    {label}
  </button>
);
