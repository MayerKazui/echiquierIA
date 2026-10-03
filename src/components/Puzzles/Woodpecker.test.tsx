// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as puzzleBook from '../../services/puzzleBook';
import { loadPuzzleEntries } from '../../services/puzzleStore';
import { loadWoodpecker, saveWoodpecker } from '../../services/woodpeckerStore';
import type { Puzzle, PuzzleIndex } from '../../utils/puzzleData';
import { createSet, type WoodpeckerSet } from '../../utils/woodpecker';
import { Puzzles } from './Puzzles';

vi.mock('../../services/puzzleBook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/puzzleBook')>()),
  loadPuzzleIndex: vi.fn(),
  loadPuzzles: vi.fn(),
}));
vi.mock('../../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

const loadPuzzleIndex = vi.mocked(puzzleBook.loadPuzzleIndex);
const loadPuzzles = vi.mocked(puzzleBook.loadPuzzles);

const index: PuzzleIndex = {
  version: 1,
  total: 5,
  bandWidth: 200,
  bands: { 1000: 3, 1200: 2 },
  themes: { mateIn1: { 1000: 2, 1200: 1 } },
};

/** Black plays b7-b6, then White mates on the back rank: Ra8. */
const puzzle = (id: string): Puzzle => ({
  id,
  fen: '6k1/1p3ppp/8/8/8/8/8/R1R3K1 b - - 0 1',
  moves: ['b7b6', 'a1a8'],
  rating: 1100,
  themes: ['mate', 'mateIn1', 'backRankMate'],
});

const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;
type User = ReturnType<typeof userEvent.setup>;

async function play(user: User, from: string, to: string) {
  await user.click(cell(from));
  await user.click(cell(to));
}
const solve = (user: User) => play(user, 'a1', 'a8');
const miss = (user: User) => play(user, 'a1', 'a2');

async function openWoodpecker(user: User) {
  render(<Puzzles onClose={vi.fn()} />);
  await user.click(await screen.findByRole('button', { name: 'Woodpecker' }));
}

async function createLot(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Créer mon lot' }));
  await screen.findByText(/Votre lot : 3 puzzles/);
}

/** A lot already made, as the store keeps it. */
async function storeLot(over: Partial<WoodpeckerSet> = {}, ids = ['p1', 'p2', 'p3']) {
  await saveWoodpecker({ ...createSet(ids.map(puzzle), { from: 1000, to: 1600 }, 1, 100), ...over });
}

const NEXT_PUZZLE = { timeout: 3000 };

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
  loadPuzzleIndex.mockReset();
  loadPuzzleIndex.mockResolvedValue(index);
  loadPuzzles.mockReset();
  loadPuzzles.mockResolvedValue([puzzle('p1'), puzzle('p2'), puzzle('p3')]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Woodpecker: the lot', () => {
  it('is reached from the puzzles, and offers a range and the size of the lot', async () => {
    const user = userEvent.setup();
    await openWoodpecker(user);
    expect(screen.getByRole('button', { name: 'Woodpecker' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Elo minimum')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Créer mon lot' })).toBeTruthy();
    // A range of 5 puzzles has no size to choose: the lot takes them all
    expect(screen.queryByRole('button', { name: '20' })).toBeNull();
  });

  it('offers the sizes the range can fill, and remembers the choice', async () => {
    const user = userEvent.setup();
    loadPuzzleIndex.mockResolvedValue({ ...index, bands: { 1000: 100, 1200: 120 } });
    await openWoodpecker(user);
    await user.click(await screen.findByRole('button', { name: '200' }));
    expect(screen.getByRole('button', { name: '200' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: '500' })).toBeNull();
    expect(localStorage.getItem('woodpecker_size')).toBe('200');
  });

  it('draws the lot from the range, once, and keeps it', async () => {
    const user = userEvent.setup();
    await openWoodpecker(user);
    await createLot(user);
    expect(loadPuzzles).toHaveBeenCalledWith({ minRating: 1000, maxRating: 1599, themes: [], match: 'any' });
    expect(screen.getByRole('button', { name: 'Commencer le cycle 1' })).toBeTruthy();
    await waitFor(async () => expect((await loadWoodpecker())?.puzzles).toHaveLength(3));
  });

  it('says so when the puzzles cannot be loaded', async () => {
    const user = userEvent.setup();
    loadPuzzles.mockRejectedValueOnce(new Error('offline'));
    await openWoodpecker(user);
    await user.click(await screen.findByRole('button', { name: 'Créer mon lot' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/n’ont pas pu être chargés/);
  });

  it('finds the lot again the next time, with its cycles', async () => {
    const user = userEvent.setup();
    await storeLot({
      cycles: [{ number: 1, startedAt: 0, finishedAt: 1, totalMs: 725_000, size: 3, firstTry: 2 }],
    });
    await openWoodpecker(user);
    expect(await screen.findByText(/Votre lot : 3 puzzles, de 1000 à 1600 Elo/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Commencer le cycle 2' })).toBeTruthy();
    expect(screen.getByText(/À battre : 12 min 05 s/)).toBeTruthy();
    const item = within(screen.getByRole('list', { name: 'Cycles terminés' }))
      .getByText('Cycle 1')
      .closest('li')!;
    expect(item.textContent).toMatch(/2 sur 3 du premier coup/);
  });

  it('changes the lot only after a confirmation that says what is lost', async () => {
    const user = userEvent.setup();
    await storeLot();
    await openWoodpecker(user);
    await user.click(await screen.findByRole('button', { name: 'Nouveau lot' }));
    expect(screen.getByRole('alert').textContent).toMatch(/efface celui-ci, ses cycles/);
    await user.click(screen.getByRole('button', { name: 'Garder ce lot' }));
    expect(screen.getByRole('button', { name: 'Commencer le cycle 1' })).toBeTruthy();
    expect((await loadWoodpecker())?.puzzles).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Nouveau lot' }));
    await user.click(screen.getByRole('button', { name: 'Effacer et changer de lot' }));
    expect(await screen.findByRole('button', { name: 'Créer mon lot' })).toBeTruthy();
    await waitFor(async () => expect(await loadWoodpecker()).toBeNull());
  });
});

describe('Woodpecker: a cycle', () => {
  it('goes through the lot, puzzle after puzzle, then tells the time of the cycle', async () => {
    const user = userEvent.setup();
    await storeLot();
    await openWoodpecker(user);
    await user.click(await screen.findByRole('button', { name: 'Commencer le cycle 1' }));
    expect(screen.getByText(/Cycle 1 · 0 sur 3 résolus/)).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('0:00');
    await solve(user);
    await screen.findByText(/Cycle 1 · 1 sur 3 résolus/, undefined, NEXT_PUZZLE);
    await solve(user);
    await screen.findByText(/Cycle 1 · 2 sur 3 résolus/, undefined, NEXT_PUZZLE);
    await solve(user);

    expect(await screen.findByText(/Cycle 1 terminé en/, undefined, NEXT_PUZZLE)).toBeTruthy();
    expect(screen.getByText(/3 sur 3 du premier coup \(100 %\)/)).toBeTruthy();
    expect(screen.getByText(/premier cycle : son temps sert de référence/)).toBeTruthy();
    const saved = await loadWoodpecker();
    expect(saved?.cycles).toHaveLength(1);
    expect(saved?.progress).toBeNull();
  });

  it('plays a puzzle missed again at the end of the cycle, and counts it as missed', async () => {
    const user = userEvent.setup();
    await storeLot();
    await openWoodpecker(user);
    await user.click(await screen.findByRole('button', { name: 'Commencer le cycle 1' }));
    await miss(user);
    expect(await screen.findByText(/Il reviendra en fin de cycle/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Puzzle suivant' }));
    expect(screen.getByText(/Cycle 1 · 0 sur 3 résolus/)).toBeTruthy();
    expect(screen.getByText(/1 à reprendre/)).toBeTruthy();
    await solve(user);
    await screen.findByText(/Cycle 1 · 1 sur 3 résolus/, undefined, NEXT_PUZZLE);
    await solve(user);
    await screen.findByText(/Cycle 1 · 2 sur 3 résolus/, undefined, NEXT_PUZZLE);
    // The last puzzle is the one that was missed: it is played again, and nothing ends before it is solved
    expect(screen.getByText(/1 à reprendre/)).toBeTruthy();
    await solve(user);

    expect(await screen.findByText(/Cycle 1 terminé en/, undefined, NEXT_PUZZLE)).toBeTruthy();
    expect(screen.getByText(/2 sur 3 du premier coup \(67 %\)/)).toBeTruthy();
    expect(screen.getByText(/1 repris en fin de cycle jusqu’à être réussi/)).toBeTruthy();
    // The puzzles of the Woodpecker repeat on their own: they do not go to the missed puzzles of the free sessions
    expect((await loadPuzzleEntries()).size).toBe(0);
  });

  it('does not end on a puzzle missed, even the last one', async () => {
    const user = userEvent.setup();
    await storeLot({}, ['p1']);
    await openWoodpecker(user);
    await user.click(await screen.findByRole('button', { name: 'Commencer le cycle 1' }));
    await miss(user);
    await screen.findByText(/Il reviendra en fin de cycle/);
    await user.click(screen.getByRole('button', { name: 'Puzzle suivant' }));
    // The same puzzle is back, afresh
    expect(screen.getByText(/Cycle 1 · 0 sur 1 résolus/)).toBeTruthy();
    expect(screen.queryByText(/Il reviendra en fin de cycle/)).toBeNull();
    await solve(user);
    expect(await screen.findByText(/Cycle 1 terminé en/, undefined, NEXT_PUZZLE)).toBeTruthy();
    expect(screen.getByText(/0 sur 1 du premier coup \(0 %\)/)).toBeTruthy();
  });

  it('compares the time with the cycle before', async () => {
    const user = userEvent.setup();
    await storeLot({ cycles: [{ number: 1, startedAt: 0, finishedAt: 1, totalMs: 600_000, size: 1, firstTry: 1 }] }, [
      'p1',
    ]);
    await openWoodpecker(user);
    await user.click(await screen.findByRole('button', { name: 'Commencer le cycle 2' }));
    await solve(user);
    expect(await screen.findByText(/Cycle 2 terminé en/, undefined, NEXT_PUZZLE)).toBeTruthy();
    expect(screen.getByText(/de moins que le cycle précédent/)).toBeTruthy();
    expect(screen.getByText(/Votre meilleur cycle jusqu’ici/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retour au lot' }));
    expect(await screen.findByRole('button', { name: 'Commencer le cycle 3' })).toBeTruthy();
    expect(screen.getByText('Cycle 2').closest('li')?.textContent).toMatch(/−/);
  });

  it('proposes the next cycle at once, with the same lot', async () => {
    const user = userEvent.setup();
    await storeLot({}, ['p1']);
    await openWoodpecker(user);
    await user.click(await screen.findByRole('button', { name: 'Commencer le cycle 1' }));
    await solve(user);
    await user.click(await screen.findByRole('button', { name: 'Commencer le cycle 2', ...NEXT_PUZZLE }));
    expect(screen.getByText(/Cycle 2 · 0 sur 1 résolus/)).toBeTruthy();
    expect((await loadWoodpecker())?.puzzles.map((p) => p.id)).toEqual(['p1']);
  });
});

describe('Woodpecker: the clock', () => {
  it('stops with the pause, hides the board, and goes on after it', async () => {
    const user = userEvent.setup();
    let clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    await storeLot({}, ['p1']);
    await openWoodpecker(user);
    await user.click(await screen.findByRole('button', { name: 'Commencer le cycle 1' }));
    clock += 5000;
    await waitFor(() => expect(screen.getByRole('timer').textContent).toBe('0:05'));

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText(/Cycle en pause/)).toBeTruthy();
    expect(cell('a1').closest('[inert]')).not.toBeNull();
    clock += 60_000;
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.getByRole('timer').textContent).toBe('0:05');

    await user.click(screen.getByRole('button', { name: 'Reprendre' }));
    expect(screen.queryByText(/Cycle en pause/)).toBeNull();
    expect(cell('a1').closest('[inert]')).toBeNull();
    clock += 3000;
    await waitFor(() => expect(screen.getByRole('timer').textContent).toBe('0:08'));
    await waitFor(async () => expect((await loadWoodpecker())?.progress?.elapsedMs).toBe(5000));
  });

  it('is kept when the player leaves the cycle, and picks up where it was', async () => {
    const user = userEvent.setup();
    let clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    await storeLot();
    await openWoodpecker(user);
    await user.click(await screen.findByRole('button', { name: 'Commencer le cycle 1' }));
    await solve(user);
    await screen.findByText(/Cycle 1 · 1 sur 3 résolus/, undefined, NEXT_PUZZLE);
    clock += 90_000;
    await user.click(screen.getByRole('button', { name: 'Quitter le cycle' }));

    expect(await screen.findByRole('button', { name: 'Reprendre le cycle 1' })).toBeTruthy();
    expect(screen.getByText(/Déjà 1 min 30 s sur ce cycle, 2 puzzles à résoudre/)).toBeTruthy();
    await waitFor(async () => {
      const progress = (await loadWoodpecker())?.progress;
      expect(progress?.queue).toHaveLength(2);
      expect(progress?.elapsedMs).toBe(90_000);
    });

    clock += 600_000;
    await user.click(screen.getByRole('button', { name: 'Reprendre le cycle 1' }));
    expect(screen.getByText(/Cycle 1 · 1 sur 3 résolus/)).toBeTruthy();
    // The time spent away does not count
    await waitFor(() => expect(screen.getByRole('timer').textContent).toBe('1:30'));
  });

  it('is kept too when the window is closed in the middle of a cycle', async () => {
    const user = userEvent.setup();
    let clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    await storeLot();
    const { unmount } = render(<Puzzles onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Woodpecker' }));
    await user.click(await screen.findByRole('button', { name: 'Commencer le cycle 1' }));
    clock += 12_000;
    unmount();
    await waitFor(async () => expect((await loadWoodpecker())?.progress?.elapsedMs).toBe(12_000));
  });
});
