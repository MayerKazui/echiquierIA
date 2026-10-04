import React from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';

interface PwaBannerProps {
  isOnline: boolean;
  updateReady: boolean;
  onUpdate: () => void;
}

/**
 * Shown above the app: a notice when the connection is lost (what still works, what does not), and the offer to
 * switch to a new version of the app that was downloaded in the background.
 */
export const PwaBanner: React.FC<PwaBannerProps> = ({ isOnline, updateReady, onUpdate }) => {
  if (isOnline && !updateReady) return null;
  return (
    <>
      {!isOnline && (
        <div
          role="status"
          className="bg-slate-900 border-b border-slate-700 px-3 sm:px-4 py-2 flex items-center gap-2 text-xs text-slate-200"
        >
          <WifiOff className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            Hors ligne : l&apos;analyse, vos parties et l&apos;entraînement fonctionnent. L&apos;import de parties
            demande une connexion.
          </span>
        </div>
      )}
      {updateReady && (
        <div
          role="status"
          className="bg-indigo-950/60 border-b border-indigo-900/60 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs"
        >
          <p className="flex items-center gap-2 text-indigo-200 font-medium min-w-0">
            <RefreshCw className="w-4 h-4 shrink-0 text-indigo-400" aria-hidden="true" />
            <span>Une nouvelle version de l&apos;application est prête.</span>
          </p>
          <button
            type="button"
            onClick={onUpdate}
            className="shrink-0 px-2.5 py-1 rounded-lg border border-indigo-700/60 text-indigo-100 hover:bg-indigo-900/60 font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Actualiser
          </button>
        </div>
      )}
    </>
  );
};
