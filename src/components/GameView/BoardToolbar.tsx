import React from 'react';
import { Check, Shield, Target } from 'lucide-react';
import { BoardSize, BoardTheme, HeatmapMode } from '../../types/ui';

interface BoardToolbarProps {
  showAnnotations: boolean;
  threatCount: number;
  onToggleAnnotations: () => void;
  heatmapMode: HeatmapMode;
  onHeatmapModeChange: (mode: HeatmapMode) => void;
  boardTheme: BoardTheme;
  onBoardThemeChange: (theme: BoardTheme) => void;
  boardSize: BoardSize;
  onBoardSizeChange: (size: BoardSize) => void;
  isImportingLichess: boolean;
  lichessOpened: boolean;
  onOpenLichess: () => void;
}

const GROUP_CLASS = 'flex items-center rounded-lg bg-slate-950 border border-slate-800 p-0.5';
const INACTIVE = 'text-slate-400 hover:text-slate-200';

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
    label: <span>⚪ Blancs</span>,
    title: 'Afficher uniquement les cases contrôlées par les Blancs',
    active: 'bg-indigo-600/30 text-indigo-300 font-bold border border-indigo-500/50',
  },
  {
    mode: 'black',
    label: <span>⚫ Noirs</span>,
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

const SIZE_OPTIONS: Array<{ size: BoardSize; label: string; title: string }> = [
  { size: 'normal', label: 'Normal', title: 'Taille standard (500px)' },
  { size: 'large', label: 'Grand', title: 'Grand échiquier (640px)' },
  { size: 'xl', label: 'XL', title: 'Très grand échiquier (760px)' },
];

/** Annotations, space control, board theme/size and Lichess import buttons. */
export const BoardToolbar: React.FC<BoardToolbarProps> = ({
  showAnnotations,
  threatCount,
  onToggleAnnotations,
  heatmapMode,
  onHeatmapModeChange,
  boardTheme,
  onBoardThemeChange,
  boardSize,
  onBoardSizeChange,
  isImportingLichess,
  lichessOpened,
  onOpenLichess,
}) => (
  <div className="flex items-center justify-between gap-1.5 flex-wrap px-2 py-1.5 rounded-xl bg-slate-900/70 border border-slate-800/80 text-[11px]">
    <div className="flex items-center gap-1 flex-wrap">
      <button
        onClick={onToggleAnnotations}
        aria-pressed={showAnnotations}
        className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium border transition-colors cursor-pointer ${
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

      {/* Space Control / Heatmap Multi-Selector */}
      <div
        role="group"
        aria-label="Contrôle de l'espace"
        className={GROUP_CLASS}
        title="Contrôle de l'espace / Rayon d'action (Touche H pour cycler)"
      >
        {HEATMAP_OPTIONS.map(({ mode, label, title, active }) => (
          <button
            key={mode}
            onClick={() => onHeatmapModeChange(heatmapMode === mode ? 'none' : mode)}
            aria-pressed={heatmapMode === mode}
            aria-label={title}
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
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
      <div role="group" aria-label="Thème de l'échiquier" className={GROUP_CLASS} title="Thème visuel de l'échiquier">
        {THEME_OPTIONS.map(({ theme, label, title, swatch, active }) => (
          <button
            key={theme}
            onClick={() => onBoardThemeChange(theme)}
            aria-pressed={boardTheme === theme}
            aria-label={title}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
              boardTheme === theme ? active : INACTIVE
            }`}
            title={title}
          >
            <span className={`w-2 h-2 rounded-full ${swatch}`} />
            <span className="hidden xs:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Board Size Selector */}
      <div
        role="group"
        aria-label="Taille de l'échiquier"
        className={GROUP_CLASS}
        title="Ajuster la taille de l'échiquier (Normal 500px, Grand 640px, XL 760px)"
      >
        {SIZE_OPTIONS.map(({ size, label, title }) => (
          <button
            key={size}
            onClick={() => onBoardSizeChange(size)}
            aria-pressed={boardSize === size}
            aria-label={title}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
              boardSize === size ? 'bg-indigo-600/30 text-indigo-300 font-bold border border-indigo-500/40' : INACTIVE
            }`}
            title={title}
          >
            {label}
          </button>
        ))}
      </div>
    </div>

    {/* Lichess Options */}
    <div className={`${GROUP_CLASS} shrink-0 max-w-full`}>
      <button
        onClick={onOpenLichess}
        aria-label="Ouvrir la partie sur Lichess"
        disabled={isImportingLichess}
        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-indigo-300 hover:text-white hover:bg-indigo-600/30 transition-colors cursor-pointer disabled:opacity-60"
        title="Importer automatiquement et ouvrir la partie complète sur Lichess.org"
      >
        {isImportingLichess ? (
          <span className="flex items-center gap-1 text-amber-300">
            <span className="w-2.5 h-2.5 border-2 border-amber-300/40 border-t-amber-300 rounded-full animate-spin" />
            <span>Import...</span>
          </span>
        ) : lichessOpened ? (
          <span className="text-emerald-400 font-bold flex items-center gap-1">
            <Check className="w-3 h-3 text-emerald-400" />
            <span>Ouvert !</span>
          </span>
        ) : (
          <span>Partie Lichess</span>
        )}
      </button>
    </div>
  </div>
);
