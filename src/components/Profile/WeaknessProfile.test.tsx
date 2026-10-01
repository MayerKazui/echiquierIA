// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveGame } from '../../services/gameStore';
import { blunder, game, mv } from '../../test/profileFixtures';
import { WeaknessProfile } from './WeaknessProfile';

/** Stores `count` games of the player, game i played on the (i+1)-th day of 2024. */
async function store(count: number, over: Parameters<typeof game>[0] = {}) {
  for (let i = 0; i < count; i++) {
    const source = game({
      id: `g${i}`,
      meta: {
        date: `2024.${String(Math.floor(i / 28) + 1).padStart(2, '0')}.${String((i % 28) + 1).padStart(2, '0')}`,
      },
      moves: Array.from({ length: 40 }, (_, ply) => (ply === 20 ? blunder(ply) : mv(ply))),
      ...over,
    });
    // Each game has its own PGN: the key of the store
    await saveGame({ pgn: `1. e4 *\n; game ${i} ${over.black ?? ''}`, depth: 12, result: source.result });
  }
}

const renderProfile = (props: Partial<React.ComponentProps<typeof WeaknessProfile>> = {}) => {
  const handlers = { onClose: vi.fn(), onImport: vi.fn() };
  render(<WeaknessProfile {...handlers} {...props} />);
  return handlers;
};

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
});

describe('WeaknessProfile', () => {
  it('says it is working while the games are read', async () => {
    await store(1);
    renderProfile();
    expect(screen.getByRole('status').textContent).toBe('Calcul du profil…');
    await screen.findByText('Parties comptées');
    expect(screen.queryByRole('status')).toBeNull();
  });

  describe('without games', () => {
    it('offers to import some', async () => {
      const { onImport } = renderProfile();
      expect(await screen.findByText('Aucune partie enregistrée')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Importer mes parties' }));
      expect(onImport).toHaveBeenCalledTimes(1);
    });

    it('explains that games without the pseudo do not count, and tells how many are stored', async () => {
      await store(2, { white: 'Carl', black: 'Dora' });
      const { onImport } = renderProfile();
      expect(await screen.findByText('Aucune partie ne vous nomme')).toBeTruthy();
      expect(screen.getByText(/2 parties sont enregistrées, mais votre pseudo n'apparaît dans aucune/)).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Importer mes parties' }));
      expect(onImport).toHaveBeenCalledTimes(1);
    });

    it('uses the singular for one game', async () => {
      await store(1, { white: 'Carl', black: 'Dora' });
      renderProfile();
      expect(await screen.findByText(/1 partie est enregistrée, mais/)).toBeTruthy();
    });
  });

  describe('with games', () => {
    it('shows the profile, and how many games were counted out of those stored', async () => {
      await store(6);
      renderProfile();
      await screen.findByText('Parties comptées');
      expect(screen.getByText(/6 parties comptées sur 6 enregistrées dans ce navigateur/)).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Par phase de la partie' })).toBeTruthy();
    });

    it('says how many games were left aside', async () => {
      await store(6);
      // Two more where the player is not named, saved under other PGN
      for (let i = 0; i < 2; i++) {
        await saveGame({
          pgn: `1. d4 *\n; other ${i}`,
          depth: 12,
          result: game({ white: 'Carl', black: 'Dora', moves: Array.from({ length: 40 }, (_, ply) => mv(ply)) }).result,
        });
      }
      renderProfile();
      expect(await screen.findByText(/6 parties comptées sur 8 enregistrées dans ce navigateur\./)).toBeTruthy();
      expect(screen.getByText(/2 parties sont laissées de côté : votre pseudo n'y figure pas/)).toBeTruthy();
    });

    it('says "est laissée" for a single game left aside', async () => {
      await store(6);
      await saveGame({
        pgn: '1. d4 *\n; other',
        depth: 12,
        result: game({ white: 'Carl', black: 'Dora', moves: Array.from({ length: 40 }, (_, ply) => mv(ply)) }).result,
      });
      renderProfile();
      expect(await screen.findByText(/1 partie est laissée de côté/)).toBeTruthy();
    });

    it('closes', async () => {
      await store(1);
      const { onClose } = renderProfile();
      await screen.findByText('Parties comptées');
      await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('the games used', () => {
    const counted = () => screen.getByText('Parties comptées').parentElement!;

    it('uses all of them at first', async () => {
      await store(25);
      renderProfile();
      await screen.findByText('Parties comptées');
      expect(screen.getByRole('button', { name: 'Toutes', pressed: true })).toBeTruthy();
      expect(within(counted()).getByText('25')).toBeTruthy();
    });

    it('can use the 20 latest, which the profile shows once it is worked out again', async () => {
      await store(25);
      renderProfile();
      await screen.findByText('Parties comptées');
      await userEvent.click(screen.getByRole('button', { name: '20 dernières' }));
      await waitFor(() => expect(within(counted()).getByText('20')).toBeTruthy());
      expect(screen.getByRole('button', { name: '20 dernières', pressed: true })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Toutes', pressed: false })).toBeTruthy();
      expect(screen.getByText(/20 parties comptées sur 25 enregistrées/)).toBeTruthy();
    });

    it('remembers the choice', async () => {
      await store(3);
      renderProfile();
      await screen.findByText('Parties comptées');
      await userEvent.click(screen.getByRole('button', { name: '50 dernières' }));
      expect(localStorage.getItem('chess_profile_window')).toBe('50');
    });

    it('starts from the choice remembered', async () => {
      localStorage.setItem('chess_profile_window', '20');
      await store(25);
      renderProfile();
      await screen.findByText('Parties comptées');
      expect(screen.getByRole('button', { name: '20 dernières', pressed: true })).toBeTruthy();
      expect(within(counted()).getByText('20')).toBeTruthy();
    });

    it('ignores a value that is not one of the choices', async () => {
      localStorage.setItem('chess_profile_window', '7');
      await store(1);
      renderProfile();
      await screen.findByText('Parties comptées');
      expect(screen.getByRole('button', { name: 'Toutes', pressed: true })).toBeTruthy();
    });
  });
});
