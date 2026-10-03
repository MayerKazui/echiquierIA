import React from 'react';
import { Shield, Swords, Target } from 'lucide-react';
import { BoardTheme, HeatmapMode } from '../../types/ui';

interface BoardToolbarProps {
  showAnnotations: boolean;
  threatCount: number;
  onToggleAnnotations: () => void;
  heatmapMode: HeatmapMode;
  onHeatmapModeChange: (mode: HeatmapMode) => void;
  boardTheme: BoardTheme;
  onBoardThemeChange: (theme: BoardTheme) => void;
  /** Starts a game against Stockfish from the position on the board. */
  onPlay?: () => void;
}

const GROUP_CLASS = 'flex items-center rounded-lg bg-slate-950 border border-slate-800 p-0.5';
const INACTIVE = 'text-slate-400 hover:text-slate-200';
/** Larger touch targets on a phone */
const GROUP_BUTTON = 'px-2 py-1.5 sm:px-1.5 sm:py-0.5';

const HEATMAP_OPTIONS: Array<{
  mode: Exclude<HeatmapMode, 'none'>;
  label: React.ReactNode;
  title: string;
  active: string;
}> = [
  {
    mode: 'both',
    label: (
      <>
        <Shield className="w-2.5 h-2.5 text-blue-400" />
        <span>Les 2</span>
      </>
    ),
    title: "Contrôle de l'espace combiné (Différentiel Blancs vs Noirs)",
    active: 'bg-blue-600/30 text-blue-300 font-bold border border-blue-500/50',
  },
  {
    mode: 'white',
    label: (
      <span>
        ⚪<span className="hidden sm:inline"> Blancs</span>
      </span>
    ),
    title: 'Afficher uniquement les cases contrôlées par les Blancs',
    active: 'bg-indigo-600/30 text-indigo-300 font-bold border border-indigo-500/50',
  },
  {
    mode: 'black',
    label: (
      <span>
        ⚫<span className="hidden sm:inline"> Noirs</span>
      </span>
    ),
    title: 'Afficher uniquement les cases contrôlées par les Noirs',
    active: 'bg-rose-600/30 text-rose-300 font-bold border border-rose-500/50',
  },
];

const THEME_OPTIONS: Array<{ theme: BoardTheme; label: string; title: string; swatch: string; active: string }> = [
  {
    theme: 'green',
    label: 'Vert',
    title: 'Échiquier Vert Tournoi',
    swatch: 'bg-[#779952]',
    active: 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40',
  },
  {
    theme: 'wood',
    label: 'Bois',
    title: 'Échiquier Bois Chaleureux',
    swatch: 'bg-[#b58863]',
    active: 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40',
  },
  {
    theme: 'blue',
    label: 'Bleu',
    title: 'Échiquier Bleu Océan',
    swatch: 'bg-[#8ca2ad]',
    active: 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40',
  },
];

/** Annotations, space control and board theme. */
export const BoardToolbar: React.FC<BoardToolbarProps> = ({
  showAnnotations,
  threatCount,
  onToggleAnnotations,
  heatmapMode,
  onHeatmapModeChange,
  boardTheme,
  onBoardThemeChange,
  onPlay,
}) => (
  // One scrollable row on a phone, a wrapping bar from `sm` up
  <div
    data-no-swipe
    className="flex items-center gap-1.5 overflow-x-auto sm:overflow-visible sm:flex-wrap sm:justify-between px-2 py-1.5 rounded-xl bg-slate-900/70 border border-slate-800/80 text-[11px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    <div className="flex items-center gap-1 shrink-0 sm:flex-wrap">
      <button
        onClick={onToggleAnnotations}
        aria-pressed={showAnnotations}
        className={`flex items-center gap-1 px-2 py-1.5 sm:py-1 rounded-md font-medium border transition-colors cursor-pointer shrink-0 ${
          showAnnotations
            ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
        }`}
        title="Afficher/masquer les flèches et les menaces tactiques (Touche E)"
      >
        <Target className="w-3 h-3 text-indigo-400" />
        <span>Annotations</span>
        {threatCount > 0 && showAnnotations && (
          <span className="ml-0.5 px-1 py-0.2 rounded-full bg-rose-600 text-white text-[9px] font-bold">
            {threatCount}
          </span>
        )}
      </button>

      {onPlay && (
        <button
          onClick={onPlay}
          className="flex items-center gap-1 px-2 py-1.5 sm:py-1 rounded-md font-medium border bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 transition-colors cursor-pointer shrink-0"
          title="Jouer contre Stockfish depuis cette position"
        >
          <Swords className="w-3 h-3 text-indigo-400" aria-hidden="true" />
          <span>Jouer ici</span>
        </button>
      )}

      {/* Space Control / Heatmap Multi-Selector */}
      <div
        role="group"
        aria-label="Contrôle de l'espace"
        className={`${GROUP_CLASS} shrink-0`}
        title="Contrôle de l'espace / Rayon d'action (Touche H pour cycler)"
      >
        {HEATMAP_OPTIONS.map(({ mode, label, title, active }) => (
          <button
            key={mode}
            onClick={() => onHeatmapModeChange(heatmapMode === mode ? 'none' : mode)}
            aria-pressed={heatmapMode === mode}
            aria-label={title}
            className={`${GROUP_BUTTON} rounded text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
              heatmapMode === mode ? active : INACTIVE
            }`}
            title={title}
          >
            {label}
          </button>
        ))}
        {heatmapMode !== 'none' && (
          <button
            onClick={() => onHeatmapModeChange('none')}
            aria-label="Désactiver le contrôle de l'espace"
            className="px-1 py-0.5 rounded text-[10px] text-slate-400 hover:text-rose-400 cursor-pointer"
            title="Désactiver l'affichage du contrôle"
          >
            ✕
          </button>
        )}
      </div>

      {/* Board Themes Selector */}
      <div
        role="group"
        aria-label="Thème de l'échiquier"
        className={`${GROUP_CLASS} shrink-0`}
        title="Thème visuel de l'échiquier"
      >
        {THEME_OPTIONS.map(({ theme, label, title, swatch, active }) => (
          <button
            key={theme}
            onClick={() => onBoardThemeChange(theme)}
            aria-pressed={boardTheme === theme}
            aria-label={title}
            className={`${GROUP_BUTTON} rounded text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
              boardTheme === theme ? active : INACTIVE
            }`}
            title={title}
          >
            <span className={`w-2 h-2 rounded-full ${swatch}`} />
            <span className="hidden xs:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);
