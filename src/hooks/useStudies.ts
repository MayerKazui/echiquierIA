import { useCallback, useEffect, useRef, useState } from 'react';
import type { Study } from '../types/study';
import { deleteStudy, listStudies, saveStudy } from '../services/studyStore';
import { getDriveSync } from '../services/driveSyncInstance';

/** How long a change waits for the next one before it is written (typing a comment changes the study at every key). */
export const SAVE_DELAY_MS = 500;

export type StudiesStatus = 'loading' | 'ready';

/**
 * The studies of the player: read once, then changed in memory at once and written to the browser a moment
 * later (and when the view closes). `saveFailed` tells the player when the browser refused a write. The list is
 * read again when a Drive sync brought something in while the view is open.
 */
export function useStudies(subscribeRestored: (listener: () => void) => () => void = getDriveSync().subscribeRestored) {
  const [studies, setStudies] = useState<Study[]>([]);
  const [status, setStatus] = useState<StudiesStatus>('loading');
  const [saveFailed, setSaveFailed] = useState(false);
  const pending = useRef(new Map<string, Study>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const toSave = [...pending.current.values()];
    pending.current.clear();
    const results = await Promise.all(toSave.map(saveStudy));
    if (results.length > 0) setSaveFailed(results.includes(false));
  }, []);

  useEffect(() => {
    let isCancelled = false;
    void listStudies().then((all) => {
      if (isCancelled) return;
      setStudies(all);
      setStatus('ready');
    });
    return () => {
      isCancelled = true;
      // What was changed last is not lost when the view is closed
      void flush();
    };
  }, [flush]);

  // A sync that brought studies in: what is waiting to be written goes first, so that it is not lost to the reload
  useEffect(
    () =>
      subscribeRestored(() => {
        void flush()
          .then(listStudies)
          .then((all) => setStudies(all));
      }),
    [subscribeRestored, flush]
  );

  /** Replaces a study (or adds it) in memory and schedules its write. */
  const update = useCallback(
    (study: Study) => {
      setStudies((all) =>
        all.some((s) => s.id === study.id) ? all.map((s) => (s.id === study.id ? study : s)) : [study, ...all]
      );
      pending.current.set(study.id, study);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush]
  );

  const remove = useCallback(async (id: string) => {
    pending.current.delete(id);
    setStudies((all) => all.filter((s) => s.id !== id));
    if (!(await deleteStudy(id))) setSaveFailed(true);
  }, []);

  return { studies, status, saveFailed, update, remove, flush };
}
