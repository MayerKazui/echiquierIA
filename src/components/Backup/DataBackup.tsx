import React, { useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Upload } from 'lucide-react';
import {
  MAX_BACKUP_CHARS,
  backupFileName,
  createBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  type RestoreReport,
} from '../../services/backup';
import { downloadTextFile } from '../../utils/download';
import { DriveSync } from './DriveSync';

interface DataBackupProps {
  /** The history changed (a backup was restored): the list has to be read again. */
  onRestored: () => void;
  /** Replaces the download of the file (tests). */
  download?: typeof downloadTextFile;
  /** Replaces the reload of the page, offered once restored settings are to be applied (tests). */
  reload?: () => void;
  /** Props of the Google Drive part (tests). */
  drive?: Omit<React.ComponentProps<typeof DriveSync>, 'onRestored'>;
}

type Notice = { kind: 'busy' | 'success' | 'error'; text: string; canReload?: boolean };

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** What a restore did, in a sentence. */
export function describeRestore(
  report: RestoreReport,
  rejected: { games: number; cards: number; studies: number; puzzles: number }
): string {
  const parts: string[] = [];
  if (report.games) {
    const { added, replaced, kept, trimmed, deleted } = report.games;
    const done = [
      added > 0 ? `${plural(added, 'partie ajoutée', 'parties ajoutées')}` : '',
      replaced > 0 ? `${plural(replaced, 'mise à jour', 'mises à jour')}` : '',
      kept > 0 ? `${plural(kept, 'déjà à jour', 'déjà à jour')}` : '',
    ].filter(Boolean);
    if (done.length > 0) parts.push(`Parties : ${done.join(', ')}.`);
    if (deleted > 0) {
      parts.push(`${plural(deleted, 'partie supprimée', 'parties supprimées')} (supprimées sur un autre appareil).`);
    }
    if (trimmed > 0) {
      parts.push(
        `${plural(trimmed, 'partie ancienne supprimée', 'parties anciennes supprimées')} pour rester dans la limite de l'historique.`
      );
    }
  } else if (report.games === null) {
    parts.push("Les parties n'ont pas pu être écrites dans ce navigateur.");
  }
  if (report.cards) {
    const { added, replaced } = report.cards;
    if (added + replaced > 0) {
      parts.push(`Entraînement : ${plural(added + replaced, 'position restaurée', 'positions restaurées')}.`);
    }
  } else if (report.cards === null) {
    parts.push("La progression d'entraînement n'a pas pu être écrite dans ce navigateur.");
  }
  if (report.studies) {
    const { added, replaced, deleted } = report.studies;
    if (added + replaced > 0) {
      parts.push(`Études : ${plural(added + replaced, 'étude restaurée', 'études restaurées')}.`);
    }
    if (deleted > 0) {
      parts.push(
        `${plural(deleted, 'étude supprimée', 'études supprimées')} (${deleted > 1 ? 'supprimées' : 'supprimée'} sur un autre appareil).`
      );
    }
  } else if (report.studies === null) {
    parts.push("Les études n'ont pas pu être écrites dans ce navigateur.");
  }
  if (report.puzzles) {
    const { added, replaced } = report.puzzles;
    if (added + replaced > 0) {
      parts.push(`Puzzles ratés : ${plural(added + replaced, 'puzzle restauré', 'puzzles restaurés')}.`);
    }
  } else if (report.puzzles === null) {
    parts.push("Les puzzles ratés n'ont pas pu être écrits dans ce navigateur.");
  }
  if (report.woodpecker === 'added' || report.woodpecker === 'replaced') {
    parts.push('Woodpecker : lot et cycles restaurés.');
  } else if (report.woodpecker === null) {
    parts.push("Le lot Woodpecker n'a pas pu être écrit dans ce navigateur.");
  }
  if (report.puzzleHistory?.cleared) {
    parts.push('Historique des puzzles effacé (effacé sur un autre appareil).');
  }
  if (report.puzzleHistory && report.puzzleHistory.added > 0) {
    parts.push(
      `Historique des puzzles : ${plural(report.puzzleHistory.added, 'élément restauré', 'éléments restaurés')}.`
    );
  } else if (report.puzzleHistory === null) {
    parts.push("L'historique des puzzles n'a pas pu être écrit dans ce navigateur.");
  }
  if (report.preferencesApplied > 0) {
    parts.push(
      `${plural(report.preferencesApplied, 'réglage restauré', 'réglages restaurés')} (rechargez la page pour les appliquer).`
    );
  }
  const unreadable = rejected.games + rejected.cards + rejected.studies + rejected.puzzles;
  if (unreadable > 0) {
    parts.push(`${plural(unreadable, 'élément illisible ignoré', 'éléments illisibles ignorés')}.`);
  }
  return parts.length > 0 ? parts.join(' ') : 'Tout était déjà à jour : rien à restaurer.';
}

