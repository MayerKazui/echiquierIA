import { useCallback, useEffect, useRef, useState } from 'react';
import { clearWoodpecker, loadWoodpecker, saveWoodpecker } from '../services/woodpeckerStore';
import type { WoodpeckerSet } from '../utils/woodpecker';

export type WoodpeckerData = { status: 'loading' } | { status: 'ready'; set: WoodpeckerSet | null };

/**
 * The Woodpecker lot, read from the browser. `update` replaces it (the screen moves on at once, the write follows in
 * the background); `reset` forgets it.
 */
export function useWoodpecker() {
  const [data, setData] = useState<WoodpeckerData>({ status: 'loading' });
  const isLoaded = useRef(false);

  useEffect(() => {
    let isCancelled = false;
    void loadWoodpecker().then((set) => {
      // A change made before the read came back is more recent than what was stored
      if (isCancelled || isLoaded.current) return;
      isLoaded.current = true;
      setData({ status: 'ready', set });
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  const update = useCallback((set: WoodpeckerSet) => {
    isLoaded.current = true;
    setData({ status: 'ready', set });
    void saveWoodpecker(set);
  }, []);

  const reset = useCallback(() => {
    isLoaded.current = true;
    setData({ status: 'ready', set: null });
    void clearWoodpecker();
  }, []);

  return { data, update, reset };
}
