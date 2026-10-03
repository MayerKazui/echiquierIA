// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { ensureOpeningBookLoaded, getOpeningPosition } from '../../services/openingBook';
import { walkLine } from '../../utils/openingExplorer';
import { saveGame } from '../../services/gameStore';
import { game, mv, PSEUDO } from '../../test/profileFixtures';
import { loadOpeningsFromDisk } from '../../test/openings';
import { Openings } from './Openings';

vi.mock('../../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;

/** Stores a game of the player (given as SAN moves). */
async function store(
  id: string,
  sans: string[],
  { result = '1-0', color = 'w' }: { result?: string; color?: 'w' | 'b' } = {}
) {
  const source = game({
    id,
    white: color === 'w' ? PSEUDO : 'Bob',
    black: color === 'w' ? 'Bob' : PSEUDO,
    meta: { result },
    moves: sans.map((san, ply) => mv(ply, { san })),
  });
  await saveGame({ pgn: `1. e4 *\n; game ${id}`, depth: 12, result: source.result });
}

const renderOpenings = (props: Partial<React.ComponentProps<typeof Openings>> = {}) => {
  const handlers = { onClose: vi.fn(), onImport: vi.fn() };
  render(<Openings {...handlers} {...props} />);
  return handlers;
};

const table = () => screen.findByRole('table');
const rowOf = async (move: string) => {
  const rows = within(await table()).getAllByRole('row');
  const row = rows.find((r) => within(r).queryByRole('button', { name: move }));
  if (!row) throw new Error(`No row for ${move}`);
  return row;
};

beforeAll(async () => {
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
});

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
});

