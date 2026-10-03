// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { Chess } from 'chess.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportError, type ImportedGame, type fetchGamesPage } from '../../services/gameImport';
import { saveGame } from '../../services/gameStore';
import { ensureOpeningBookLoaded } from '../../services/openingBook';
import { game as storedGame, mv } from '../../test/profileFixtures';
import { loadOpeningsFromDisk } from '../../test/openings';
import { Openings } from './Openings';

vi.mock('../../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

const RUY = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'];
const SICILIAN = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4'];
const QUEENS = ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'];

let seq = 0;
/** A game of the searched player, from its moves. */
function played(
  sans: string[],
  { color = 'w', outcome = 'win' }: { color?: 'w' | 'b'; outcome?: ImportedGame['outcome'] } = {}
): ImportedGame {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  const id = `g${++seq}`;
  return {
    id,
    source: 'chesscom',
    url: `https://www.chess.com/game/live/${id}`,
    pgn: chess.pgn(),
    white: color === 'w' ? 'rival' : 'autre',
    black: color === 'w' ? 'autre' : 'rival',
    whiteRating: color === 'w' ? 1850 : 1700,
    blackRating: color === 'w' ? 1700 : 1850,
    playedAt: 1_790_000_000_000 + seq * 3_600_000,
    speed: 'blitz',
    timeControl: '5 min',
    rated: true,
    userColor: color,
    outcome,
    plies: sans.length,
  };
}

const HISTORY = [
  played(RUY),
  played(RUY),
  played(RUY),
  played(SICILIAN, { outcome: 'loss' }),
  played(QUEENS, { color: 'b', outcome: 'draw' }),
];

const pageOf = (games: ImportedGame[]) => vi.fn<typeof fetchGamesPage>(async () => ({ games, cursor: null }));

const renderPrep = (fetchPage = pageOf(HISTORY)) => {
  render(
    <Openings onClose={vi.fn()} onImport={vi.fn()} fetchPage={fetchPage} start={{ view: 'opponent', sans: [] }} />
  );
  return fetchPage;
};

/** Types the pseudo and starts the search. */
async function search(user: ReturnType<typeof userEvent.setup>, pseudo = 'rival') {
  await user.type(screen.getByRole('textbox', { name: /Pseudo de l'adversaire/ }), pseudo);
  await user.click(screen.getByRole('button', { name: 'Préparer' }));
}

const card = (name: string) => screen.findByRole('region', { name });
const table = () => screen.findByRole('table');

beforeAll(async () => {
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
});

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
  seq = 0;
});

describe('Préparer un adversaire', () => {
  it('reads nothing until a pseudo is given and the search is started', async () => {
    const fetchPage = renderPrep();
    expect(screen.getByRole('button', { name: 'Préparer' }).hasAttribute('disabled')).toBe(true);
    await userEvent.setup().type(screen.getByRole('textbox', { name: /Pseudo de l'adversaire/ }), 'rival');
    expect(screen.getByRole('button', { name: 'Préparer' }).hasAttribute('disabled')).toBe(false);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('reads the games of the pseudo with the site, the cadence and the number chosen', async () => {
    const user = userEvent.setup();
    const fetchPage = renderPrep();
    await user.click(screen.getByRole('button', { name: 'Lichess' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Cadence' }), 'blitz');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Nombre de parties à lire' }), '50');
    await search(user, '  rival ');
    await screen.findByText(/5 parties lues/);
    expect(fetchPage).toHaveBeenCalledWith(
      'lichess',
      'rival',
      expect.objectContaining({ speed: 'blitz', limit: 50, cursor: null })
    );
  });

  it('summarises the games: who, how many, rating, speeds', async () => {
    const user = userEvent.setup();
    renderPrep();
    await search(user);
    const summary = await screen.findByText(/5 parties lues/);
    expect(summary.textContent).toContain('classement 1850');
    expect(summary.textContent).toContain('Blitz 5');
    expect(screen.getByRole('heading', { name: /rival sur chess\.com/ })).toBeTruthy();
    // Few games: the tendencies are said to be fragile
    expect(screen.getByText(/Peu de parties lues/)).toBeTruthy();
  });

  it('shows, for each colour, how the opponent starts and which openings they play', async () => {
    const user = userEvent.setup();
    renderPrep();
    await search(user);

    const white = within(await card('Avec les Blancs'));
    expect(white.getByRole('button', { name: "Voir 1.e4 dans l'explorateur" })).toBeTruthy();
    expect(white.getAllByText(/Partie espagnole/).length).toBeGreaterThan(0);
    expect(white.getAllByText(/Défense sicilienne/).length).toBeGreaterThan(0);

    const black = within(await card('Avec les Noirs'));
    expect(black.getByRole('button', { name: "Voir 1.d4 d5 dans l'explorateur" })).toBeTruthy();
    expect(black.getAllByText(/Gambit dame/).length).toBeGreaterThan(0);
  });

  it('points to the favourite line and shows it in the explorer, with the right side', async () => {
    const user = userEvent.setup();
    renderPrep();
    await search(user);
    const white = within(await card('Avec les Blancs'));
    expect(white.getByText(/Sa ligne favorite/).parentElement?.textContent).toContain('1.e4 e5 2.Cf3 Cc6 3.Fb5 a6');

    await user.click(white.getByRole('button', { name: "Voir sa ligne favorite avec les Blancs dans l'explorateur" }));
    const line = await screen.findByRole('list', { name: 'Coups joués' });
    expect(within(line).getAllByRole('button')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Il joue les Blancs' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('counts the opponent’s moves in the explorer, the most played first, with their share', async () => {
    const user = userEvent.setup();
    renderPrep();
    await search(user);
    const rows = within(await table()).getAllByRole('row');
    // Header, then 1.e4 first: the 4 games with White, against the 1.d4 that White played in the game with Black
    const first = within(rows[1]);
    expect(first.getByRole('button', { name: '1.e4' })).toBeTruthy();
    expect(first.getByText('80 %')).toBeTruthy();
    expect(first.getByText('4 parties : 3 gagnées, 0 nulle, 1 perdue')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Parties de rival' })).toBeTruthy();
  });

  it('limits the explorer to the games with one colour', async () => {
    const user = userEvent.setup();
    renderPrep();
    await search(user);
    await table();
    await user.click(screen.getByRole('button', { name: 'Il joue les Noirs' }));
    const rows = within(await table()).getAllByRole('row');
    expect(within(rows[1]).getByRole('button', { name: '1.d4' })).toBeTruthy();
    expect(within(rows[1]).getByText('100 %')).toBeTruthy();
  });

  it('puts the player’s own results next to the opponent’s, from the other side', async () => {
    // The player (White) lost after 1.e4 e5
    const own = storedGame({
      id: 'mine',
      moves: ['e4', 'e5'].map((san, ply) => mv(ply, { san })),
      meta: { result: '0-1' },
    });
    await saveGame({ pgn: '1. e4 e5 *\n; mine', depth: 12, result: own.result });
    const user = userEvent.setup();
    renderPrep();
    await search(user);
    await table();

    // The opponent has White: the player has Black, and the game as White does not count
    await user.click(screen.getByRole('button', { name: 'Il joue les Blancs' }));
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Mes parties' })).toBeTruthy());
    const whiteRows = within(await table()).getAllByRole('row');
    expect(whiteRows.some((row) => within(row).queryByText(/1 partie : 0 gagnée, 0 nulle, 1 perdue/))).toBe(false);

    // The opponent has Black: the player's game as White is the one counted, on the move it went through
    await user.click(screen.getByRole('button', { name: 'Il joue les Noirs' }));
    const rows = within(await table()).getAllByRole('row');
    const e4 = rows.find((row) => within(row).queryByRole('button', { name: '1.e4' }))!;
    expect(within(e4).getByText('1 partie : 0 gagnée, 0 nulle, 1 perdue')).toBeTruthy();
    const d4 = rows.find((row) => within(row).queryByRole('button', { name: '1.d4' }))!;
    // Nothing of the player's own on 1.d4: the last cell is empty
    expect(within(d4).getAllByRole('cell').at(-1)?.textContent).toBe('—');
  });

  it('tells when the search fails', async () => {
    const user = userEvent.setup();
    renderPrep(
      vi
        .fn<typeof fetchGamesPage>()
        .mockRejectedValue(new ImportError('not_found', 'Aucun joueur de ce nom sur chess.com.'))
    );
    await search(user, 'inconnu');
    expect((await screen.findByRole('alert')).textContent).toContain('Aucun joueur de ce nom');
    expect(screen.queryByRole('region', { name: 'Avec les Blancs' })).toBeNull();
  });

  it('says so when no game was found', async () => {
    const user = userEvent.setup();
    renderPrep(pageOf([]));
    await search(user);
    expect(await screen.findByText('Aucune partie trouvée avec ce filtre.')).toBeTruthy();
  });

  it('can be cancelled while the games are being read', async () => {
    const user = userEvent.setup();
    const never = vi.fn<typeof fetchGamesPage>(() => new Promise(() => {}));
    renderPrep(never);
    await search(user);
    expect((await screen.findByRole('status')).textContent).toContain('Lecture des parties de rival sur chess.com');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Préparer' }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps the games read when the player looks at another view and comes back', async () => {
    const user = userEvent.setup();
    renderPrep();
    await search(user);
    await card('Avec les Blancs');

    await user.click(screen.getByRole('button', { name: 'Explorateur' }));
    expect(screen.queryByRole('region', { name: 'Avec les Blancs' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Préparer un adversaire' }));
    expect(await card('Avec les Blancs')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /Pseudo de l'adversaire/ })).toHaveProperty('value', 'rival');
  });
});
