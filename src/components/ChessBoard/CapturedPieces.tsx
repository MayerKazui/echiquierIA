import React from 'react';
import { ChessPiece } from './ChessPieces';

interface CapturedPiecesProps {
  captured: Array<{ type: 'q' | 'r' | 'b' | 'n' | 'p'; count: number }>;
  pieceColor: 'w' | 'b'; // color of the captured pieces (e.g. if player is White, pieceColor is 'b')
  advantage: number; // material lead for this player (e.g. +3)
  className?: string;
}

export const CapturedPieces: React.FC<CapturedPiecesProps> = ({
  captured,
  pieceColor,
  advantage,
  className = '',
}) => {
  const hasPieces = captured.length > 0;
  const hasAdvantage = advantage > 0;

  if (!hasPieces && !hasAdvantage) {
    return <div className={`inline-flex items-center h-5 sm:h-6 shrink-0 ${className}`} />;
  }

  return (
    <div className={`inline-flex items-center gap-1.5 min-w-0 h-5 sm:h-6 shrink-0 flex-nowrap ${className}`}>
      {/* Captured piece icons */}
      <div className="flex items-center -space-x-1 sm:-space-x-0.5 overflow-hidden max-w-[140px] xs:max-w-[180px] sm:max-w-[240px] shrink-0">
        {captured.map(({ type, count }) => {
          return Array.from({ length: count }).map((_, idx) => (
            <div
              key={`${type}-${idx}`}
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-transform hover:scale-125 hover:z-10 cursor-default"
              title={`Pièce capturée : ${getPieceFrenchName(type, pieceColor)}`}
            >
              <ChessPiece type={type} color={pieceColor} className="w-full h-full drop-shadow-xs" />
            </div>
          ));
        })}
      </div>

      {/* Material advantage badge (+1, +3, +5...) */}
      {hasAdvantage && (
        <span
          className="px-1.5 py-0.2 rounded-md bg-slate-800 border border-slate-700/80 text-[10px] sm:text-[11px] font-mono font-bold text-amber-300 shrink-0 shadow-xs"
          title={`Avantage matériel de +${advantage} point(s)`}
        >
          +{advantage}
        </span>
      )}
    </div>
  );
};

function getPieceFrenchName(type: string, color: 'w' | 'b'): string {
  const col = color === 'w' ? 'blanche' : 'noire';
  switch (type) {
    case 'q':
      return `Dame ${col}`;
    case 'r':
      return `Tour ${col}`;
    case 'b':
      return `Fou ${col}`;
    case 'n':
      return `Cavalier ${col}`;
    case 'p':
      return `Pion ${col}`;
    default:
      return `Pièce ${col}`;
  }
}
