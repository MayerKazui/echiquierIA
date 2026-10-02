// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOpeningsFromDisk } from '../../test/openings';
import { Openings } from './Openings';

// This file never loads the openings itself: the download is what is being tested.
beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Openings without the openings database', () => {
  it('says so while the download fails, and starts once a new try succeeds', async () => {
    const data = await loadOpeningsFromDisk();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<Openings onClose={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Chargement des ouvertures…');
    await screen.findByText('Les ouvertures ne sont pas disponibles');

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.queryByText('Les ouvertures ne sont pas disponibles')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
