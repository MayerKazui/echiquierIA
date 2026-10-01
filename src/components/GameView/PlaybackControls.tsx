import React from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  OctagonPause,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { PlaybackSpeed } from '../../types/ui';

interface PlaybackControlsProps {
  currentPly: number;
  totalMoves: number;
  isPlaying: boolean;
  playbackSpeed: PlaybackSpeed;
  criticalCount: number;
  currentErrorIndex: number | null;
  hasPrevError: boolean;
  hasNextError: boolean;
  /** Auto-play stops on the mistakes and blunders. */
  pauseOnErrors: boolean;
  onStart: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEnd: () => void;
  onTogglePlay: () => void;
  onChangeSpeed: (speed: PlaybackSpeed) => void;
  onPrevError: () => void;
  onNextError: () => void;
  onTogglePauseOnErrors: () => void;
  onFlip: () => void;
}

const SPEEDS: Array<{ speed: PlaybackSpeed; perMove: string }> = [
  { speed: 0.5, perMove: '2.2s' },
  { speed: 1, perMove: '1.1s' },
  { speed: 2, perMove: '0.55s' },
  { speed: 4, perMove: '0.28s' },
];

const STEP_BUTTON =
  'p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer';
const ERROR_BUTTON =
  'flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 disabled:opacity-25 disabled:pointer-events-none transition-colors text-xs font-medium cursor-pointer';

/** Step / auto-play controls, error-to-error jumpers, move counter and flip button. */
export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  currentPly,
  totalMoves,
  isPlaying,
  playbackSpeed,
  criticalCount,
  currentErrorIndex,
  hasPrevError,
  hasNextError,
  pauseOnErrors,
  onStart,
  onPrev,
  onNext,
  onEnd,
  onTogglePlay,
  onChangeSpeed,
  onPrevError,
  onNextError,
  onTogglePauseOnErrors,
  onFlip,
}) => {
  const atEnd = currentPly >= totalMoves - 1;

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-lg gap-2 sm:gap-2.5 max-w-full overflow-hidden">
      {/* Top/Left Row: Step Controls & Critical Error Jumpers */}
      <div className="flex items-center justify-between sm:justify-start gap-1 sm:gap-1.5 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={onStart}
            disabled={currentPly <= 0}
            className={STEP_BUTTON}
            aria-label="Début de la partie"
            title="Début de la partie (Flèche Haut)"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onPrev}
            disabled={currentPly <= 0}
            className={STEP_BUTTON}
            aria-label="Coup précédent"
            title="Coup précédent (Flèche Gauche)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={onTogglePlay}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
            }`}
            aria-label={isPlaying ? 'Mettre en pause' : `Lecture automatique à la vitesse ${playbackSpeed}x`}
            title={isPlaying ? 'Pause (Touche Espace)' : `Lecture automatique ${playbackSpeed}x (Touche Espace)`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="text-[11px] hidden xs:inline">{isPlaying ? 'Pause' : 'Auto'}</span>
          </button>

          {/* Playback speed: one button that cycles through the speeds */}
          <button
            onClick={() =>
              onChangeSpeed(SPEEDS[(SPEEDS.findIndex((s) => s.speed === playbackSpeed) + 1) % SPEEDS.length].speed)
            }
            className="px-2 py-1.5 sm:py-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-indigo-300 hover:text-white transition-colors cursor-pointer"
            aria-label={`Vitesse de lecture : ${playbackSpeed}x. Changer la vitesse`}
            title={`Vitesse de lecture ${playbackSpeed}x (${SPEEDS.find((s) => s.speed === playbackSpeed)?.perMove}/coup), cliquer pour changer`}
          >
            {playbackSpeed}x
          </button>

          <button
            onClick={onNext}
            disabled={atEnd}
            className={STEP_BUTTON}
            aria-label="Coup suivant"
            title="Coup suivant (Flèche Droite)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onEnd}
            disabled={atEnd}
            className={STEP_BUTTON}
            aria-label="Fin de la partie"
            title="Fin de la partie (Flèche Bas)"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>

        {/* Critical Moments (Moments Clés / Saut d'erreurs) */}
        <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-lg border border-slate-800">
          <button
            onClick={onPrevError}
            disabled={!hasPrevError}
            className={ERROR_BUTTON}
            aria-label="Erreur précédente"
            title="Moment clé / Erreur précédente (Shift + Flèche Gauche)"
          >
            <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          </button>

          {criticalCount > 0 && (
            <span
              className="px-1 text-[10px] font-mono text-slate-400 font-semibold"
              title="Moments critiques détectés"
            >
              {currentErrorIndex ? `${currentErrorIndex}/${criticalCount}` : `${criticalCount} err.`}
            </span>
          )}

          <button
            onClick={onNextError}
            disabled={!hasNextError}
            className={ERROR_BUTTON}
            aria-label="Erreur suivante"
            title="Moment clé / Erreur suivante (Shift + Flèche Droite)"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          </button>

          <button
            onClick={onTogglePauseOnErrors}
            aria-pressed={pauseOnErrors}
            className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
              pauseOnErrors
                ? 'bg-amber-500/25 text-amber-200 border-amber-500/50'
                : 'bg-transparent text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            aria-label="Pause de la lecture automatique sur les erreurs"
            title={
              pauseOnErrors
                ? 'La lecture automatique s’arrête sur les erreurs et les gaffes (cliquer pour désactiver)'
                : 'La lecture automatique ne s’arrête pas sur les erreurs (cliquer pour activer)'
            }
          >
            <OctagonPause className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Row on Mobile / Right Group on Desktop: Move counter + Quick tools */}
      <div className="flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
        <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-300">
          <span className="text-slate-400 text-[11px]">
            {currentPly >= 0 ? `${currentPly + 1} / ${totalMoves}` : `0 / ${totalMoves}`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onFlip}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer"
            aria-label="Inverser l'échiquier"
            title="Inverser l'échiquier"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
