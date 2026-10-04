import React, { useId } from 'react';
import { Eraser, RotateCcw, Trash2 } from 'lucide-react';
import {
  STANDARD_POSITION,
  EMPTY_POSITION,
  possibleCastling,
  type EditorPiece,
  type EditorPosition,
  type PieceColor,
  type PieceKind,
} from '../../utils/positionEditor';
import { ChessPiece } from '../ChessBoard/ChessPieces';
import { SECONDARY } from '../Openings/shared';

/** What a click on a square does: put this piece there, or take the piece off. */
export type EditorTool = EditorPiece | 'erase';

interface PositionEditorProps {
  position: EditorPosition;
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  onChange: (position: EditorPosition) => void;
}

const KINDS: Array<{ type: PieceKind; label: string; feminine: boolean }> = [
  { type: 'k', label: 'Roi', feminine: false },
  { type: 'q', label: 'Dame', feminine: true },
  { type: 'r', label: 'Tour', feminine: true },
  { type: 'b', label: 'Fou', feminine: false },
  { type: 'n', label: 'Cavalier', feminine: false },
  { type: 'p', label: 'Pion', feminine: false },
];

export const pieceName = ({ type, color }: EditorPiece): string => {
  const kind = KINDS.find((k) => k.type === type)!;
  const adjective = color === 'w' ? (kind.feminine ? 'blanche' : 'blanc') : kind.feminine ? 'noire' : 'noir';
  return `${kind.label} ${adjective}`;
};

const LEGEND = 'text-xs font-semibold text-slate-200';
const TOOL =
  'w-10 h-10 sm:w-9 sm:h-9 rounded-lg border p-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
// A mid-tone ground: white pieces (dark outline) and black pieces both show on it
const TOOL_OFF = 'border-slate-600 bg-slate-400 hover:bg-slate-300';
const TOOL_ON = 'border-indigo-300 bg-slate-300 ring-2 ring-indigo-400';
const OPTION =
  'flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 cursor-pointer has-[:checked]:border-indigo-500/60 has-[:checked]:bg-indigo-500/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-400 has-[:disabled]:opacity-50 has-[:disabled]:cursor-not-allowed';

const CASTLING_RIGHTS: Array<{ right: string; label: string }> = [
  { right: 'K', label: 'Petit roque blanc' },
  { right: 'Q', label: 'Grand roque blanc' },
  { right: 'k', label: 'Petit roque noir' },
  { right: 'q', label: 'Grand roque noir' },
];

/** The tools to set a position up: the pieces to put on the board, whose move it is, who can still castle. */
export const PositionEditor: React.FC<PositionEditorProps> = ({ position, tool, onToolChange, onChange }) => {
  const name = useId();
  const possible = possibleCastling(position.placement);
  const isOn = (piece: EditorPiece) => tool !== 'erase' && tool.type === piece.type && tool.color === piece.color;

  const toggleRight = (right: string, on: boolean) => {
    const kept = new Set([...position.castling].filter((r) => possible.includes(r)));
    if (on) kept.add(right);
    else kept.delete(right);
    onChange({
      ...position,
      castling:
        'KQkq'
          .split('')
          .filter((r) => kept.has(r))
          .join('') || '-',
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className={`${LEGEND} mb-1`}>Pièces à poser</legend>
        {(['w', 'b'] as PieceColor[]).map((color) => (
          <div key={color} className="flex flex-wrap gap-1.5">
            {KINDS.map(({ type }) => {
              const piece: EditorPiece = { type, color };
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={isOn(piece)}
                  aria-label={pieceName(piece)}
                  title={pieceName(piece)}
                  onClick={() => onToolChange(piece)}
                  className={`${TOOL} ${isOn(piece) ? TOOL_ON : TOOL_OFF}`}
                >
                  <ChessPiece type={type} color={color} />
                </button>
              );
            })}
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={tool === 'erase'}
            onClick={() => onToolChange('erase')}
            className={`${SECONDARY} ${tool === 'erase' ? '!border-indigo-400 !bg-indigo-500/20' : ''}`}
          >
            <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
            Gomme
          </button>
        </div>
        <p className="text-[11px] text-slate-400">
          Cliquez une case pour y poser la pièce choisie ; cliquez une pièce de même nature pour l’enlever.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${LEGEND} mb-1`}>Trait</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['w', 'Aux Blancs'],
              ['b', 'Aux Noirs'],
            ] as Array<[PieceColor, string]>
          ).map(([value, label]) => (
            <label key={value} className={OPTION}>
              <input
                type="radio"
                name={`${name}-turn`}
                checked={position.turn === value}
                onChange={() => onChange({ ...position, turn: value, enPassant: '-' })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${LEGEND} mb-1`}>Roques encore possibles</legend>
        <div className="grid grid-cols-2 gap-2">
          {CASTLING_RIGHTS.map(({ right, label }) => (
            <label key={right} className={OPTION}>
              <input
                type="checkbox"
                disabled={!possible.includes(right)}
                checked={possible.includes(right) && position.castling.includes(right)}
                onChange={(e) => toggleRight(right, e.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">Un roque n’est offert que si le roi et la tour sont à leur place.</p>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange(STANDARD_POSITION)} className={SECONDARY}>
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          Position initiale
        </button>
        <button type="button" onClick={() => onChange(EMPTY_POSITION)} className={SECONDARY}>
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          Vider l’échiquier
        </button>
      </div>
    </div>
  );
};
