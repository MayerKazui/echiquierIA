import React, { useState } from 'react';
import { FileUp, Plus, Trash2 } from 'lucide-react';
import type { Study } from '../../types/study';
import type { ParsedStudyPgn } from '../../utils/studyPgn';
import { countMoves } from '../../utils/studyTree';
import type { StudiesStatus } from '../../hooks/useStudies';
import { BUTTON, SECONDARY } from '../Openings/shared';
import { StudyImport } from './StudyImport';

interface StudyListProps {
  studies: Study[];
  status: StudiesStatus;
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onImport: (parsed: ParsedStudyPgn, fileName?: string) => void;
  onDelete: (id: string) => void;
}

const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** The studies of the player, with the creation of a study and the import of a PGN. */
export const StudyList: React.FC<StudyListProps> = ({ studies, status, onOpen, onCreate, onImport, onDelete }) => {
  const [mode, setMode] = useState<'list' | 'create' | 'import'>('list');
  const [name, setName] = useState('');
  const [toDelete, setToDelete] = useState<string | null>(null);

  if (mode === 'import') {
    return (
      <StudyImport
        actionLabel="Créer l'étude"
        onCancel={() => setMode('list')}
        onImport={(parsed, fileName) => {
          onImport(parsed, fileName);
          setMode('list');
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={SECONDARY} onClick={() => setMode(mode === 'create' ? 'list' : 'create')}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          Nouvelle étude
        </button>
        <button type="button" className={SECONDARY} onClick={() => setMode('import')}>
          <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
          Importer un PGN
        </button>
      </div>

      {mode === 'create' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(name.trim() || 'Nouvelle étude');
            setName('');
            setMode('list');
          }}
        >
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-300 grow max-w-sm">
            Nom de l&apos;étude
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Ma défense sicilienne"
              className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs font-normal text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            />
          </label>
          <button type="submit" className={`${BUTTON} bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white`}>
            Créer
          </button>
        </form>
      )}

      {status === 'loading' ? (
        <p role="status" className="text-sm text-slate-400 py-6 text-center">
          Chargement des études…
        </p>
      ) : studies.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">
          Aucune étude pour l&apos;instant. Créez-en une, ou importez un PGN (une étude Lichess par exemple). Vos études
          restent dans ce navigateur : elles ne sont partagées avec personne.
        </p>
      ) : (
        <ul aria-label="Mes études" className="flex flex-col gap-2">
          {studies.map((study) => {
            const moves = study.chapters.reduce((total, c) => total + countMoves(c.root), 0);
            return (
              <li
                key={study.id}
                className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5"
              >
                <button
                  type="button"
                  onClick={() => onOpen(study.id)}
                  className="flex-1 min-w-0 text-left cursor-pointer rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  <span className="block text-sm font-semibold text-slate-100 truncate">{study.name}</span>
                  <span className="block text-[11px] text-slate-400">
                    {study.chapters.length} {study.chapters.length > 1 ? 'chapitres' : 'chapitre'} · {moves}{' '}
                    {moves > 1 ? 'coups' : 'coup'} · modifiée le {date.format(study.updatedAt)}
                  </span>
                </button>
                {toDelete === study.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setToDelete(null);
                        onDelete(study.id);
                      }}
                      className={`${BUTTON} bg-rose-600 hover:bg-rose-500 border-rose-500 text-white`}
                    >
                      Supprimer « {study.name} »
                    </button>
                    <button type="button" className={SECONDARY} onClick={() => setToDelete(null)}>
                      Garder
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label={`Supprimer l'étude ${study.name}`}
                    onClick={() => setToDelete(study.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
