import React from 'react';
import { Shield } from 'lucide-react';
import { HeatmapMode } from '../../types/ui';
import { BoardHeatmapData } from '../../utils/chessHeatmap';

interface HeatmapSummaryProps {
  mode: Exclude<HeatmapMode, 'none'>;
  data: BoardHeatmapData;
  onModeChange: (mode: HeatmapMode) => void;
}

const SWITCHER_OPTIONS: Array<{ mode: Exclude<HeatmapMode, 'none'>; label: string; active: string }> = [
  { mode: 'both', label: 'Les 2', active: 'bg-blue-600/40 text-blue-200 font-bold' },
  { mode: 'white', label: 'Blancs', active: 'bg-indigo-600/40 text-indigo-200 font-bold' },
  { mode: 'black', label: 'Noirs', active: 'bg-rose-600/40 text-rose-200 font-bold' },
];

/** Space-control figures and gauge shown under the toolbar while the heatmap is active. */
export const HeatmapSummary: React.FC<HeatmapSummaryProps> = ({ mode, data, onModeChange }) => (
  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/90 border border-blue-500/30 text-xs shadow-md animate-in fade-in flex-wrap gap-2">
    <div className="flex items-center gap-2 flex-wrap min-w-0">
      <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />

      {mode === 'both' && (
        <>
          <span className="font-semibold text-slate-200">Contrôle de l'espace (Différentiel) :</span>
          <span className="text-blue-300 font-bold font-mono">
            ⚪ {data.whitePercent}% ({data.whiteControlledCount} cases)
          </span>
          <span className="text-slate-400">vs</span>
          <span className="text-rose-400 font-bold font-mono">
            ⚫ {data.blackPercent}% ({data.blackControlledCount} cases)
          </span>
          {data.contestedCount > 0 && (
            <span className="text-amber-300/90 text-[11px] hidden sm:inline">
              · {data.contestedCount} contestée(s)
            </span>
          )}
        </>
      )}

      {mode === 'white' && (
        <>
          <span className="font-semibold text-indigo-300">Rayon d'action des Blancs :</span>
          <span className="text-blue-300 font-bold font-mono">
            ⚪ {data.whiteTotalCovered} cases couvertes / 64 ({Math.round((data.whiteTotalCovered / 64) * 100)}%)
          </span>
          <span className="text-slate-400 font-mono text-[11px] hidden sm:inline">
            · {data.whiteTotalAttacks} attaques / protections
          </span>
        </>
      )}

      {mode === 'black' && (
        <>
          <span className="font-semibold text-rose-300">Rayon d'action des Noirs :</span>
          <span className="text-rose-300 font-bold font-mono">
            ⚫ {data.blackTotalCovered} cases couvertes / 64 ({Math.round((data.blackTotalCovered / 64) * 100)}%)
          </span>
          <span className="text-slate-400 font-mono text-[11px] hidden sm:inline">
            · {data.blackTotalAttacks} attaques / protections
          </span>
        </>
      )}
    </div>

    {/* Visual gauge bar & Quick switchers */}
    <div className="flex items-center gap-2 shrink-0">
      <div className="w-20 sm:w-28 bg-slate-800 rounded-full h-2 overflow-hidden flex border border-slate-700/80 shrink-0">
        {mode === 'both' ? (
          <>
            <div
              className="bg-blue-500 h-full transition-all duration-200"
              style={{ width: `${data.whitePercent}%` }}
              title={`Blancs : ${data.whitePercent}%`}
            />
            <div
              className="bg-rose-500 h-full transition-all duration-200"
              style={{ width: `${data.blackPercent}%` }}
              title={`Noirs : ${data.blackPercent}%`}
            />
          </>
        ) : mode === 'white' ? (
          <div
            className="bg-blue-500 h-full transition-all duration-200"
            style={{ width: `${(data.whiteTotalCovered / 64) * 100}%` }}
            title={`Blancs : ${data.whiteTotalCovered} cases`}
          />
        ) : (
          <div
            className="bg-rose-500 h-full transition-all duration-200"
            style={{ width: `${(data.blackTotalCovered / 64) * 100}%` }}
            title={`Noirs : ${data.blackTotalCovered} cases`}
          />
        )}
      </div>

      <div className="flex items-center rounded-md bg-slate-950 p-0.5 border border-slate-800 text-[10px]">
        {SWITCHER_OPTIONS.map(({ mode: optionMode, label, active }) => (
          <button
            key={optionMode}
            onClick={() => onModeChange(optionMode)}
            className={`px-1.5 py-0.5 rounded cursor-pointer ${
              mode === optionMode ? active : 'text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => onModeChange('none')}
          className="px-1 py-0.5 text-slate-500 hover:text-rose-400 cursor-pointer ml-0.5"
          title="Masquer le contrôle"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
);
