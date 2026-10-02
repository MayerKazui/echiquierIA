import React from 'react';
import { Cloud } from 'lucide-react';
import { useDriveSync } from '../../hooks/useDriveSync';
import { getDriveSync } from '../../services/driveSyncInstance';
import type { DriveSyncManager } from '../../services/driveSyncManager';

interface DriveSyncBannerProps {
  /** Replaces the app's Drive sync (tests). */
  manager?: DriveSyncManager;
}

/**
 * Shown above the app when the automatic Google Drive sync cannot go on without the user: Google wants them to
 * sign in again (it needs a click, the browser blocks a pop-up opened on its own), or the sync failed.
 */
export const DriveSyncBanner: React.FC<DriveSyncBannerProps> = ({ manager = getDriveSync() }) => {
  const status = useDriveSync(manager);
  if (!status.enabled || (status.phase !== 'needs-signin' && status.phase !== 'error')) return null;
  const needsSignIn = status.phase === 'needs-signin';
  return (
    <div
      role={needsSignIn ? 'status' : 'alert'}
      className="bg-slate-900 border-b border-slate-700 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs"
    >
      <p className="flex items-center gap-2 text-slate-200 min-w-0">
        <Cloud className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span>
          {needsSignIn
            ? 'Google Drive : reconnexion nécessaire pour continuer à synchroniser vos parties.'
            : `Google Drive : ${status.message ?? 'la synchronisation a échoué.'}`}
        </span>
      </p>
      <button
        type="button"
        onClick={() => void manager.syncNow().catch(() => {})}
        className="shrink-0 px-2.5 py-1 rounded-lg border border-slate-600 text-slate-100 hover:bg-slate-800 font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        {needsSignIn ? 'Se reconnecter' : 'Réessayer'}
      </button>
    </div>
  );
};
