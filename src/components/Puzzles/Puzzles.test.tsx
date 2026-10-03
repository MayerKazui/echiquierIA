// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveGame } from '../../services/gameStore';
import * as puzzleBook from '../../services/puzzleBook';
import { loadPuzzleEntries, savePuzzleEntry } from '../../services/puzzleStore';
import { game } from '../../test/profileFixtures';
import type { Puzzle, PuzzleIndex } from '../../utils/puzzleData';
import { DAY_MS } from '../../utils/spacedRepetition';
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
  themes: { mateIn1: { 1000: 2, 1200: 1 }, backRankMate: { 1000: 1 }, fork: { 1200: 1 }, short: { 1000: 1 } },
};

/** Black plays b7-b6, then White mates on the back rank: Ra8 (or Rc8, which is as good). */
const puzzle = (id: string, over: Partial<Puzzle> = {}): Puzzle => ({
  id,
  fen: '6k1/1p3ppp/8/8/8/8/8/R1R3K1 b - - 0 1',
  moves: ['b7b6', 'a1a8'],
  rating: 1100,
  themes: ['mate', 'mateIn1', 'backRankMate'],
  ...over,
});

const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;

async function play(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.click(cell(from));
  await user.click(cell(to));
}

const renderPuzzles = () => {
  const onClose = vi.fn();
  render(<Puzzles onClose={onClose} />);
  return { onClose };
};

