// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineEvaluation } from '../../services/stockfishEngine';
import { stockfishService } from '../../services/stockfishEngine';
import { loadCards, saveCard } from '../../services/trainingStore';
import { endgameCardId } from '../../utils/endgameDrill';
import { DAY_MS } from '../../utils/spacedRepetition';
import { Endgames } from './Endgames';

/** Three small endgames instead of the library: a mate in one, a position to hold, and one more to fill a session. */
vi.mock('../../data/endgames', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../data/endgames')>();
  const make = (id: string, goal: 'win' | 'draw', fen: string) => ({
    id,
    category: 'mates' as const,
    title: `Finale ${id}`,
    goal,
    fen,
    idea: `Idée de la finale ${id}, assez longue pour être une vraie phrase.`,
  });
  return {
    ...original,
    ENDGAMES: [
      make('mat1', 'win', '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1'),
      make('tenir', 'draw', '4k2r/8/8/8/8/8/8/R3K3 w - - 0 1'),
      make('autre', 'win', '8/8/8/4k3/8/8/8/3QK3 w - - 0 1'),
    ],
  };
});
vi.mock('../../services/stockfishEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/stockfishEngine')>()),
  stockfishService: { evaluatePosition: vi.fn(), warmUp: vi.fn(), activeWorkerCount: 1 },
}));
vi.mock('../../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

const evaluatePosition = vi.mocked(stockfishService.evaluatePosition);
const engine = stockfishService as { activeWorkerCount: number };

const at = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;

/** What the fake engine thinks of positions (by FEN without the counters); anything else is level, first move best. */
let verdicts: Record<string, Partial<EngineEvaluation>> = {};

function fakeEvaluation(fen: string): EngineEvaluation {
  const chess = new Chess(fen);
  const [first] = chess.moves({ verbose: true });
  return {
    cp: 900,
    mate: null,
    bestMoveUci: first ? `${first.from}${first.to}${first.promotion ?? ''}` : '',
    bestMoveSan: first?.san ?? '',
    pv: [],
    ...verdicts[at(fen)],
  };
}

/** After `uci` from `fen`. */
function after(fen: string, uci: string): string {
  const chess = new Chess(fen);
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return at(chess.fen());
}

const MATE1 = '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1';

const renderEndgames = (props: Partial<React.ComponentProps<typeof Endgames>> = {}) => {
  const handlers = { onClose: vi.fn() };
  render(<Endgames {...handlers} {...props} />);
  return handlers;
};

/** Reads the figure of a tile of the set-up screen ("À revoir", "Nouvelles"...). */
const tile = (label: string) => screen.getByText(label).parentElement!.querySelector('p:nth-of-type(2)')!.textContent;

async function play(label: string) {
  const user = userEvent.setup();
  renderEndgames();
  await user.click(await screen.findByRole('button', { name: `Jouer : ${label}` }));
  return user;
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
  verdicts = {};
  engine.activeWorkerCount = 1;
  evaluatePosition.mockReset();
  evaluatePosition.mockImplementation(async (fen) => fakeEvaluation(fen));
});

