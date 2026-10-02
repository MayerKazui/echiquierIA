// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureOpeningBookLoaded } from '../../services/openingBook';
import { saveGame } from '../../services/gameStore';
import { game, mv, PSEUDO } from '../../test/profileFixtures';
import { loadOpeningsFromDisk } from '../../test/openings';
import { Openings } from './Openings';

vi.mock('../../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

const RUY = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];

/** Stores a game of the player: `bookPlies` moves of theory, then the first move outside the book. */
async function store(
  id: string,
  {
    bookPlies = 6,
    loss = 0,
    name = 'Ruy Lopez: Morphy Defense',
    eco = 'C78',
    result = '1-0',
    color = 'w',
    sans = RUY,
  }: {
    bookPlies?: number;
    loss?: number;
    name?: string;
    eco?: string;
    result?: string;
    color?: 'w' | 'b';
    sans?: string[];
  } = {}
) {
  const source = game({
    id,
    white: color === 'w' ? PSEUDO : 'Bob',
    black: color === 'w' ? 'Bob' : PSEUDO,
    meta: { result },
    moves: sans.map((san, ply) =>
      ply < bookPlies
        ? mv(ply, { san, classification: 'book', openingName: name, eco })
        : mv(ply, { san, classification: 'best', winPercentLoss: ply === bookPlies ? loss : 0 })
    ),
  });
  await saveGame({ pgn: `1. e4 *\n; game ${id}`, depth: 12, result: source.result });
}

const renderRepertoire = async () => {
  const handlers = { onClose: vi.fn(), onImport: vi.fn() };
  const user = userEvent.setup();
  render(<Openings {...handlers} />);
  await user.click(screen.getByRole('button', { name: 'Mes ouvertures' }));
  return { ...handlers, user };
};

beforeAll(async () => {
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
});

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
});