/** Starts a run from the set-up screen, once the puzzles are loaded. */
async function startRun(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Commencer' }));
  await screen.findByText(/^Puzzle 1/);
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
  loadPuzzleIndex.mockReset();
  loadPuzzleIndex.mockResolvedValue(index);
  loadPuzzles.mockReset();
  loadPuzzles.mockResolvedValue([puzzle('p1')]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Puzzles: set-up', () => {
  it('says the puzzles are loading, then offers the choice with the number of puzzles', async () => {
    renderPuzzles();
    expect(screen.getByRole('status').textContent).toBe('Chargement des puzzles…');
    await screen.findByRole('button', { name: 'Commencer' });
    // The default range, 1000 to 1600, covers the bands 1000 and 1200
    expect(screen.getByText('5 puzzles')).toBeTruthy();
    expect((screen.getByLabelText('Elo minimum') as HTMLSelectElement).value).toBe('1000');
  });

  it('offers the themes in French, with how many puzzles each has in the range', async () => {
    renderPuzzles();
    await screen.findByRole('button', { name: 'Commencer' });
    expect(screen.getByRole('button', { name: /Mat en 1 \(3\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mat du couloir \(1\)/ })).toBeTruthy();
  });

  it('counts a theme in the range that is chosen', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await screen.findByRole('button', { name: 'Commencer' });
    await user.selectOptions(screen.getByLabelText('Elo maximum (exclu)'), '1200');
    expect(screen.getByText('3 puzzles')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mat en 1 \(2\)/ })).toBeTruthy();
  });

  it('keeps the upper end above the lower one', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await screen.findByRole('button', { name: 'Commencer' });
    await user.selectOptions(screen.getByLabelText('Elo minimum'), '1800');
    expect(Number((screen.getByLabelText('Elo maximum (exclu)') as HTMLSelectElement).value)).toBeGreaterThan(1800);
  });

  it('remembers the choice for the next time', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await screen.findByRole('button', { name: 'Commencer' });
    await user.click(screen.getByRole('button', { name: /Mat du couloir/ }));
    await user.click(screen.getByRole('button', { name: '10 min' }));
    expect(localStorage.getItem('puzzle_themes')).toBe('backRankMate');
    expect(localStorage.getItem('puzzle_minutes')).toBe('10');
  });

  it('offers to combine several themes', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await screen.findByRole('button', { name: 'Commencer' });
    expect(screen.queryByRole('button', { name: /Tous les thèmes à la fois/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Mat du couloir/ }));
    await user.click(screen.getByRole('button', { name: /Mat en 1/ }));
    await user.click(screen.getByRole('button', { name: /Tous les thèmes à la fois/ }));
    expect(localStorage.getItem('puzzle_match')).toBe('all');
  });

  it('cannot start when the index knows of no puzzle for the choice', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await screen.findByRole('button', { name: 'Commencer' });
    await user.selectOptions(screen.getByLabelText('Elo minimum'), '2000');
    expect((screen.getByRole('button', { name: 'Commencer' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Aucun puzzle pour ce choix/)).toBeTruthy();
  });

  it('can be tried again when the index does not load', async () => {
    const user = userEvent.setup();
    loadPuzzleIndex.mockRejectedValueOnce(new Error('offline'));
    renderPuzzles();
    expect((await screen.findByRole('alert')).textContent).toBe('Les puzzles n’ont pas pu être chargés.');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('button', { name: 'Commencer' })).toBeTruthy();
  });

  it('suggests a range from the rating of the player in their games', async () => {
    const user = userEvent.setup();
    await saveGame({ pgn: '1. e4 *', depth: 12, result: game({ meta: { whiteElo: '1432' } }).result });
    renderPuzzles();
    await user.click(await screen.findByRole('button', { name: 'Prendre de 1200 à 1800' }));
    expect(screen.getByText(/Votre Elo en partie : 1432/)).toBeTruthy();
    expect((screen.getByLabelText('Elo minimum') as HTMLSelectElement).value).toBe('1200');
    expect((screen.getByLabelText('Elo maximum (exclu)') as HTMLSelectElement).value).toBe('1800');
  });

  it('closes', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPuzzles();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Puzzles: a run', () => {
  it('asks for the puzzles of the choice, played in the side that moves second', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await startRun(user);
    expect(loadPuzzles).toHaveBeenCalledWith({ minRating: 1000, maxRating: 1599, themes: [], match: 'any' });
    expect(screen.getByText(/Les Blancs jouent/)).toBeTruthy();
    // The opponent's first move (b7-b6) is already played
    expect(cell('b6').getAttribute('aria-label')).toMatch(/pion noir/);
  });

  it('solves a puzzle: it counts, nothing is kept, and the next one comes by itself', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    loadPuzzles.mockResolvedValue([puzzle('p1'), puzzle('p2')]);
    renderPuzzles();
    await startRun(user);
    await play(user, 'a1', 'a8');
    expect(await screen.findByText(/Réussi\./)).toBeTruthy();
    expect(screen.getByLabelText('1 réussis')).toBeTruthy();
    await screen.findByText(/^Puzzle 2/, undefined, { timeout: 3000 });
    expect((await loadPuzzleEntries()).size).toBe(0);
  });

  it('accepts another mate than the one of the solution', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await startRun(user);
    await play(user, 'c1', 'c8');
    expect(await screen.findByText(/Réussi\./)).toBeTruthy();
  });

  it('misses a puzzle at the first wrong move, shows the move expected and keeps the puzzle for tomorrow', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await startRun(user);
    await play(user, 'a1', 'a2');
    expect(await screen.findByText(/Raté\./)).toBeTruthy();
    expect(screen.getByText(/Le coup attendu était Ta8/)).toBeTruthy();
    expect(screen.getByLabelText('1 ratés')).toBeTruthy();
    // The themes are told once the puzzle is over
    expect(within(screen.getByRole('list', { name: 'Thèmes du puzzle' })).getByText('Mat du couloir')).toBeTruthy();
    await waitFor(async () => expect((await loadPuzzleEntries()).get('p1')?.card.level).toBe(0));
  });

  it('lets the player try again after a miss, which does not change the result', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await startRun(user);
    await play(user, 'a1', 'a2');
    await user.click(await screen.findByRole('button', { name: 'Réessayer' }));
    await play(user, 'a1', 'a8');
    expect(await screen.findByText(/Trouvé\./)).toBeTruthy();
    expect(screen.getByText(/reste compté comme raté/)).toBeTruthy();
    expect(screen.getByLabelText('1 ratés')).toBeTruthy();
    expect(screen.getByLabelText('0 réussis')).toBeTruthy();
  });

  it('counts the solution asked for as a miss', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await startRun(user);
    await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
    expect(await screen.findByText(/Raté\./)).toBeTruthy();
    await waitFor(async () => expect((await loadPuzzleEntries()).has('p1')).toBe(true));
  });

  it('ends with the score, the time and the missed puzzles', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await startRun(user);
    await play(user, 'a1', 'a2');
    await user.click(await screen.findByRole('button', { name: 'Voir le résultat' }));
    expect(await screen.findByText(/0 réussi sur 1 \(0 %\)/)).toBeTruthy();
    expect(screen.getByText(/Plus de puzzle à jouer/)).toBeTruthy();
    expect(screen.getByText(/1100 Elo/)).toBeTruthy();
    expect(screen.getByText(/Les puzzles ratés reviennent demain/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Nouvelle séance' }));
    expect(await screen.findByRole('button', { name: 'Commencer' })).toBeTruthy();
  });

  it('stops when the player asks to', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await startRun(user);
    await user.click(screen.getByRole('button', { name: 'Arrêter la séance' }));
    expect(await screen.findByText(/Séance arrêtée/)).toBeTruthy();
    expect(screen.getByText(/0 réussi sur 0/)).toBeTruthy();
  });

  it('ends when the timer runs out', async () => {
    const user = userEvent.setup();
    renderPuzzles();
    await screen.findByRole('button', { name: 'Commencer' });
    await user.click(screen.getByRole('button', { name: '3 min' }));
    await startRun(user);
    expect(screen.getByRole('timer').textContent).toMatch(/^[0-3]:\d\d$/);
    const real = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(real + 3 * 60_000 + 1000);
    expect(await screen.findByText(/Le temps est écoulé/)).toBeTruthy();
  });

  it('says so when no puzzle matches, and when the puzzles cannot be loaded', async () => {
    const user = userEvent.setup();
    loadPuzzles.mockResolvedValueOnce([]);
    renderPuzzles();
    await user.click(await screen.findByRole('button', { name: 'Commencer' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Aucun puzzle ne correspond/);
    await user.click(screen.getByRole('button', { name: 'Retour au choix' }));
    loadPuzzles.mockRejectedValueOnce(new Error('offline'));
    await user.click(await screen.findByRole('button', { name: 'Commencer' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/n’ont pas pu être chargés/);
  });
});

describe('Puzzles: sent by the plan', () => {
  it('opens on the themes of the plan, and not on the last choice', async () => {
    localStorage.setItem('puzzle_themes', 'fork');
    localStorage.setItem('puzzle_mode', 'woodpecker');
    render(<Puzzles onClose={vi.fn()} start={{ themes: ['mateIn1', 'backRankMate'] }} />);
    expect((await screen.findByRole('button', { name: /Mat en 1/ })).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Mat du couloir/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Fourchette/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Séance libre' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('takes the level of the games for the range, and starts on those themes', async () => {
    const user = userEvent.setup();
    await saveGame({ pgn: '1. e4 *', depth: 12, result: game({ meta: { whiteElo: '1432' } }).result });
    render(<Puzzles onClose={vi.fn()} start={{ themes: ['mateIn1'] }} />);
    await waitFor(() => expect((screen.getByLabelText('Elo minimum') as HTMLSelectElement).value).toBe('1200'));
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    await screen.findByText(/^Puzzle 1/);
    expect(loadPuzzles).toHaveBeenCalledWith({ minRating: 1200, maxRating: 1799, themes: ['mateIn1'], match: 'any' });
  });

  it('keeps what the player had stored until they change something', async () => {
    const user = userEvent.setup();
    render(<Puzzles onClose={vi.fn()} start={{ themes: ['mateIn1'] }} />);
    await screen.findByRole('button', { name: 'Commencer' });
    expect(localStorage.getItem('puzzle_themes')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Mat du couloir/ }));
    expect(localStorage.getItem('puzzle_themes')).toBe('mateIn1,backRankMate');
  });

  it('leaves the Woodpecker reachable', async () => {
    const user = userEvent.setup();
    render(<Puzzles onClose={vi.fn()} start={{ themes: ['mateIn1'] }} />);
    await user.click(await screen.findByRole('button', { name: 'Woodpecker' }));
    expect(await screen.findByRole('button', { name: 'Créer mon lot' })).toBeTruthy();
  });
});

describe('Puzzles: the missed ones', () => {
  const missed = (id: string, dueAt: number, level = 0) => ({
    id,
    puzzle: puzzle(id),
    card: { id, level, dueAt, lastSeen: dueAt - DAY_MS, attempts: 1, failures: 1 },
  });

  it('says there is none at first', async () => {
    renderPuzzles();
    await screen.findByRole('button', { name: 'Commencer' });
    expect(screen.getByText(/Aucun pour l’instant/)).toBeTruthy();
  });

  it('reviews the ones that are due, and moves one found again on', async () => {
    const user = userEvent.setup();
    await savePuzzleEntry(missed('old', Date.now() - DAY_MS));
    await savePuzzleEntry(missed('later', Date.now() + 3 * DAY_MS));
    renderPuzzles();
    await user.click(await screen.findByRole('button', { name: /Revoir mes puzzles ratés \(1\)/ }));
    await screen.findByText('Puzzle 1 sur 1');
    expect(loadPuzzles).not.toHaveBeenCalled();
    await play(user, 'a1', 'a8');
    await waitFor(async () => expect((await loadPuzzleEntries()).get('old')?.card.level).toBe(1));
    // The only puzzle was solved at the first try: the run is over
    expect(await screen.findByText(/1 réussi sur 1 \(100 %\)/, undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByText(/Les puzzles ratés reviennent demain/)).toBeNull();
  });

  it('offers to review in advance when nothing is due', async () => {
    const user = userEvent.setup();
    await savePuzzleEntry(missed('later', Date.now() + 3 * DAY_MS, 1));
    renderPuzzles();
    await user.click(await screen.findByRole('button', { name: 'Réviser en avance' }));
    await screen.findByText('Puzzle 1 sur 1');
  });
});
