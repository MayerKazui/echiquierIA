import React from 'react';
import { BookOpen } from 'lucide-react';
import { toFrenchOpeningName } from '../../utils/openingNames';

interface OpeningStripProps {
  opening: string;
  eco?: string;
}

/** Name of the opening reached at the current move, shown above the board. */
export const OpeningStrip: React.FC<OpeningStripProps> = ({ opening, eco }) => (
  <div className="flex items-center px-3.5 py-2 rounded-xl bg-slate-900/90 border border-indigo-500/20 text-xs shadow-sm min-h-[36px]">
    <div className="flex items-center gap-2 truncate min-w-0">
      <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
      <span className="font-semibold text-white truncate">
        {eco ? `[${eco}] ` : ''}
        {toFrenchOpeningName(opening)}
      </span>
    </div>
  </div>
);
