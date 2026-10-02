import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronsLeft,
  ChevronsRight,
  Eraser,
  FlipVertical2,
  Trash2,
} from 'lucide-react';
import type { StudyChapter } from '../../types/study';
import type { BoardTheme } from '../../types/ui';
import { chessAudio } from '../../utils/chessAudio';
import { fromBoardShapes, toBoardShapes } from '../../utils/studyShapes';
import { toFrenchSan } from '../../utils/chessNotation';
import {
  MOVE_GLYPHS,
  POSITION_GLYPHS,
  addChild,
  isVariation,
  makeNode,
  moveLabel,
  moveNode,
  nagLabel,
  nagSymbol,
  pathTo,
  promoteNode,
  removeNode,
  setComment,
  setShapes,
  toggleNag,
} from '../../utils/studyTree';
import { useMoveInput } from '../../hooks/useMoveInput';
import { useStableCallback } from '../../hooks/useStableCallback';
import { ChessBoard } from '../ChessBoard/ChessBoard';
import { SECONDARY } from '../Openings/shared';
import { StudyMoveTree } from './StudyMoveTree';

interface StudyEditorProps {
  chapter: StudyChapter;
  selectedId: string;
  boardTheme?: BoardTheme;
  onSelect: (id: string) => void;
  onChange: (chapter: StudyChapter) => void;
  /** Shown at the top of the column beside the board (the settings of the study). */
  aside?: React.ReactNode;
}

const glyphClass = (isOn: boolean) =>
  `min-w-8 px-1.5 py-1 rounded-md border text-xs font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
    isOn
      ? 'bg-indigo-600 border-indigo-500 text-white'
      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
  }`;

