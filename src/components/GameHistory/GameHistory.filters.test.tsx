// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../../types/chess';
import { listGames, saveGame } from '../../services/gameStore';
import { loadNotes } from '../../services/gameNoteStore';
import { GameHistory } from './GameHistory';

/** A game of the player (White, "Alice") against `black`, whose moves each give away `loss` centipawns. */
function result(
  black: string,
  outcome: string,
  opening: string,
  loss: number,
  extra: Partial<GameAnalysisResult['metadata']> = {}
): GameAnalysisResult {
  const move = (ply: number): Partial<MoveAnalysis> => ({
    san: ply % 2 === 0 ? 'e4' : 'e5',
    fenBefore: 'x',
    ply,
    color: ply % 2 === 0 ? 'w' : 'b',
    evalBefore: 0,
    evalAfter: ply % 2 === 0 ? -loss : 0,
    centipawnLoss: ply % 2 === 0 ? loss : 0,
    winPercentLoss: 0,
    classification: 'best',
  });
  return {
    metadata: { white: 'Alice', black, result: outcome, opening, eco: 'B20', ...extra },
    moves: [move(0), move(1), move(2), move(3)] as MoveAnalysis[],
    statsWhite: { accuracy: 1 } as GameAnalysisResult['statsWhite'],
    statsBlack: { accuracy: 1 } as GameAnalysisResult['statsBlack'],
    userColor: 'w',
    userPseudo: 'Alice',
  };
}

const GAMES = [
  { black: 'Boris', outcome: '1-0', opening: 'Sicilian Defense: Najdorf Variation', loss: 0, date: '2026.10.01' },
  { black: 'Carl', outcome: '0-1', opening: 'Italian Game', loss: 400, date: '2026.09.20' },
  { black: 'Dora', outcome: '1/2-1/2', opening: 'Italian Game', loss: 10, date: '2026.08.15' },
];

beforeEach(async () => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  const now = vi.spyOn(Date, 'now');
  for (const [index, game] of GAMES.entries()) {
    now.mockReturnValue(1000 * (index + 1));
    await saveGame({
      pgn: `[Black "${game.black}"]\n\n1. e4 e5 2. Nf3 Nc6 *`,
      depth: 12,
      result: result(game.black, game.outcome, game.opening, game.loss, { date: game.date }),
    });
  }
  vi.restoreAllMocks();
});

const renderHistory = (props: Partial<React.ComponentProps<typeof GameHistory>> = {}) =>
  render(<GameHistory currentPgn="" onOpen={() => {}} onClose={() => {}} {...props} />);

/** The opponents shown, in order (the rows are named "Ouvrir la partie Alice contre X…"). */
const shownOpponents = () =>
  screen
    .queryAllByRole('button', { name: /^Ouvrir la partie/ })
    .map((button) => /contre (\w+)/.exec(button.getAttribute('aria-label') ?? '')?.[1]);

async function openFilters() {
  await userEvent.click(await screen.findByRole('button', { name: /^Filtres/ }));
}

