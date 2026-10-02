import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Cloud } from 'lucide-react';
import { createTokenProvider, googleClientId, loadGoogleIdentity, type TokenProvider } from '../../services/googleAuth';
import { describeSyncError, syncWithDrive, type DriveSyncReport } from '../../services/driveSync';
import { assetUrl } from '../../utils/siteUrl';
import { describeRestore } from './DataBackup';

interface DriveSyncProps {
  /** The history changed (Drive brought games back): the list has to be read again. */
  onRestored: () => void;
  /** Replaces the OAuth client ID taken from the build (tests). */
  clientId?: string | undefined;
  /** Replaces the loading of the Google script (tests). */
  loadScript?: () => Promise<void>;
  /** Replaces the sync itself (tests). */
  sync?: (tokens: TokenProvider) => Promise<DriveSyncReport>;
  /** Replaces the reload of the page, offered once restored settings are to be applied (tests). */
  reload?: () => void;
}

type Notice = { kind: 'busy' | 'success' | 'error'; text: string; canReload?: boolean };

/** Where the date of the last sync is kept (this browser only: it is not part of the backup). */
const LAST_SYNC_KEY = 'chess_drive_last_sync';

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

function readLastSync(): number | null {
  try {
    const value = Number(window.localStorage.getItem(LAST_SYNC_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeLastSync(time: number): void {
  try {
    window.localStorage.setItem(LAST_SYNC_KEY, String(time));
  } catch {
    // Storage unavailable: the date is just not shown next time
  }
}

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
      `Copie envoyée : ${plural(report.sent.games, 'partie', 'parties')}, ${plural(report.sent.cards, 'position', 'positions')} d'entraînement (${kb} Ko).`
    );
  } else {
    parts.push("Rien à envoyer : ce navigateur n'a encore aucune donnée.");
  }
  return parts.join(' ');
}

/** Syncs the backup with the user's Google Drive: merges what is there, then sends the merged copy back. */
export const DriveSync: React.FC<DriveSyncProps> = ({
  onRestored,
  clientId = googleClientId(),
  loadScript = loadGoogleIdentity,
  sync = (tokens) => syncWithDrive({ tokens }),
  reload = () => window.location.reload(),
}) => {
  const [script, setScript] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(readLastSync);
  const tokens = useRef<TokenProvider | null>(null);
  const isBusy = notice?.kind === 'busy';

  // The script is loaded before the click: a pop-up opened after an `await` is blocked by the browsers
  useEffect(() => {
    if (!clientId) return;
    let isCurrent = true;
    loadScript().then(
      () => isCurrent && setScript('ready'),
      () => isCurrent && setScript('failed')
    );
    return () => {
      isCurrent = false;
    };
  }, [clientId, loadScript]);

  if (!clientId) return null;

  const run = async () => {
    if (script !== 'ready') {
      // The script did not load earlier: try again
      setScript('loading');
      try {
        await loadScript();
        setScript('ready');
        setNotice({ kind: 'success', text: 'Google est prêt : cliquez de nouveau pour vous connecter.' });
      } catch (err) {
        setScript('failed');
        setNotice({ kind: 'error', text: describeSyncError(err) });
      }
      return;
    }
    tokens.current ??= createTokenProvider({ clientId });
    setNotice({ kind: 'busy', text: 'Synchronisation avec Google Drive…' });
    try {
      const report = await sync(tokens.current);
      if (report.restore) onRestored();
      const now = Date.now();
      writeLastSync(now);
      setLastSync(now);
      const failed = report.restore !== null && report.restore.games === null && report.restore.cards === null;
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

  return (
    <div className="flex flex-col gap-2 border-t border-slate-800/60 pt-3 mt-1">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
        <p className="text-[11px] text-slate-400 sm:max-w-md">
          Gardez une copie privée dans votre Google Drive (dossier réservé à l&apos;application, non chiffré) pour
          retrouver vos données sur un autre appareil. Les suppressions ne sont pas synchronisées : une partie supprimée
          ici revient depuis Drive.{' '}
          <a
            href={assetUrl('confidentialite.html')}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-indigo-300 hover:text-indigo-200"
          >
            Règles de confidentialité
          </a>
          {lastSync !== null && <> · Dernière synchronisation : {DATE_FORMAT.format(lastSync)}</>}
        </p>
        <button
          type="button"
          disabled={isBusy || script === 'loading'}
          onClick={() => void run()}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
          {script === 'failed' ? 'Réessayer de charger Google' : 'Synchroniser avec Google Drive'}
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
    </div>
  );
};
