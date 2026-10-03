// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveGame } from '../../services/gameStore';
import { stockfishService } from '../../services/stockfishEngine';
import { loadCards, saveCard } from '../../services/trainingStore';
import { game, mv } from '../../test/profileFixtures';
import { faultMove } from '../../test/trainingFixtures';
import { DAY_MS } from '../../utils/spacedRepetition';
import { Training } from './Training';

vi.mock('../../services/stockfishEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/stockfishEngine')>()),
  stockfishService: { evaluatePosition: vi.fn() },
}));
vi.mock('../../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

const evaluatePosition = vi.mocked(stockfishService.evaluatePosition);

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** A second fault, in the endgame, of another kind: 32.a3 instead of the engine's Nf3 (a made-up position). */
const hanging = (ply: number, over = {}) =>
  faultMove({
    ply,
    moveNumber: Math.floor(ply / 2) + 1,
    fenBefore: START,
    san: 'a3',
    uci: 'a2a3',
    bestMoveUci: 'g1f3',
    bestMoveSan: 'Nf3',
    pv: ['g1f3'],
    mateBefore: null,
    mateAfter: null,
    faultKind: 'hanging',
    winPercentBefore: 54,
    winPercentLoss: 20,
    ...over,
  });

let counter = 0;
/** Stores a game of 70 plies of the player (Alice, White) with the faults given by ply. */
async function store(faults: Record<number, ReturnType<typeof faultMove>>, over: Parameters<typeof game>[0] = {}) {
  counter += 1;
  const source = game({
    moves: Array.from({ length: 70 }, (_, ply) => faults[ply] ?? mv(ply)),
    meta: { date: `2024.03.${String(counter).padStart(2, '0')}` },
    ...over,
  });
  await saveGame({ pgn: `1. e4 *\n; game ${counter}`, depth: 12, result: source.result });
}

const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;
const evaluation = (cp: number) => ({ cp, mate: null, bestMoveUci: '', bestMoveSan: '', pv: [] });

const renderTraining = (props: Partial<React.ComponentProps<typeof Training>> = {}) => {
  const handlers = { onClose: vi.fn(), onImport: vi.fn() };
  render(<Training {...handlers} {...props} />);
  return handlers;
};

/** Reads the figure of a tile of the set-up screen ("À revoir", "Nouvelles"...). */
const tile = (label: string) => screen.getByText(label).parentElement!.querySelector('p:nth-of-type(2)')!.textContent;

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
  evaluatePosition.mockReset();
  evaluatePosition.mockResolvedValue(evaluation(0));
});