/** A chapter to read and to write: the board, the tree of moves, and the comment and glyphs of the selected move. */
export const StudyEditor: React.FC<StudyEditorProps> = ({
  chapter,
  selectedId,
  boardTheme,
  onSelect,
  onChange,
  aside,
}) => {
  const { root } = chapter;
  const [isFlipped, setIsFlipped] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const path = pathTo(root, selectedId) ?? [root];
  const selected = path[path.length - 1];
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const isRoot = selected === root;

  const select = (id: string) => {
    setIsConfirmingDelete(false);
    onSelect(id);
  };

  const handleMove = (from: string, to: string, promotion?: string): boolean => {
    const node = makeNode(selected, { from, to, promotion });
    if (!node) return false;
    chessAudio.playForMove(node.san, /[+#]/.test(node.san));
    const existing = selected.children.find((c) => c.san === node.san);
    if (existing) {
      select(existing.id);
    } else {
      onChange({ ...chapter, root: addChild(root, selected.id, node) });
      select(node.id);
    }
    return true;
  };
  const input = useMoveInput(selected.fen, handleMove);
  const shapes = toBoardShapes(selected.shapes);

  const siblings = parent?.children ?? [];
  const siblingIndex = siblings.findIndex((c) => c.id === selected.id);
  const goEnd = () => {
    let node = selected;
    while (node.children[0]) node = node.children[0];
    select(node.id);
  };

  // On the window: a click on the board takes the focus off it, and the arrows must still walk the moves
  const onKeyDown = useStableCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case 'ArrowLeft':
        if (parent) select(parent.id);
        break;
      case 'ArrowRight':
        if (selected.children[0]) select(selected.children[0].id);
        break;
      case 'ArrowUp':
        if (siblingIndex > 0) select(siblings[siblingIndex - 1].id);
        break;
      case 'ArrowDown':
        if (siblingIndex >= 0 && siblingIndex < siblings.length - 1) select(siblings[siblingIndex + 1].id);
        break;
      case 'Home':
        select(root.id);
        break;
      case 'End':
        goEnd();
        break;
      default:
        return;
    }
    e.preventDefault();
    // The game behind the dialog has the same arrows: they are spent here
    e.stopPropagation();
  });
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown, true); // capture: before the app's own listeners
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onKeyDown]);

  const label =
    isRoot || !parent ? 'la position de départ' : `le coup ${moveLabel(parent.fen, toFrenchSan(selected.san))}`;

  return (
    <div className="grid md:grid-cols-[var(--modal-board)_minmax(0,1fr)] gap-4 items-start">
      <div className="w-full max-w-md mx-auto md:max-w-none md:mx-0 md:sticky md:top-0 flex flex-col gap-2">
        <ChessBoard
          fen={selected.fen}
          isFlipped={isFlipped !== (chapter.orientation === 'b')}
          boardTheme={boardTheme}
          lastMove={isRoot ? null : { from: selected.from, to: selected.to }}
          showArrows={false}
          shapes={shapes}
          onShapesChange={(list) => onChange({ ...chapter, root: setShapes(root, selected.id, fromBoardShapes(list)) })}
          showThreats={false}
          selectedSquare={input.selectedSquare}
          onSquareClick={input.handleSquareClick}
          onPieceMove={input.handlePieceMove}
          promotion={input.pendingPromotion}
          onPromote={input.choosePromotion}
          onCancelPromotion={input.cancelPromotion}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={SECONDARY} disabled={isRoot} onClick={() => select(root.id)}>
            <ChevronsLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Début
          </button>
          <button type="button" className={SECONDARY} disabled={!parent} onClick={() => parent && select(parent.id)}>
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Précédent
          </button>
          <button
            type="button"
            className={SECONDARY}
            disabled={!selected.children[0]}
            onClick={() => selected.children[0] && select(selected.children[0].id)}
          >
            Suivant
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button type="button" className={SECONDARY} disabled={selected.children.length === 0} onClick={goEnd}>
            <ChevronsRight className="w-3.5 h-3.5" aria-hidden="true" />
            Fin
          </button>
          <button type="button" className={SECONDARY} onClick={() => setIsFlipped((f) => !f)}>
            <FlipVertical2 className="w-3.5 h-3.5" aria-hidden="true" />
            Retourner
          </button>
          {shapes.length > 0 && (
            <button
              type="button"
              className={SECONDARY}
              onClick={() => onChange({ ...chapter, root: setShapes(root, selected.id, []) })}
            >
              <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
              Effacer les dessins
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          Jouez un coup sur l&apos;échiquier pour l&apos;ajouter : un coup différent de la suite devient une variante.
          Clic droit : un cercle, ou glisser pour une flèche (Maj : jaune, Alt : bleue, Ctrl : rouge) ; elles sont
          gardées avec la position. Flèches du clavier : se déplacer dans les coups.
        </p>
      </div>

      <div className="flex flex-col gap-3 min-w-0">
        {aside}
        <StudyMoveTree root={root} selectedId={selected.id} onSelect={select} />

        <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p className="text-xs font-semibold text-slate-200" role="status" aria-live="polite">
            {isRoot ? 'Position de départ' : `Sur ${label}`}
          </p>

          {!isRoot && (
            <>
              <div role="group" aria-label="Annotation du coup" className="flex flex-wrap gap-1.5">
                {MOVE_GLYPHS.map((nag) => (
                  <button
                    key={nag}
                    type="button"
                    aria-pressed={selected.nags?.includes(nag) ?? false}
                    aria-label={nagLabel(nag)}
                    title={nagLabel(nag)}
                    onClick={() => onChange({ ...chapter, root: toggleNag(root, selected.id, nag) })}
                    className={glyphClass(selected.nags?.includes(nag) ?? false)}
                  >
                    {nagSymbol(nag)}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Évaluation de la position" className="flex flex-wrap gap-1.5">
                {POSITION_GLYPHS.map((nag) => (
                  <button
                    key={nag}
                    type="button"
                    aria-pressed={selected.nags?.includes(nag) ?? false}
                    aria-label={nagLabel(nag)}
                    title={nagLabel(nag)}
                    onClick={() => onChange({ ...chapter, root: toggleNag(root, selected.id, nag) })}
                    className={glyphClass(selected.nags?.includes(nag) ?? false)}
                  >
                    {nagSymbol(nag)}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-300">
            {isRoot ? 'Introduction du chapitre' : 'Commentaire'}
            <textarea
              value={selected.comment ?? ''}
              onChange={(e) => onChange({ ...chapter, root: setComment(root, selected.id, e.target.value) })}
              rows={3}
              maxLength={4000}
              className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs font-normal text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            />
          </label>

          {!isRoot && (
            <div className="flex flex-wrap gap-2">
              {isVariation(root, selected.id) && (
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={() => onChange({ ...chapter, root: promoteNode(root, selected.id) })}
                >
                  Faire de cette variante la ligne principale
                </button>
              )}
              {siblings.length > 1 && (
                <>
                  <button
                    type="button"
                    className={SECONDARY}
                    disabled={siblingIndex <= 0}
                    title="Change l'ordre parmi les variantes de ce coup (la première est la ligne principale)"
                    onClick={() => onChange({ ...chapter, root: moveNode(root, selected.id, -1) })}
                  >
                    <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                    Monter
                  </button>
                  <button
                    type="button"
                    className={SECONDARY}
                    disabled={siblingIndex < 0 || siblingIndex >= siblings.length - 1}
                    title="Change l'ordre parmi les variantes de ce coup (la première est la ligne principale)"
                    onClick={() => onChange({ ...chapter, root: moveNode(root, selected.id, 1) })}
                  >
                    <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                    Descendre
                  </button>
                </>
              )}
              {isConfirmingDelete ? (
                <>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer bg-rose-600 hover:bg-rose-500 border-rose-500 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    onClick={() => {
                      setIsConfirmingDelete(false);
                      onChange({ ...chapter, root: removeNode(root, selected.id) });
                      onSelect(parent?.id ?? root.id);
                    }}
                  >
                    Supprimer ce coup et la suite
                  </button>
                  <button type="button" className={SECONDARY} onClick={() => setIsConfirmingDelete(false)}>
                    Garder
                  </button>
                </>
              ) : (
                <button type="button" className={SECONDARY} onClick={() => setIsConfirmingDelete(true)}>
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Supprimer ce coup
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
