import { useCallback, useEffect, useRef, useState } from 'react';
import { exportVisionRecords, recordVisionRun } from '../services/visionStore';
import { applyRun, type RunOutcome, type VisionRecord } from '../utils/vision';

/**
 * The records of the vision exercises, read once (null until then), and a way to note a finished round. When the
 * browser cannot store them the round still counts for this visit: the outcome is worked out from what is on screen.
 */
export function useVisionRecords() {
  const [records, setRecords] = useState<ReadonlyMap<string, VisionRecord> | null>(null);
  const latest = useRef<ReadonlyMap<string, VisionRecord>>(new Map());

  useEffect(() => {
    let isCancelled = false;
    void exportVisionRecords().then((list) => {
      if (isCancelled) return;
      // A round finished before the read came back must not be forgotten
      const merged = new Map(list.map((record) => [record.key, record]));
      for (const [key, record] of latest.current) {
        const known = merged.get(key);
        if (!known || record.best > known.best || record.runs > known.runs) merged.set(key, record);
      }
      latest.current = merged;
      setRecords(merged);
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  const finish = useCallback(async (key: string, score: number): Promise<RunOutcome> => {
    const outcome = (await recordVisionRun(key, score)) ?? applyRun(latest.current.get(key), key, score, Date.now());
    const next = new Map(latest.current);
    next.set(key, outcome.record);
    latest.current = next;
    setRecords(next);
    return outcome;
  }, []);

  return { records, finish };
}
