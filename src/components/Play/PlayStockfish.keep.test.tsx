// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analysisEngine, type LiveAnalysis, type LiveRequest } from '../../services/analysisEngine';
import { enginePlayer } from '../../services/enginePlayer';
import { listPlayedGames } from '../../services/playedGameStore';
import { loadPlaySession, savePlaySession } from '../../services/playSessionStore';
import { STANDARD_START_FEN } from '../../utils/playGame';
import { PlayStockfish } from './PlayStockfish';

vi.mock('../../services/enginePlayer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/enginePlayer')>()),
  enginePlayer: { chooseMove: vi.fn() },
}));
vi.mock('../../services/analysisEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/analysisEngine')>()),
  analysisEngine: { analyze: vi.fn(), stop: vi.fn(), dispose: vi.fn() },
}));
vi.mock('../../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

const chooseMove = vi.mocked(enginePlayer.chooseMove);
const analyze = vi.mocked(analysisEngine.analyze);
const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;
const status = () => screen.getByRole('status', { name: '' }).textContent ?? '';

function engineSays(...moves: string[]) {
  const queue = [...moves];
  chooseMove.mockImplementation(() => (queue.length > 0 ? Promise.resolve(queue.shift()!) : new Promise(() => {})));
}

async function playMove(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.click(cell(from));
  await user.click(cell(to));
}

/** The line the analysis engine reports for the position asked, from White's point of view. */
const live = (request: LiveRequest, uci: string, cp: number, mate: number | null = null, depth = 16): LiveAnalysis => ({
  fen: request.fen,
  depth,
  nps: null,
  lines: [{ rank: 1, depth, cp, mate, pv: [uci] }],
});

const lastRequest = () => analyze.mock.calls[analyze.mock.calls.length - 1][0];

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
  chooseMove.mockReset();
  analyze.mockReset();
});

const MATE_IN_TWO = ['e7e5', 'd8h4'];

async function playToCheckmate(user: ReturnType<typeof userEvent.setup>) {
  engineSays(...MATE_IN_TWO);
  await user.click(screen.getByRole('button', { name: 'Jouer' }));
  await playMove(user, 'f2', 'f3');
  await waitFor(() => expect(screen.getByText(/1…e5/)).toBeTruthy());
  await playMove(user, 'g2', 'g4');
  await waitFor(() => expect(screen.getByText(/Échec et mat : Stockfish gagne/)).toBeTruthy());
}

