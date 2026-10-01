import React, { useEffect, useRef } from 'react';
import { ChessPiece } from './ChessPieces';
import type { PendingPromotion, PromotionPiece } from '../../hooks/useSandbox';

const CHOICES: Array<{ piece: PromotionPiece; type: 'q' | 'r' | 'b' | 'n'; label: string }> = [
  { piece: 'q', type: 'q', label: 'Dame' },
  { piece: 'r', type: 'r', label: 'Tour' },
  { piece: 'b', type: 'b', label: 'Fou' },
  { piece: 'n', type: 'n', label: 'Cavalier' },
];

interface PromotionPickerProps {
  promotion: PendingPromotion;
  onChoose: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

/** Choice of the piece a pawn becomes, over the board (a click outside or Escape cancels the move). */
export const PromotionPicker: React.FC<PromotionPickerProps> = ({ promotion, onChoose, onCancel }) => {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => firstRef.current?.focus(), []);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-slate-950/60"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-label="Promotion : choisissez la nouvelle pièce"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
        className="flex gap-1.5 sm:gap-2 p-2 sm:p-3 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl"
      >
        {CHOICES.map(({ piece, type, label }, index) => (
          <button
            key={piece}
            ref={index === 0 ? firstRef : undefined}
            onClick={() => onChoose(piece)}
            aria-label={label}
            title={label}
            className="w-14 h-14 sm:w-20 sm:h-20 p-1.5 rounded-xl bg-slate-800 hover:bg-indigo-600/40 border border-slate-700 hover:border-indigo-400 transition-colors cursor-pointer"
          >
            <ChessPiece type={type} color={promotion.color} />
          </button>
        ))}
      </div>
    </div>
  );
};
