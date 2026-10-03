// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listGames, saveGame } from '../../services/gameStore';
import { savePuzzleAttempt } from '../../services/puzzleHistoryStore';
import { saveCard } from '../../services/trainingStore';
import { game, mv } from '../../test/profileFixtures';
import { distinctFen, faultMove } from '../../test/trainingFixtures';
import { DAY_MS } from '../../utils/spacedRepetition';
import { Plan } from './Plan';

let counter = 0;
/** Stores a game of 70 plies of the player (Alice, White) with the faults given by ply. */
async function store(faults: Record<number, ReturnType<typeof faultMove>> = {}, over: Parameters<typeof game>[0] = {}) {
  counter += 1;
  const source = game({
    moves: Array.from({ length: 70 }, (_, ply) => faults[ply] ?? mv(ply)),
    meta: { date: `2024.03.${String(counter).padStart(2, '0')}` },
    ...over,
  });
  await saveGame({ pgn: `1. e4 *\n; game ${counter}`, depth: 12, result: source.result });
}

/** Six games, each with one piece left hanging: that is all of the faults, so it is the kind that comes back. */
const storeHangingGames = async (count = 6) => {
  for (let i = 0; i < count; i++) await store({ 6: faultMove({ faultKind: 'hanging', fenBefore: distinctFen(i) }) });
};

/** The first objective of the plan. */
const firstItem = async () => {
  const list = await screen.findByRole('list', { name: 'Objectifs de la semaine' });
  return within(within(list).getAllByRole('listitem')[0]);
};

const renderPlan = (props: Partial<React.ComponentProps<typeof Plan>> = {}) => {
  const handlers = { onClose: vi.fn(), onTrain: vi.fn(), onShowLine: vi.fn(), onImport: vi.fn(), onPuzzles: vi.fn() };
  render(<Plan {...handlers} {...props} />);
  return handlers;
};

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
});