describe('the game in progress', () => {
  it('is kept after every move', async () => {
    engineSays('e7e5');
    const user = userEvent.setup();
    render(<PlayStockfish onClose={vi.fn()} />);
    expect(loadPlaySession()).toBeNull();
    await user.click(screen.getByRole('radio', { name: /Expert/ }));
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await playMove(user, 'e2', 'e4');
    await waitFor(() => expect(loadPlaySession()?.moves).toEqual(['e2e4', 'e7e5']));
    expect(loadPlaySession()).toMatchObject({
      startFen: STANDARD_START_FEN,
      color: 'w',
      levelId: 'expert',
      label: 'Partie complète',
    });
  });

  it('is offered again when the window is opened later, and carried on where it stopped', async () => {
    engineSays('e7e5');
    const user = userEvent.setup();
    const first = render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await playMove(user, 'e2', 'e4');
    await waitFor(() => expect(loadPlaySession()?.moves).toHaveLength(2));
    first.unmount();

    engineSays('b8c6');
    render(<PlayStockfish onClose={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Partie en cours' }).textContent).toContain('2 demi-coups joués');
    await user.click(screen.getByRole('button', { name: 'Reprendre la partie' }));
    expect(screen.getByText('1.e4 1…e5')).toBeTruthy();
    expect(status()).toContain('À vous de jouer');

    await playMove(user, 'g1', 'f3');
    await waitFor(() => expect(screen.getByText('1.e4 1…e5 2.Cf3 2…Cc6')).toBeTruthy());
    expect(chooseMove).toHaveBeenLastCalledWith(
      expect.objectContaining({ moves: ['e2e4', 'e7e5', 'g1f3'], startFen: STANDARD_START_FEN })
    );
  });

  it('lets the engine answer at once when it was its turn when the window closed', async () => {
    savePlaySession({
      startFen: STANDARD_START_FEN,
      label: 'Partie complète',
      prefix: [],
      color: 'w',
      levelId: 'club',
      moves: ['e2e4'],
      hints: 0,
      evals: 0,
      startedAt: 1,
      updatedAt: 2,
    });
    engineSays('c7c5');
    const user = userEvent.setup();
    render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Reprendre la partie' }));
    await waitFor(() => expect(screen.getByText('1.e4 1…c5')).toBeTruthy());
  });

  it('is dropped when the player gives it up from the setup, and replaced by a new game', async () => {
    const session = {
      startFen: STANDARD_START_FEN,
      label: 'Partie complète',
      prefix: [],
      color: 'w' as const,
      levelId: 'club',
      moves: ['e2e4', 'e7e5'],
      hints: 0,
      evals: 0,
      startedAt: 1,
      updatedAt: 2,
    };
    savePlaySession(session);
    const user = userEvent.setup();
    const first = render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Abandonner cette partie' }));
    expect(screen.queryByRole('region', { name: 'Partie en cours' })).toBeNull();
    expect(loadPlaySession()).toBeNull();
    expect(await listPlayedGames()).toEqual([]);
    first.unmount();

    savePlaySession(session);
    engineSays();
    render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    expect(loadPlaySession()).toBeNull();
  });

  it('stays when the player leaves a game for the setup, to be resumed', async () => {
    engineSays();
    const user = userEvent.setup();
    render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await playMove(user, 'e2', 'e4');
    await user.click(screen.getByRole('button', { name: 'Nouvelle partie' }));
    expect(screen.getByRole('region', { name: 'Partie en cours' })).toBeTruthy();
  });

  it('is not kept when no move was played, and forgets a game taken back to its start', async () => {
    engineSays('e7e5');
    const user = userEvent.setup();
    render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    expect(loadPlaySession()).toBeNull();
    await playMove(user, 'e2', 'e4');
    await waitFor(() => expect(loadPlaySession()?.moves).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Reprendre le coup' }));
    expect(loadPlaySession()).toBeNull();
  });
});

describe('the finished game', () => {
  it('is kept in the history with its level, and the game in progress is dropped', async () => {
    const user = userEvent.setup();
    render(<PlayStockfish userName="Alice" onClose={vi.fn()} />);
    await playToCheckmate(user);
    expect(await screen.findByText(/gardée dans « Mes parties »/)).toBeTruthy();
    expect(loadPlaySession()).toBeNull();
    const games = await listPlayedGames();
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      sans: ['f3', 'e5', 'g4', 'Qh4#'],
      result: '0-1',
      ending: 'checkmate',
      color: 'w',
      levelLabel: 'Club',
      userName: 'Alice',
      analysable: true,
    });
    expect(games[0].pgn).toContain('[White "Alice"]');
  });

  it('is kept once only, however many times the screen is drawn again', async () => {
    const user = userEvent.setup();
    render(<PlayStockfish onClose={vi.fn()} />);
    await playToCheckmate(user);
    await screen.findByText(/gardée dans « Mes parties »/);
    await user.click(screen.getByRole('button', { name: 'Nouvelle partie' }));
    expect(await listPlayedGames()).toHaveLength(1);
  });

  it('is kept when the player resigns, as a defeat', async () => {
    engineSays();
    const user = userEvent.setup();
    render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await playMove(user, 'e2', 'e4');
    await user.click(screen.getByRole('button', { name: 'Abandonner' }));
    await screen.findByText(/gardée dans « Mes parties »/);
    expect(await listPlayedGames()).toMatchObject([{ result: '0-1', ending: 'resigned' }]);
    expect(loadPlaySession()).toBeNull();
  });

  it('is not kept when nothing was played', async () => {
    engineSays();
    const user = userEvent.setup();
    render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await user.click(screen.getByRole('button', { name: 'Abandonner' }));
    expect(screen.queryByText(/gardée dans « Mes parties »/)).toBeNull();
    expect(await listPlayedGames()).toEqual([]);
  });

  it('is kept as a game that cannot be analysed when it began on a position of its own', async () => {
    engineSays();
    const user = userEvent.setup();
    render(
      <PlayStockfish
        start={{ fen: '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1', label: 'Position critique de vos parties' }}
        onClose={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await playMove(user, 'g1', 'g2');
    await user.click(screen.getByRole('button', { name: 'Abandonner' }));
    await screen.findByText(/gardée dans « Mes parties »/);
    expect(await listPlayedGames()).toMatchObject([
      { analysable: false, label: 'Position critique de vos parties', sans: ['Qg2'] },
    ]);
  });

  it('is no longer finished when the player takes the last move back: the game goes on and is kept as in progress', async () => {
    const user = userEvent.setup();
    render(<PlayStockfish onClose={vi.fn()} />);
    await playToCheckmate(user);
    await screen.findByText(/gardée dans « Mes parties »/);
    await user.click(screen.getByRole('button', { name: 'Reprendre le coup' }));
    await waitFor(async () => expect(await listPlayedGames()).toEqual([]));
    expect(screen.queryByText(/gardée dans « Mes parties »/)).toBeNull();
    await waitFor(() => expect(loadPlaySession()?.moves).toEqual(['f2f3', 'e7e5']));
  });

  it('says so when the browser refuses to keep it', async () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<PlayStockfish onClose={vi.fn()} />);
    await playToCheckmate(user);
    expect(await screen.findByText(/n’a pas pu être gardée/)).toBeTruthy();
    warn.mockRestore();
  });
});

describe('the help on demand', () => {
  async function startGame(user: ReturnType<typeof userEvent.setup>, extra: () => void = () => engineSays()) {
    extra();
    render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
  }

  it('searches nothing until it is asked for', async () => {
    const user = userEvent.setup();
    await startGame(user);
    expect(analyze).not.toHaveBeenCalled();
  });

  it('gives the piece to move first, then the move itself, and counts one hint', async () => {
    const user = userEvent.setup();
    await startGame(user);
    await user.click(screen.getByRole('button', { name: 'Indice' }));
    expect(screen.getByText('Stockfish cherche le meilleur coup…')).toBeTruthy();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toMatchObject({ fen: STANDARD_START_FEN, lines: 1 });
    act(() => lastRequest().onUpdate(live(lastRequest(), 'g1f3', 30)));

    expect(await screen.findByText(/le meilleur coup part de la case/)).toBeTruthy();
    expect(screen.getByText('g1')).toBeTruthy();
    expect(screen.queryByText(/Meilleur coup :/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Voir le coup' }));
    expect(screen.getByText('Cf3')).toBeTruthy();
    expect(screen.getByText(/Meilleur coup :/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Indice' }) as HTMLButtonElement).disabled).toBe(true);
    expect(analyze).toHaveBeenCalledTimes(1);

    await playMove(user, 'e2', 'e4');
    await waitFor(() => expect(loadPlaySession()?.hints).toBe(1));
  });

  it('draws the hint on the board: a circle on the piece, then an arrow to the square', async () => {
    const user = userEvent.setup();
    await startGame(user);
    expect(document.querySelectorAll('[style*="border-color"]')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Indice' }));
    act(() => lastRequest().onUpdate(live(lastRequest(), 'g1f3', 30)));
    await screen.findByText(/le meilleur coup part de la case/);
    expect(cell('g1').querySelector('[style*="border-color"]')).not.toBeNull();
    expect(document.querySelectorAll('svg line[marker-end="url(#userArrowGreen)"]')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Voir le coup' }));
    expect(document.querySelectorAll('svg line[marker-end="url(#userArrowGreen)"]')).toHaveLength(1);
    expect(document.querySelectorAll('[style*="border-color"]')).toHaveLength(0);
  });

  it('evaluates the position from the player’s side, for Black too', async () => {
    engineSays('e2e4');
    const user = userEvent.setup();
    render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Noirs' }));
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await waitFor(() => expect(screen.getByText('1.e4')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Évaluer la position' }));
    // White's point of view: +0.6, so Black is slightly worse
    act(() => lastRequest().onUpdate(live(lastRequest(), 'e7e5', 60)));
    expect(await screen.findByText('-0,6')).toBeTruthy();
    expect(screen.getByText(/Stockfish est un peu mieux/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Évaluer la position' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('announces a mate', async () => {
    const user = userEvent.setup();
    await startGame(user);
    await user.click(screen.getByRole('button', { name: 'Évaluer la position' }));
    act(() => lastRequest().onUpdate(live(lastRequest(), 'g1f3', 10000, 4)));
    expect(await screen.findByText(/Vous avez un mat en 4 coups/)).toBeTruthy();
  });

  it('shows what was found so far while the search goes on, and stops it at the depth asked', async () => {
    const user = userEvent.setup();
    await startGame(user);
    await user.click(screen.getByRole('button', { name: 'Évaluer la position' }));
    act(() => lastRequest().onUpdate(live(lastRequest(), 'g1f3', 20, null, 8)));
    expect(await screen.findByText(/Recherche en cours, profondeur 8/)).toBeTruthy();
    expect(analysisEngine.stop).not.toHaveBeenCalled();
    act(() => lastRequest().onUpdate(live(lastRequest(), 'g1f3', 25, null, 16)));
    expect(screen.queryByText(/Recherche en cours/)).toBeNull();
    expect(analysisEngine.stop).toHaveBeenCalled();
  });

  it('forgets the help when the position changes, and counts the evaluation', async () => {
    engineSays('e7e5');
    const user = userEvent.setup();
    await startGame(user, () => engineSays('e7e5'));
    await user.click(screen.getByRole('button', { name: 'Évaluer la position' }));
    act(() => lastRequest().onUpdate(live(lastRequest(), 'g1f3', 20)));
    await screen.findByText(/Évaluation :/);
    await playMove(user, 'e2', 'e4');
    await waitFor(() => expect(screen.getByText('1.e4 1…e5')).toBeTruthy());
    expect(screen.queryByText(/Évaluation :/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Évaluer la position' }) as HTMLButtonElement).disabled).toBe(false);
    await waitFor(() => expect(loadPlaySession()?.evals).toBe(1));
  });

  it('cannot be asked for while the engine is thinking', async () => {
    const user = userEvent.setup();
    await startGame(user);
    await playMove(user, 'e2', 'e4');
    await screen.findByText('Stockfish réfléchit…');
    expect((screen.getByRole('button', { name: 'Indice' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Évaluer la position' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when the analysis engine is not available', async () => {
    const user = userEvent.setup();
    await startGame(user);
    await user.click(screen.getByRole('button', { name: 'Indice' }));
    act(() => lastRequest().onError?.(new Error('no engine')));
    expect(await screen.findByText('Le moteur d’analyse n’est pas disponible.')).toBeTruthy();
  });

  it('keeps the help asked for with the finished game, and with a game that is resumed', async () => {
    const user = userEvent.setup();
    const first = render(<PlayStockfish userName="Alice" onClose={vi.fn()} />);
    engineSays(...MATE_IN_TWO);
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await user.click(screen.getByRole('button', { name: 'Indice' }));
    act(() => lastRequest().onUpdate(live(lastRequest(), 'g1f3', 20)));
    await playMove(user, 'f2', 'f3');
    await waitFor(() => expect(loadPlaySession()?.hints).toBe(1));
    first.unmount();

    render(<PlayStockfish userName="Alice" onClose={vi.fn()} />);
    engineSays('d8h4');
    await user.click(screen.getByRole('button', { name: 'Reprendre la partie' }));
    await user.click(screen.getByRole('button', { name: 'Évaluer la position' }));
    act(() => lastRequest().onUpdate(live(lastRequest(), 'g1f3', 20)));
    await playMove(user, 'g2', 'g4');
    await waitFor(() => expect(screen.getByText(/Échec et mat : Stockfish gagne/)).toBeTruthy());
    await waitFor(async () => expect(await listPlayedGames()).toMatchObject([{ hints: 1, evals: 1 }]));
  });
});
