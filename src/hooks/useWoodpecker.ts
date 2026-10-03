import { useCallback, useEffect, useRef, useState } from 'react';
import { loadWoodpecker, loadWoodpeckerArchive, retireWoodpecker, saveWoodpecker } from '../services/woodpeckerStore';
import { archiveLot, mergeArchives, resumeLot, type ArchivedLot, type WoodpeckerSet } from '../utils/woodpecker';

export type WoodpeckerData =
  | { status: 'loading' }
  /** `archive`: the lots the player left, with their cycles. */
  | { status: 'ready'; set: WoodpeckerSet | null; archive: ArchivedLot[] };

/**
 * The Woodpecker lot, read from the browser. `update` replaces it (the screen moves on at once, the write follows in
 * the background); `reset` leaves it for a new one, keeping the cycles done on it.
 */
export function useWoodpecker() {
  const [data, setData] = useState<WoodpeckerData>({ status: 'loading' });
  const isLoaded = useRef(false);
  const archive = useRef<ArchivedLot[]>([]);

  useEffect(() => {
    let isCancelled = false;
    void Promise.all([loadWoodpecker(), loadWoodpeckerArchive()]).then(([set, left]) => {
      // A change made before the read came back is more recent than what was stored
      if (isCancelled || isLoaded.current) return;
      isLoaded.current = true;
      archive.current = left;
      setData({ status: 'ready', set, archive: left });
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  const update = useCallback((set: WoodpeckerSet) => {
    isLoaded.current = true;
    setData({ status: 'ready', set, archive: archive.current });
    void saveWoodpecker(set);
  }, []);

  const reset = useCallback((set: WoodpeckerSet | null) => {
    isLoaded.current = true;
    const now = Date.now();
    const lot = set ? archiveLot(set, now) : null;
    archive.current = lot ? mergeArchives(archive.current, [lot]) : archive.current;
    setData({ status: 'ready', set: null, archive: archive.current });
    if (set) void retireWoodpecker(set, now);
  }, []);

  /**
   * Takes up a lot that was left, with its cycles. The lot in hand, if it has cycles, goes to the lots left in its
   * place (its cycle in progress is lost). Resolves with false when the lot cannot be played again.
   */
  const resume = useCallback(async (lot: ArchivedLot, current: WoodpeckerSet | null): Promise<boolean> => {
    const now = Date.now();
    const resumed = resumeLot(lot, now);
    if (!resumed) return false;
    isLoaded.current = true;
    const left = current ? archiveLot(current, now) : null;
    if (left) archive.current = mergeArchives(archive.current, [left]);
    setData({ status: 'ready', set: resumed, archive: archive.current });
    // In this order: the lot in hand is retired (and removed), then the other one becomes the lot in hand
    if (current) await retireWoodpecker(current, now);
    await saveWoodpecker(resumed);
    return true;
  }, []);

  return { data, update, reset, resume };
}
