import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearSnapshot,
  createSnapshot,
  loadSnapshot,
  pendingJobs,
  runBatch,
  saveSnapshot,
  type BatchDeps,
  type BatchJob,
  type BatchSnapshot,
} from '../services/batchAnalysis';
import { loadGame, saveGame } from '../services/gameStore';
import { stockfishService } from '../services/stockfishEngine';

/**
 * - `running`: a game of the queue is being analysed;
 * - `paused`: the user started an analysis of their own, the queue waits and goes on by itself afterwards;
 * - `interrupted`: a queue was left by a previous visit (tab closed), waiting for the user to resume or drop it;
 * - `finished`: the queue is done (its counts are shown until dismissed).
 */
export type BatchStatus = 'idle' | 'running' | 'paused' | 'interrupted' | 'finished';

export interface BatchView {
  status: BatchStatus;
  total: number;
  done: number;
  failed: number;
  /** The game being analysed (running only). */
  current: BatchJob | null;
  /** Part of the current game done, 0 to 1. */
  fraction: number;
}

const defaultDeps: BatchDeps = {
  analyze: (pgn, depth, onProgress, signal) =>
    stockfishService.analyzeFullGame(pgn, depth, (current, total) => onProgress(total > 0 ? current / total : 0), {
      signal,
    }),
  isStored: async (pgn, depth) => {
    const stored = await loadGame(pgn);
    return stored !== null && stored.depth >= depth;
  },
  save: saveGame,
};

/** A queue left by a previous visit, if games remain to be analysed. */
const initialSnapshot = (): BatchSnapshot | null => {
  const snapshot = loadSnapshot();
  return snapshot && pendingJobs(snapshot).length > 0 ? snapshot : null;
};

/**
 * Analyses a list of games in the background, one after the other, and keeps the queue in the browser so that a
 * closed tab does not lose it (`interrupted` on the next visit, `resume` continues).
 *
 * The engine is shared with the analysis the user starts by hand: while `foregroundBusy` is true the queue steps
 * aside (the game in progress is dropped and redone later) and goes on by itself when the engine is free again.
 */
export function useBatchAnalysis(foregroundBusy: boolean, deps: BatchDeps = defaultDeps) {
  const [initial] = useState(initialSnapshot);
  const [snapshot, setSnapshot] = useState<BatchSnapshot | null>(initial);
  const [status, setStatus] = useState<BatchStatus>(initial ? 'interrupted' : 'idle');
  const [current, setCurrent] = useState<BatchJob | null>(null);
  const [fraction, setFraction] = useState(0);

  const snapshotRef = useRef<BatchSnapshot | null>(initial);
  const controllerRef = useRef<AbortController | null>(null);
  /** Why the running queue was stopped: tells what to do with the queue afterwards. */
  const stopReasonRef = useRef<'pause' | 'cancel' | 'unmount' | null>(null);
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  }, [deps]);

  const execute = useCallback(async (start: BatchSnapshot) => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    stopReasonRef.current = null;
    snapshotRef.current = start;
    saveSnapshot(start);
    setSnapshot(start);
    setStatus('running');
    setFraction(0);

    const { outcome, snapshot: last } = await runBatch(start, depsRef.current, {
      signal: controller.signal,
      onProgress: (progress) => {
        setCurrent(progress.current);
        setFraction(progress.fraction);
      },
      onChange: (changed) => {
        snapshotRef.current = changed;
        setSnapshot(changed);
        saveSnapshot(changed);
      },
    });

    controllerRef.current = null;
    setCurrent(null);
    if (outcome === 'completed') {
      clearSnapshot();
      snapshotRef.current = last;
      setSnapshot(last);
      setStatus('finished');
      return;
    }
    const reason = stopReasonRef.current;
    if (reason === 'cancel') {
      clearSnapshot();
      snapshotRef.current = null;
      setSnapshot(null);
      setStatus('idle');
    } else if (reason === 'pause') {
      setStatus('paused');
    }
  }, []);

  // Step aside for an analysis started by hand, and come back when it is over
  useEffect(() => {
    if (foregroundBusy && status === 'running') {
      stopReasonRef.current = 'pause';
      controllerRef.current?.abort();
    } else if (!foregroundBusy && status === 'paused' && snapshotRef.current) {
      void execute(snapshotRef.current);
    }
  }, [foregroundBusy, status, execute]);

  // Leaving the page must not leave the engine busy
  useEffect(
    () => () => {
      stopReasonRef.current = 'unmount';
      controllerRef.current?.abort();
    },
    []
  );

  /** Starts a new queue. Returns false when one is already running or there is nothing to analyse. */
  const start = useCallback(
    (jobs: BatchJob[], depth: number, userPseudo: string): boolean => {
      if (controllerRef.current) return false;
      const next = createSnapshot(jobs, depth, userPseudo);
      if (next.jobs.length === 0) return false;
      void execute(next);
      return true;
    },
    [execute]
  );

  /** Continues a queue left by a previous visit. */
  const resume = useCallback(() => {
    if (status === 'interrupted' && snapshotRef.current) void execute(snapshotRef.current);
  }, [status, execute]);

  /** Stops the queue for good (the games already analysed stay in the history). */
  const cancel = useCallback(() => {
    if (status !== 'running' && status !== 'paused' && status !== 'interrupted') return;
    stopReasonRef.current = 'cancel';
    if (controllerRef.current) {
      controllerRef.current.abort();
      return;
    }
    clearSnapshot();
    snapshotRef.current = null;
    setSnapshot(null);
    setStatus('idle');
  }, [status]);

  /** Closes the summary of a finished queue. */
  const dismiss = useCallback(() => {
    if (status !== 'finished') return;
    snapshotRef.current = null;
    setSnapshot(null);
    setStatus('idle');
  }, [status]);

  const view: BatchView = {
    status,
    total: snapshot?.jobs.length ?? 0,
    done: snapshot?.doneIds.length ?? 0,
    failed: snapshot?.failedIds.length ?? 0,
    current,
    fraction,
  };
  return { ...view, start, resume, cancel, dismiss };
}
