import React, { useId, useMemo, useState } from 'react';
import { FileUp } from 'lucide-react';
import { parseStudyPgn, type ParsedStudyPgn } from '../../utils/studyPgn';
import { countMoves } from '../../utils/studyTree';
import { BUTTON, SECONDARY } from '../Openings/shared';

/** The biggest PGN accepted, in characters: it is read in the page, a huge file would freeze it. */
export const MAX_PGN_CHARS = 5_000_000;

interface StudyImportProps {
  /** What the import creates, in the button ("Créer l'étude", "Ajouter les chapitres"). */
  actionLabel: string;
  onImport: (parsed: ParsedStudyPgn, fileName?: string) => void;
  onCancel: () => void;
}

/** Import of a PGN as chapters: the whole study (a game per chapter) or a single game, pasted or from a file. */
export const StudyImport: React.FC<StudyImportProps> = ({ actionLabel, onImport, onCancel }) => {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  const [fileError, setFileError] = useState('');
  const textId = useId();
  const fileId = useId();

  const parsed = useMemo(() => (text.trim() === '' ? null : parseStudyPgn(text)), [text]);
  const chapters = parsed?.chapters.length ?? 0;
  const moves = parsed?.chapters.reduce((total, c) => total + countMoves(c.root), 0) ?? 0;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError('');
    if (file.size > MAX_PGN_CHARS) {
      setFileError('Ce fichier est trop volumineux pour être lu ici.');
      return;
    }
    try {
      setText(await file.text());
      setFileName(file.name.replace(/\.pgn$/i, ''));
    } catch {
      setFileError("Ce fichier n'a pas pu être lu.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-400">
        Collez un PGN, ou choisissez un fichier : une étude Lichess entière (une partie par chapitre) ou une seule
        partie. Les variantes, les commentaires et les annotations sont conservés.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={textId} className="text-[11px] font-semibold text-slate-300">
          PGN
        </label>
        <textarea
          id={textId}
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, MAX_PGN_CHARS));
            setFileName(undefined);
          }}
          rows={7}
          spellCheck={false}
          className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2 font-mono text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={fileId} className={`${SECONDARY} cursor-pointer`}>
          <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
          Choisir un fichier PGN
        </label>
        <input
          id={fileId}
          type="file"
          accept=".pgn,text/plain"
          aria-label="Fichier PGN"
          className="sr-only"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {fileName && <span className="text-[11px] text-slate-400">{fileName}</span>}
      </div>
      {fileError && (
        <p role="alert" className="text-xs text-rose-300">
          {fileError}
        </p>
      )}

      <div role="status" aria-live="polite" className="flex flex-col gap-1">
        {parsed && chapters > 0 && (
          <p className="text-xs text-emerald-300">
            {chapters} {chapters > 1 ? 'chapitres' : 'chapitre'}, {moves} {moves > 1 ? 'coups' : 'coup'} à importer.
          </p>
        )}
        {parsed && chapters === 0 && (
          <p className="text-xs text-amber-300">Aucun chapitre lisible dans ce texte : est-ce bien un PGN ?</p>
        )}
        {parsed?.warnings.map((warning) => (
          <p key={warning} className="text-xs text-amber-300">
            {warning}
          </p>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className={SECONDARY} onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          disabled={chapters === 0}
          onClick={() => parsed && onImport(parsed, fileName)}
          className={`${BUTTON} bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
};
