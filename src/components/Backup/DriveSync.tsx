import React, { useEffect, useId, useState } from 'react';
import { AlertCircle, CheckCircle2, Cloud, RefreshCw } from 'lucide-react';
import { describeSyncError, type DriveSyncReport } from '../../services/driveSync';
import { getDriveSync } from '../../services/driveSyncInstance';
import type { DriveSyncManager, SyncStatus } from '../../services/driveSyncManager';
import { useDriveSync } from '../../hooks/useDriveSync';
import { assetUrl } from '../../utils/siteUrl';
import { describeRestore } from './DataBackup';

interface DriveSyncProps {
  /** The history changed (Drive brought games back, or deleted some): the list has to be read again. */
  onRestored: () => void;
  /** Replaces the app's Drive sync (tests). */
  manager?: DriveSyncManager;
  /** Replaces the reload of the page, offered once restored settings are to be applied (tests). */
  reload?: () => void;
}

type Notice = { kind: 'busy' | 'success' | 'error'; text: string; canReload?: boolean };

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** What a sync did, in a few sentences. */
export function describeSync(report: DriveSyncReport): string {
  const parts: string[] = [];
  if (report.restore) {
    parts.push(`Depuis Drive : ${describeRestore(report.restore, report.rejected)}`);
  } else {
    parts.push('Drive ne contenait pas encore de copie.');
  }
  if (report.sent) {
    const kb = Math.max(1, Math.round(report.sent.bytes / 1024));
    parts.push(
      `Copie envoyée : ${plural(report.sent.games, 'partie', 'parties')}, ${plural(report.sent.cards, 'position', 'positions')} d'entraînement${report.sent.studies > 0 ? `, ${plural(report.sent.studies, 'étude', 'études')}` : ''} (${kb} Ko).`
    );
  } else {
    parts.push("Rien à envoyer : ce navigateur n'a encore aucune donnée.");
  }
  return parts.join(' ');
}

/** The state of the automatic sync, in a sentence. */
export function describeAutoSync(status: SyncStatus): string {
  switch (status.phase) {
    case 'idle':
      return 'À jour.';
    case 'waiting':
      return 'Changement détecté : synchronisation dans un instant.';
    case 'syncing':
      return 'Synchronisation en cours…';
    case 'needs-signin':
      return status.message ?? 'Google demande de vous reconnecter.';
    case 'error':
      return status.message ?? 'La synchronisation avec Google Drive a échoué.';
    default:
      return '';
  }
}

/** Syncs the backup with the user's Google Drive: merges what is there, then sends the merged copy back. */
export const DriveSync: React.FC<DriveSyncProps> = ({
  onRestored,
  manager = getDriveSync(),
  reload = () => window.location.reload(),
}) => {
  const status = useDriveSync(manager);
  const [notice, setNotice] = useState<Notice | null>(null);
  const autoId = useId();
  const isBusy = notice?.kind === 'busy' || status.phase === 'syncing';

  // The script is loaded before the click: a pop-up opened after an `await` is blocked by the browsers
  useEffect(() => {
    manager.prepare().catch(() => {});
  }, [manager]);

  // Whoever syncs (this button or the automatic sync), the list shows what came
  useEffect(() => manager.subscribeRestored(onRestored), [manager, onRestored]);

  if (!manager.available) return null;

  const run = async () => {
    if (status.script !== 'ready') {
      // The script did not load earlier: try again
      try {
        await manager.prepare();
        setNotice({ kind: 'success', text: 'Google est prêt : cliquez de nouveau pour vous connecter.' });
      } catch (err) {
        setNotice({ kind: 'error', text: describeSyncError(err) });
      }
      return;
    }
    setNotice({ kind: 'busy', text: 'Synchronisation avec Google Drive…' });
    try {
      const report = await manager.syncNow();
      const failed =
        report.restore !== null &&
        report.restore.games === null &&
        report.restore.cards === null &&
        report.restore.studies === null;
      setNotice({
        kind: failed ? 'error' : 'success',
        text: describeSync(report),
        canReload: (report.restore?.preferencesApplied ?? 0) > 0,
      });
    } catch (err) {
      console.error('Drive sync failed:', err);
      setNotice({ kind: 'error', text: describeSyncError(err) });
    }
  };

  const autoState = status.enabled ? describeAutoSync(status) : '';
  const canRetry = status.enabled && (status.phase === 'needs-signin' || status.phase === 'error');

  return (
    <div className="flex flex-col gap-2 border-t border-slate-800/60 pt-3 mt-1">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
        <p className="text-[11px] text-slate-400 sm:max-w-md">
          Gardez une copie privée dans votre Google Drive (dossier réservé à l&apos;application, non chiffré) pour
          retrouver vos données sur un autre appareil.{' '}
          <a
            href={assetUrl('confidentialite.html')}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-indigo-300 hover:text-indigo-200"
          >
            Règles de confidentialité
          </a>
          {status.lastSync !== null && <> · Dernière synchronisation : {DATE_FORMAT.format(status.lastSync)}</>}
        </p>
        <button
          type="button"
          disabled={isBusy || status.script === 'loading'}
          onClick={() => void run()}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
          {status.script === 'failed' ? 'Réessayer de charger Google' : 'Synchroniser avec Google Drive'}
        </button>
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

      {status.lastSync !== null && (
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-2">
            <input
              id={autoId}
              type="checkbox"
              checked={status.enabled}
              onChange={(event) => manager.setEnabled(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-500 cursor-pointer"
            />
            <label htmlFor={autoId} className="text-xs text-slate-200 cursor-pointer">
              Synchroniser automatiquement
              <span className="block text-[11px] text-slate-400">
                À l&apos;ouverture de l&apos;application, puis après chaque partie ajoutée ou supprimée. Les
                suppressions sont synchronisées aussi.
              </span>
            </label>
          </div>
          {autoState && (
            <p
              role={status.phase === 'error' ? 'alert' : 'status'}
              className={`flex items-center gap-2 pl-6 text-[11px] ${
                status.phase === 'error'
                  ? 'text-rose-300'
                  : status.phase === 'needs-signin'
                    ? 'text-amber-300'
                    : 'text-slate-400'
              }`}
            >
              {status.phase === 'syncing' && <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />}
              <span>{autoState}</span>
              {canRetry && (
                <button
                  type="button"
                  onClick={() => void run()}
                  className="underline font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
                >
                  {status.phase === 'needs-signin' ? 'Se reconnecter' : 'Réessayer'}
                </button>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
