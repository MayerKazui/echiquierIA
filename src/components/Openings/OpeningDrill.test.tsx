// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureOpeningBookLoaded } from '../../services/openingBook';
import { saveGame } from '../../services/gameStore';
import { loadCards, saveCard } from '../../services/trainingStore';
import { game, mv, PSEUDO } from '../../test/profileFixtures';
import { loadOpeningsFromDisk } from '../../test/openings';
import { drillId } from '../../utils/openingDrill';
import { DAY_MS } from '../../utils/spacedRepetition';
import { OpeningDrill } from './OpeningDrill';

vi.mock('../../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

/** After 3…a6 of the Ruy Lopez, White plays 4.a3, which the openings database does not know (4.Ba4, 4.Bxc6 it does). */
const RUY_A3 = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'a3', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];
/** The theory followed up to 5.O-O: games that stay in it that long make a line that works. */
const RUY_BA4 = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];
const AFTER_A6 = 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
/** Black’s 3…h6 instead of the theory (3…a6, 3…Nf6…). */
const RUY_H6 = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'h6', 'O-O', 'Nf6', 'd3', 'd6', 'Nc3', 'Be7'];

/** Stores a game of the player: `bookPlies` moves of theory, then the first move outside the book. */
async function store(
  id: string,
  {
    sans = RUY_A3,
    bookPlies = 6,
    loss = 12,
    color = 'w',
  }: { sans?: string[]; bookPlies?: number; loss?: number; color?: 'w' | 'b' } = {}
) {
  const source = game({
    id,
    white: color === 'w' ? PSEUDO : 'Bob',
    black: color === 'w' ? 'Bob' : PSEUDO,
    meta: { result: '1-0', date: '2026.03.14' },
    moves: sans.map((san, ply) =>
      ply < bookPlies
        ? mv(ply, { san, classification: 'book', openingName: 'Ruy Lopez: Morphy Defense', eco: 'C78' })
        : mv(ply, { san, classification: 'best', winPercentLoss: ply === bookPlies ? loss : 0 })
    ),
  });
  await saveGame({ pgn: `1. e4 *\n; game ${id}`, depth: 12, result: source.result });
}

const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;

const renderDrill = (props: Partial<React.ComponentProps<typeof OpeningDrill>> = {}) => {
  const handlers = { onImport: vi.fn(), onShowLine: vi.fn() };
  render(<OpeningDrill {...handlers} {...props} />);
  return handlers;
};

/** Reads the figure of a tile of the set-up screen ("À revoir", "Nouvelles"...). */
const tile = (label: string) => screen.getByText(label).parentElement!.querySelector('p:nth-of-type(2)')!.textContent;

async function begin() {
  const user = userEvent.setup();
  await store('a');
  const handlers = renderDrill();
  await user.click(await screen.findByRole('button', { name: /Commencer/ }));
  return { user, ...handlers };
}

async function waitForCards(count: number) {
  await waitFor(async () => expect((await loadCards()).size).toBe(count));
  return loadCards();
}

beforeAll(async () => {
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
});

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
});

