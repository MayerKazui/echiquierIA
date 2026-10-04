// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enginePlayer } from '../../services/enginePlayer';
import { exportVisionRecords } from '../../services/visionStore';
import { Vision } from './Vision';

vi.mock('../../services/enginePlayer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/enginePlayer')>()),
  enginePlayer: { chooseMove: vi.fn() },
}));

const chooseMove = vi.mocked(enginePlayer.chooseMove);
const pieceCount = () => document.querySelectorAll('[role="gridcell"] svg[viewBox="0 0 45 45"]').length;
const status = () =>
  screen
    .getAllByRole('status')
    .map((element) => element.textContent)
    .join(' | ');

/** The engine answers with the moves given, in turn; none left, it stays silent (it is thinking). */
function engineSays(...moves: string[]) {
  const queue = [...moves];
  chooseMove.mockImplementation(() => (queue.length > 0 ? Promise.resolve(queue.shift()!) : new Promise(() => {})));
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
  chooseMove.mockReset();
});

async function start(level = 'Club', side: 'Blancs' | 'Noirs' | 'Au hasard' = 'Blancs') {
  const user = userEvent.setup();
  render(<Vision onClose={() => {}} initialMode="game" random={() => 0.9} />);
  await user.click(await screen.findByRole('radio', { name: side }));
  await user.click(await screen.findByRole('button', { name: new RegExp(`^Commencer : ${level}`) }));
  return user;
}

async function type(user: ReturnType<typeof userEvent.setup>, move: string) {
  const field = screen.getByLabelText('Votre coup');
  await waitFor(() => expect((field as HTMLInputElement).disabled).toBe(false));
  await user.clear(field);
  await user.type(field, `${move}{Enter}`);
}

describe('Partie à l’aveugle', () => {
  it('offers a level for each strength of the engine and a side', async () => {
    const user = userEvent.setup();
    render(<Vision onClose={() => {}} initialMode="game" />);
    expect((await screen.findAllByRole('button', { name: /^Commencer : / })).length).toBe(7);
    expect((screen.getByRole('radio', { name: 'Blancs' }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'Noirs' }));
    expect((await screen.findAllByText('Pas encore de score')).length).toBe(7);
  });

  it('plays a whole game on an empty board: the moves are typed, the engine answers and says its move', async () => {
    engineSays('e7e5', 'd8h4');
    const user = await start();
    expect(pieceCount()).toBe(0);
    expect(screen.getByRole('grid', { name: /sans pièces/ })).toBeTruthy();
    expect(status()).toContain('À vous de jouer');

    await type(user, 'f3'); // 1.f3
    await waitFor(() => expect(status()).toContain('Stockfish a joué e5'));
    expect(pieceCount()).toBe(0);
    expect(screen.getByText(/1\.f3/)).toBeTruthy();

    await type(user, 'g4'); // 2.g4 Qh4#
    await waitFor(() => expect(status()).toContain('Échec et mat : Stockfish gagne'));
    // The pieces come back to look at the end
    expect(pieceCount()).toBe(32);
    expect(await screen.findByText('Résultat : Défaite')).toBeTruthy();
    // A loss is a score of 0: it is noted, and it is not a record
    expect(await screen.findByText('Votre record à ce niveau : Défaite.')).toBeTruthy();
    expect(await exportVisionRecords()).toEqual([
      {
        key: 'game:club',
        best: 0,
        bestAt: expect.any(Number),
        runs: 1,
        history: [{ at: expect.any(Number), score: 0 }],
      },
    ]);
  });

  it('plays the engine’s first move when the player has the Black pieces, and wins with a mate', async () => {
    engineSays('f2f3', 'g2g4');
    const user = await start('Débutant', 'Noirs');
    await waitFor(() => expect(status()).toContain('Stockfish a joué f3'));
    expect(
      screen
        .getByRole('grid', { name: /sans pièces/ })
        .querySelector('[data-square]')!
        .getAttribute('data-square')
    ).toBe('h1');
    await type(user, 'e5');
    await waitFor(() => expect(status()).toContain('Stockfish a joué g4'));
    await type(user, 'Dh4'); // French: the queen to h4, mate
    await waitFor(() => expect(status()).toContain('vous avez gagné'));
    expect(await screen.findByText('Résultat : Victoire')).toBeTruthy();
    expect((await exportVisionRecords())[0]).toMatchObject({ key: 'game:debutant', best: 2 });
  });

  it('refuses a move that is not legal, without penalty, and keeps the turn', async () => {
    engineSays();
    const user = await start();
    await type(user, 'e5');
    expect((await screen.findByRole('alert')).textContent).toContain('« e5 » n’est pas un coup légal ici');
    expect(screen.getByText(/1 coup refusé/)).toBeTruthy();
    expect(chooseMove).not.toHaveBeenCalled();
    await type(user, 'e4');
    await waitFor(() => expect(chooseMove).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('counts each look at the board, and a game after a look is not noted', async () => {
    engineSays();
    const user = await start();
    await user.click(screen.getByRole('button', { name: /Regarder l’échiquier/ }));
    expect(pieceCount()).toBe(32);
    expect(screen.getByText(/1 regard sur l’échiquier/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Recacher l’échiquier' }));
    expect(pieceCount()).toBe(0);
    // Looking again is another look
    await user.click(screen.getByRole('button', { name: /Regarder l’échiquier/ }));
    expect(screen.getByText(/2 regards sur l’échiquier/)).toBeTruthy();
    // A move hides the board again
    await type(user, 'e4');
    expect(pieceCount()).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Abandonner' }));
    expect(await screen.findByText(/Vous avez abandonné/)).toBeTruthy();
    expect(screen.getByText(/ne compte pas pour le record/)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await exportVisionRecords()).toEqual([]);
  });

  it('can hide the list of the moves, and counts a resignation as a loss', async () => {
    engineSays('e7e5');
    const user = await start();
    await type(user, 'e4');
    await waitFor(() => expect(status()).toContain('Stockfish a joué e5'));
    expect(screen.getByText(/1\.e4/)).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: /Cacher la liste des coups/ }));
    expect(screen.queryByText(/1\.e4/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Abandonner' }));
    expect(await screen.findByText('Résultat : Défaite')).toBeTruthy();
    expect((await exportVisionRecords())[0]).toMatchObject({ key: 'game:club', best: 0, runs: 1 });
  });

  it('offers to try again, at the same level', async () => {
    engineSays();
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'Abandonner' }));
    await user.click(await screen.findByRole('button', { name: 'Rejouer ce niveau' }));
    expect(screen.getByText(/Stockfish Club/)).toBeTruthy();
    expect(screen.getByLabelText('Votre coup')).toBeTruthy();
  });

  it('says so when the engine is not available, and tries again on request', async () => {
    chooseMove.mockRejectedValueOnce(new Error('no engine'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    engineSays();
    const user = await start('Club', 'Noirs');
    expect(await screen.findByText(/Le moteur n’est pas disponible/)).toBeTruthy();
    chooseMove.mockImplementation(() => new Promise(() => {}));
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(status()).toContain('Stockfish réfléchit');
  });
});
