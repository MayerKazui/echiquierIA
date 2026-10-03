// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveGame } from '../../services/gameStore';
import { savePuzzleAttempt } from '../../services/puzzleHistoryStore';
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
    it('does not offer to choose the games used, there are none', async () => {
      renderProfile();
      await screen.findByText('Aucune partie enregistrée');
      expect(screen.queryByRole('button', { name: 'Toutes' })).toBeNull();
    });

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
    it('offers to train on the errors once the profile is shown', async () => {
      await store(6);
      const onTrain = vi.fn();
      renderProfile({ onTrain });
      await userEvent.click(await screen.findByRole('button', { name: "S'entraîner sur ces erreurs" }));
      expect(onTrain).toHaveBeenCalledTimes(1);
    });

    it('does not offer the training without anything to count, nor when it cannot be opened', async () => {
      await store(2, { white: 'Carl', black: 'Dora' });
      renderProfile({ onTrain: vi.fn() });
      await screen.findByText('Aucune partie ne vous nomme');
      expect(screen.queryByRole('button', { name: "S'entraîner sur ces erreurs" })).toBeNull();
      cleanup();
      await store(6);
      renderProfile();
      await screen.findByText('Parties comptées');
      expect(screen.queryByRole('button', { name: "S'entraîner sur ces erreurs" })).toBeNull();
    });

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

    it('does not talk about the games left aside when only the latest are used', async () => {
      await store(6);
      await saveGame({
        pgn: '1. d4 *\n; other',
        depth: 12,
        result: game({ white: 'Carl', black: 'Dora', moves: Array.from({ length: 40 }, (_, ply) => mv(ply)) }).result,
      });
      localStorage.setItem('chess_profile_window', '20');
      renderProfile();
      await screen.findByText(/6 parties comptées sur 7 enregistrées/);
      expect(screen.queryByText(/laissée de côté|laissées de côté/)).toBeNull();
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

describe('WeaknessProfile: the puzzles', () => {
  const play = async (id: string, themes: string[], ok: boolean, ago = 1000) => {
    const at = Date.now() - ago;
    await savePuzzleAttempt({ id, plays: 1, wins: ok ? 1 : 0, lastAt: at }, { at, id, ok, rating: 1100, themes });
  };

  it('says nothing of puzzles when none was played', async () => {
    await store(6);
    renderProfile();
    await screen.findByText('Parties comptées');
    expect(screen.queryByRole('region', { name: 'Vos puzzles' })).toBeNull();
  });

  it('tells how the puzzles go, and offers the theme that is failed most', async () => {
    await store(6);
    for (let i = 0; i < 6; i++) await play(`f${i}`, ['fork'], i < 2, i + 1);
    for (let i = 0; i < 6; i++) await play(`p${i}`, ['pin'], i < 5, i + 10);
    const user = userEvent.setup();
    const onPuzzles = vi.fn();
    renderProfile({ onPuzzles });
    const section = within(await screen.findByRole('region', { name: 'Vos puzzles' }));
    expect(section.getByText(/12 puzzles joués, 58 % réussis du premier coup/)).toBeTruthy();
    expect(section.getByText(/Le thème le plus fragile : Fourchette, 33 % sur 6 puzzles/)).toBeTruthy();
    await user.click(section.getByRole('button', { name: 'Puzzles : Fourchette' }));
    expect(onPuzzles).toHaveBeenCalledWith(['fork']);
  });

  it('does not name a theme before it was played enough, and ignores old puzzles', async () => {
    await store(6);
    await play('a', ['fork'], false);
    for (let i = 0; i < 6; i++) await play(`old${i}`, ['pin'], false, 40 * 24 * 3600_000);
    renderProfile({ onPuzzles: vi.fn() });
    const section = within(await screen.findByRole('region', { name: 'Vos puzzles' }));
    expect(section.getByText(/1 puzzle joué, 0 % réussis/)).toBeTruthy();
    expect(section.getByText(/Aucun thème n’a encore 5 puzzles joués/)).toBeTruthy();
    expect(section.queryByRole('button')).toBeNull();
  });
});
