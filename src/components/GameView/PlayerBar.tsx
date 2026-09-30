import React from 'react';
import { GameMetadata } from '../../types/chess';
import { PlayerColor } from '../../types/ui';
import { BoardMaterialState } from '../../utils/chessMaterial';
import { CapturedPieces } from '../ChessBoard/CapturedPieces';

interface PlayerBarProps {
  color: PlayerColor;
  metadata?: GameMetadata;
  userColor: PlayerColor;
  material: BoardMaterialState;
  /** Extra classes for the bar (the bottom bar clips its overflow). */
  className?: string;
  /** Right-hand side content (flip button, current move…). */
  children?: React.ReactNode;
}

/** Name, "VOUS" badge, Elo and captured pieces of one player, above or below the board. */
export const PlayerBar: React.FC<PlayerBarProps> = ({
  color,
  metadata,
  userColor,
  material,
  className = '',
  children,
}) => {
  const isWhite = color === 'w';
  const name = isWhite ? metadata?.white || 'Joueur Blancs' : metadata?.black || 'Joueur Noirs';
  const elo = isWhite ? metadata?.whiteElo : metadata?.blackElo;

  return (
    <div
      className={`flex items-center justify-between px-1.5 sm:px-2 text-xs h-9 min-h-[36px] flex-nowrap ${className}`}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-nowrap overflow-hidden">
        <div
          className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border shrink-0 ${
            isWhite ? 'bg-white border-slate-300 shadow-sm' : 'bg-slate-800 border-slate-600'
          }`}
        />
        <span className="font-bold text-slate-200 truncate max-w-[120px] xs:max-w-[160px] sm:max-w-[220px]">
          {name}
        </span>
        {userColor === color && (
          <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold text-[9px] uppercase tracking-wider shrink-0">
            VOUS
          </span>
        )}
        {elo && <span className="text-slate-400 font-mono text-[10px] sm:text-xs shrink-0">({elo})</span>}

        {/* Captured pieces & material lead */}
        <div className="overflow-hidden flex items-center shrink-0">
          <CapturedPieces
            captured={isWhite ? material.whiteCaptured : material.blackCaptured}
            pieceColor={isWhite ? 'b' : 'w'}
            advantage={isWhite ? material.whiteAdvantage : material.blackAdvantage}
            className="ml-1"
          />
        </div>
      </div>

      {children}
    </div>
  );
};
