// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPuzzleHistory, savePuzzleAttempt, savePuzzleSession } from '../../services/puzzleHistoryStore';
import * as puzzleBook from '../../services/puzzleBook';
import { saveWoodpecker } from '../../services/woodpeckerStore';
import type { Puzzle, PuzzleIndex } from '../../utils/puzzleData';
import { attemptKey } from '../../utils/puzzleHistory';
import { createSet } from '../../utils/woodpecker';
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
  themes: { mateIn1: { 1000: 2, 1200: 1 }, fork: { 1200: 1 } },
};

/** Black plays b7-b6, then White mates on the back rank: Ra8. */
const puzzle = (id: string, over: Partial<Puzzle> = {}): Puzzle => ({
  id,
  fen: '6k1/1p3ppp/8/8/8/8/8/R1R3K1 b - - 0 1',
  moves: ['b7b6', 'a1a8'],
  rating: 1100,
  themes: ['mate', 'mateIn1', 'backRankMate'],
  ...over,
});

const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;
type User = ReturnType<typeof userEvent.setup>;
const play = async (user: User, from: string, to: string) => {
  await user.click(cell(from));
  await user.click(cell(to));
};

/** Puts attempts in the history, as the app would have written them. */
async function store(count: number, themes: string[], wins: number, at = Date.now()) {
  for (let i = 0; i < count; i++) {
    const attempt = { at: at - i, id: `${themes[0]}${i}`, ok: i < wins, rating: 1100, themes };
    await savePuzzleAttempt({ id: attempt.id, plays: 1, wins: attempt.ok ? 1 : 0, lastAt: attempt.at }, attempt);
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
  loadPuzzleIndex.mockReset();
  loadPuzzleIndex.mockResolvedValue(index);
  loadPuzzles.mockReset();
  loadPuzzles.mockResolvedValue([puzzle('p1')]);
});
afterEach(() => vi.restoreAllMocks());

