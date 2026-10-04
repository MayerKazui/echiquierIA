import React, { useState } from 'react';
import { Eye, X } from 'lucide-react';
import { useOwnVisionGames } from '../../hooks/useOwnVisionGames';
import { useVisionRecords } from '../../hooks/useVisionRecords';
import { VISION_MODE_LABELS, type Random, type VisionMode } from '../../utils/vision';
import type { BoardTheme } from '../../types/ui';
import { BlindDrill } from './BlindDrill';
import { BlindGame } from './BlindGame';
import { CoordinatesDrill } from './CoordinatesDrill';
import { LinesDrill } from './LinesDrill';
import { ProgressPanel } from './ProgressPanel';
import type { GameSource, GameSourceId } from './shared';

interface VisionProps {
  onClose: () => void;
  boardTheme?: BoardTheme;
  /** The exercise to open on; the others stay one click away. */
  initialMode?: VisionMode;
  /** Source of chance, for tests. */
  random?: Random;
}

type View = VisionMode | 'progress';

const VIEWS: View[] = ['coordinates', 'blind', 'lines', 'game', 'progress'];

const VIEW_LABELS: Record<View, string> = { ...VISION_MODE_LABELS, progress: 'Progression' };

const VIEW_HINTS: Record<View, string> = {
  coordinates: 'Trouver une case par son nom, nommer une case éclairée, dire sa couleur',
  blind: 'Suivre une partie sans voir les pièces',
  lines: 'Calculer une ligne sans la jouer',
  game: 'Jouer une partie complète contre Stockfish sans voir les pièces',
  progress: 'L’évolution de vos scores, exercice par exercice',
};

const SOURCE_KEY = 'chess_vision_source';

/** The games of the reading exercises chosen last time (a convenience: storage may be unavailable). */
function savedSource(): GameSourceId {
  try {
    return localStorage.getItem(SOURCE_KEY) === 'own' ? 'own' : 'reserve';
  } catch {
    return 'reserve';
  }
}

/**
 * "Vision": short exercises to see the board without moving the pieces: the names of the squares, a game followed
 * blind, a line calculated in the head, a whole game played blindfold. Everything runs in the browser, without a
 * network (the engine of the blind game is the one of the application), and the best score of each level and the
 * latest rounds are kept (and travel in the backup).
 */
export const Vision: React.FC<VisionProps> = ({ onClose, boardTheme, initialMode = 'coordinates', random }) => {
  const [view, setView] = useState<View>(initialMode);
  const [sourceId, setSourceId] = useState<GameSourceId>(savedSource);
  const { records, finish } = useVisionRecords();
  // The history is only read once someone asks for their own games, on either reading exercise
  const own = useOwnVisionGames(sourceId === 'own');
  const source: GameSource = {
    id: sourceId,
    own,
    onChange: (id) => {
      setSourceId(id);
      try {
        localStorage.setItem(SOURCE_KEY, id);
      } catch {
        // Not kept for next time
      }
    },
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 w-full max-w-5xl mx-auto max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Eye className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Vision</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Voir l’échiquier sans bouger les pièces. Rien à télécharger : cela marche hors ligne.
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
        aria-label="Contenu de l’entraînement de la vision"
        tabIndex={0}
        className="overflow-y-auto min-h-0 pr-1 flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
      >
        <div role="group" aria-label="Exercice" className="flex flex-wrap gap-2">
          {VIEWS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              title={VIEW_HINTS[value]}
              onClick={() => setView(value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                view === value
                  ? 'bg-indigo-600/30 border-indigo-500 text-white'
                  : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              {VIEW_LABELS[value]}
            </button>
          ))}
        </div>

        {/* A key per exercise: switching starts the other one afresh */}
        {view === 'coordinates' && (
          <CoordinatesDrill
            key="coordinates"
            records={records}
            finish={finish}
            boardTheme={boardTheme}
            random={random}
          />
        )}
        {view === 'blind' && (
          <BlindDrill
            key="blind"
            records={records}
            finish={finish}
            boardTheme={boardTheme}
            random={random}
            source={source}
          />
        )}
        {view === 'lines' && (
          <LinesDrill
            key="lines"
            records={records}
            finish={finish}
            boardTheme={boardTheme}
            random={random}
            source={source}
          />
        )}
        {view === 'game' && (
          <BlindGame key="game" records={records} finish={finish} boardTheme={boardTheme} random={random} />
        )}
        {view === 'progress' && <ProgressPanel records={records} />}
      </div>
    </div>
  );
};
