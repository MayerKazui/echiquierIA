import React, { useState } from 'react';
import { GraduationCap, X } from 'lucide-react';
import type { Study } from '../../types/study';
import type { BoardTheme } from '../../types/ui';
import { useStudies } from '../../hooks/useStudies';
import type { ParsedStudyPgn } from '../../utils/studyPgn';
import { createChapter, newId } from '../../utils/studyTree';
import { STUDY_SCHEMA_VERSION } from '../../services/studyStore';
import { StudyList } from './StudyList';
import { StudyView } from './StudyView';

interface StudiesProps {
  onClose: () => void;
  boardTheme?: BoardTheme;
}

function blankStudy(name: string, chapters = [createChapter('Chapitre 1')], description = ''): Study {
  const now = Date.now();
  return {
    id: newId(),
    name,
    description,
    chapters,
    createdAt: now,
    updatedAt: now,
    schemaVersion: STUDY_SCHEMA_VERSION,
  };
}

/** "Études": the player's own studies (chapters of annotated moves with variations), kept in the browser. */
export const Studies: React.FC<StudiesProps> = ({ onClose, boardTheme }) => {
  const { studies, status, saveFailed, update, remove } = useStudies();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = studies.find((s) => s.id === openId) ?? null;

  const create = (name: string) => {
    const study = blankStudy(name);
    update(study);
    setOpenId(study.id);
  };

  const importStudy = (parsed: ParsedStudyPgn, fileName?: string) => {
    const study = blankStudy(parsed.name || fileName || 'Étude importée', parsed.chapters);
    update(study);
    setOpenId(study.id);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 max-w-5xl w-full mx-auto max-h-[90dvh]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Études</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Vos propres chapitres de coups commentés, avec variantes. Privés : ils restent dans ce navigateur.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {saveFailed && (
        <p role="alert" className="text-xs text-amber-300">
          Les modifications n&apos;ont pas pu être enregistrées dans ce navigateur (stockage indisponible ou plein) :
          exportez l&apos;étude en PGN pour ne rien perdre.
        </p>
      )}

      <div
        role="region"
        aria-label="Contenu des études"
        tabIndex={0}
        className="overflow-y-auto min-h-0 pr-1 flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
      >
        {open ? (
          <StudyView study={open} boardTheme={boardTheme} onChange={update} onBack={() => setOpenId(null)} />
        ) : (
          <StudyList
            studies={studies}
            status={status}
            onOpen={setOpenId}
            onCreate={create}
            onImport={importStudy}
            onDelete={(id) => void remove(id)}
          />
        )}
      </div>
    </div>
  );
};
