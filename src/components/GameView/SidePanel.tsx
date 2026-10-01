import React, { useState } from 'react';
import { BookOpenText, ListOrdered } from 'lucide-react';

type PanelTab = 'move' | 'list';

interface SidePanelProps {
  moveCount: number;
  /** The analysis of the current move (comparison, threats, AI coach). */
  move: React.ReactNode;
  /** The list of moves. */
  list: React.ReactNode;
  className?: string;
}

const TAB_BASE =
  'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer';

/**
 * The move analysis and the move list share one panel: one tab at a time instead of two long cards stacked
 * below the board. Both stay mounted (the inactive one is only hidden) so that the filters and the scroll
 * position of the list survive a change of tab.
 */
export const SidePanel: React.FC<SidePanelProps> = ({ moveCount, move, list, className = '' }) => {
  const [tab, setTab] = useState<PanelTab>('move');

  return (
    <div className={`flex flex-col gap-2.5 min-h-0 ${className}`}>
      <div role="group" aria-label="Contenu du panneau" data-no-swipe className="flex gap-2 shrink-0">
        <button
          onClick={() => setTab('move')}
          aria-pressed={tab === 'move'}
          className={`${TAB_BASE} ${
            tab === 'move'
              ? 'bg-indigo-600/25 text-indigo-200 border-indigo-500/40'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
        >
          <BookOpenText className="w-3.5 h-3.5" />
          Coup
        </button>
        <button
          onClick={() => setTab('list')}
          aria-pressed={tab === 'list'}
          className={`${TAB_BASE} ${
            tab === 'list'
              ? 'bg-indigo-600/25 text-indigo-200 border-indigo-500/40'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5" />
          Liste ({moveCount})
        </button>
      </div>

      <div hidden={tab !== 'move'} className="min-h-0 flex-1 overflow-y-auto lg:pr-1">
        {move}
      </div>
      <div hidden={tab !== 'list'} className="min-h-0 flex-1 h-[min(60dvh,30rem)] lg:h-auto">
        {list}
      </div>
    </div>
  );
};
