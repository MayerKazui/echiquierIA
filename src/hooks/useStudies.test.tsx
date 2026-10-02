// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listStudies, saveStudy, STUDY_SCHEMA_VERSION } from '../services/studyStore';
import type { Study } from '../types/study';
import { createChapter } from '../utils/studyTree';
import { SAVE_DELAY_MS, useStudies } from './useStudies';

const studyOf = (id: string, name: string): Study => ({
  id,
  name,
  description: '',
  chapters: [createChapter('C')],
  createdAt: 1,
  updatedAt: 1,
  schemaVersion: STUDY_SCHEMA_VERSION,
});

/** A source of "a sync brought something" events, driven by the test. */
function restoredSource() {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    fire: () => listeners.forEach((l) => l()),
    count: () => listeners.size,
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
});

describe('useStudies', () => {
  it('reads the studies once, then changes them in memory at once and writes them a moment later', async () => {
    await saveStudy(studyOf('a', 'Avant'));
    const source = restoredSource();
    const { result } = renderHook(() => useStudies(source.subscribe));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.studies.map((s) => s.name)).toEqual(['Avant']);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => result.current.update({ ...studyOf('a', 'Après'), updatedAt: 5 }));
    vi.useRealTimers();
    expect(result.current.studies[0].name).toBe('Après');
    expect((await listStudies())[0].name).toBe('Avant'); // not written yet
    await act(() => result.current.flush());
    expect((await listStudies())[0].name).toBe('Après');
    expect(SAVE_DELAY_MS).toBeGreaterThan(0);
  });

  it('reads the list again when a sync brought studies in, after writing what was waiting', async () => {
    const source = restoredSource();
    const { result } = renderHook(() => useStudies(source.subscribe));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.studies).toEqual([]);

    await saveStudy(studyOf('from-drive', 'Venue de Drive')); // what the sync wrote
    act(() => source.fire());
    await waitFor(() => expect(result.current.studies.map((s) => s.name)).toEqual(['Venue de Drive']));

    act(() => result.current.update(studyOf('edited', 'En cours')));
    await act(async () => source.fire());
    await waitFor(() =>
      expect(result.current.studies.map((s) => s.name).sort()).toEqual(['En cours', 'Venue de Drive'])
    );
  });

  it('stops listening when it is closed, and writes what was waiting', async () => {
    const source = restoredSource();
    const { result, unmount } = renderHook(() => useStudies(source.subscribe));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(source.count()).toBe(1);
    act(() => result.current.update(studyOf('late', 'Dernière modification')));
    unmount();
    expect(source.count()).toBe(0);
    await waitFor(async () => expect((await listStudies()).map((s) => s.name)).toEqual(['Dernière modification']));
  });

  it('removes a study and says so when the browser refuses a write', async () => {
    await saveStudy(studyOf('a', 'A'));
    const source = restoredSource();
    const { result } = renderHook(() => useStudies(source.subscribe));
    await waitFor(() => expect(result.current.studies).toHaveLength(1));
    await act(() => result.current.remove('a'));
    expect(result.current.studies).toEqual([]);
    expect(await listStudies()).toEqual([]);
    expect(result.current.saveFailed).toBe(false);
  });
});