/** Export and import of everything the app keeps in the browser, as one JSON file. */
export const DataBackup: React.FC<DataBackupProps> = ({
  onRestored,
  download = downloadTextFile,
  reload = () => window.location.reload(),
  drive,
}) => {
  const [notice, setNotice] = useState<Notice | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const isBusy = notice?.kind === 'busy';

  const exportData = async () => {
    setNotice({ kind: 'busy', text: 'Préparation de la sauvegarde…' });
    try {
      const backup = await createBackup();
      download(backupFileName(), serializeBackup(backup));
      setNotice({
        kind: 'success',
        text: `Sauvegarde exportée : ${plural(backup.games.length, 'partie', 'parties')}, ${plural(backup.cards.length, 'position', 'positions')} d'entraînement${backup.studies.length > 0 ? `, ${plural(backup.studies.length, 'étude', 'études')}` : ''}${backup.puzzles.length > 0 ? `, ${plural(backup.puzzles.length, 'puzzle raté', 'puzzles ratés')}` : ''}${backup.puzzleHistory.log.length > 0 ? `, ${plural(backup.puzzleHistory.log.length, 'puzzle joué', 'puzzles joués')}` : ''}${backup.woodpecker ? `, un lot Woodpecker (${plural(backup.woodpecker.cycles.length, 'cycle', 'cycles')})` : ''}.`,
      });
    } catch (err) {
      console.error('Backup export failed:', err);
      setNotice({ kind: 'error', text: "L'export a échoué. Réessayez, ou libérez de la mémoire." });
    }
  };

  const importData = async (file: File) => {
    if (file.size > MAX_BACKUP_CHARS) {
      setNotice({ kind: 'error', text: 'Ce fichier est trop volumineux pour être une sauvegarde.' });
      return;
    }
    setNotice({ kind: 'busy', text: 'Lecture de la sauvegarde…' });
    try {
      const parsed = parseBackup(await file.text());
      if (!parsed.ok) {
        setNotice({ kind: 'error', text: parsed.error });
        return;
      }
      const report = await restoreBackup(parsed.backup);
      onRestored();
      const failed = report.games === null && report.cards === null && report.studies === null;
      setNotice({
        kind: failed ? 'error' : 'success',
        text: describeRestore(report, parsed.rejected),
        canReload: report.preferencesApplied > 0,
      });
    } catch (err) {
      console.error('Backup import failed:', err);
      setNotice({ kind: 'error', text: "Ce fichier n'a pas pu être lu." });
    }
  };

  return (
    <section aria-label="Sauvegarde" className="flex flex-col gap-2 border-t border-slate-800/80 pt-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
        <p id={descriptionId} className="text-[11px] text-slate-400 sm:max-w-md">
          Vos parties, votre progression d&apos;entraînement, vos études et vos réglages ne sont que dans ce navigateur
          : vider ses données les efface. Le fichier de sauvegarde n&apos;est pas chiffré.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void exportData()}
            aria-describedby={descriptionId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-xs font-semibold text-slate-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Exporter mes données
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => fileInput.current?.click()}
            aria-describedby={descriptionId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-xs font-semibold text-slate-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            Importer une sauvegarde
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            aria-label="Fichier de sauvegarde"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = ''; // the same file can be chosen again
              if (file) void importData(file);
            }}
          />
        </div>
      </div>

      <div role={notice?.kind === 'error' ? 'alert' : 'status'} className={notice ? 'text-xs' : 'sr-only'}>
        {notice && (
          <p
            className={`flex items-start gap-2 ${
              notice.kind === 'error'
                ? 'text-rose-300'
                : notice.kind === 'success'
                  ? 'text-emerald-300'
                  : 'text-slate-300'
            }`}
          >
            {notice.kind === 'error' && <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />}
            {notice.kind === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />}
            <span>
              {notice.text}
              {notice.canReload && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={reload}
                    className="underline font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
                  >
                    Recharger
                  </button>
                </>
              )}
            </span>
          </p>
        )}
      </div>

      <DriveSync onRestored={onRestored} {...drive} />
    </section>
  );
};
