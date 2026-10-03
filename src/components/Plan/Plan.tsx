import React from 'react';
import { BookOpen, CheckCircle2, ClipboardList, Dumbbell, Lightbulb, Puzzle, Upload, X } from 'lucide-react';
import { usePlan } from '../../hooks/usePlan';
import type { PlanAction, PlanItem } from '../../utils/trainingPlan';
import { themeLabel } from '../../utils/puzzleThemes';
import type { TrainingFilter } from '../../utils/spacedRepetition';

interface PlanProps {
  onClose: () => void;
  /** Starts the training on the errors of a theme. */
  onTrain: (filter: TrainingFilter) => void;
  /** Shows a position (the moves played to reach it) in the opening explorer. */
  onShowLine: (line: string[]) => void;
  /** Opens the training on the opening repertoire (the exits from the theory, replayed). */
  onDrill: () => void;
  /** Opens the import of online games. */
  onImport: () => void;
  /** Opens the puzzles on themes of Lichess. */
  onPuzzles: (themes: string[]) => void;
}

const BUTTON =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 text-xs font-semibold text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

const ICONS: Record<PlanAction['kind'], React.ReactNode> = {
  train: <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" />,
  openings: <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />,
  import: <Upload className="w-3.5 h-3.5" aria-hidden="true" />,
  puzzles: <Puzzle className="w-3.5 h-3.5" aria-hidden="true" />,
  habit: <Lightbulb className="w-4 h-4 text-amber-300" aria-hidden="true" />,
};

const LABELS: Record<Exclude<PlanAction['kind'], 'habit'>, string> = {
  train: 'Commencer',
  openings: 'Voir la position',
  import: 'Importer mes parties',
  puzzles: 'Faire des puzzles',
};

const BUTTON_SECONDARY =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

const themesText = (themes: readonly string[]) => themes.map(themeLabel).join(', ');

function Goal({ done, target, text, label }: { done: number; target: number; text: string; label: string }) {
  const isDone = done >= target;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>{text}</span>
        {isDone && (
          <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            Objectif atteint
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={done}
        className="h-1.5 rounded-full bg-slate-800 overflow-hidden"
      >
        <div
          className={`${isDone ? 'bg-emerald-500' : 'bg-indigo-500'} h-full rounded-full`}
          style={{ width: `${(done / target) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** "Mon plan": the few objectives of the week, each with the button that starts it. */
export const Plan: React.FC<PlanProps> = ({ onClose, onTrain, onShowLine, onDrill, onImport, onPuzzles }) => {
  const state = usePlan();

  const run = (action: PlanAction) => {
    if (action.kind === 'train') onTrain(action.filter);
    else if (action.kind === 'openings') onShowLine(action.line);
    else if (action.kind === 'import') onImport();
    else if (action.kind === 'puzzles') onPuzzles(action.themes);
  };

  const renderItem = (item: PlanItem, index: number) => (
    <li key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-3.5 py-3 flex flex-col gap-2.5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="w-6 h-6 shrink-0 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-xs font-bold flex items-center justify-center"
        >
          {item.action.kind === 'habit' ? ICONS.habit : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-100">{item.title}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{item.why}</p>
        </div>
      </div>
      {item.goal && (
        <Goal
          done={item.goal.done}
          target={item.goal.target}
          label="Progression de la semaine"
          text={`Cette semaine : ${item.goal.done} position${item.goal.done > 1 ? 's' : ''} rejouée${item.goal.done > 1 ? 's' : ''} sur ${item.goal.target}`}
        />
      )}
      {item.puzzleGoal && (
        <Goal
          done={item.puzzleGoal.done}
          target={item.puzzleGoal.target}
          label="Progression des puzzles de la semaine"
          text={`Cette semaine : ${item.puzzleGoal.done} puzzle${item.puzzleGoal.done > 1 ? 's' : ''} joué${item.puzzleGoal.done > 1 ? 's' : ''} sur ${item.puzzleGoal.target}`}
        />
      )}
      {item.action.kind !== 'habit' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => run(item.action)} className={BUTTON}>
            {ICONS[item.action.kind]}
            {LABELS[item.action.kind]}
            {item.action.kind === 'puzzles' && <span className="font-normal">: {themesText(item.action.themes)}</span>}
          </button>
          {item.drill && (
            <button type="button" onClick={onDrill} className={BUTTON_SECONDARY}>
              <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" />
              S&apos;entraîner sur mes sorties de théorie
            </button>
          )}
          {item.puzzles && (
            <button type="button" onClick={() => onPuzzles(item.puzzles!)} className={BUTTON_SECONDARY}>
              {ICONS.puzzles}
              Puzzles : {themesText(item.puzzles)}
            </button>
          )}
        </div>
      )}
    </li>
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 max-w-2xl w-full mx-auto max-h-[90dvh]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <ClipboardList className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Mon plan</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Trois objectifs au plus, tirés de vos parties : ce qui vous coûte le plus de points en ce moment.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        role="region"
        aria-label="Contenu du plan"
        tabIndex={0}
        className="overflow-y-auto min-h-0 pr-1 flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
      >
        {state.status === 'loading' && (
          <p role="status" className="text-sm text-slate-400 py-8 text-center">
            Préparation du plan…
          </p>
        )}

        {state.status === 'empty' && (
          <div className="flex flex-col items-center gap-3 text-center py-8 px-2">
            <p className="text-sm font-semibold text-slate-200">Aucune partie enregistrée</p>
            <p className="text-xs text-slate-400 max-w-md">
              Le plan se construit sur vos parties analysées. Importez les dernières depuis chess.com ou Lichess : elles
              s&apos;analysent en arrière-plan.
            </p>
            <button type="button" onClick={onImport} className={BUTTON}>
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              Importer mes parties
            </button>
          </div>
        )}

        {state.status === 'ready' && state.plan.note === 'nothing' && (
          <div className="flex flex-col gap-1.5 text-center py-8 px-2">
            <p className="text-sm font-semibold text-slate-200">Rien d&apos;urgent cette semaine</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Aucune erreur ne revient nettement, aucune sortie d&apos;ouverture ne vous coûte cher et il n&apos;y a pas
              de phase fragile : continuez à jouer et à importer vos parties, le plan se mettra à jour.
            </p>
          </div>
        )}

        {state.status === 'ready' && state.plan.items.length > 0 && (
          <ol aria-label="Objectifs de la semaine" className="flex flex-col gap-3">
            {state.plan.items.map(renderItem)}
          </ol>
        )}
      </div>
    </div>
  );
};
