import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PRACTICE_DAYS, shiftDay } from '../utils/practiceDays';
import { exportPracticeDays, mergePracticeDays, onPracticeChanged, recordPractice } from './practiceStore';

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
});

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('practiceStore', () => {
  it('counts what is practised by day', async () => {
    await recordPractice(at(2026, 10, 3, 9));
    await recordPractice(at(2026, 10, 3, 22));
    await recordPractice(at(2026, 10, 4));
    expect(await exportPracticeDays()).toEqual([
      { day: '2026-10-03', count: 2 },
      { day: '2026-10-04', count: 1 },
    ]);
  });

  it('tells the listeners, and keeps quiet when a restore is silent', async () => {
    const listener = vi.fn();
    const off = onPracticeChanged(listener);
    await recordPractice(at(2026, 10, 3));
    expect(listener).toHaveBeenCalledTimes(1);
    await mergePracticeDays([{ day: '2026-10-01', count: 1 }], { silent: true });
    expect(listener).toHaveBeenCalledTimes(1);
    await mergePracticeDays([{ day: '2026-10-02', count: 1 }]);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    await recordPractice(at(2026, 10, 3));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('merges by keeping the larger count, and ignores what is not a day', async () => {
    await recordPractice(at(2026, 10, 3));
    const report = await mergePracticeDays([
      { day: '2026-10-03', count: 1 },
      { day: '2026-10-03', count: 3 },
      { day: '2026-10-05', count: 2 },
      { day: 'x', count: 2 },
    ]);
    expect(report).toEqual({ added: 1, replaced: 1 });
    expect(await exportPracticeDays()).toEqual([
      { day: '2026-10-03', count: 3 },
      { day: '2026-10-05', count: 2 },
    ]);
  });

  it('forgets the oldest days beyond the limit', async () => {
    const start = '2025-01-01';
    const days = Array.from({ length: MAX_PRACTICE_DAYS }, (_, i) => ({ day: shiftDay(start, i), count: 1 }));
    await mergePracticeDays(days);
    await recordPractice(at(2030, 1, 1));
    const kept = await exportPracticeDays();
    expect(kept).toHaveLength(MAX_PRACTICE_DAYS);
    expect(kept.some((d) => d.day === start)).toBe(false);
    expect(kept.some((d) => d.day === '2030-01-01')).toBe(true);
  });

  it('never rejects when IndexedDB is unavailable', async () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(recordPractice(1)).resolves.toBeUndefined();
    expect(await exportPracticeDays()).toEqual([]);
    expect(await mergePracticeDays([{ day: '2026-10-03', count: 1 }])).toBeNull();
    warn.mockRestore();
  });
});
