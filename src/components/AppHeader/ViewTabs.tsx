import React from 'react';
import { LayoutDashboard, Swords } from 'lucide-react';
import { AppTab } from '../../types/ui';

interface ViewTabsProps {
  activeTab: AppTab;
  /** While an analysis runs the summary (Bilan) is not available yet. */
  isAnalyzing?: boolean;
  onChangeTab: (tab: AppTab) => void;
  className?: string;
}

const tabClass = (isActive: boolean) =>
  `flex items-center gap-1 px-2 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
    isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
  }`;

/** Segmented switch between the board and the summary, shown in the header on larger screens. */
export const ViewTabs: React.FC<ViewTabsProps> = ({ activeTab, isAnalyzing = false, onChangeTab, className = '' }) => (
  <div
    role="group"
    aria-label="Vue"
    className={`items-center gap-0.5 p-0.5 bg-slate-950 rounded-xl border border-slate-800 ${className}`}
  >
    <button
      onClick={() => onChangeTab('board')}
      aria-pressed={activeTab === 'board'}
      className={tabClass(activeTab === 'board')}
    >
      <Swords className="w-3 h-3 shrink-0" />
      <span>Échiquier</span>
    </button>
    <button
      onClick={() => onChangeTab('dashboard')}
      aria-pressed={activeTab === 'dashboard'}
      disabled={isAnalyzing}
      title={isAnalyzing ? "Disponible quand l'analyse est terminée" : undefined}
      className={`${tabClass(activeTab === 'dashboard')} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <LayoutDashboard className="w-3 h-3 shrink-0" />
      <span>Bilan</span>
    </button>
  </div>
);
