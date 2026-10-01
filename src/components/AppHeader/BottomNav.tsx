import React from 'react';
import { LayoutDashboard, Swords } from 'lucide-react';
import { AppTab } from '../../types/ui';

interface BottomNavProps {
  activeTab: AppTab;
  /** While an analysis runs the summary (Bilan) is not available yet. */
  isAnalyzing?: boolean;
  onChangeTab: (tab: AppTab) => void;
}

const itemClass = (isActive: boolean) =>
  `flex flex-col items-center justify-center gap-0.5 min-h-14 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
    isActive ? 'text-indigo-300' : 'text-slate-400'
  } disabled:opacity-40 disabled:cursor-not-allowed`;

/** Switch between the board and the summary, fixed at the bottom of a phone screen (thumb reach). */
export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, isAnalyzing = false, onChangeTab }) => (
  <nav
    aria-label="Vue"
    className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800 bg-slate-900/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
  >
    <div className="grid grid-cols-2">
      <button
        onClick={() => onChangeTab('board')}
        aria-pressed={activeTab === 'board'}
        className={itemClass(activeTab === 'board')}
      >
        <Swords className="w-5 h-5" aria-hidden="true" />
        <span>Échiquier</span>
      </button>
      <button
        onClick={() => onChangeTab('dashboard')}
        aria-pressed={activeTab === 'dashboard'}
        disabled={isAnalyzing}
        title={isAnalyzing ? "Disponible quand l'analyse est terminée" : undefined}
        className={itemClass(activeTab === 'dashboard')}
      >
        <LayoutDashboard className="w-5 h-5" aria-hidden="true" />
        <span>Bilan</span>
      </button>
    </div>
  </nav>
);
