import React, { useEffect, useState } from 'react';
import { Puzzle as PuzzleIcon, X } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePlayerElo } from '../../hooks/usePlayerElo';
import { usePuzzleReview } from '../../hooks/usePuzzleReview';
import { useWoodpecker } from '../../hooks/useWoodpecker';
import { loadPuzzleIndex, loadPuzzles } from '../../services/puzzleBook';
import type { BoardTheme } from '../../types/ui';
import type { Puzzle, PuzzleIndex } from '../../utils/puzzleData';
import { pickReview, type PuzzleEntry } from '../../utils/puzzleReview';
import {
  DEFAULT_RANGE,
  TIMER_OPTIONS,
  normalizeRange,
  shuffle,
  suggestRange,
  toFilter,
  type EloRange,
} from '../../utils/puzzleRun';
import { beginCycle, createSet, drawLot } from '../../utils/woodpecker';
import { PuzzleRun, type RunReport } from './PuzzleRun';
import { PuzzleSetup, type PuzzleChoice } from './PuzzleSetup';
import { PuzzleSummary } from './PuzzleSummary';
import { WoodpeckerHome } from './WoodpeckerHome';
import { WoodpeckerRun } from './WoodpeckerRun';
import { WoodpeckerSummary } from './WoodpeckerSummary';

/** Where the plan of the week sends the player: puzzles on these themes, at the level of their games. */
export interface PuzzleStart {
  themes: string[];
}

interface PuzzlesProps {
  onClose: () => void;
  boardTheme?: BoardTheme;
  /** Opens on a free session with these themes, instead of the player's last choice (until they change it). */
  start?: PuzzleStart;
}

type Screen =
  | { kind: 'setup' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'run'; puzzles: Puzzle[]; minutes: number | null; isReview: boolean }
  | { kind: 'summary'; report: RunReport; isReview: boolean }
  | { kind: 'woodpecker-run' }
  | { kind: 'woodpecker-summary'; cycleNumber: number };

type Mode = 'free' | 'woodpecker';
const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: 'free', label: 'Séance libre' },
  { id: 'woodpecker', label: 'Woodpecker' },
];

const NO_ENTRIES: ReadonlyMap<string, PuzzleEntry> = new Map();

const PRIMARY =
  'px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

