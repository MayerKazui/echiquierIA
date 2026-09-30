import React from 'react';

/** Shown for the instant it takes to download a lazy view. */
export const ViewFallback: React.FC = () => (
  <div role="status" className="flex items-center justify-center gap-2 py-16 text-xs text-slate-400">
    <span
      className="w-4 h-4 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin"
      aria-hidden="true"
    />
    <span>Chargement…</span>
  </div>
);
