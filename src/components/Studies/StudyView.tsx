import React, { useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileUp, Lock, Plus, Swords, Trash2 } from 'lucide-react';
import type { Study, StudyChapter } from '../../types/study';
import type { BoardTheme } from '../../types/ui';
import { downloadTextFile } from '../../utils/download';
import type { ParsedStudyPgn } from '../../utils/studyPgn';
import { chapterToPgn, studyToPgn } from '../../utils/studyPgn';
import type { PlayStart } from '../../utils/playGame';
import { START_FEN, countMoves, createChapter, findNode, moveItem, pathTo } from '../../utils/studyTree';
import { BUTTON, SECONDARY } from '../Openings/shared';
import { StudyEditor } from './StudyEditor';
import { StudyImport } from './StudyImport';
import { StudyPlay } from './StudyPlay';

interface StudyViewProps {
  study: Study;
  boardTheme?: BoardTheme;
  onChange: (study: Study) => void;
  onBack: () => void;
  /** Starts a game against Stockfish from a position of the chapter. */
  onPlay?: (start: PlayStart) => void;
}

/** A file name from a title: no characters a file system refuses. */
const fileName = (title: string) => `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'etude'}.pgn`;

const FIELD =
  'rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs font-normal text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

/** One study: its introduction, its chapters, and the chapter on screen to write or to play (locked). */
export const StudyView: React.FC<StudyViewProps> = ({ study, boardTheme, onChange, onBack, onPlay }) => {
  const [chapterId, setChapterId] = useState(study.chapters[0]?.id ?? '');
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [isLocked, setIsLocked] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const chapter = study.chapters.find((c) => c.id === chapterId) ?? study.chapters[0];

  const changeChapter = (next: StudyChapter) =>
    onChange({ ...study, chapters: study.chapters.map((c) => (c.id === next.id ? next : c)) });

  /** The position selected in the chapter's tree (the root, until another is chosen), to play from. */
  const playFromSelection = () => {
    if (!onPlay) return;
    const id = selection[chapter.id] ?? chapter.root.id;
    const node = findNode(chapter.root, id) ?? chapter.root;
    const isFromStart = chapter.root.fen === START_FEN;
    const path = pathTo(chapter.root, node.id) ?? [];
    onPlay({
      fen: node.fen,
      label: `Position de l'étude « ${study.name || 'Sans nom'} », chapitre « ${chapter.name || 'Sans nom'} »`,
      prefix: isFromStart ? path.slice(1).map((n) => n.san) : undefined,
    });
  };

  const addChapter = () => {
    const created = createChapter(`Chapitre ${study.chapters.length + 1}`);
    onChange({ ...study, chapters: [...study.chapters, created] });
    setChapterId(created.id);
    setIsLocked(false);
  };

  const importChapters = (parsed: ParsedStudyPgn) => {
    // A game without a name is numbered after the chapters already in the study, not from 1 again
    const added = parsed.chapters.map((c, i) =>
      /^Chapitre \d+$/.test(c.name) ? { ...c, name: `Chapitre ${study.chapters.length + i + 1}` } : c
    );
    onChange({ ...study, chapters: [...study.chapters, ...added] });
    setChapterId(added[0].id);
    setIsImporting(false);
    setIsLocked(false);
  };

  const deleteChapter = () => {
    const remaining = study.chapters.filter((c) => c.id !== chapter.id);
    if (remaining.length === 0) return;
    setIsConfirmingDelete(false);
    setChapterId(remaining[0].id);
    onChange({ ...study, chapters: remaining });
  };

  const moveChapter = (offset: number) => {
    const index = study.chapters.findIndex((c) => c.id === chapter.id);
    onChange({ ...study, chapters: moveItem(study.chapters, index, offset) });
  };

  const chooseChapter = (id: string) => {
    setChapterId(id);
    setIsConfirmingDelete(false);
    setIsLocked(false);
  };

  // The settings of the study and of the chapter sit beside the board, so that the board starts high on the page
  const settings = (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-300">
        Introduction de l&apos;étude
        <textarea
          value={study.description}
          rows={2}
          maxLength={4000}
          onChange={(e) => onChange({ ...study, description: e.target.value })}
          className={FIELD}
        />
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-300 grow min-w-40 max-w-sm">
          Nom du chapitre
          <input
            value={chapter.name}
            maxLength={120}
            onChange={(e) => changeChapter({ ...chapter, name: e.target.value })}
            className={FIELD}
          />
        </label>
        <div role="group" aria-label="Côté du chapitre" className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400">Vu du côté des :</span>
          {(['w', 'b'] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={chapter.orientation === side}
              onClick={() => changeChapter({ ...chapter, orientation: side })}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                chapter.orientation === side
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {side === 'w' ? 'Blancs' : 'Noirs'}
            </button>
          ))}
        </div>
        {study.chapters.length > 1 && (
          <div role="group" aria-label="Ordre du chapitre" className="flex items-center gap-1.5">
            <button
              type="button"
              className={SECONDARY}
              disabled={study.chapters[0].id === chapter.id}
              onClick={() => moveChapter(-1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Avant
            </button>
            <button
              type="button"
              className={SECONDARY}
              disabled={study.chapters[study.chapters.length - 1].id === chapter.id}
              onClick={() => moveChapter(1)}
            >
              Après
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        <button
          type="button"
          className={SECONDARY}
          onClick={() =>
            downloadTextFile(
              fileName(`${study.name} - ${chapter.name}`),
              chapterToPgn(study, chapter),
              'application/x-chess-pgn'
            )
          }
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Exporter ce chapitre
        </button>
        {study.chapters.length > 1 &&
          (isConfirmingDelete ? (
            <>
              <button
                type="button"
                onClick={deleteChapter}
                className={`${BUTTON} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white`}
              >
                Supprimer ce chapitre
              </button>
              <button type="button" className={SECONDARY} onClick={() => setIsConfirmingDelete(false)}>
                Garder
              </button>
            </>
          ) : (
            <button type="button" className={SECONDARY} onClick={() => setIsConfirmingDelete(true)}>
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Supprimer le chapitre
            </button>
          ))}
        {!isLocked && onPlay && (
          <button type="button" className={SECONDARY} onClick={playFromSelection}>
            <Swords className="w-3.5 h-3.5" aria-hidden="true" />
            Jouer contre Stockfish
          </button>
        )}
        {!isLocked && countMoves(chapter.root) > 0 && (
          <button
            type="button"
            className={`${BUTTON} bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white`}
            onClick={() => setIsLocked(true)}
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            Jouer ce chapitre (verrouiller)
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="modal-board-tall flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" className={SECONDARY} onClick={onBack}>
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Mes études
        </button>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-300 grow min-w-40 max-w-md">
          Nom de l&apos;étude
          <input
            value={study.name}
            maxLength={120}
            onChange={(e) => onChange({ ...study, name: e.target.value })}
            className={FIELD}
          />
        </label>
        <button
          type="button"
          className={SECONDARY}
          onClick={() => downloadTextFile(fileName(study.name), studyToPgn(study), 'application/x-chess-pgn')}
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Exporter en PGN
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div role="group" aria-label="Chapitres" className="flex flex-wrap items-center gap-1.5">
          {study.chapters.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === chapter.id}
              onClick={() => chooseChapter(c.id)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer max-w-48 truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                c.id === chapter.id
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {c.name || 'Sans nom'}
            </button>
          ))}
          <button type="button" className={SECONDARY} onClick={addChapter}>
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Chapitre
          </button>
          <button type="button" className={SECONDARY} onClick={() => setIsImporting((v) => !v)}>
            <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
            Importer
          </button>
        </div>

        {isImporting && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <StudyImport
              actionLabel="Ajouter les chapitres"
              onCancel={() => setIsImporting(false)}
              onImport={importChapters}
            />
          </div>
        )}
      </div>

      {isLocked ? (
        <StudyPlay
          key={chapter.id}
          chapter={chapter}
          boardTheme={boardTheme}
          aside={settings}
          onExit={() => setIsLocked(false)}
        />
      ) : (
        <StudyEditor
          key={chapter.id}
          chapter={chapter}
          boardTheme={boardTheme}
          aside={settings}
          selectedId={selection[chapter.id] ?? chapter.root.id}
          onSelect={(id) => setSelection((s) => ({ ...s, [chapter.id]: id }))}
          onChange={changeChapter}
        />
      )}
    </div>
  );
};
