// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enginePlayer } from '../../services/enginePlayer';
import { listPlayedGames } from '../../services/playedGameStore';
import { loadPlaySession, savePlaySession } from '../../services/playSessionStore';
import { STANDARD_START_FEN } from '../../utils/playGame';
import { PlayStockfish } from './PlayStockfish';

vi.mock('../../services/enginePlayer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/enginePlayer')>()),
  enginePlayer: { chooseMove: vi.fn() },
}));
vi.mock('../../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

const chooseMove = vi.mocked(enginePlayer.chooseMove);
const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;
const status = () => screen.getByRole('status', { name: '' }).textContent ?? '';
const yours = () => screen.getByRole('timer', { name: 'Pendule de votre camp' }).textContent ?? '';
const engines = () => screen.getByRole('timer', { name: 'Pendule de Stockfish' }).textContent ?? '';
const elapse = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function engineSays(...moves: string[]) {
  const queue = [...moves];
  chooseMove.mockImplementation(() => (queue.length > 0 ? Promise.resolve(queue.shift()!) : new Promise(() => {})));
}

/**
 * Fake timers, but not the ones IndexedDB needs. Testing Library only advances fake timers by itself when it finds
 * a `jest` global: this is the part of it that it uses.
 */
function setup() {
  Object.assign(globalThis, { jest: { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) } });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  return userEvent.setup({ advanceTimers: (ms) => void vi.advanceTimersByTime(ms) });
}

async function startWithClock(user: ReturnType<typeof userEvent.setup>, minutes: string, increment = 'Aucun') {
  await user.click(screen.getByRole('radio', { name: 'Avec pendule' }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Temps de chaque camp' }), minutes);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Incrément par coup' }), increment);
  await user.click(screen.getByRole('button', { name: 'Jouer' }));
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
  chooseMove.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, 'jest');
});

describe('the clock of a game against the engine', () => {
  it('is optional: by default the game has no clock', async () => {
    const user = setup();
    engineSays();
    render(<PlayStockfish onClose={vi.fn()} />);
    expect((screen.getByRole('radio', { name: 'Sans pendule' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('combobox', { name: 'Temps de chaque camp' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('offers one to fifteen minutes and an increment, and remembers the choice', async () => {
    const user = setup();
    engineSays();
    const { unmount } = render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Avec pendule' }));
    const minutes = screen.getByRole('combobox', { name: 'Temps de chaque camp' }) as HTMLSelectElement;
    expect([...minutes.options].map((o) => o.value)).toEqual(Array.from({ length: 15 }, (_, i) => String(i + 1)));
    await user.selectOptions(minutes, '3');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Incrément par coup' }), '2 secondes');
    unmount();

    render(<PlayStockfish onClose={vi.fn()} />);
    expect((screen.getByRole('radio', { name: 'Avec pendule' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Temps de chaque camp' }) as HTMLSelectElement).value).toBe('3');
    expect((screen.getByRole('combobox', { name: 'Incrément par coup' }) as HTMLSelectElement).value).toBe('2');
  });

  it('runs down the clock of the side to move, and gives the increment after a move', async () => {
    const user = setup();
    engineSays('e7e5');
    render(<PlayStockfish onClose={vi.fn()} />);
    await startWithClock(user, '5 minutes', '3 secondes');
    expect(yours()).toContain('5:00');
    expect(engines()).toContain('5:00');

    await elapse(10_000);
    expect(yours()).toContain('4:50');
    expect(engines()).toContain('5:00');

    await user.click(cell('e2'));
    await user.click(cell('e4'));
    await elapse(0);
    // 10 s spent, 3 s back; the engine answered at once, and got its increment too
    expect(yours()).toContain('4:53');
    expect(engines()).toContain('5:03');
    expect(chooseMove.mock.calls[0][0].moveTimeMs).toBeGreaterThan(0);
  });

  it("lets the engine think for less when its clock is short, never more than its level's time", async () => {
    const user = setup();
    engineSays('e7e5');
    render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /Maximum/ }));
    await startWithClock(user, '1 minute');
    await user.click(cell('e2'));
    await user.click(cell('e4'));
    await elapse(0);
    // A minute is 60 s: a twenty-fifth of it is 2.4 s, so the 1.5 s of the level stay
    expect(chooseMove.mock.calls[0][0].moveTimeMs).toBe(1500);
  });

  it('is lost on time: the game is over, scored for the engine, and kept with its clock', async () => {
    const user = setup();
    engineSays();
    render(<PlayStockfish onClose={vi.fn()} onAnalyze={vi.fn()} />);
    await startWithClock(user, '1 minute');
    await user.click(cell('e2'));
    await user.click(cell('e4'));
    await elapse(0);
    // The engine is "thinking" for good: its time runs out
    await elapse(61_000);
    expect(status()).toContain('Le temps de Stockfish est écoulé');
    expect(engines()).toContain('0:00');
    expect(screen.getByRole('button', { name: 'Analyser la partie' })).toBeTruthy();

    vi.useRealTimers();
    const games = await vi.waitFor(async () => {
      const found = await listPlayedGames();
      expect(found).toHaveLength(1);
      return found;
    });
    expect(games[0]).toMatchObject({ ending: 'timeout', result: '1-0', timeControl: '60' });
    expect(games[0].pgn).toContain('[TimeControl "60"]');
    expect(games[0].pgn).toContain('[%clk 0:01:00]');
  });

  it('is lost on time on the player side: nothing more can be played', async () => {
    const user = setup();
    engineSays();
    render(<PlayStockfish onClose={vi.fn()} />);
    await startWithClock(user, '1 minute');
    await elapse(61_000);
    expect(status()).toContain('Votre temps est écoulé : Stockfish gagne');
    expect(yours()).toContain('0:00');
    await user.click(cell('e2'));
    await user.click(cell('e4'));
    expect(screen.queryByText(/1\.e4/)).toBeNull();
  });

  it('is kept with the game in progress, and carried on when the game is resumed', async () => {
    const user = setup();
    engineSays('e7e5');
    const { unmount } = render(<PlayStockfish onClose={vi.fn()} />);
    await startWithClock(user, '10 minutes', '5 secondes');
    await elapse(20_000);
    await user.click(cell('e2'));
    await user.click(cell('e4'));
    await elapse(0);
    const kept = loadPlaySession();
    expect(kept?.clock).toMatchObject({ baseSeconds: 600, incrementSeconds: 5, w: 585_000, b: 605_000 });
    expect(kept?.clock?.log).toEqual([585_000, 605_000]);
    unmount();

    // Hours later: the time the window was closed is not charged
    await elapse(3_600_000);
    engineSays();
    render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Reprendre la partie' }));
    expect(yours()).toContain('9:45');
    expect(engines()).toContain('10:05');
    await elapse(5000);
    expect(yours()).toContain('9:40');
  });

  it('does not run in a game resumed without a clock', async () => {
    const user = setup();
    engineSays();
    savePlaySession({
      startFen: STANDARD_START_FEN,
      label: 'Partie complète',
      prefix: [],
      color: 'w',
      levelId: 'club',
      moves: ['e2e4', 'e7e5'],
      hints: 0,
      evals: 0,
      startedAt: 1,
      updatedAt: 2,
    });
    render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Reprendre la partie' }));
    expect(screen.queryByRole('timer')).toBeNull();
  });
});
