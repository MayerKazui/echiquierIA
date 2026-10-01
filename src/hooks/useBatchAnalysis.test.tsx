// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSnapshot, loadSnapshot, saveSnapshot, type BatchDeps, type BatchJob } from '../services/batchAnalysis';
import type { GameAnalysisOutput } from '../services/stockfishEngine';
import { useBatchAnalysis } from './useBatchAnalysis';

const OUTPUT = { moves: [], statsWhite: {}, statsBlack: {}, detectedOpening: null } as unknown as GameAnalysisOutput;
const job = (id: string): BatchJob => ({
  id,
  pgn: `[White "Alice"]\n[Black "Opp${id}"]\n\n1. e4 e5 *`,
  label: `contre Opp${id}`,
});

/** Engine whose answers are given by the test: a game finishes when `release` is called with its PGN. */
function controlledDeps() {
  const waiting = new Map<string, () => void>();
  const started: string[] = [];
  const saved: string[] = [];
  const deps: BatchDeps = {
    analyze: vi.fn(
      (pgn, _depth, onProgress, signal) =>
        new Promise<GameAnalysisOutput>((resolve, reject) => {
          started.push(pgn);
          onProgress(0.25);
          waiting.set(pgn, () => resolve(OUTPUT));
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })
    ),
    isStored: vi.fn(async () => false),
    save: vi.fn(async (game) => void saved.push(game.pgn)),
  };
  const release = async (j: BatchJob) => {
    await waitFor(() => expect(waiting.has(j.pgn)).toBe(true));
    const finish = waiting.get(j.pgn)!;
    waiting.delete(j.pgn);
    await act(async () => finish());
  };
  return { deps, started, saved, release };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('useBatchAnalysis', () => {
  it('is idle at first', () => {
    const { deps } = controlledDeps();
    const { result } = renderHook(() => useBatchAnalysis(false, deps));
    expect(result.current).toMatchObject({ status: 'idle', total: 0, done: 0, failed: 0, current: null });
  });

  it('analyses the queue game after game, shows where it is, then finishes and forgets the queue', async () => {
    const { deps, saved, release } = controlledDeps();
    const { result } = renderHook(() => useBatchAnalysis(false, deps));

    let accepted = false;
    act(() => {
      accepted = result.current.start([job('1'), job('2')], 14, 'Alice');
    });
    expect(accepted).toBe(true);
    await waitFor(() => expect(result.current.fraction).toBe(0.25));
    expect(result.current).toMatchObject({ status: 'running', total: 2, done: 0 });
    expect(result.current.current?.id).toBe('1');
    expect(loadSnapshot()?.jobs).toHaveLength(2); // the queue is kept while it runs

    await release(job('1'));
    await waitFor(() => expect(result.current.current?.id).toBe('2'));
    expect(result.current.done).toBe(1);
    expect(loadSnapshot()?.doneIds).toEqual(['1']);

    await release(job('2'));
    await waitFor(() => expect(result.current.status).toBe('finished'));
    expect(result.current).toMatchObject({ total: 2, done: 2, failed: 0, current: null });
    expect(saved).toEqual([job('1').pgn, job('2').pgn]);
    expect(loadSnapshot()).toBeNull();

    act(() => result.current.dismiss());
    expect(result.current).toMatchObject({ status: 'idle', total: 0 });
  });

  it('refuses a second queue while one runs, and an empty one', async () => {
    const { deps } = controlledDeps();
    const { result } = renderHook(() => useBatchAnalysis(false, deps));
    expect(result.current.start([], 12, 'Alice')).toBe(false);
    act(() => void result.current.start([job('1')], 12, 'Alice'));
    await waitFor(() => expect(result.current.status).toBe('running'));
    expect(result.current.start([job('2')], 12, 'Alice')).toBe(false);
  });

  it('cancels for good: nothing more is analysed and the queue is forgotten', async () => {
    const { deps, started, release } = controlledDeps();
    const { result } = renderHook(() => useBatchAnalysis(false, deps));
    act(() => void result.current.start([job('1'), job('2')], 12, 'Alice'));
    await release(job('1'));
    await waitFor(() => expect(started).toHaveLength(2));

    act(() => result.current.cancel());
    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(started).toHaveLength(2);
    expect(loadSnapshot()).toBeNull();
    expect(result.current.total).toBe(0);
  });

  describe('a queue left by a previous visit', () => {
    const leave = (doneIds: string[] = ['1']) =>
      saveSnapshot({ ...createSnapshot([job('1'), job('2'), job('3')], 12, 'Alice'), doneIds });

    it('is offered, not restarted by itself', async () => {
      leave();
      const { deps, started } = controlledDeps();
      const { result } = renderHook(() => useBatchAnalysis(false, deps));
      expect(result.current).toMatchObject({ status: 'interrupted', total: 3, done: 1 });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(started).toEqual([]);
    });

    it('continues with the games that were left when resumed', async () => {
      leave();
      const { deps, started, release } = controlledDeps();
      const { result } = renderHook(() => useBatchAnalysis(false, deps));
      act(() => result.current.resume());
      await release(job('2'));
      await release(job('3'));
      await waitFor(() => expect(result.current.status).toBe('finished'));
      expect(started).toEqual([job('2').pgn, job('3').pgn]);
      expect(result.current.done).toBe(3);
    });

    it('can be dropped', () => {
      leave();
      const { deps } = controlledDeps();
      const { result } = renderHook(() => useBatchAnalysis(false, deps));
      act(() => result.current.cancel());
      expect(result.current.status).toBe('idle');
      expect(loadSnapshot()).toBeNull();
    });

    it('is not offered when nothing is left to do, nor when the data is damaged', () => {
      leave(['1', '2', '3']);
      const { deps } = controlledDeps();
      expect(renderHook(() => useBatchAnalysis(false, deps)).result.current.status).toBe('idle');
      localStorage.setItem('chess_batch_analysis', '{broken');
      expect(renderHook(() => useBatchAnalysis(false, deps)).result.current.status).toBe('idle');
    });

    it('cannot be resumed once the queue is finished', async () => {
      const { deps, started, release } = controlledDeps();
      const { result } = renderHook(() => useBatchAnalysis(false, deps));
      act(() => void result.current.start([job('1')], 12, 'Alice'));
      await release(job('1'));
      await waitFor(() => expect(result.current.status).toBe('finished'));

      act(() => result.current.resume());
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(result.current.status).toBe('finished');
      expect(started).toHaveLength(1);
    });

    it('does nothing when resumed while there is nothing to resume', () => {
      const { deps, started } = controlledDeps();
      const { result } = renderHook(() => useBatchAnalysis(false, deps));
      act(() => result.current.resume());
      expect(result.current.status).toBe('idle');
      expect(started).toEqual([]);
    });
  });

  describe('when the user analyses a game by hand', () => {
    it('steps aside while the engine is busy, redoes the game in progress, then goes on by itself', async () => {
      const { deps, started, release } = controlledDeps();
      const { result, rerender } = renderHook(({ busy }) => useBatchAnalysis(busy, deps), {
        initialProps: { busy: false },
      });
      act(() => void result.current.start([job('1'), job('2')], 12, 'Alice'));
      await waitFor(() => expect(started).toEqual([job('1').pgn]));

      rerender({ busy: true });
      await waitFor(() => expect(result.current.status).toBe('paused'));
      expect(loadSnapshot()?.doneIds).toEqual([]); // nothing was lost, the game is still to do
      expect(started).toEqual([job('1').pgn]);

      rerender({ busy: false });
      await waitFor(() => expect(started).toEqual([job('1').pgn, job('1').pgn]));
      expect(result.current.status).toBe('running');

      await release(job('1'));
      await release(job('2'));
      await waitFor(() => expect(result.current.status).toBe('finished'));
      expect(result.current.done).toBe(2);
    });

    it('can still be cancelled while it waits', async () => {
      const { deps, started } = controlledDeps();
      const { result, rerender } = renderHook(({ busy }) => useBatchAnalysis(busy, deps), {
        initialProps: { busy: false },
      });
      act(() => void result.current.start([job('1')], 12, 'Alice'));
      await waitFor(() => expect(started).toHaveLength(1));
      rerender({ busy: true });
      await waitFor(() => expect(result.current.status).toBe('paused'));

      act(() => result.current.cancel());
      expect(result.current.status).toBe('idle');
      expect(loadSnapshot()).toBeNull();
      rerender({ busy: false });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(started).toHaveLength(1); // not restarted
    });

    it('does not touch an interrupted queue: it waits to be resumed', async () => {
      saveSnapshot(createSnapshot([job('1')], 12, 'Alice'));
      const { deps, started } = controlledDeps();
      const { result, rerender } = renderHook(({ busy }) => useBatchAnalysis(busy, deps), {
        initialProps: { busy: true },
      });
      rerender({ busy: false });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(result.current.status).toBe('interrupted');
      expect(started).toEqual([]);
    });
  });

  it('stops the engine when the page is left', async () => {
    const { deps, started } = controlledDeps();
    const { result, unmount } = renderHook(() => useBatchAnalysis(false, deps));
    act(() => void result.current.start([job('1')], 12, 'Alice'));
    await waitFor(() => expect(started).toHaveLength(1));
    const signal = vi.mocked(deps.analyze).mock.calls[0][3];
    unmount();
    expect(signal.aborted).toBe(true);
    expect(loadSnapshot()?.jobs).toHaveLength(1); // kept for the next visit
  });
});
