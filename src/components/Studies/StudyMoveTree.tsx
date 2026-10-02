import React, { useEffect, useRef } from 'react';
import type { StudyNode } from '../../types/study';
import { toFrenchSan } from '../../utils/chessNotation';
import { nagText } from '../../utils/studyTree';

interface StudyMoveTreeProps {
  root: StudyNode;
  selectedId: string;
  onSelect: (id: string) => void;
}

/** "12.", "12…" before a move, from the position it is played in. */
function numberOf(parent: StudyNode): { number: string; isWhite: boolean } {
  const [, turn, , , , fullmove] = parent.fen.split(' ');
  return { number: fullmove ?? '1', isWhite: turn !== 'b' };
}

interface LineProps {
  parent: StudyNode;
  /** The move number is written before the first move even if it is a black one (start of a variation). */
  forceNumber: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  selectedRef: React.RefObject<HTMLButtonElement | null>;
}

/** The continuations of `parent`: the main line as a flowing text, each variation in a block of its own. */
const Line: React.FC<LineProps> = ({ parent, forceNumber, selectedId, onSelect, selectedRef }) => {
  const [main, ...variations] = parent.children;
  if (!main) return null;
  const { number, isWhite } = numberOf(parent);
  const isSelected = main.id === selectedId;
  const label = `${isWhite || forceNumber ? `${number}${isWhite ? '.' : '…'}` : ''}${toFrenchSan(main.san)}${nagText(main.nags)}`;
  const hasBreak = variations.length > 0 || Boolean(main.comment);

  return (
    <>
      <button
        type="button"
        ref={isSelected ? selectedRef : undefined}
        aria-current={isSelected ? 'step' : undefined}
        onClick={() => onSelect(main.id)}
        className={`px-1 py-0.5 rounded-md font-mono text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
          isSelected ? 'bg-indigo-600 text-white' : 'text-slate-200 hover:bg-slate-800'
        }`}
      >
        {label}
      </button>{' '}
      {main.comment && <span className="text-[11px] italic text-slate-400">{main.comment} </span>}
      {variations.map((variation) => (
        <span key={variation.id} className="block my-1 ml-3 pl-2 border-l border-slate-700">
          <VariationLine
            node={variation}
            parent={parent}
            selectedId={selectedId}
            onSelect={onSelect}
            selectedRef={selectedRef}
          />
        </span>
      ))}
      <Line
        parent={main}
        forceNumber={hasBreak}
        selectedId={selectedId}
        onSelect={onSelect}
        selectedRef={selectedRef}
      />
    </>
  );
};

/** One variation: its first move (always numbered), then what follows it. */
const VariationLine: React.FC<
  {
    node: StudyNode;
    parent: StudyNode;
  } & Omit<LineProps, 'parent' | 'forceNumber'>
> = ({ node, parent, selectedId, onSelect, selectedRef }) => {
  // A node alone, as the main child of a copy of its parent: `Line` then writes it with its number
  const alone: StudyNode = { ...parent, children: [node] };
  return <Line parent={alone} forceNumber selectedId={selectedId} onSelect={onSelect} selectedRef={selectedRef} />;
};

/** The moves of a chapter with their variations, comments and glyphs: a click goes to the position. */
export const StudyMoveTree: React.FC<StudyMoveTreeProps> = ({ root, selectedId, onSelect }) => {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);

  return (
    <div
      role="group"
      aria-label="Coups de l'étude"
      className="text-xs leading-7 max-h-64 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 p-2"
    >
      {root.children.length === 0 ? (
        <p className="text-slate-400">Jouez un coup sur l&apos;échiquier pour commencer ce chapitre.</p>
      ) : (
        <Line parent={root} forceNumber={false} selectedId={selectedId} onSelect={onSelect} selectedRef={selectedRef} />
      )}
    </div>
  );
};