describe('Openings', () => {
  it('starts from the initial position, with the first moves of the openings', async () => {
    renderOpenings();
    expect(await screen.findByText('Position initiale')).toBeTruthy();
    const body = within(await table());
    expect(body.getByRole('button', { name: '1.e4' })).toBeTruthy();
    expect(body.getByRole('button', { name: '1.d4' })).toBeTruthy();
    // French piece letters
    expect(body.getByRole('button', { name: '1.Cf3' })).toBeTruthy();
  });

  it('follows a move: the opening is named in French and the move is on the line', async () => {
    const user = userEvent.setup();
    renderOpenings();
    await user.click(within(await table()).getByRole('button', { name: '1.e4' }));
    const line = screen.getByRole('list', { name: 'Coups joués' });
    expect(within(line).getByRole('button', { name: '1.e4' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/\[B00\].*[Pp]ion/);

    await user.click(within(await table()).getByRole('button', { name: '1…c5' }));
    expect(screen.getByRole('status').textContent).toMatch(/Défense sicilienne/);
    expect(within(line).getAllByRole('button')).toHaveLength(2);
  });

  it('goes back one move, to a move of the line, and to the start', async () => {
    const user = userEvent.setup();
    renderOpenings();
    for (const move of ['1.e4', '1…c5']) await user.click(within(await table()).getByRole('button', { name: move }));
    await user.click(within(await table()).getByRole('button', { name: '2.Cf3' }));
    const line = screen.getByRole('list', { name: 'Coups joués' });
    expect(within(line).getAllByRole('button')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Coup précédent' }));
    expect(within(line).getAllByRole('button')).toHaveLength(2);

    await user.click(within(line).getByRole('button', { name: '1.e4' }));
    expect(within(line).getAllByRole('button')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Début' }));
    expect(screen.queryByRole('list', { name: 'Coups joués' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Début' }).hasAttribute('disabled')).toBe(true);
  });

  it('plays a move made on the board when the explorer offers it', async () => {
    const user = userEvent.setup();
    renderOpenings();
    await table();
    await user.click(cell('e2'));
    await user.click(cell('e4'));
    const line = screen.getByRole('list', { name: 'Coups joués' });
    expect(within(line).getByRole('button', { name: '1.e4' })).toBeTruthy();
  });

  it('refuses a move of the board that is not among the moves offered, and says so', async () => {
    const user = userEvent.setup();
    renderOpenings();
    for (const move of ['1.e4', '1…e5']) await user.click(within(await table()).getByRole('button', { name: move }));
    // A legal move that no line of the database follows
    const fen = walkLine(['e4', 'e5'], getOpeningPosition).fen;
    const known = new Set(getOpeningPosition(fen)?.nextSans);
    const odd = new Chess(fen).moves({ verbose: true }).find((m) => !known.has(m.san))!;

    await user.click(cell(odd.from));
    await user.click(cell(odd.to));
    expect(screen.getByRole('status').textContent).toContain('ne figure pas dans les coups proposés');
    const line = screen.getByRole('list', { name: 'Coups joués' });
    expect(within(line).getAllByRole('button')).toHaveLength(2);
  });

  describe('with the player’s games', () => {
    it('shows how the games went after each move', async () => {
      await store('a', ['e4', 'e5'], { result: '1-0' });
      await store('b', ['e4', 'c5'], { result: '0-1' });
      await store('c', ['d4', 'd5'], { result: '1/2-1/2' });
      renderOpenings();
      const e4 = await rowOf('1.e4');
      expect(within(e4).getByText('2 parties : 1 gagnée, 0 nulle, 1 perdue')).toBeTruthy();
      const d4 = await rowOf('1.d4');
      expect(within(d4).getByText('1 partie : 0 gagnée, 1 nulle, 0 perdue')).toBeTruthy();
      const nf3 = await rowOf('1.Cf3');
      expect(within(nf3).queryByText(/partie/)).toBeNull();
    });

    it('shows the replies of the games from the position reached', async () => {
      await store('a', ['e4', 'e5'], { result: '1-0' });
      await store('b', ['e4', 'c5'], { result: '0-1' });
      const user = userEvent.setup();
      renderOpenings();
      await user.click(within(await rowOf('1.e4')).getByRole('button', { name: '1.e4' }));
      expect(within(await rowOf('1…e5')).getByText('1 partie : 1 gagnée, 0 nulle, 0 perdue')).toBeTruthy();
      expect(within(await rowOf('1…c5')).getByText('1 partie : 0 gagnée, 0 nulle, 1 perdue')).toBeTruthy();
    });

    it('lists a move the games played that the theory does not know, as out of the book', async () => {
      await store('a', ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'], { result: '1-0' });
      const user = userEvent.setup();
      renderOpenings();
      for (const move of ['1.e4', '1…e5']) await user.click(within(await table()).getByRole('button', { name: move }));
      // 2.Dh5 is a (named) opening ; follow the game further, to where the book stops
      await user.click(within(await table()).getByRole('button', { name: '2.Dh5' }));
      await user.click(within(await table()).getByRole('button', { name: '2…Cc6' }));
      await user.click(within(await table()).getByRole('button', { name: '3.Fc4' }));
      await user.click(within(await table()).getByRole('button', { name: '3…Cf6' }));
      expect(within(await rowOf('4.Dxf7#')).getByText('hors du livre')).toBeTruthy();
    });

    it('looks at one colour only', async () => {
      await store('a', ['e4', 'e5'], { result: '1-0', color: 'w' });
      await store('b', ['d4', 'd5'], { result: '0-1', color: 'b' });
      const user = userEvent.setup();
      renderOpenings();
      expect(within(await rowOf('1.d4')).getByText(/1 partie/)).toBeTruthy();

      await user.click(screen.getByRole('button', { name: 'Avec les Blancs' }));
      expect(within(await rowOf('1.e4')).getByText(/1 partie/)).toBeTruthy();
      expect(within(await rowOf('1.d4')).queryByText(/partie/)).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Avec les Noirs' }));
      expect(within(await rowOf('1.d4')).getByText(/1 partie/)).toBeTruthy();
      expect(within(await rowOf('1.e4')).queryByText(/partie/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Avec les Noirs' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('does not offer to import when games are counted', async () => {
      await store('a', ['e4', 'e5']);
      renderOpenings();
      await table();
      await waitFor(() => expect(screen.queryByRole('button', { name: 'importez vos parties' })).toBeNull());
    });
  });

  describe('without games', () => {
    it('works on the theory alone, and offers to import the games', async () => {
      const user = userEvent.setup();
      const { onImport } = renderOpenings();
      await table();
      await user.click(screen.getByRole('button', { name: 'importez vos parties' }));
      expect(onImport).toHaveBeenCalledTimes(1);
    });
  });

  it('closes', async () => {
    const user = userEvent.setup();
    const { onClose } = renderOpenings();
    await table();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Openings, playing from a position', () => {
  it('offers a game against Stockfish from the line on the board, with the moves that lead there', async () => {
    const onPlay = vi.fn();
    const user = userEvent.setup();
    renderOpenings({ onPlay, start: { view: 'explorer', sans: ['e4', 'c5'] } });
    await user.click(await screen.findByRole('button', { name: 'Jouer contre Stockfish' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    const [start] = onPlay.mock.calls[0] as [{ fen: string; label: string; prefix: string[] }];
    expect(start.prefix).toEqual(['e4', 'c5']);
    expect(start.fen).toBe(walkLine(['e4', 'c5'], getOpeningPosition).fen);
    expect(start.label).toContain("Position de l'explorateur");
  });

  it('does not offer it on the initial position (the menu has the complete game)', async () => {
    renderOpenings({ onPlay: vi.fn() });
    await table();
    expect(screen.queryByRole('button', { name: 'Jouer contre Stockfish' })).toBeNull();
  });
});

describe('Openings, opened on a position', () => {
  it('starts on the line it is given, in the explorer', async () => {
    renderOpenings({ start: { view: 'explorer', sans: ['e4', 'c5'] } });
    const line = await screen.findByRole('list', { name: 'Coups joués' });
    expect(
      within(line)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['1.e4', '1…c5']);
    expect(screen.getByRole('button', { name: 'Explorateur' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('starts on the repertoire when asked to', async () => {
    renderOpenings({ start: { view: 'repertoire', sans: [] } });
    expect(screen.getByRole('button', { name: 'Mes ouvertures' }).getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByText('Aucune partie à compter')).toBeTruthy();
  });
});