describe('Plan', () => {
  it('says it is preparing the plan while the games are read', async () => {
    await storeHangingGames();
    renderPlan();
    expect(screen.getByRole('status').textContent).toBe('Préparation du plan…');
    await screen.findByRole('list', { name: 'Objectifs de la semaine' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  describe('with something to work on', () => {
    it('lists the objectives with their reason', async () => {
      await storeHangingGames();
      renderPlan();
      const list = await screen.findByRole('list', { name: 'Objectifs de la semaine' });
      const [first] = within(list).getAllByRole('listitem');
      expect(within(first).getByRole('heading', { name: 'Rejouez vos erreurs : pièce laissée en prise' })).toBeTruthy();
      expect(within(first).getByText('100 % de vos erreurs (6 sur 6) sont de ce type.')).toBeTruthy();
    });

    it('shows the progress of the week', async () => {
      await storeHangingGames();
      renderPlan();
      const item = await firstItem();
      const bar = item.getByRole('progressbar', { name: 'Progression de la semaine' });
      expect(bar.getAttribute('aria-valuenow')).toBe('0');
      expect(bar.getAttribute('aria-valuemax')).toBe('6');
      expect(item.getByText('Cette semaine : 0 position rejouée sur 6')).toBeTruthy();
    });

    it('counts the positions replayed this week, and says when the goal is reached', async () => {
      await storeHangingGames(5);
      const games = await listGames();
      const now = Date.now();
      for (const g of games) {
        await saveCard({
          id: `${g.id}:6`,
          level: 1,
          dueAt: now + 3 * DAY_MS,
          lastSeen: now - DAY_MS,
          attempts: 1,
          failures: 0,
        });
      }
      renderPlan();
      const item = await firstItem();
      expect(item.getByRole('progressbar', { name: 'Progression de la semaine' }).getAttribute('aria-valuenow')).toBe(
        '5'
      );
      expect(item.getByText('Cette semaine : 5 positions rejouées sur 5')).toBeTruthy();
      expect(item.getByText('Objectif atteint')).toBeTruthy();
    });

    it('starts the training on the theme of the objective', async () => {
      await storeHangingGames();
      const user = userEvent.setup();
      const { onTrain } = renderPlan();
      await user.click((await firstItem()).getByRole('button', { name: 'Commencer' }));
      expect(onTrain).toHaveBeenCalledTimes(1);
      const filter = onTrain.mock.calls[0][0];
      expect([...filter.kinds]).toEqual(['hanging']);
      expect([...filter.phases]).toEqual([]);
    });
  });

  describe('the puzzles', () => {
    it('offers the puzzles of the theme beside the errors to replay', async () => {
      await storeHangingGames();
      const user = userEvent.setup();
      const { onPuzzles, onTrain } = renderPlan();
      await user.click((await firstItem()).getByRole('button', { name: 'Puzzles : Pièce en prise' }));
      expect(onPuzzles).toHaveBeenCalledWith(['hangingPiece']);
      expect(onTrain).not.toHaveBeenCalled();
    });

    it('goes to the puzzles alone when every error of the theme was replayed and is mastered', async () => {
      await storeHangingGames(5);
      for (const g of await listGames()) {
        await saveCard({
          id: `${g.id}:6`,
          level: 4,
          dueAt: Number.MAX_SAFE_INTEGER,
          lastSeen: Date.now() - 30 * DAY_MS,
          attempts: 4,
          failures: 0,
        });
      }
      const user = userEvent.setup();
      const { onPuzzles } = renderPlan();
      const item = await firstItem();
      expect(item.getByRole('heading', { name: 'Faites des puzzles : pièce laissée en prise' })).toBeTruthy();
      expect(item.queryByRole('progressbar', { name: 'Progression de la semaine' })).toBeNull();
      await user.click(item.getByRole('button', { name: /Faire des puzzles/ }));
      expect(onPuzzles).toHaveBeenCalledWith(['hangingPiece']);
    });

    it('shows the progress of the week in puzzles on the theme', async () => {
      await storeHangingGames();
      const now = Date.now();
      for (let i = 0; i < 4; i++) {
        await savePuzzleAttempt(
          { id: `h${i}`, plays: 1, wins: 1, lastAt: now - i },
          { at: now - i, id: `h${i}`, ok: true, rating: 1100, themes: ['hangingPiece'] }
        );
      }
      await savePuzzleAttempt(
        { id: 'f', plays: 1, wins: 1, lastAt: now },
        { at: now, id: 'f', ok: true, rating: 1100, themes: ['fork'] }
      );
      renderPlan();
      const item = await firstItem();
      const bar = item.getByRole('progressbar', { name: 'Progression des puzzles de la semaine' });
      expect(bar.getAttribute('aria-valuenow')).toBe('4');
      expect(bar.getAttribute('aria-valuemax')).toBe('10');
      expect(item.getByText('Cette semaine : 4 puzzles joués sur 10')).toBeTruthy();
    });

    it('has none beside a habit, nor when games are missing', async () => {
      await storeHangingGames(3);
      renderPlan();
      await screen.findByRole('heading', { name: 'Analysez plus de parties' });
      expect(screen.queryByRole('button', { name: /uzzles/ })).toBeNull();
    });
  });

  describe('without enough to say', () => {
    it('offers to import games when none is stored', async () => {
      const user = userEvent.setup();
      const { onImport } = renderPlan();
      expect(await screen.findByText('Aucune partie enregistrée')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Importer mes parties' }));
      expect(onImport).toHaveBeenCalledTimes(1);
    });

    it('asks for more games under five, and shows no progress', async () => {
      await storeHangingGames(3);
      const user = userEvent.setup();
      const { onImport } = renderPlan();
      const item = await screen.findByRole('heading', { name: 'Analysez plus de parties' });
      expect(item.parentElement!.textContent).toContain("3 pour l'instant, il en faut 5 au moins");
      expect(screen.queryByRole('progressbar')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Importer mes parties' }));
      expect(onImport).toHaveBeenCalledTimes(1);
    });

    it('says nothing is urgent when nothing stands out', async () => {
      for (let i = 0; i < 6; i++) await store();
      renderPlan();
      expect(await screen.findByText("Rien d'urgent cette semaine")).toBeTruthy();
      expect(screen.queryByRole('list', { name: 'Objectifs de la semaine' })).toBeNull();
    });
  });

  it('closes', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPlan();
    await screen.findByText('Aucune partie enregistrée');
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