const toNumber = (raw: string): number | undefined => {
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

/** "Puzzles": the puzzles of Lichess to solve against the clock, by rating and theme, and the missed ones to review. */
export const Puzzles: React.FC<PuzzlesProps> = ({ onClose, boardTheme, start: initialStart }) => {
  // Held in memory, not stored: the choices of the player are not overwritten until they make one
  const [preset, setPreset] = useState<PuzzleStart | undefined>(initialStart);
  const [storedMode, setStoredMode] = usePersistentState<Mode>('puzzle_mode', 'free', (raw) =>
    raw === 'free' || raw === 'woodpecker' ? raw : undefined
  );
  const [from, setFrom] = usePersistentState<number>('puzzle_from', DEFAULT_RANGE.from, toNumber);
  const [to, setTo] = usePersistentState<number>('puzzle_to', DEFAULT_RANGE.to, toNumber);
  const [themesRaw, setThemesRaw] = usePersistentState<string>('puzzle_themes', '', (raw) => raw);
  const [match, setMatch] = usePersistentState<'any' | 'all'>('puzzle_match', 'any', (raw) =>
    raw === 'all' || raw === 'any' ? raw : undefined
  );
  const [minutes, setMinutes] = usePersistentState<number | null>('puzzle_minutes', null, (raw) => {
    if (raw === 'null') return null;
    const value = Number(raw);
    return TIMER_OPTIONS.includes(value) ? value : undefined;
  });
  const elo = usePlayerElo();
  const mode: Mode = preset ? 'free' : storedMode;
  const setMode = (next: Mode) => {
    setPreset(undefined);
    setStoredMode(next);
  };
  const choice: PuzzleChoice = {
    // The level of the games, as far as it is known: the plan is about what the games show
    range: preset && elo !== null ? suggestRange(elo) : normalizeRange({ from, to }),
    themes: preset ? preset.themes : themesRaw === '' ? [] : themesRaw.split(','),
    match: preset ? 'any' : match,
    minutes,
  };
  const setChoice = (next: PuzzleChoice) => {
    setPreset(undefined);
    setFrom(next.range.from);
    setTo(next.range.to);
    setThemesRaw(next.themes.join(','));
    setMatch(next.match);
    setMinutes(next.minutes);
  };

  const [index, setIndex] = useState<PuzzleIndex | null>(null);
  const [indexError, setIndexError] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: 'setup' });
  // Fixed while a screen is shown: the figures must not change under the player's eyes
  const [now, setNow] = useState(() => Date.now());
  const { data, record } = usePuzzleReview();
  const woodpecker = useWoodpecker();
  const [isDrawing, setIsDrawing] = useState(false);
  const woodpeckerSet = woodpecker.data.status === 'ready' ? woodpecker.data.set : null;

  useEffect(() => {
    let isCurrent = true;
    loadPuzzleIndex().then(
      (loaded) => isCurrent && setIndex(loaded),
      () => isCurrent && setIndexError(true)
    );
    return () => {
      isCurrent = false;
    };
  }, []);

  const retryIndex = () => {
    setIndexError(false);
    loadPuzzleIndex().then(setIndex, () => setIndexError(true));
  };

  const entries = data.status === 'ready' ? data.entries : NO_ENTRIES;

  const start = async () => {
    setScreen({ kind: 'loading' });
    try {
      const pool = await loadPuzzles(toFilter(choice.range, choice.themes, choice.match));
      if (pool.length === 0) {
        setScreen({
          kind: 'error',
          message: 'Aucun puzzle ne correspond à ce choix : élargissez l’Elo ou les thèmes.',
        });
        return;
      }
      setScreen({ kind: 'run', puzzles: shuffle(pool), minutes: choice.minutes, isReview: false });
    } catch {
      setScreen({
        kind: 'error',
        message:
          'Les puzzles n’ont pas pu être chargés. Vérifiez la connexion : une tranche déjà utilisée marche hors ligne.',
      });
    }
  };

  const review = (isEarly: boolean) => {
    const puzzles = pickReview(entries.values(), Date.now(), { includeUpcoming: isEarly });
    if (puzzles.length > 0) setScreen({ kind: 'run', puzzles, minutes: null, isReview: true });
  };

  /** Draws the lot of the Woodpecker once: from then on it is the same one, cycle after cycle. */
  const createLot = async (range: EloRange, size: number) => {
    setIsDrawing(true);
    try {
      const pool = await loadPuzzles(toFilter(range, [], 'any'));
      const seed = Math.floor(Math.random() * 2 ** 32);
      const lot = drawLot(pool, size, seed);
      if (lot.length === 0) {
        setScreen({ kind: 'error', message: 'Aucun puzzle dans cette tranche : élargissez l’Elo.' });
        return;
      }
      woodpecker.update(createSet(lot, range, seed, Date.now()));
    } catch {
      setScreen({
        kind: 'error',
        message:
          'Les puzzles n’ont pas pu être chargés. Vérifiez la connexion : une tranche déjà utilisée marche hors ligne.',
      });
    } finally {
      setIsDrawing(false);
    }
  };

  const startCycle = () => {
    if (!woodpeckerSet) return;
    woodpecker.update(beginCycle(woodpeckerSet, Date.now()));
    setScreen({ kind: 'woodpecker-run' });
  };

  const backToSetup = () => {
    setNow(Date.now());
    setScreen({ kind: 'setup' });
  };

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 w-full mx-auto max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] ${
        screen.kind === 'run' || screen.kind === 'woodpecker-run' ? 'max-w-[min(96vw,84rem)]' : 'max-w-4xl'
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <PuzzleIcon className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Puzzles</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              200 000 puzzles de Lichess, au niveau et sur les thèmes de votre choix, avec un chronomètre si vous
              voulez.
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
        aria-label="Contenu des puzzles"
        tabIndex={0}
        className="overflow-y-auto min-h-0 pr-1 flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
      >
        {screen.kind === 'setup' && index && (
          <div role="group" aria-label="Mode" className="flex flex-wrap gap-2">
            {MODES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  mode === id
                    ? 'bg-indigo-600/30 border-indigo-500 text-white'
                    : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {screen.kind === 'setup' && !index && !indexError && (
          <p role="status" className="text-sm text-slate-400 py-8 text-center">
            Chargement des puzzles…
          </p>
        )}

        {screen.kind === 'setup' && indexError && (
          <div className="flex flex-col items-center gap-3 text-center py-8">
            <p role="alert" className="text-sm text-slate-200">
              Les puzzles n’ont pas pu être chargés.
            </p>
            <button type="button" onClick={retryIndex} className={PRIMARY}>
              Réessayer
            </button>
          </div>
        )}

        {screen.kind === 'setup' && index && mode === 'woodpecker' && woodpecker.data.status === 'loading' && (
          <p role="status" className="text-sm text-slate-400 py-8 text-center">
            Chargement du lot…
          </p>
        )}

        {screen.kind === 'setup' && index && mode === 'woodpecker' && woodpecker.data.status === 'ready' && (
          <WoodpeckerHome
            index={index}
            set={woodpeckerSet}
            elo={elo}
            isCreating={isDrawing}
            onCreate={createLot}
            onStart={startCycle}
            onReset={woodpecker.reset}
          />
        )}

        {screen.kind === 'setup' && index && mode === 'free' && (
          <PuzzleSetup
            index={index}
            choice={choice}
            onChoiceChange={setChoice}
            elo={elo}
            entries={entries}
            now={now}
            onStart={start}
            onReview={review}
          />
        )}

        {screen.kind === 'loading' && (
          <p role="status" className="text-sm text-slate-400 py-8 text-center">
            Préparation de la séance…
          </p>
        )}

        {screen.kind === 'error' && (
          <div className="flex flex-col items-start gap-3 py-4">
            <p role="alert" className="text-sm text-slate-200">
              {screen.message}
            </p>
            <button type="button" onClick={backToSetup} className={PRIMARY}>
              Retour au choix
            </button>
          </div>
        )}

        {screen.kind === 'run' && (
          <PuzzleRun
            puzzles={screen.puzzles}
            minutes={screen.minutes}
            isReview={screen.isReview}
            boardTheme={boardTheme}
            onResult={record}
            onFinish={(report) => setScreen({ kind: 'summary', report, isReview: screen.isReview })}
          />
        )}

        {screen.kind === 'woodpecker-run' && woodpeckerSet?.progress && (
          <WoodpeckerRun
            set={{ ...woodpeckerSet, progress: woodpeckerSet.progress }}
            boardTheme={boardTheme}
            onChange={woodpecker.update}
            onFinish={(cycleNumber) => setScreen({ kind: 'woodpecker-summary', cycleNumber })}
            onLeave={backToSetup}
          />
        )}

        {screen.kind === 'woodpecker-summary' && woodpeckerSet && (
          <WoodpeckerSummary
            cycles={woodpeckerSet.cycles}
            number={screen.cycleNumber}
            onNext={startCycle}
            onHome={backToSetup}
          />
        )}

        {screen.kind === 'summary' && (
          <PuzzleSummary
            report={screen.report}
            keepsMissed={!screen.isReview}
            onAgain={backToSetup}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
};
