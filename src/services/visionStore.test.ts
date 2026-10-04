import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dayKey } from '../utils/practiceDays';
import { exportPracticeDays } from './practiceStore';
import { exportVisionRecords, mergeVisionRecords, onVisionChanged, recordVisionRun } from './visionStore';

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
});

const key = 'coordinates:white';

describe('visionStore', () => {
  it('keeps the best score and counts the rounds', async () => {
    expect(await recordVisionRun(key, 14, 1000)).toMatchObject({ isRecord: true, previousBest: null });
    expect(await recordVisionRun(key, 9, 2000)).toMatchObject({ isRecord: false, previousBest: 14 });
    expect(await recordVisionRun(key, 21, 3000)).toMatchObject({ isRecord: true, previousBest: 14 });
    expect(await recordVisionRun('blind:long', 3, 4000)).toMatchObject({ isRecord: true });
    expect(await exportVisionRecords()).toEqual([
      { key: 'blind:long', best: 3, bestAt: 4000, runs: 1, history: [{ at: 4000, score: 3 }] },
      {
        key,
        best: 21,
        bestAt: 3000,
        runs: 3,
        history: [
          { at: 1000, score: 14 },
          { at: 2000, score: 9 },
          { at: 3000, score: 21 },
        ],
      },
    ]);
  });

  it('counts a round as practice of the day', async () => {
    const now = new Date(2026, 9, 4, 12).getTime();
    await recordVisionRun(key, 5, now);
    expect(await exportPracticeDays()).toEqual([{ day: dayKey(now), count: 1 }]);
  });

  it('tells the listeners, and keeps quiet when a restore is silent', async () => {
    const listener = vi.fn();
    const off = onVisionChanged(listener);
    await recordVisionRun(key, 5, 1000);
    expect(listener).toHaveBeenCalledTimes(1);
    await mergeVisionRecords([{ key: 'blind:short', best: 2, bestAt: 1, runs: 1 }], { silent: true });
    expect(listener).toHaveBeenCalledTimes(1);
    await mergeVisionRecords([{ key: 'lines:short', best: 2, bestAt: 1, runs: 1 }]);
    expect(listener).toHaveBeenCalledTimes(2);
    await mergeVisionRecords([{ key: 'lines:short', best: 2, bestAt: 1, runs: 1 }]); // nothing new
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    await recordVisionRun(key, 6, 2000);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('merges by keeping the better score, and ignores what is not a record', async () => {
    await recordVisionRun(key, 12, 1000);
    await recordVisionRun(key, 8, 2000);
    const report = await mergeVisionRecords([
      { key, best: 15, bestAt: 5000, runs: 1 },
      { key, best: 13, bestAt: 4000, runs: 1 },
      { key: 'lines:long', best: 4, bestAt: 3000, runs: 2 },
      { key: 'x', best: 4, bestAt: 3000, runs: 2 },
    ]);
    expect(report).toEqual({ added: 1, replaced: 1 });
    expect(await exportVisionRecords()).toEqual([
      {
        key,
        best: 15,
        bestAt: 5000,
        runs: 2,
        history: [
          { at: 1000, score: 12 },
          { at: 2000, score: 8 },
        ],
      },
      { key: 'lines:long', best: 4, bestAt: 3000, runs: 2 },
    ]);
  });

  it('does not lower a record that is better here', async () => {
    await recordVisionRun(key, 30, 1000);
    expect(await mergeVisionRecords([{ key, best: 10, bestAt: 9, runs: 1 }])).toEqual({ added: 0, replaced: 0 });
    expect((await exportVisionRecords())[0]).toMatchObject({ best: 30, bestAt: 1000 });
  });

  it('resolves with nothing stored when IndexedDB is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    expect(await exportVisionRecords()).toEqual([]);
    expect(await recordVisionRun(key, 5)).toBeNull();
    expect(await mergeVisionRecords([{ key, best: 1, bestAt: 1, runs: 1 }])).toBeNull();
    warn.mockRestore();
  });
});
