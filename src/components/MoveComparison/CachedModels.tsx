import React from 'react';
import { Trash2 } from 'lucide-react';
import { useCachedModels } from '../../hooks/useCachedModels';
import { LOCAL_MODELS } from '../../services/localLlm.protocol';
import { formatBytes } from '../../services/localModelCache';

/**
 * The models the browser keeps for the coach, with a button to delete each: changing model leaves the old one where it
 * was downloaded, and several gigabytes add up. Nothing is shown when there is nothing to delete.
 */
export const CachedModels: React.FC<{ refreshKey: unknown; currentRepo: string }> = ({ refreshKey, currentRepo }) => {
  const { models, remove } = useCachedModels(refreshKey);
  if (models.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="cached-models">
      <span className="font-medium text-slate-200">Modèles téléchargés</span>
      <ul className="flex flex-col gap-1">
        {models.map((model) => {
          const preset = LOCAL_MODELS.find((candidate) => candidate.repo === model.repo);
          const name = preset?.label ?? model.repo;
          return (
            <li
              key={model.repo}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-slate-950/70 border border-slate-800"
            >
              <span className="min-w-0">
                <span className="block truncate text-slate-200">
                  {name}
                  {model.repo === currentRepo && <span className="ml-1.5 text-emerald-400">(utilisé)</span>}
                </span>
                <span className="text-slate-400">{formatBytes(model.bytes)}</span>
              </span>
              <button
                type="button"
                onClick={() => remove(model.repo)}
                aria-label={`Supprimer le modèle ${name}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 border border-slate-700 cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                Supprimer
              </button>
            </li>
          );
        })}
      </ul>
      <span className="text-slate-400">
        Un modèle que vous n’utilisez plus reste dans le navigateur : supprimez-le pour libérer la place. Il sera
        retéléchargé si vous le choisissez de nouveau.
      </span>
    </div>
  );
};
