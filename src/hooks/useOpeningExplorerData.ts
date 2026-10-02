import { useCallback, useEffect, useState } from 'react';
import { listGames } from '../services/gameStore';
import { ensureOpeningBookLoaded, isOpeningDatasetLoaded } from '../services/openingBook';
import { buildOpeningIndex, type OpeningIndex } from '../utils/openingIndex';

export type ExplorerData =
  | { status: 'loading' }
  /** The openings database could not be downloaded (offline, and not in the cache yet). */
  | { status: 'unavailable' }
  | { status: 'ready'; index: OpeningIndex };

/** Lets the page paint between two slices of work. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * What the opening explorer works from: the openings database, and the moves of the games kept in the browser.
 * The games are best effort (the explorer still works on theory alone when they cannot be read).
 */
export function useOpeningExplorerData() {
  const [data, setData] = useState<ExplorerData>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      const [, games] = await Promise.all([ensureOpeningBookLoaded(), listGames().catch(() => [])]);
      if (isCancelled) return;
      if (!isOpeningDatasetLoaded()) {
        setData({ status: 'unavailable' });
        return;
      }
      const index = await buildOpeningIndex(games, { yieldToUi }).catch(() => new Map() as OpeningIndex);
      if (!isCancelled) setData({ status: 'ready', index });
    })();
    return () => {
      isCancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setData({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { data, retry };
}
