// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveGame } from '../../services/gameStore';
import { game, mv, PSEUDO } from '../../test/profileFixtures';
import { loadOpeningsFromDisk } from '../../test/openings';
import { OpeningDrill } from './OpeningDrill';

const RUY_A3 = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'a3', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];

// This file never loads the openings itself: the download is what is being tested.
beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpeningDrill without the openings database', () => {
  it('says so while the download fails, and starts once a new try succeeds', async () => {
    const source = game({
      id: 'a',
      white: PSEUDO,
      black: 'Bob',
      moves: RUY_A3.map((san, ply) =>
        ply < 6
          ? mv(ply, { san, classification: 'book', openingName: 'Ruy Lopez: Morphy Defense', eco: 'C78' })
          : mv(ply, { san, classification: 'best', winPercentLoss: ply === 6 ? 12 : 0 })
      ),
    });
    await saveGame({ pgn: '1. e4 *\n; game a', depth: 12, result: source.result });

    const data = await loadOpeningsFromDisk();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<OpeningDrill onImport={vi.fn()} onShowLine={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Recherche de vos sorties de théorie…');
    await screen.findByText('Les ouvertures ne sont pas disponibles');

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('button', { name: 'Commencer (1 position)' })).toBeTruthy();
    expect(screen.queryByText('Les ouvertures ne sont pas disponibles')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
