// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VISION_GAMES } from '../../data/visionGames';
import * as gameStore from '../../services/gameStore';
import { recordVisionRun } from '../../services/visionStore';
import { seeded } from '../../test/seeded';
import { Vision } from './Vision';
import { SourcePicker, gamesFor, type GameSource } from './shared';

vi.mock('../../services/gameStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/gameStore')>()),
  listGames: vi.fn(),
}));

const listGames = vi.mocked(gameStore.listGames);
const pieceCount = () => document.querySelectorAll('[role="gridcell"] svg[viewBox="0 0 45 45"]').length;

/** A stored game with only what the exercises read: its moves and who played them. */
function storedGame(id: string, white: string, moves: string[], date = '2026.10.02') {
  return {
    id,
    result: { metadata: { white, black: 'Adversaire', date }, moves: moves.map((san) => ({ san })) },
  } as unknown as gameStore.StoredGame;
}

// Only a short game of its own: the reserve has none of these players
const OWN_MOVES = VISION_GAMES[0].moves.slice(0, 14);

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
  listGames.mockReset();
  listGames.mockResolvedValue([storedGame('mine', 'Moi-même', OWN_MOVES)]);
});

describe('the games read, famous or the player’s own', () => {
  it('reads the famous games unless asked, and does not read the history for that', async () => {
    const user = userEvent.setup();
    render(<Vision onClose={() => {}} initialMode="blind" random={seeded(5)} />);
    expect((screen.getByRole('radio', { name: 'Parties célèbres' }) as HTMLInputElement).checked).toBe(true);
    expect(listGames).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: /^Commencer : Courte/ }));
    await user.click(screen.getByRole('button', { name: 'Coup suivant' }));
    expect(screen.getByText(/Coup 2 sur 6/)).toBeTruthy();
  });

  it('reads a game of the player’s history in the blind mode, and names it after the round', async () => {
    const user = userEvent.setup();
    render(<Vision onClose={() => {}} initialMode="blind" random={seeded(5)} />);
    await user.click(screen.getByRole('radio', { name: 'Mes parties analysées' }));
    expect(await screen.findByText(/1 partie dans votre historique/)).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: /^Commencer : Courte/ }));
    for (let i = 0; i < 5; i++) await user.click(screen.getByRole('button', { name: 'Coup suivant' }));
    await user.click(screen.getByRole('button', { name: 'Terminé : poser les questions' }));
    expect(pieceCount()).toBe(0);
    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByRole('button', { name: 'Case vide' }));
      await user.click(screen.getByRole('button', { name: i < 4 ? 'Question suivante' : 'Voir le résultat' }));
    }
    expect(
      await screen.findByText(/Partie lue : Moi-même – Adversaire, 2026-10-02 \(une de vos parties\)/)
    ).toBeTruthy();
  });

  it('asks about a stretch of the player’s game in the lines exercise', async () => {
    const user = userEvent.setup();
    render(<Vision onClose={() => {}} initialMode="lines" random={seeded(5)} />);
    await user.click(screen.getByRole('radio', { name: 'Mes parties analysées' }));
    await user.click(await screen.findByRole('button', { name: /^Commencer : Courtes/ }));
    expect(screen.getByText(/Question 1 sur/)).toBeTruthy();
    // Rounds made of one game of 14 half-moves still hold several different stretches
    expect(screen.getByRole('grid', { name: 'Position au début de la ligne' })).toBeTruthy();
  });

  it('waits for the history before letting a round start', async () => {
    let release: (games: gameStore.StoredGame[]) => void = () => {};
    listGames.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const user = userEvent.setup();
    render(<Vision onClose={() => {}} initialMode="blind" />);
    await user.click(screen.getByRole('radio', { name: 'Mes parties analysées' }));
    expect(screen.getByText('Lecture de votre historique…')).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Commencer : Courte/ }) as HTMLButtonElement).disabled).toBe(true);
    release([storedGame('mine', 'Moi', OWN_MOVES)]);
    await waitFor(() =>
      expect((screen.getByRole('button', { name: /^Commencer : Courte/ }) as HTMLButtonElement).disabled).toBe(false)
    );
  });

  it('falls back on the famous games, and says so, when the player has none that are long enough', async () => {
    listGames.mockResolvedValue([storedGame('tiny', 'Moi', ['e4', 'e5'])]);
    const user = userEvent.setup();
    render(<Vision onClose={() => {}} initialMode="blind" random={seeded(5)} />);
    await user.click(screen.getByRole('radio', { name: 'Mes parties analysées' }));
    await user.click(await screen.findByRole('button', { name: /^Commencer : Courte/ }));
    expect(screen.getByText(/Coup 1 sur 6/)).toBeTruthy(); // a round was made anyway
    await user.click(screen.getByRole('button', { name: 'Coup suivant' }));
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('says there is nothing to read when the history is empty, and remembers the choice for the next visit', async () => {
    listGames.mockResolvedValue([]);
    const user = userEvent.setup();
    const { unmount } = render(<Vision onClose={() => {}} initialMode="blind" />);
    await user.click(screen.getByRole('radio', { name: 'Mes parties analysées' }));
    expect(await screen.findByText(/Aucune partie analysée dans ce navigateur/)).toBeTruthy();
    unmount();
    render(<Vision onClose={() => {}} initialMode="lines" />);
    expect((screen.getByRole('radio', { name: 'Mes parties analysées' }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('the choice of the games', () => {
  const source = (id: 'reserve' | 'own', games: { id: string; moves: string[] }[] | null): GameSource => ({
    id,
    onChange: () => {},
    own: games === null ? { status: 'loading' } : { status: 'ready', games },
  });

  it('uses the player’s games when there are enough, the reserve otherwise, and says which', () => {
    const own = [{ id: 'mine', moves: OWN_MOVES }];
    expect(gamesFor(source('reserve', own), 6, seeded(1))).toEqual({ games: VISION_GAMES, isFallback: false });
    expect(gamesFor(source('own', own), 6, seeded(1)).games.map((g) => g.id)).toEqual(['own:mine']);
    expect(gamesFor(source('own', own), 20, seeded(1))).toEqual({ games: VISION_GAMES, isFallback: true });
    expect(gamesFor(source('own', []), 6, seeded(1))).toEqual({ games: VISION_GAMES, isFallback: true });
    // Not read yet: nothing to draw from, and nothing to blame the player for
    expect(gamesFor(source('own', null), 6, seeded(1))).toEqual({ games: VISION_GAMES, isFallback: false });
  });

  it('tells the player the reserve is read when their games are too short for the level', () => {
    render(<SourcePicker source={source('own', [{ id: 'a', moves: ['e4'] }])} isFallback />);
    expect(screen.getByText(/Pas assez de parties assez longues pour ce niveau/)).toBeTruthy();
  });
});

describe('Progression', () => {
  it('says there is nothing yet, then draws a curve with the record and the trend', async () => {
    const user = userEvent.setup();
    render(<Vision onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Progression' }));
    expect(await screen.findByText(/Rien à montrer pour l’instant/)).toBeTruthy();
  });

  it('draws the rounds of each level played', async () => {
    const scores = [10, 12, 9, 15, 14, 18, 20, 17];
    for (const [i, score] of scores.entries())
      await recordVisionRun('coordinates:white', score, 1_700_000_000_000 + i * 86_400_000);
    await recordVisionRun('game:club', 2, 1_700_000_000_000);
    await recordVisionRun('blind:short', 3, 1_700_000_000_000);
    await recordVisionRun('blind:short', 4, 1_700_100_000_000);

    const user = userEvent.setup();
    render(<Vision onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Progression' }));
    const cards = await screen.findAllByRole('listitem');
    expect(cards).toHaveLength(3);

    const coordinates = cards.find((card) => within(card).queryByText('Coordonnées · Côté des Blancs'))!;
    expect(within(coordinates).getByText('Record : 20 · 8 parties')).toBeTruthy();
    expect(within(coordinates).getByRole('img', { name: /8 parties, de 10 le .* à 17 le .*Record : 20/ })).toBeTruthy();
    // The last five (15, 14, 18, 20, 17) average 16.8; the three before them are too few to compare
    expect(within(coordinates).getByText(/Moyenne des 5 dernières parties : 16,8\./)).toBeTruthy();

    const blind = cards.find((card) => within(card).queryByText('Mode aveugle · Courte'))!;
    expect(within(blind).getByRole('img', { name: /2 parties/ })).toBeTruthy();
    expect(within(blind).queryByText(/Moyenne/)).toBeNull();

    // One round only: no curve yet, and a game is told as a result
    const game = cards.find((card) => within(card).queryByText('Partie à l’aveugle · Club'))!;
    expect(within(game).getByText('Record : Victoire · 1 partie')).toBeTruthy();
    expect(within(game).queryByRole('img')).toBeNull();
    expect(within(game).getByText('La courbe apparaît à la deuxième série.')).toBeTruthy();
  });

  it('compares the latest rounds with the ones before them', async () => {
    const scores = [10, 10, 10, 10, 10, 14, 14, 14, 14, 14];
    for (const [i, score] of scores.entries())
      await recordVisionRun('lines:short', Math.min(5, score - 9), 1_700_000_000_000 + i * 1000);
    const user = userEvent.setup();
    render(<Vision onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Progression' }));
    expect(
      await screen.findByText(/Moyenne des 5 dernières parties : 5 sur 5, contre 1 pour les 5 d’avant \(en progrès\)/)
    ).toBeTruthy();
  });

  it('says a record made before the curves existed has no rounds yet', async () => {
    const { mergeVisionRecords } = await import('../../services/visionStore');
    await mergeVisionRecords([{ key: 'lines:long', best: 3, bestAt: 5, runs: 4 }]);
    const user = userEvent.setup();
    render(<Vision onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Progression' }));
    expect(await screen.findByText(/Les séries jouées avant la courbe n’y sont pas/)).toBeTruthy();
    expect(screen.getByText('Record : 3/5 · 4 parties')).toBeTruthy();
  });
});