describe('OpeningDrill', () => {
  it('says it is looking for the positions to replay while the games are read', async () => {
    await store('a');
    renderDrill();
    expect(screen.getByRole('status').textContent).toBe('Recherche de vos positions à rejouer…');
    await screen.findByRole('button', { name: /Commencer/ });
    expect(screen.queryByText('Recherche de vos positions à rejouer…')).toBeNull();
  });

  describe('with nothing to replay', () => {
    it('offers to import games when none is stored', async () => {
      const { onImport } = renderDrill();
      expect(await screen.findByText('Aucune partie enregistrée')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Importer mes parties' }));
      expect(onImport).toHaveBeenCalledTimes(1);
    });

    it('explains it when games are stored but none left the theory at a cost', async () => {
      await store('a', { loss: 3 });
      renderDrill();
      expect(await screen.findByText('Aucune position à rejouer')).toBeTruthy();
      expect(screen.getByText(/Dans vos 1 partie enregistrée, il n'y en a aucune pour l'instant/)).toBeTruthy();
    });

    it('does not offer a move of the theory as a mistake', async () => {
      // 4.Ba4 is theory: the game was analysed before the database was complete
      await store('a', { sans: [...RUY_A3.slice(0, 6), 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'], loss: 20 });
      renderDrill();
      expect(await screen.findByText('Aucune position à rejouer')).toBeTruthy();
    });
  });

  describe('set-up screen', () => {
    it('counts the positions never replayed', async () => {
      await store('a');
      renderDrill();
      await screen.findByRole('button', { name: /Commencer/ });
      expect(tile('Nouvelles')).toBe('1');
      expect(tile('À revoir')).toBe('0');
      expect(tile('Plus tard')).toBe('0');
      expect(tile('Maîtrisées')).toBe('0');
      expect(screen.getByRole('button', { name: 'Commencer (1 position)' })).toBeTruthy();
    });

    it('counts the positions of each side, and takes only the side chosen', async () => {
      const user = userEvent.setup();
      await store('a');
      await store('b', { sans: RUY_H6, bookPlies: 5, color: 'b' });
      renderDrill();
      await screen.findByRole('button', { name: /Commencer/ });
      expect(screen.getByRole('button', { name: /Avec les Blancs \(1\)/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Avec les Noirs \(1\)/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Commencer (2 positions)' })).toBeTruthy();

      await user.click(screen.getByRole('button', { name: /Avec les Noirs/ }));
      expect(screen.getByRole('button', { name: /Avec les Noirs/ }).getAttribute('aria-pressed')).toBe('true');
      expect(tile('Nouvelles')).toBe('1');
      expect(screen.getByRole('button', { name: 'Commencer (1 position)' })).toBeTruthy();

      await user.click(screen.getByRole('button', { name: /Avec les Noirs/ }));
      expect(screen.getByRole('button', { name: 'Commencer (2 positions)' })).toBeTruthy();
    });

    it('says when everything is up to date, and offers to review in advance', async () => {
      const user = userEvent.setup();
      await store('a');
      await saveCard({
        id: drillId(AFTER_A6),
        level: 1,
        dueAt: Date.now() + 3 * DAY_MS,
        lastSeen: Date.now(),
        attempts: 1,
        failures: 0,
      });
      renderDrill();
      expect(
        await screen.findByText(/Tout est à jour pour ce choix : la prochaine position revient dans 3 jours/)
      ).toBeTruthy();
      expect(tile('Plus tard')).toBe('1');
      expect(screen.queryByRole('button', { name: /Commencer/ })).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Réviser en avance' }));
      expect(await screen.findByText(/Position 1 sur 1/)).toBeTruthy();
    });

    it('counts the positions due again, and the mastered ones', async () => {
      await store('a');
      await store('b', { sans: RUY_H6, bookPlies: 5, color: 'b' });
      const { listGames } = await import('../../services/gameStore');
      const { collectDrillPositions } = await import('../../utils/openingDrill');
      const { getOpeningPosition } = await import('../../services/openingBook');
      const ids = (await collectDrillPositions(await listGames(), getOpeningPosition)).map((p) => p.id);
      await saveCard({ id: ids[0], level: 0, dueAt: Date.now() - DAY_MS, lastSeen: 1, attempts: 2, failures: 1 });
      await saveCard({ id: ids[1], level: 4, dueAt: Number.MAX_SAFE_INTEGER, lastSeen: 1, attempts: 4, failures: 0 });
      renderDrill();
      await screen.findByRole('button', { name: /Commencer/ });
      expect(tile('À revoir')).toBe('1');
      expect(tile('Maîtrisées')).toBe('1');
      expect(tile('Nouvelles')).toBe('0');
    });
  });

  describe('the lines that work', () => {
    /** Two games that follow the theory up to 5.O-O, where the opponent leaves it. */
    const storeLine = async () => {
      await store('x', { sans: RUY_BA4, bookPlies: 9 });
      await store('y', { sans: RUY_BA4, bookPlies: 9 });
    };

    it('counts them apart from the exits, and lets the player choose', async () => {
      const user = userEvent.setup();
      await storeLine();
      await store('a');
      renderDrill();
      await screen.findByRole('button', { name: /Commencer/ });
      expect(screen.getByRole('button', { name: /Mes sorties de théorie \(1\)/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Mes lignes qui marchent \(1\)/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Commencer (2 positions)' })).toBeTruthy();

      await user.click(screen.getByRole('button', { name: /Mes lignes qui marchent/ }));
      expect(screen.getByRole('button', { name: /Mes lignes qui marchent/ }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('button', { name: 'Commencer (1 position)' })).toBeTruthy();
      // The count of a colour follows the kind chosen
      expect(screen.getByRole('button', { name: /Avec les Blancs \(1\)/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Avec les Noirs \(0\)/ })).toBeTruthy();

      await user.click(screen.getByRole('button', { name: /Mes lignes qui marchent/ }));
      await user.click(screen.getByRole('button', { name: /Mes sorties de théorie/ }));
      expect(screen.getByRole('button', { name: 'Commencer (1 position)' })).toBeTruthy();
    });

    it('starts the session with the exits, which cost something, then the lines', async () => {
      const user = userEvent.setup();
      await storeLine();
      await store('a');
      renderDrill();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      expect(screen.getByText(/Sortie de théorie/)).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      await user.click(screen.getByRole('button', { name: 'Position suivante' }));
      expect(screen.getByText(/Ligne qui marche/)).toBeTruthy();
    });

    it('does not say what was played before the answer, which is the answer', async () => {
      const user = userEvent.setup();
      await storeLine();
      renderDrill();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      expect(screen.getByText(/Position 1 sur 1/).textContent).toMatch(/coup 5/);
      const text = () => screen.getByText(/Ligne qui marche/).textContent;
      expect(text()).toBe('Ligne qui marche : vous suivez la théorie ici dans 2 de vos parties.');
      await user.click(cell('e1'));
      await user.click(cell('g1'));
      expect(await screen.findByText(/Réussi\./)).toBeTruthy();
      expect(text()).toBe(
        'Ligne qui marche : vous suivez la théorie ici dans 2 de vos parties : vous avez joué 5.O-O (2 fois).'
      );
    });

    it('accepts the move played in the game, and brings the position back tomorrow', async () => {
      const user = userEvent.setup();
      await storeLine();
      renderDrill();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      await user.click(cell('e1'));
      await user.click(cell('g1'));
      expect(await screen.findByText('Réussi.')).toBeTruthy();
      expect(screen.getByText(/O-O est un coup de la théorie\./)).toBeTruthy();
      const cards = await waitForCards(1);
      const [card] = [...cards.values()];
      expect(card.id).toBe(drillId('r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 5'));
      expect(card.level).toBe(1);
    });

    it('refuses a move the database does not know there, and counts a failure', async () => {
      const user = userEvent.setup();
      await storeLine();
      renderDrill();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      await user.click(cell('h2'));
      await user.click(cell('h3'));
      expect(await screen.findByText(/La base des ouvertures ne connaît pas h3 ici/)).toBeTruthy();
      expect(screen.getByText('Raté.')).toBeTruthy();
      const [card] = [...(await waitForCards(1)).values()];
      expect(card.level).toBe(0);
    });

    it('says in the summary what the player plays', async () => {
      const user = userEvent.setup();
      await storeLine();
      renderDrill();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      await user.click(screen.getByRole('button', { name: 'Terminer la séance' }));
      expect(screen.getByText(/\(vous jouez O-O\)/)).toBeTruthy();
    });
  });

  describe('a position', () => {
    it('shows the line, the opening and what happened in the games', async () => {
      await begin();
      expect(screen.getByText(/Position 1 sur 1/).textContent).toMatch(/coup 4 · \[C78\] Partie espagnole/);
      expect(screen.getByText('Vous jouez les Blancs. Quel est le coup de la théorie ?')).toBeTruthy();
      expect(screen.getByText('1. e4 e5 2. Cf3 Cc6 3. Fb5 a6')).toBeTruthy();
      expect(
        screen.getByText(
          /Sortie de théorie : dans une de vos parties, vous avez quitté la théorie ici : 4\.a3, ce qui a coûté en moyenne 12 points de chances de gain/
        )
      ).toBeTruthy();
      expect(cell('b5')).toBeTruthy();
    });

    it('turns the board for Black', async () => {
      const user = userEvent.setup();
      await store('b', { sans: RUY_H6, bookPlies: 5, color: 'b' });
      renderDrill();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      expect(screen.getByText('Vous jouez les Noirs. Quel est le coup de la théorie ?')).toBeTruthy();
      expect(screen.getByText(/coup 3/)).toBeTruthy();
      // The theory answers 3…a6 (or 3…Nf6): found on the board
      await user.click(cell('a7'));
      await user.click(cell('a6'));
      expect(await screen.findByText(/Réussi\./)).toBeTruthy();
    });

    it('accepts a move of the theory, and brings the position back tomorrow', async () => {
      const { user } = await begin();
      await user.click(cell('b5'));
      await user.click(cell('a4'));
      expect(await screen.findByText(/Réussi\./)).toBeTruthy();
      expect(screen.getByText(/Fa4 est un coup de la théorie\./)).toBeTruthy();
      expect(screen.getByText(/Coups de la théorie :/).parentElement!.textContent).toContain('Fa4, Fxc6');

      const [card] = [...(await waitForCards(1)).values()];
      expect(card).toMatchObject({ id: drillId(AFTER_A6), level: 1, attempts: 1, failures: 0 });
      expect(card.dueAt - card.lastSeen).toBe(DAY_MS);
      await user.click(screen.getByRole('button', { name: 'Terminer la séance' }));
      expect(screen.getByText('Séance terminée : 1 réussie sur 1')).toBeTruthy();
      expect(screen.getByText(/reviendra demain/)).toBeTruthy();
    });

    it('accepts the other move of the theory too', async () => {
      const { user } = await begin();
      await user.click(cell('b5'));
      await user.click(cell('c6'));
      expect(await screen.findByText(/Réussi\./)).toBeTruthy();
      expect(screen.getByText(/Fxc6 est un coup de la théorie\./)).toBeTruthy();
    });

    it('says when the move is the one played in the game, and counts a failure', async () => {
      const { user } = await begin();
      await user.click(cell('a2'));
      await user.click(cell('a3'));
      expect(await screen.findByText(/Raté\./)).toBeTruthy();
      expect(screen.getByText(/C'est le coup que vous avez joué en partie : a3\./)).toBeTruthy();
      const [card] = [...(await waitForCards(1)).values()];
      expect(card).toMatchObject({ level: 0, attempts: 1, failures: 1 });
    });

    it('says when the database does not know the move, and shows the moves of the theory', async () => {
      const { user } = await begin();
      await user.click(cell('b1'));
      await user.click(cell('c3'));
      expect(await screen.findByText(/Raté\./)).toBeTruthy();
      expect(screen.getByText(/La base des ouvertures ne connaît pas Cc3 ici\./)).toBeTruthy();
      expect(screen.getByText(/Coups de la théorie :/).parentElement!.textContent).toContain('Fa4, Fxc6');
    });

    it('gives the solution and counts a failure', async () => {
      const { user } = await begin();
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      expect(await screen.findByText(/Solution : Fa4\./)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
      const [card] = [...(await waitForCards(1)).values()];
      expect(card).toMatchObject({ level: 0, failures: 1 });
    });

    it('lets the player try again without counting it, and keeps the failure', async () => {
      const { user } = await begin();
      await user.click(cell('b1'));
      await user.click(cell('c3'));
      await screen.findByText(/Raté\./);
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      await user.click(cell('b5'));
      await user.click(cell('a4'));

      const status = await screen.findByText(/Trouvé\./);
      expect(status.parentElement!.textContent).toContain('La position reste à revoir demain.');
      await user.click(screen.getByRole('button', { name: 'Terminer la séance' }));
      expect(screen.getByText('Séance terminée : 0 réussie sur 1')).toBeTruthy();
      const [card] = [...(await waitForCards(1)).values()];
      expect(card).toMatchObject({ level: 0, attempts: 1, failures: 1 });
    });

    it('does not take a move while the answer is on screen', async () => {
      const { user } = await begin();
      await user.click(cell('b5'));
      await user.click(cell('a4'));
      await screen.findByText(/Réussi\./);
      await user.click(cell('b1'));
      await user.click(cell('c3'));
      expect(screen.queryByText(/Raté\./)).toBeNull();
      expect((await waitForCards(1)).size).toBe(1);
    });

    it('shows the position in the explorer', async () => {
      const { user, onShowLine } = await begin();
      expect(screen.queryByRole('button', { name: /explorateur/ })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      await user.click(await screen.findByRole('button', { name: "Voir la position dans l'explorateur" }));
      expect(onShowLine).toHaveBeenCalledWith(RUY_A3.slice(0, 6));
    });

    it('goes through the positions one after the other, the costliest first', async () => {
      const user = userEvent.setup();
      await store('a', { loss: 10 });
      await store('b', { sans: RUY_H6, bookPlies: 5, color: 'b', loss: 30 });
      renderDrill();
      await user.click(await screen.findByRole('button', { name: /Commencer \(2 positions\)/ }));
      expect(screen.getByText(/Position 1 sur 2/)).toBeTruthy();
      expect(screen.getByText(/Vous jouez les Noirs/)).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      await user.click(screen.getByRole('button', { name: 'Position suivante' }));
      expect(screen.getByText(/Position 2 sur 2/)).toBeTruthy();
      expect(screen.getByText(/Vous jouez les Blancs/)).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      await user.click(screen.getByRole('button', { name: 'Terminer la séance' }));

      const list = within(screen.getByRole('list'));
      expect(list.getAllByRole('listitem')).toHaveLength(2);
      expect(list.getAllByLabelText('Ratée')).toHaveLength(2);
      expect(screen.getByText('Séance terminée : 0 réussie sur 2')).toBeTruthy();
    });

    it('comes back to the set-up for a new session', async () => {
      const { user } = await begin();
      await user.click(cell('b5'));
      await user.click(cell('a4'));
      await user.click(await screen.findByRole('button', { name: 'Terminer la séance' }));
      await user.click(screen.getByRole('button', { name: 'Nouvelle séance' }));
      expect(await screen.findByText(/Tout est à jour pour ce choix/)).toBeTruthy();
      expect(tile('Plus tard')).toBe('1');
    });
  });
});