describe('Training', () => {
  it('says it is looking for the errors while the games are read', async () => {
    await store({ 6: faultMove() });
    renderTraining();
    expect(screen.getByRole('status').textContent).toBe('Recherche de vos erreurs…');
    await screen.findByRole('button', { name: /Commencer/ });
    expect(screen.queryByText('Recherche de vos erreurs…')).toBeNull();
  });

  describe('with nothing to replay', () => {
    it('offers to import games when none is stored', async () => {
      const { onImport } = renderTraining();
      expect(await screen.findByText('Aucune partie enregistrée')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Importer mes parties' }));
      expect(onImport).toHaveBeenCalledTimes(1);
    });

    it('explains it when games are stored but hold no error of the player', async () => {
      await store({}, { id: 'clean' });
      renderTraining();
      expect(await screen.findByText('Aucune erreur à rejouer')).toBeTruthy();
      expect(screen.getByText(/Dans vos 1 partie enregistrée, aucune erreur n'est à rejouer/)).toBeTruthy();
    });

    it('says the same for games that do not name the player', async () => {
      await store({ 6: faultMove() }, { white: 'Carl', black: 'Dora' });
      renderTraining();
      expect(await screen.findByText('Aucune erreur à rejouer')).toBeTruthy();
    });
  });

  describe('opened on a theme', () => {
    it('starts with the filter it is given, and counts what it brings', async () => {
      await store({ 6: faultMove(), 62: hanging(62) });
      renderTraining({ initialFilter: { kinds: new Set(['hanging']), phases: new Set() } });
      await screen.findByRole('button', { name: /Commencer/ });
      expect(screen.getByRole('button', { name: /Pièce laissée en prise/ }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('button', { name: /Mat/ }).getAttribute('aria-pressed')).toBe('false');
      expect(screen.getByRole('button', { name: /Commencer \(1 position\)/ })).toBeTruthy();
    });

    it('takes every error without a filter', async () => {
      await store({ 6: faultMove(), 62: hanging(62) });
      renderTraining();
      expect(await screen.findByRole('button', { name: /Commencer \(2 positions\)/ })).toBeTruthy();
    });
  });

  describe('set-up screen', () => {
    it('counts the positions never replayed', async () => {
      await store({ 6: faultMove(), 62: hanging(62) });
      renderTraining();
      await screen.findByRole('button', { name: /Commencer/ });
      expect(tile('Nouvelles')).toBe('2');
      expect(tile('À revoir')).toBe('0');
      expect(tile('Plus tard')).toBe('0');
      expect(tile('Maîtrisées')).toBe('0');
      expect(screen.getByRole('button', { name: 'Commencer (2 positions)' })).toBeTruthy();
    });

    it('counts, for each theme, the positions it would bring', async () => {
      await store({ 6: faultMove(), 62: hanging(62) });
      renderTraining();
      await screen.findByRole('button', { name: /Commencer/ });
      expect(screen.getByRole('button', { name: /Mat manqué ou subi \(1\)/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Pièce laissée en prise \(1\)/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Tactique manquée \(0\)/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Ouverture \(1\)/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Finale \(1\)/ })).toBeTruthy();
    });

    it('keeps only the chosen theme', async () => {
      const user = userEvent.setup();
      await store({ 6: faultMove(), 62: hanging(62) });
      renderTraining();
      await user.click(await screen.findByRole('button', { name: /Pièce laissée en prise/ }));
      expect(screen.getByRole('button', { name: /Pièce laissée en prise/ }).getAttribute('aria-pressed')).toBe('true');
      expect(tile('Nouvelles')).toBe('1');
      await user.click(screen.getByRole('button', { name: 'Commencer (1 position)' }));
      expect(screen.getByText(/Position 1 sur 1 · coup 32/)).toBeTruthy();
    });

    it('keeps only the chosen phase, and both themes together', async () => {
      const user = userEvent.setup();
      await store({ 6: faultMove(), 62: hanging(62) });
      renderTraining();
      await user.click(await screen.findByRole('button', { name: /Finale/ }));
      expect(tile('Nouvelles')).toBe('1');
      await user.click(screen.getByRole('button', { name: /Mat manqué ou subi/ }));
      // An endgame, and a mate: there is none
      expect(tile('Nouvelles')).toBe('0');
      expect(screen.queryByRole('button', { name: /Commencer/ })).toBeNull();
      expect(screen.getByText('Aucune position à travailler pour ce choix.')).toBeTruthy();
    });

    it('takes a theme off when it is chosen again', async () => {
      const user = userEvent.setup();
      await store({ 6: faultMove(), 62: hanging(62) });
      renderTraining();
      const chip = await screen.findByRole('button', { name: /Finale/ });
      await user.click(chip);
      await user.click(screen.getByRole('button', { name: /Finale/ }));
      expect(screen.getByRole('button', { name: /Finale/ }).getAttribute('aria-pressed')).toBe('false');
      expect(tile('Nouvelles')).toBe('2');
    });

    it('tells when everything is up to date and offers to work in advance', async () => {
      const user = userEvent.setup();
      await store({ 6: faultMove() });
      const gameId = (await findPositionId())!;
      await saveCard({
        id: gameId,
        level: 1,
        dueAt: Date.now() + 3 * DAY_MS,
        lastSeen: Date.now(),
        attempts: 1,
        failures: 0,
      });
      renderTraining();
      await screen.findByText(/Tout est à jour pour ce choix : la prochaine position revient dans 3 jours/);
      expect(tile('Plus tard')).toBe('1');
      await user.click(screen.getByRole('button', { name: 'Réviser en avance' }));
      expect(screen.getByText(/Position 1 sur 1/)).toBeTruthy();
    });

    it('counts the positions due again, and the mastered ones', async () => {
      await store({ 6: faultMove(), 62: hanging(62) });
      const ids = await findPositionIds();
      await saveCard({ id: ids[0], level: 0, dueAt: Date.now() - DAY_MS, lastSeen: 1, attempts: 2, failures: 1 });
      await saveCard({ id: ids[1], level: 4, dueAt: Number.MAX_SAFE_INTEGER, lastSeen: 1, attempts: 4, failures: 0 });
      renderTraining();
      await screen.findByRole('button', { name: /Commencer/ });
      expect(tile('À revoir')).toBe('1');
      expect(tile('Maîtrisées')).toBe('1');
      expect(tile('Nouvelles')).toBe('0');
    });
  });

  describe('replaying a position', () => {
    async function begin() {
      const user = userEvent.setup();
      await store({ 6: faultMove() });
      const handlers = renderTraining();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      return { user, ...handlers };
    }

    it('shows the position from the side of the player, and what was played in the game', async () => {
      await begin();
      expect(screen.getByText(/Position 1 sur 1 · coup 4 · contre Bob/)).toBeTruthy();
      expect(screen.getByText(/Vous jouez les Blancs\. Trouvez un meilleur coup\./)).toBeTruthy();
      expect(screen.getByText(/En partie, vous aviez joué/).textContent).toContain('Dh4');
      expect(screen.getByText(/En partie, vous aviez joué/).textContent).toContain('une gaffe');
      expect(cell('h5').getAttribute('aria-label')).toBe('h5, dame blanche');
      // White at the bottom
      expect(screen.getAllByRole('gridcell')[63].getAttribute('aria-label')).toMatch(/^h1/);
    });

    it('turns the board around when the player had the Black pieces', async () => {
      const user = userEvent.setup();
      await store(
        {
          7: faultMove({
            ply: 7,
            moveNumber: 4,
            color: 'b',
            san: 'a6',
            uci: 'a7a6',
            fenBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
            bestMoveUci: 'e7e5',
            bestMoveSan: 'e5',
            mateBefore: null,
            faultKind: 'other',
          }),
        },
        { white: 'Bob', black: 'Alice' }
      );
      renderTraining();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      expect(screen.getByText(/Vous jouez les Noirs\./)).toBeTruthy();
      expect(screen.getByText(/contre Bob/)).toBeTruthy();
      const cells = screen.getAllByRole('gridcell');
      expect(cells[0].getAttribute('aria-label')).toMatch(/^h1/);
      expect(cells[63].getAttribute('aria-label')).toMatch(/^a8/);
      await user.click(cell('e7'));
      await user.click(cell('e5'));
      expect(await screen.findByText(/Réussi\./)).toBeTruthy();
    });

    it('does not tell the solution before the answer', async () => {
      await begin();
      expect(screen.queryByText(/Suite du moteur/)).toBeNull();
      expect(screen.queryByText('Position suivante')).toBeNull();
      expect(screen.queryByText('Terminer la séance')).toBeNull();
    });

    it("congratulates the engine's move, with the explanation, and ends the session", async () => {
      const { user } = await begin();
      await user.click(cell('h5'));
      await user.click(cell('f7'));
      const status = await screen.findByText(/Réussi\./);
      expect(status.parentElement!.textContent).toContain('Dxf7# est le coup du moteur.');
      expect(screen.getByText(/Suite du moteur :/).parentElement!.textContent).toContain('Dxf7#');
      expect(screen.getByText('Mat manqué ou subi')).toBeTruthy();
      expect(evaluatePosition).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Terminer la séance' }));
      expect(screen.getByText('Séance terminée : 1 réussie sur 1')).toBeTruthy();
    });

    it('offers to open the game at the error only once the answer is known', async () => {
      const onOpenGame = vi.fn();
      const user = userEvent.setup();
      await store({ 6: faultMove() });
      renderTraining({ onOpenGame });
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      expect(screen.queryByRole('button', { name: 'Voir dans la partie' })).toBeNull();

      await user.click(cell('h5'));
      await user.click(cell('f7'));
      await screen.findByText(/Réussi\./);
      await user.click(screen.getByRole('button', { name: 'Voir dans la partie' }));
      expect(onOpenGame).toHaveBeenCalledTimes(1);
      const [id, ply] = onOpenGame.mock.calls[0] as [string, number];
      expect(ply).toBe(6);
      expect((await loadCards()).has(`${id}:6`)).toBe(true);
    });

    it('offers a game against Stockfish from the position, once the answer is known', async () => {
      const onPlay = vi.fn();
      const user = userEvent.setup();
      await store({ 6: faultMove() });
      renderTraining({ onPlay });
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      expect(screen.queryByRole('button', { name: /contre Stockfish/ })).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      await user.click(screen.getByRole('button', { name: 'Jouer cette position contre Stockfish' }));
      expect(onPlay).toHaveBeenCalledTimes(1);
      const [start] = onPlay.mock.calls[0] as [{ fen: string; label: string; prefix?: string[] }];
      expect(start.fen).toBe(faultMove().fenBefore);
      expect(start.label).toBe('Position critique de vos parties');
      expect(start.prefix).toBeUndefined();
    });

    it('has no such button when it cannot open a game', async () => {
      const { user } = await begin();
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      expect(screen.queryByRole('button', { name: 'Voir dans la partie' })).toBeNull();
    });

    it('says when the same position came back in other games', async () => {
      const user = userEvent.setup();
      await store({ 6: faultMove() });
      await store({ 6: faultMove() });
      await store({ 6: faultMove() });
      renderTraining();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      expect(screen.getByText(/Position 1 sur 1/)).toBeTruthy();
      expect(screen.getByText(/aussi présentée dans 2 autres parties/)).toBeTruthy();
    });

    it('records the success, and brings the position back in a day', async () => {
      const { user } = await begin();
      await user.click(cell('h5'));
      await user.click(cell('f7'));
      await screen.findByText(/Réussi\./);
      await waitFor(async () => expect((await loadCards()).size).toBe(1));
      const [card] = [...(await loadCards()).values()];
      expect(card).toMatchObject({ level: 1, attempts: 1, failures: 0 });
      expect(card.dueAt - card.lastSeen).toBe(DAY_MS);
      await user.click(screen.getByRole('button', { name: 'Terminer la séance' }));
      expect(screen.getByText(/reviendra demain/)).toBeTruthy();
    });

    it('says when the move is the one played in the game, and counts a failure', async () => {
      const { user } = await begin();
      await user.click(cell('h5'));
      await user.click(cell('h4'));
      expect(await screen.findByText(/Raté\./)).toBeTruthy();
      expect(screen.getByText(/C'est le coup que vous aviez joué en partie : Dh4\./)).toBeTruthy();
      await waitFor(async () => expect((await loadCards()).size).toBe(1));
      expect([...(await loadCards()).values()][0]).toMatchObject({ level: 0, attempts: 1, failures: 1 });
    });

    it('lets the player try again without counting it, and keeps the failure', async () => {
      const { user } = await begin();
      await user.click(cell('h5'));
      await user.click(cell('h4'));
      await screen.findByText(/Raté\./);
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(screen.queryByText(/Raté\./)).toBeNull();
      expect(screen.getByText(/Trouvez un meilleur coup/)).toBeTruthy();

      await user.click(cell('h5'));
      await user.click(cell('f7'));
      const status = await screen.findByText(/Trouvé\./);
      expect(status.parentElement!.textContent).toContain('La position reste à revoir demain.');
      await user.click(screen.getByRole('button', { name: 'Terminer la séance' }));
      expect(screen.getByText('Séance terminée : 0 réussie sur 1')).toBeTruthy();
      const [card] = [...(await loadCards()).values()];
      expect(card).toMatchObject({ level: 0, attempts: 1, failures: 1 });
    });

    it('asks the engine about another move, and accepts one that holds', async () => {
      evaluatePosition.mockResolvedValue(evaluation(1000)); // still winning for White
      const { user } = await begin();
      await user.click(cell('c4'));
      await user.click(cell('f7')); // 4.Bxf7+ keeps the win
      const status = await screen.findByText(/Réussi\./);
      expect(status.parentElement!.textContent).toContain('Bon coup. Le moteur préférait Dxf7#');
      expect(evaluatePosition).toHaveBeenCalledTimes(1);
      expect([...(await waitForCards(1)).values()][0].level).toBe(1);
    });

    it('refuses another move that throws the advantage away', async () => {
      evaluatePosition.mockResolvedValue(evaluation(-300));
      const { user } = await begin();
      await user.click(cell('c4'));
      await user.click(cell('f7'));
      const status = await screen.findByText(/Raté\./);
      expect(status.parentElement!.textContent).toMatch(/Ce coup donne \d+ points? de chances de gain à l'adversaire/);
    });

    it('says when the engine could not check the move', async () => {
      evaluatePosition.mockRejectedValue(new Error('worker lost'));
      const { user } = await begin();
      await user.click(cell('c4'));
      await user.click(cell('f7'));
      expect(await screen.findByText(/il n'a pas pu le vérifier/)).toBeTruthy();
    });

    it('says the move is being checked, and does not take another meanwhile', async () => {
      let resolve!: (value: ReturnType<typeof evaluation>) => void;
      evaluatePosition.mockReturnValue(new Promise((r) => (resolve = r)));
      const { user } = await begin();
      await user.click(cell('c4'));
      await user.click(cell('f7'));
      expect(await screen.findByText('Vérification du coup avec le moteur…')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Voir la solution' }).hasAttribute('disabled')).toBe(true);
      await user.click(cell('h5'));
      await user.click(cell('f7'));
      expect(evaluatePosition).toHaveBeenCalledTimes(1);
      resolve(evaluation(1000));
      expect(await screen.findByText(/Réussi\./)).toBeTruthy();
    });

    it('shows the solution on request, and counts a failure', async () => {
      const { user } = await begin();
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      const status = await screen.findByText(/Raté\./);
      expect(status.parentElement!.textContent).toContain('Solution : Dxf7#.');
      expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
      expect([...(await waitForCards(1)).values()][0]).toMatchObject({ level: 0, failures: 1 });
    });

    it('ignores a click on a square of the opponent, or a move that is not legal', async () => {
      const { user } = await begin();
      await user.click(cell('e7'));
      await user.click(cell('e5'));
      await user.click(cell('h5'));
      await user.click(cell('a8'));
      expect(screen.queryByText(/Raté\.|Réussi\./)).toBeNull();
      expect(evaluatePosition).not.toHaveBeenCalled();
    });

    it("uses the coach's explanation when the game keeps it", async () => {
      const user = userEvent.setup();
      await store({
        6: faultMove({
          aiExplanation: {
            concept: 'Mat du berger',
            whyPlayedIsBad: 'Vous laissez filer le mat.',
            whyBestIsBetter: 'La dame prend f7 avec mat.',
            plan: 'Cherchez les mats en un coup.',
          },
        }),
      });
      renderTraining();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      expect(await screen.findByText(/Vous laissez filer le mat\./)).toBeTruthy();
      expect(screen.getByText('La dame prend f7 avec mat.')).toBeTruthy();
      expect(screen.getByText(/Cherchez les mats en un coup\./)).toBeTruthy();
    });
  });

  describe('a session of several positions', () => {
    it('goes from one to the next, and sums up', async () => {
      const user = userEvent.setup();
      await store({ 6: faultMove(), 62: hanging(62) });
      renderTraining();
      await user.click(await screen.findByRole('button', { name: /Commencer \(2 positions\)/ }));
      // The costliest fault (40 points) comes first
      expect(screen.getByText(/Position 1 sur 2 · coup 4/)).toBeTruthy();
      await user.click(cell('h5'));
      await user.click(cell('f7'));
      await user.click(await screen.findByRole('button', { name: 'Position suivante' }));
      expect(screen.getByText(/Position 2 sur 2 · coup 32/)).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      await user.click(await screen.findByRole('button', { name: 'Terminer la séance' }));

      expect(screen.getByText('Séance terminée : 1 réussie sur 2')).toBeTruthy();
      const list = screen.getByRole('list');
      expect(within(list).getAllByRole('listitem')).toHaveLength(2);
      expect(within(list).getByLabelText('Réussie')).toBeTruthy();
      expect(within(list).getByLabelText('Ratée')).toBeTruthy();
    });

    it('goes back to the set-up screen, with the figures up to date', async () => {
      const user = userEvent.setup();
      await store({ 6: faultMove() });
      renderTraining();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      await user.click(await screen.findByRole('button', { name: 'Terminer la séance' }));
      await user.click(screen.getByRole('button', { name: 'Nouvelle séance' }));
      expect(tile('Nouvelles')).toBe('0');
      expect(tile('Plus tard')).toBe('1');
      expect(screen.getByText(/la prochaine position revient demain/)).toBeTruthy();
    });

    it('does not bring back a position that was just missed, in the next session', async () => {
      const user = userEvent.setup();
      await store({ 6: faultMove() });
      renderTraining();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      await user.click(await screen.findByRole('button', { name: 'Terminer la séance' }));
      await user.click(screen.getByRole('button', { name: 'Nouvelle séance' }));
      expect(screen.queryByRole('button', { name: /Commencer/ })).toBeNull();
    });

    it('remembers the progress when it is opened again', async () => {
      const user = userEvent.setup();
      await store({ 6: faultMove() });
      renderTraining();
      await user.click(await screen.findByRole('button', { name: /Commencer/ }));
      await user.click(screen.getByRole('button', { name: 'Voir la solution' }));
      await waitForCards(1);
      document.body.innerHTML = '';
      renderTraining();
      await screen.findByText(/la prochaine position revient demain/);
      expect(tile('Plus tard')).toBe('1');
    });
  });

  it('closes', async () => {
    await store({ 6: faultMove() });
    const { onClose } = renderTraining();
    await userEvent.click(await screen.findByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

async function waitForCards(count: number) {
  await waitFor(async () => expect((await loadCards()).size).toBe(count));
  return loadCards();
}

/** The ids of the positions of the stored games (in the order the training lists them). */
async function findPositionIds(): Promise<string[]> {
  const { listGames } = await import('../../services/gameStore');
  const { collectPositions } = await import('../../utils/trainingPositions');
  return (await collectPositions(await listGames())).map((p) => p.id);
}

async function findPositionId(): Promise<string | undefined> {
  return (await findPositionIds())[0];
}
