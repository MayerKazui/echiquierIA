// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enginePlayer } from '../../services/enginePlayer';
import { STANDARD_START_FEN, type PlayStart } from '../../utils/playGame';
import { PlayStockfish } from './PlayStockfish';

vi.mock('../../services/enginePlayer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/enginePlayer')>()),
  enginePlayer: { chooseMove: vi.fn() },
}));
vi.mock('../../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

const chooseMove = vi.mocked(enginePlayer.chooseMove);
const checked = (name: string | RegExp) => (screen.getByRole('radio', { name }) as HTMLInputElement).checked;
const disabled = (name: string) => (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;
const status = () => screen.getByRole('status').textContent ?? '';
const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;

/** The engine answers with the moves given, in turn; none left, it stays silent (it is thinking). */
function engineSays(...moves: string[]) {
  const queue = [...moves];
  chooseMove.mockImplementation(() => (queue.length > 0 ? Promise.resolve(queue.shift()!) : new Promise(() => {})));
}

async function playMove(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.click(cell(from));
  await user.click(cell(to));
}

function renderPlay(props: Partial<React.ComponentProps<typeof PlayStockfish>> = {}) {
  const onClose = vi.fn();
  const onAnalyze = vi.fn();
  render(<PlayStockfish onClose={onClose} onAnalyze={onAnalyze} {...props} />);
  return { onClose, onAnalyze };
}

const ORIGIN: PlayStart = {
  fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  label: "Position de l'explorateur : Partie ouverte",
  prefix: ['e4', 'e5'],
};

beforeEach(() => {
  localStorage.clear();
  chooseMove.mockReset();
});

describe('PlayStockfish setup', () => {
  it('offers the usual start, a side and the levels, and no origin without one', () => {
    renderPlay();
    expect(checked(/Partie complète/)).toBe(true);
    expect(screen.queryByRole('radio', { name: /explorateur/ })).toBeNull();
    expect(checked('Blancs')).toBe(true);
    expect(screen.getAllByRole('radio', { name: /Débutant|Facile|Club|Confirmé|Expert|Maître|Maximum/ })).toHaveLength(
      7
    );
    expect(checked(/Club/)).toBe(true);
  });

  it('starts on the position it comes from, with the side to move', () => {
    renderPlay({ start: { ...ORIGIN, fen: ORIGIN.fen.replace(' w ', ' b ') } });
    expect(checked(/explorateur/)).toBe(true);
    expect(checked('Noirs')).toBe(true);
  });

  it('refuses a position that is not valid, and accepts a good one', async () => {
    const user = userEvent.setup();
    renderPlay();
    await user.click(screen.getByRole('radio', { name: /Une autre position/ }));
    const field = screen.getByRole('textbox', { name: 'Position au format FEN' });
    const play = screen.getByRole('button', { name: 'Jouer' }) as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    await user.type(field, 'n importe quoi');
    expect(screen.getByRole('alert').textContent).toContain("n'est pas valide");
    expect(play.disabled).toBe(true);
    await user.clear(field);
    await user.type(field, '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1');
    expect(play.disabled).toBe(false);
  });

  it('keeps the level chosen for next time', async () => {
    const user = userEvent.setup();
    const first = render(<PlayStockfish onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /Expert/ }));
    first.unmount();
    render(<PlayStockfish onClose={vi.fn()} />);
    expect(checked(/Expert/)).toBe(true);
  });

  it('closes', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPlay();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('PlayStockfish game', () => {
  it('plays a move, gets the engine’s answer at the level chosen, and lists the moves', async () => {
    engineSays('e7e5');
    const user = userEvent.setup();
    renderPlay();
    await user.click(screen.getByRole('radio', { name: /Maître/ }));
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    expect(status()).toContain('À vous de jouer');

    await playMove(user, 'e2', 'e4');
    await waitFor(() => expect(screen.getByText('1.e4 1…e5')).toBeTruthy());
    expect(chooseMove).toHaveBeenCalledWith(
      expect.objectContaining({
        startFen: STANDARD_START_FEN,
        moves: ['e2e4'],
        level: expect.objectContaining({ id: 'maitre' }),
      })
    );
    expect(status()).toContain('À vous de jouer');
  });

  it('says the engine is thinking, and does not let the player move meanwhile', async () => {
    engineSays(); // never answers
    const user = userEvent.setup();
    renderPlay();
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await playMove(user, 'e2', 'e4');
    expect(await screen.findByText('Stockfish réfléchit…')).toBeTruthy();
    await playMove(user, 'd2', 'd4');
    expect(screen.getByText(/1\.e4/)).toBeTruthy();
    expect(screen.queryByText(/2\.d4/)).toBeNull();
  });

  it('lets the engine open when the player has the Black pieces', async () => {
    engineSays('e2e4');
    const user = userEvent.setup();
    renderPlay();
    await user.click(screen.getByRole('radio', { name: 'Noirs' }));
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await waitFor(() => expect(screen.getByText('1.e4')).toBeTruthy());
    expect(chooseMove).toHaveBeenCalledWith(expect.objectContaining({ moves: [] }));
  });

  it('numbers the moves from the position it started on', async () => {
    engineSays('b8c6');
    const user = userEvent.setup();
    renderPlay({ start: ORIGIN });
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await playMove(user, 'g1', 'f3');
    await waitFor(() => expect(screen.getByText('2.Cf3 2…Cc6')).toBeTruthy());
  });

  it('takes a move back with the answer to it, but not before the engine’s first move', async () => {
    engineSays('e7e5');
    const user = userEvent.setup();
    renderPlay();
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    expect(disabled('Reprendre le coup')).toBe(true);
    await playMove(user, 'e2', 'e4');
    await waitFor(() => expect(disabled('Reprendre le coup')).toBe(false));
    await user.click(screen.getByRole('button', { name: 'Reprendre le coup' }));
    expect(screen.queryByText(/1\.e4/)).toBeNull();
    expect(disabled('Reprendre le coup')).toBe(true);
  });

  it('ends on a checkmate and offers to analyse the game', async () => {
    engineSays('e7e5', 'd8h4');
    const user = userEvent.setup();
    const { onAnalyze } = renderPlay();
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await playMove(user, 'f2', 'f3');
    await waitFor(() => expect(screen.getByText(/1…e5/)).toBeTruthy());
    await playMove(user, 'g2', 'g4');
    await waitFor(() => expect(status()).toContain('Échec et mat : Stockfish gagne.'));
    expect(screen.queryByRole('button', { name: 'Abandonner' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Analyser la partie' }));
    const pgn = onAnalyze.mock.calls[0][0] as string;
    expect(pgn).toContain('1. f3 e5 2. g4 Qh4#');
    expect(pgn).toContain('[Result "0-1"]');
  });

  it('lets the player resign, and start again from the setup', async () => {
    engineSays();
    const user = userEvent.setup();
    renderPlay();
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await user.click(screen.getByRole('button', { name: 'Abandonner' }));
    expect(status()).toContain('Vous avez abandonné.');
    await user.click(screen.getByRole('button', { name: 'Nouvelle partie' }));
    expect(screen.getByRole('button', { name: 'Jouer' })).toBeTruthy();
  });

  it('does not offer the analysis of a game that began on a position whose way there is unknown', async () => {
    engineSays();
    const user = userEvent.setup();
    renderPlay({ start: { fen: '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1', label: 'Position critique de vos parties' } });
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await playMove(user, 'g1', 'g2');
    await user.click(screen.getByRole('button', { name: 'Abandonner' }));
    expect(screen.queryByRole('button', { name: 'Analyser la partie' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Nouvelle partie' })).toBeTruthy();
  });

  it('tells the player when the engine is not available, and asks again on request', async () => {
    chooseMove.mockRejectedValueOnce(new Error('The engine is not available')).mockResolvedValueOnce('e7e5');
    const user = userEvent.setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderPlay();
    await user.click(screen.getByRole('button', { name: 'Jouer' }));
    await playMove(user, 'e2', 'e4');
    const alertBox = await screen.findByText(/Le moteur n'est pas disponible/);
    expect(alertBox).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByText('1.e4 1…e5')).toBeTruthy());
    warn.mockRestore();
    expect(within(document.body).queryByText(/Le moteur n'est pas disponible/)).toBeNull();
  });
});