describe('Mes ouvertures', () => {
  it('says it is looking while the games are read', async () => {
    await store('a');
    await renderRepertoire();
    expect(screen.getByRole('status').textContent).toBe('Recherche de vos ouvertures…');
    await screen.findByRole('list', { name: 'Mes ouvertures' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lists the openings played with their results, the name in French', async () => {
    await store('a', { result: '1-0' });
    await store('b', { result: '0-1' });
    await store('c', { result: '1/2-1/2', name: 'Italian Game', eco: 'C50' });
    await renderRepertoire();
    const list = await screen.findByRole('list', { name: 'Mes ouvertures' });
    const items = within(list)
      .getAllByRole('listitem', { name: '' })
      .filter((li) => li.parentElement === list);
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(/Partie espagnole/)).toBeTruthy();
    expect(within(items[0]).getByText('2 parties : 1 gagnée, 0 nulle, 1 perdue')).toBeTruthy();
    expect(within(items[1]).getByText('1 partie : 0 gagnée, 1 nulle, 0 perdue')).toBeTruthy();
    expect(screen.getByText('3 parties comptées')).toBeTruthy();
  });

  it('opens on the colour with the most games, and switches', async () => {
    await store('a', { color: 'b', name: 'Sicilian Defense: Najdorf Variation', eco: 'B90' });
    await store('b', { color: 'b', name: 'Sicilian Defense: Najdorf Variation', eco: 'B90' });
    await store('c', { color: 'w' });
    const { user } = await renderRepertoire();
    await screen.findByRole('list', { name: 'Mes ouvertures' });
    expect(screen.getByRole('button', { name: 'Avec les Noirs' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Sicilienne|sicilienne/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Avec les Blancs' }));
    expect(screen.queryByText(/Sicilienne|sicilienne/)).toBeNull();
    expect(screen.getByText(/Partie espagnole/)).toBeTruthy();
  });

  it('expands the variations of a family', async () => {
    await store('a', { name: 'Ruy Lopez: Morphy Defense', eco: 'C78' });
    await store('b', { name: 'Ruy Lopez: Berlin Defense', eco: 'C65' });
    const { user } = await renderRepertoire();
    await screen.findByRole('list', { name: 'Mes ouvertures' });
    expect(screen.queryByRole('list', { name: /^Variantes/ })).toBeNull();

    const toggle = screen.getByRole('button', { name: /Voir les variantes \(2\)/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    const variations = screen.getByRole('list', { name: /^Variantes/ });
    expect(within(variations).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Masquer les variantes/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('says who left the theory first', async () => {
    await store('a', { bookPlies: 6 }); // the player (White, ply 6)
    await store('b', { bookPlies: 7 }); // the opponent
    await store('c', { bookPlies: 12 }); // nobody
    await renderRepertoire();
    expect(
      await screen.findByText(
        /Vous quittez la théorie en premier dans 1 partie, l'adversaire dans 1 ; 1 partie reste dans le livre jusqu'au demi-coup 35/
      )
    ).toBeTruthy();
  });

  describe('recurring ways out of the book', () => {
    it('shows a costly one, and what it costs on average', async () => {
      await store('a', { loss: 10 });
      await store('b', { loss: 6, result: '0-1' });
      await renderRepertoire();
      const exits = await screen.findByRole('list', { name: /^Sorties de la théorie récurrentes/ });
      const text = within(exits).getByRole('listitem').textContent;
      expect(text).toContain('2 fois, vous sortez de la théorie avec 4.Fa4');
      expect(text).toContain('coûte en moyenne 8 points de chances de gain');
    });

    it('shows one that holds the position without calling it costly', async () => {
      await store('a', { loss: 1 });
      await store('b', { loss: 2 });
      await renderRepertoire();
      const text = (await screen.findByRole('list', { name: /^Sorties/ })).textContent;
      expect(text).toContain('il tient la position (1,5 point de perte en moyenne)');
      expect(text).not.toContain('coûte');
    });

    it('does not show an exit that happened once', async () => {
      await store('a', { loss: 10 });
      await renderRepertoire();
      await screen.findByRole('list', { name: 'Mes ouvertures' });
      expect(screen.queryByRole('list', { name: /^Sorties/ })).toBeNull();
    });

    it('writes the move with the side of the player: Black’s move number has an ellipsis', async () => {
      const sans = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5'];
      const opts = { color: 'b' as const, bookPlies: 7, loss: 12, sans, name: 'Sicilian Defense: Najdorf Variation' };
      await store('a', opts);
      await store('b', opts);
      await renderRepertoire();
      const text = (await screen.findByRole('list', { name: /^Sorties/ })).textContent;
      expect(text).toContain('4…Cf6');
    });

    it('shows the position before the move in the explorer', async () => {
      await store('a', { loss: 10 });
      await store('b', { loss: 10 });
      const { user } = await renderRepertoire();
      await user.click(await screen.findByRole('button', { name: /Voir dans l'explorateur la position avant 4\.Fa4/ }));

      expect(screen.getByRole('button', { name: 'Explorateur' }).getAttribute('aria-pressed')).toBe('true');
      const line = await screen.findByRole('list', { name: 'Coups joués' });
      expect(
        within(line)
          .getAllByRole('button')
          .map((b) => b.textContent)
      ).toEqual(['1.e4', '1…e5', '2.Cf3', '2…Cc6', '3.Fb5', '3…a6']);
      // The move that leaves the theory is a move of the games, listed as such
      const rows = within(await screen.findByRole('table')).getAllByRole('row');
      const row = rows.find((r) => within(r).queryByRole('button', { name: '4.Fa4' }));
      expect(row).toBeTruthy();
    });
  });

  describe('without games to count', () => {
    it('offers to import them', async () => {
      const { onImport, user } = await renderRepertoire();
      await screen.findByText('Aucune partie à compter');
      await user.click(screen.getByRole('button', { name: 'Importer mes parties' }));
      expect(onImport).toHaveBeenCalledTimes(1);
    });

    it('says how many stored games were left out', async () => {
      const source = game({ id: 'x', white: 'X', black: 'Y' });
      await saveGame({ pgn: '1. e4 *\n; stranger', depth: 12, result: source.result });
      await renderRepertoire();
      expect((await screen.findByText(/Renseignez-le/)).textContent).toContain(
        '1 partie enregistrée ne compte pas : pseudo absent ou partie trop courte'
      );
    });
  });
});