describe('Endgames set-up screen', () => {
  it('lists the endgames by category, all new at first', async () => {
    renderEndgames();
    expect(await screen.findByRole('button', { name: 'Commencer (3 finales)' })).toBeTruthy();
    expect(tile('Nouvelles')).toBe('3');
    expect(tile('À revoir')).toBe('0');
    const list = screen.getByRole('region', { name: 'Mats élémentaires' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('Finale mat1')).toBeTruthy();
    expect(within(list).getAllByText(/Gagner · Nouvelle/)).toHaveLength(2);
    expect(within(list).getByText(/Faire nulle · Nouvelle/)).toBeTruthy();
  });

  it('can start on one family of endgames, and show them all again', async () => {
    const user = userEvent.setup();
    renderEndgames({ initialCategory: 'rooks' });
    expect(await screen.findByText('Finales de tours')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Mats élémentaires' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Commencer/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Toutes les finales' }));
    expect(await screen.findByRole('button', { name: 'Commencer (3 finales)' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Mats élémentaires' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Toutes les finales' })).toBeNull();
  });

  it('shows where the endgames stand', async () => {
    const now = Date.now();
    await saveCard({
      id: endgameCardId({ id: 'mat1' }),
      level: 1,
      dueAt: now + 2 * DAY_MS,
      lastSeen: now,
      attempts: 1,
      failures: 0,
    });
    await saveCard({
      id: endgameCardId({ id: 'tenir' }),
      level: 0,
      dueAt: now - DAY_MS,
      lastSeen: now - 2 * DAY_MS,
      attempts: 1,
      failures: 1,
    });
    renderEndgames();
    await screen.findByRole('button', { name: /Commencer/ });
    expect(tile('À revoir')).toBe('1');
    expect(tile('Nouvelles')).toBe('1');
    expect(tile('Plus tard')).toBe('1');
    expect(screen.getByText(/Reviendra dans 2 jours/)).toBeTruthy();
    expect(screen.getByText(/Faire nulle · À revoir/)).toBeTruthy();
    // What is due comes first in a session, then what is new
    expect(screen.getByRole('button', { name: 'Commencer (2 finales)' })).toBeTruthy();
  });

  it('offers to revise in advance when everything is up to date', async () => {
    const now = Date.now();
    for (const id of ['mat1', 'tenir', 'autre']) {
      await saveCard({
        id: endgameCardId({ id }),
        level: 1,
        dueAt: now + DAY_MS,
        lastSeen: now,
        attempts: 1,
        failures: 0,
      });
    }
    const user = userEvent.setup();
    renderEndgames();
    expect(await screen.findByText(/Tout est à jour/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Réviser en avance' }));
    expect(await screen.findByText(/Finale 1 sur 3/)).toBeTruthy();
  });

  it('closes', async () => {
    const { onClose } = renderEndgames();
    await screen.findByRole('button', { name: /Commencer/ });
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('an endgame', () => {
  it('tells the idea and the goal, and asks the engine about the position', async () => {
    await play('Finale mat1');
    expect(await screen.findByText(/Idée de la finale mat1/)).toBeTruthy();
    expect(screen.getByText(/Vous jouez les Blancs\. Gagnez cette position/)).toBeTruthy();
    await waitFor(() => expect(evaluatePosition).toHaveBeenCalledWith(MATE1, expect.any(Number), expect.anything()));
  });

  it('is won by a checkmate: result noted, card scheduled, and the session ends', async () => {
    const user = await play('Finale mat1');
    await screen.findByText(/Idée de la finale mat1/);
    await waitFor(() => expect(screen.queryByText(/Le moteur prépare/)).toBeNull());
    await user.click(cell('g1'));
    await user.click(cell('g7'));
    expect(await screen.findByText(/Échec et mat : la position est gagnée/)).toBeTruthy();
    expect(screen.getByText('Réussi.')).toBeTruthy();
    expect(screen.getByText(/Dg7#/)).toBeTruthy();
    await waitFor(async () => expect((await loadCards()).get(endgameCardId({ id: 'mat1' }))?.level).toBe(1));
    expect(screen.queryByRole('button', { name: 'Voir la solution' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Terminer la séance' }));
    expect(await screen.findByText('Séance terminée : 1 réussie sur 1')).toBeTruthy();
    expect(screen.getByText(/Finale mat1/)).toBeTruthy();
    expect(screen.getByText(/reviendra demain/)).toBeTruthy();
  });

  it('judges a bad move: fails the position, shows the solution, and lets the player take the move back', async () => {
    verdicts[after(MATE1, 'g1g6')] = { cp: 0 }; // the stalemate: nothing left of the win
    verdicts[at(MATE1)] = { bestMoveUci: 'g1g7', bestMoveSan: 'Qg7#', mate: 1 };
    const user = await play('Finale mat1');
    await screen.findByText(/Idée de la finale mat1/);
    await waitFor(() => expect(screen.queryByText(/Le moteur prépare/)).toBeNull());
    await user.click(cell('g1'));
    await user.click(cell('g6'));
    expect(await screen.findByText('Raté.')).toBeTruthy();
    expect(screen.getByText(/La position reste à revoir demain/)).toBeTruthy();
    await waitFor(async () => {
      const card = (await loadCards()).get(endgameCardId({ id: 'mat1' }));
      expect(card).toMatchObject({ level: 0, failures: 1 });
    });

    // Take it back and find it: practice, the result already counted stays
    await user.click(screen.getByRole('button', { name: 'Réessayer ce coup' }));
    await user.click(cell('g1'));
    await user.click(cell('g7'));
    expect(await screen.findByText(/Échec et mat/)).toBeTruthy();
    expect(screen.getByText('Terminé.')).toBeTruthy();
    expect((await loadCards()).get(endgameCardId({ id: 'mat1' }))).toMatchObject({
      level: 0,
      failures: 1,
      attempts: 1,
    });
  });

  it('answers a good move, and goes on', async () => {
    const reply = 'h8h7';
    verdicts[after(MATE1, 'f7e7')] = { bestMoveUci: reply };
    const user = await play('Finale mat1');
    await screen.findByText(/Idée de la finale mat1/);
    await waitFor(() => expect(screen.queryByText(/Le moteur prépare/)).toBeNull());
    await user.click(cell('f7'));
    await user.click(cell('e7'));
    expect(await screen.findByText(/Le moteur répond Rh7/)).toBeTruthy();
    expect(screen.getByText('1.Re7 1…Rh7')).toBeTruthy();
    expect(screen.getByText(/Coup 2 sur 40 au plus/)).toBeTruthy();
    // Nothing is noted until the position is won or failed
    expect((await loadCards()).size).toBe(0);
  });

  it('gives the solution on request, which fails the position', async () => {
    verdicts[at(MATE1)] = { bestMoveUci: 'g1g7', bestMoveSan: 'Qg7#' };
    const user = await play('Finale mat1');
    await screen.findByText(/Idée de la finale mat1/);
    await waitFor(() => expect(screen.queryByText(/Le moteur prépare/)).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
    expect(screen.getByText(/Solution :/)).toBeTruthy();
    expect(screen.getByText(/Dg7#/)).toBeTruthy();
    await waitFor(async () =>
      expect((await loadCards()).get(endgameCardId({ id: 'mat1' }))).toMatchObject({ level: 0, failures: 1 })
    );
    // The only finale of the session: nothing after it
    expect(screen.getByRole('button', { name: 'Terminer la séance' })).toBeTruthy();
  });

  it('shows the goal and the progress of a draw to hold', async () => {
    await play('Finale tenir');
    await screen.findByText(/Idée de la finale tenir/);
    await waitFor(() => expect(screen.queryByText(/Le moteur prépare/)).toBeNull());
    expect(screen.getByText(/Faites nulle : tenez 12 coups/)).toBeTruthy();
    expect(screen.getByText(/0 coup tenu sur 12/)).toBeTruthy();
    // The goal is not told as a win
    expect(screen.queryByText(/Gagnez cette position/)).toBeNull();
  });

  it('says so when the engine is not available, and plays again on request', async () => {
    engine.activeWorkerCount = 0;
    const user = await play('Finale mat1');
    expect(await screen.findByText(/Le moteur n'est pas disponible/)).toBeTruthy();
    engine.activeWorkerCount = 1;
    await user.click(screen.getByRole('button', { name: 'Recommencer la position' }));
    await waitFor(() => expect(screen.queryByText(/Le moteur n'est pas disponible/)).toBeNull());
    expect(await screen.findByText(/Idée de la finale mat1/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Le moteur prépare/)).toBeNull());
  });
});
