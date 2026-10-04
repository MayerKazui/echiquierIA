import { useCallback, useEffect, useState } from 'react';
import { releaseLocalModel } from '../services/localLlm';
import { deleteCachedModel, listCachedModels, type CachedModel } from '../services/localModelCache';

/**
 * The models kept by the browser, read again whenever `refreshKey` changes (a download has just ended, say), with a way
 * to delete one.
 */
export function useCachedModels(refreshKey: unknown) {
  const [models, setModels] = useState<CachedModel[]>([]);

  const refresh = useCallback(async () => {
    try {
      setModels(await listCachedModels());
    } catch {
      setModels([]); // no readable cache: nothing to show
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listCachedModels()
      .then((found) => {
        if (!cancelled) setModels(found);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const remove = useCallback(
    async (repo: string) => {
      releaseLocalModel();
      await deleteCachedModel(repo);
      await refresh();
    },
    [refresh]
  );

  return { models, remove };
}