describe('Puzzles: the history', () => {
  it('notes the puzzles played and the session, with their outcome', async () => {
    const user = userEvent.setup();
    loadPuzzles.mockResolvedValue([puzzle('p1'), puzzle('p2')]);
    render(<Puzzles onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Commencer' }));
    await screen.findByText(/^Puzzle 1/);
    await play(user, 'a1', 'a2'); // a miss
    await user.click(await screen.findByRole('button', { name: 'Puzzle suivant' }));
    await play(user, 'a1', 'a8');
    await user.click(await screen.findByRole('button', { name: 'Voir le résultat' }));
    await screen.findByText(/Plus de puzzle à jouer/);

    await waitFor(async () => {
      const history = await loadPuzzleHistory();
      expect(history.log.map((a) => a.ok)).toEqual([false, true]);
      expect(history.sessions).toHaveLength(1);
    });
    const history = await loadPuzzleHistory();
    expect(history.seen.size).toBe(2);
    expect(history.log[0]).toMatchObject({ rating: 1100, themes: ['mate', 'mateIn1', 'backRankMate'] });
    expect(history.sessions[0]).toMatchObject({ mode: 'free', solved: 1, total: 2, minutes: null });
  });

  it('does not note a session in which nothing was played', async () => {
    const user = userEvent.setup();
    render(<Puzzles onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Commencer' }));
    await screen.findByText(/^Puzzle 1/);
    await user.click(screen.getByRole('button', { name: 'Arrêter la séance' }));
    await screen.findByText(/Séance arrêtée/);
    expect((await loadPuzzleHistory()).sessions).toEqual([]);
  });

  it('draws the puzzles never played before the ones played', async () => {
    const user = userEvent.setup();
    await savePuzzleAttempt(
      { id: 'old', plays: 1, wins: 1, lastAt: 5 },
      { at: 5, id: 'old', ok: true, rating: 1100, themes: [] }
    );
    loadPuzzles.mockResolvedValue([puzzle('old'), puzzle('new')]);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<Puzzles onClose={vi.fn()} />);
    expect(await screen.findByText(/Vous avez déjà joué 1 puzzle : ils reviennent en dernier/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    await screen.findByText(/^Puzzle 1/);
    await play(user, 'a1', 'a8');
    // Both are the same position: the one shown first is told apart by what is kept once solved
    await waitFor(async () => expect((await loadPuzzleHistory()).seen.get('new')?.plays).toBe(1));
    expect((await loadPuzzleHistory()).seen.get('old')?.plays).toBe(1);
  });

  it('notes the first attempt of a puzzle of the Woodpecker, not its retries', async () => {
    const user = userEvent.setup();
    await saveWoodpecker(createSet([puzzle('w1'), puzzle('w2')], { from: 1000, to: 1200 }, 1, 100));
    render(<Puzzles onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Woodpecker' }));
    await user.click(await screen.findByRole('button', { name: 'Commencer le cycle 1' }));
    await play(user, 'a1', 'a2'); // w1 missed
    await user.click(await screen.findByRole('button', { name: 'Puzzle suivant' }));
    await play(user, 'a1', 'a8'); // w2 solved
    await screen.findByText(/Cycle 1 · 1 sur 2 résolus/, undefined, { timeout: 3000 });
    await play(user, 'a1', 'a8'); // w1 again, solved: not a new attempt
    await screen.findByText(/Cycle 1 terminé en/, undefined, { timeout: 3000 });
    const { log } = await loadPuzzleHistory();
    expect(log.map((a) => [a.id, a.ok])).toEqual([
      ['w1', false],
      ['w2', true],
    ]);
  });
});

describe('Puzzles: the statistics', () => {
  const openStats = async (user: User) => {
    render(<Puzzles onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Statistiques' }));
  };

  it('says there is nothing yet', async () => {
    await openStats(userEvent.setup());
    expect(await screen.findByText('Pas encore de puzzle joué')).toBeTruthy();
  });

  it('tells the totals and the success by theme, the weakest first', async () => {
    await store(10, ['fork'], 3);
    await store(8, ['pin'], 7);
    await store(2, ['skewer'], 1);
    await savePuzzleSession({
      at: Date.now() - 1000,
      mode: 'free',
      solved: 9,
      total: 12,
      elapsedMs: 300_000,
      minutes: 5,
    });
    await openStats(userEvent.setup());
    const themes = await screen.findByRole('list', { name: 'Réussite par thème' });
    const rows = within(themes).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Fourchette.*30 %.*3 sur 10/);
    expect(rows[1].textContent).toMatch(/Clouage.*88 %.*7 sur 8/);
    expect(screen.getByText(/Pas encore assez de puzzles : Enfilade \(2\)/)).toBeTruthy();
    // Played in all, and played this week
    expect(screen.getAllByText('20')).toHaveLength(2);
    const sessions = within(screen.getByRole('list', { name: 'Dernières séances' })).getAllByRole('listitem');
    expect(sessions[0].textContent).toMatch(/Séance libre.*9 sur 12 \(75 %\).*5 min 00 s.*2,4 par minute/);
  });

  it('leaves out the attempts older than 30 days from the themes', async () => {
    await store(6, ['fork'], 0, Date.now() - 40 * 24 * 3600_000);
    await openStats(userEvent.setup());
    expect(await screen.findByText(/Aucun thème n’a encore 5 puzzles joués/)).toBeTruthy();
  });

  it('tells the figures over a week, a month or everything that was kept', async () => {
    const user = userEvent.setup();
    await store(6, ['fork'], 6, Date.now() - 1000); // this week: all solved
    await store(6, ['pin'], 0, Date.now() - 20 * 24 * 3600_000); // this month: none solved
    await store(6, ['skewer'], 3, Date.now() - 60 * 24 * 3600_000); // long ago
    await openStats(user);
    const themes = async () =>
      within(await screen.findByRole('list', { name: 'Réussite par thème' }))
        .getAllByRole('listitem')
        .map((row) => row.textContent?.split(/\d/)[0]);
    expect(await themes()).toEqual(['Clouage', 'Fourchette']); // a month, the weakest first
    await user.click(screen.getByRole('button', { name: '7 jours' }));
    expect(await themes()).toEqual(['Fourchette']);
    expect(screen.getByText('Réussite, 7 jours')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tout' }));
    expect(await themes()).toEqual(['Clouage', 'Enfilade', 'Fourchette']);
    expect(screen.getByText(/Réussite par thème, depuis le début/)).toBeTruthy();
  });

  it('does not draw the progress before two weeks have enough puzzles', async () => {
    await store(6, ['fork'], 3, Date.now() - 1000);
    await openStats(userEvent.setup());
    expect(await screen.findByText(/La courbe apparaît quand deux semaines ont au moins 5 puzzles/)).toBeTruthy();
  });

  it('draws the progress week after week', async () => {
    await store(6, ['fork'], 3, Date.now() - 1000); // this week: 50 %
    await store(6, ['pin'], 6, Date.now() - 7 * 24 * 3600_000 - 1000); // last week: 100 %
    await openStats(userEvent.setup());
    const curve = await screen.findByRole('img', {
      name: /Réussite aux puzzles, semaine après semaine : 100 % .* 50 %/,
    });
    expect(curve.querySelectorAll('circle')).toHaveLength(2);
    expect(curve.querySelectorAll('polyline')).toHaveLength(1);
  });

  it('clears the history only after a confirmation that says what goes', async () => {
    const user = userEvent.setup();
    await store(6, ['fork'], 3);
    await savePuzzleSession({ at: Date.now(), mode: 'free', solved: 1, total: 2, elapsedMs: 1000, minutes: null });
    await openStats(user);
    await user.click(await screen.findByRole('button', { name: 'Effacer l’historique' }));
    expect(screen.getByRole('alert').textContent).toMatch(/statistiques.*séances.*Drive.*puzzles ratés.*Woodpecker/);
    await user.click(screen.getByRole('button', { name: 'Garder' }));
    expect((await loadPuzzleHistory()).log).toHaveLength(6);

    await user.click(screen.getByRole('button', { name: 'Effacer l’historique' }));
    await user.click(screen.getByRole('button', { name: 'Effacer l’historique' }));
    expect(await screen.findByText('Pas encore de puzzle joué')).toBeTruthy();
    await waitFor(async () => {
      const history = await loadPuzzleHistory();
      expect(history.log).toEqual([]);
      expect(history.sessions).toEqual([]);
      expect(history.clearedAt).toBeGreaterThan(0);
    });
  });

  it('starts puzzles on a theme from its row', async () => {
    const user = userEvent.setup();
    await store(6, ['fork'], 1);
    await openStats(user);
    await user.click(await screen.findByRole('button', { name: 'S’entraîner : Fourchette' }));
    expect((await screen.findByRole('button', { name: /Fourchette/ })).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Commencer' })).toBeTruthy();
  });

  it('keys the attempts so that the order of the store is the order they were played in', () => {
    expect(attemptKey({ at: 2, id: 'a' }) < attemptKey({ at: 10, id: 'a' })).toBe(true);
  });
});
