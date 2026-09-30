import React from 'react';
import { BookOpen } from 'lucide-react';
import { PlayerColor } from '../../types/ui';

interface OpeningStripProps {
  opening: string;
  eco?: string;
  userColor: PlayerColor;
  onUpdateUserColor: (color: PlayerColor) => void;
}

/** Opening name + the user's perspective switch, shown above the board. */
export const OpeningStrip: React.FC<OpeningStripProps> = ({ opening, eco, userColor, onUpdateUserColor }) => (
  <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-900/90 border border-indigo-500/20 text-xs shadow-sm min-h-[36px]">
    <div className="flex items-center gap-2 truncate min-w-0">
      <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
      <span className="font-semibold text-white truncate">
        {eco ? `[${eco}] ` : ''}
        {opening}
      </span>
    </div>

    <div className="flex items-center gap-1.5 shrink-0 text-[11px] ml-2">
      <span className="text-slate-400 hidden sm:inline">Perspective :</span>
      <button
        onClick={() => onUpdateUserColor(userColor === 'w' ? 'b' : 'w')}
        className="px-2 py-0.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-semibold cursor-pointer transition-colors"
        title="Changer votre perspective de jeu"
      >
        {userColor === 'w' ? '⚪ Blancs' : '⚫ Noirs'}
      </button>
    </div>
  </div>
);