describe('GameHistory search and filters', () => {
  it('shows every game, the latest first, and no count while nothing is filtered', async () => {
    renderHistory();
    await screen.findAllByRole('listitem');
    expect(shownOpponents()).toEqual(['Dora', 'Carl', 'Boris']);
    expect(screen.queryByText(/parties sur/)).toBeNull();
  });

  it('searches as one types, by opponent, opening (in French) or event, and says how many are left', async () => {
    renderHistory();
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Rechercher une partie' }), 'sicilienne');
    expect(shownOpponents()).toEqual(['Boris']);
    expect(screen.getByText('1 partie sur 3')).toBeTruthy();
  });

  it('filters by result from the side of the player', async () => {
    renderHistory();
    await openFilters();
    await userEvent.selectOptions(screen.getByLabelText('Résultat'), 'loss');
    expect(shownOpponents()).toEqual(['Carl']);
    await userEvent.selectOptions(screen.getByLabelText('Résultat'), 'draw');
    expect(shownOpponents()).toEqual(['Dora']);
  });

  it('filters by opening family, opponent, accuracy and period, and combines them', async () => {
    renderHistory();
    await openFilters();
    await userEvent.selectOptions(screen.getByLabelText('Ouverture'), 'Italian Game');
    expect(shownOpponents()).toEqual(['Dora', 'Carl']);
    await userEvent.selectOptions(screen.getByLabelText('Précision'), '90');
    expect(shownOpponents()).toEqual(['Dora']);
    await userEvent.selectOptions(screen.getByLabelText('Précision'), 'all');
    await userEvent.selectOptions(screen.getByLabelText('Adversaire'), 'Carl');
    expect(shownOpponents()).toEqual(['Carl']);
    await userEvent.selectOptions(screen.getByLabelText('Adversaire'), '');
    await userEvent.selectOptions(screen.getByLabelText('Période'), 'custom');
    await userEvent.type(screen.getByLabelText('Du'), '2026-09-01');
    expect(shownOpponents()).toEqual(['Carl']);
  });

  it('counts the active filters on the button and resets them', async () => {
    renderHistory();
    await openFilters();
    await userEvent.selectOptions(screen.getByLabelText('Couleur'), 'b');
    // Alice always has the White pieces here: nothing matches
    expect(shownOpponents()).toEqual([]);
    expect(screen.getByText('Aucune partie ne correspond à cette recherche.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Filtres/ }).textContent).toContain('1 actif');
    await userEvent.click(screen.getByRole('button', { name: 'Afficher toutes les parties' }));
    expect(shownOpponents()).toEqual(['Dora', 'Carl', 'Boris']);
  });

  it('sorts by accuracy, by date of the game and by opponent', async () => {
    renderHistory();
    const sort = await screen.findByLabelText('Trier les parties');
    await userEvent.selectOptions(sort, 'accuracy-desc');
    expect(shownOpponents()).toEqual(['Boris', 'Dora', 'Carl']);
    await userEvent.selectOptions(sort, 'accuracy-asc');
    expect(shownOpponents()).toEqual(['Carl', 'Dora', 'Boris']);
    await userEvent.selectOptions(sort, 'date-asc');
    expect(shownOpponents()).toEqual(['Dora', 'Carl', 'Boris']);
    await userEvent.selectOptions(sort, 'date-desc');
    expect(shownOpponents()).toEqual(['Boris', 'Carl', 'Dora']);
    await userEvent.selectOptions(sort, 'opponent');
    expect(shownOpponents()).toEqual(['Boris', 'Carl', 'Dora']);
  });

  it('keeps the filters out of the confirmation to clear everything, and says so', async () => {
    renderHistory();
    await userEvent.type(await screen.findByRole('searchbox'), 'boris');
    await userEvent.click(screen.getByRole('button', { name: 'Tout effacer' }));
    expect(screen.getByText(/Supprimer les 3 parties \(les filtres ne comptent pas\)/)).toBeTruthy();
  });
});

describe('GameHistory notes and tags', () => {
  const rowOf = async (opponent: string) =>
    (await screen.findByRole('button', { name: new RegExp(`Ouvrir la partie Alice contre ${opponent}`) })).closest(
      'li'
    ) as HTMLElement;

  async function writeNote(opponent: string, text: string, tags: string[]) {
    const row = await rowOf(opponent);
    await userEvent.click(within(row).getByRole('button', { name: /Ajouter une note de la partie/ }));
    if (text) await userEvent.type(within(row).getByLabelText('Note personnelle'), text);
    for (const tag of tags) {
      await userEvent.type(within(row).getByLabelText('Étiquettes'), `${tag}{Enter}`);
    }
    await userEvent.click(within(row).getByRole('button', { name: 'Enregistrer' }));
  }

  it('writes a note and tags, shows them on the row and keeps them in the store', async () => {
    renderHistory();
    await writeNote('Carl', 'Perdu au temps en finale', ['À revoir', 'tournoi']);
    const row = await rowOf('Carl');
    await waitFor(() => expect(within(row).getByText('Perdu au temps en finale')).toBeTruthy());
    expect(within(row).getByText('à revoir')).toBeTruthy();
    expect(within(row).getByText('tournoi')).toBeTruthy();
    // The editor is closed, and the button now says it edits
    expect(within(row).queryByLabelText('Note personnelle')).toBeNull();
    expect(within(row).getByRole('button', { name: /Modifier la note de la partie/ })).toBeTruthy();

    const stored = await loadNotes();
    expect([...stored.values()]).toEqual([
      expect.objectContaining({ note: 'Perdu au temps en finale', tags: ['à revoir', 'tournoi'] }),
    ]);
    // The game itself is untouched: same date of analysis, same order
    expect((await listGames()).map((g) => g.savedAt)).toEqual([3000, 2000, 1000]);
  });

  it('finds the games by their note or their tag, and filters by tag', async () => {
    renderHistory();
    await writeNote('Carl', 'Perdu au temps', ['zeitnot']);
    await writeNote('Boris', '', ['tournoi']);
    await userEvent.type(screen.getByRole('searchbox'), 'temps');
    expect(shownOpponents()).toEqual(['Carl']);
    await userEvent.clear(screen.getByRole('searchbox'));
    await openFilters();
    await userEvent.selectOptions(screen.getByLabelText('Étiquette'), 'tournoi');
    expect(shownOpponents()).toEqual(['Boris']);
  });

  it('offers the tags already used, adds a tag typed but not confirmed, and removes a tag', async () => {
    renderHistory();
    await writeNote('Carl', '', ['finale']);
    const row = await rowOf('Boris');
    await userEvent.click(within(row).getByRole('button', { name: /Ajouter une note de la partie/ }));
    await userEvent.click(within(row).getByRole('button', { name: '+ finale' }));
    expect(within(row).getByRole('button', { name: "Retirer l'étiquette finale" })).toBeTruthy();
    await userEvent.type(within(row).getByLabelText('Étiquettes'), 'bullet');
    await userEvent.click(within(row).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(within(row).getByText('bullet')).toBeTruthy());
    expect(within(row).getByText('finale')).toBeTruthy();

    await userEvent.click(within(row).getByRole('button', { name: /Modifier la note de la partie/ }));
    await userEvent.click(within(row).getByRole('button', { name: "Retirer l'étiquette finale" }));
    await userEvent.click(within(row).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(within(row).queryByText('finale')).toBeNull());
  });

  it('removes the note when everything is emptied', async () => {
    renderHistory();
    await writeNote('Carl', 'à effacer', []);
    const row = await rowOf('Carl');
    await userEvent.click(await within(row).findByRole('button', { name: /Modifier la note de la partie/ }));
    await userEvent.clear(within(row).getByLabelText('Note personnelle'));
    await userEvent.click(within(row).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(within(row).queryByText('à effacer')).toBeNull());
    expect((await loadNotes()).size).toBe(0);
    expect(within(row).getByRole('button', { name: /Ajouter une note de la partie/ })).toBeTruthy();
  });

  it('cancels without saving', async () => {
    renderHistory();
    const row = await rowOf('Carl');
    await userEvent.click(within(row).getByRole('button', { name: /Ajouter une note de la partie/ }));
    await userEvent.type(within(row).getByLabelText('Note personnelle'), 'brouillon');
    await userEvent.click(within(row).getByRole('button', { name: 'Annuler' }));
    expect(within(row).queryByLabelText('Note personnelle')).toBeNull();
    expect((await loadNotes()).size).toBe(0);
  });

  it('empties the note of a game that is deleted', async () => {
    renderHistory();
    await writeNote('Carl', 'à garder un temps', ['x']);
    await screen.findByText('à garder un temps');
    await userEvent.click(screen.getByRole('button', { name: /Supprimer la partie Alice contre Carl/ }));
    await waitFor(() => expect(shownOpponents()).toEqual(['Dora', 'Boris']));
    expect((await loadNotes()).size).toBe(0);
  });
});

describe('GameHistory export', () => {
  it('offers the export of a game kept complete, and hands it over', async () => {
    const onExport = vi.fn();
    renderHistory({ onExport });
    await userEvent.click(await screen.findByRole('button', { name: /Exporter la partie Alice contre Carl/ }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport.mock.calls[0][0]).toMatchObject({ result: { metadata: { black: 'Carl' } } });
  });

  it('has no export without a handler', async () => {
    renderHistory();
    await screen.findAllByRole('listitem');
    expect(screen.queryByRole('button', { name: /Exporter la partie/ })).toBeNull();
  });
});
