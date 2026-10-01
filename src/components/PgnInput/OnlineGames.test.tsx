// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportError, type ImportPage, type ImportedGame, type fetchGamesPage } from '../../services/gameImport';
import { OnlineGames } from './OnlineGames';

function game(over: Partial<ImportedGame> = {}): ImportedGame {
  return {
    id: 'g1',
    source: 'chesscom',
    url: 'https://www.chess.com/game/live/g1',
    pgn: '1. e4 e5 2. Nf3 Nc6',
    white: 'alice',
    black: 'Bob',
    whiteRating: 1500,
    blackRating: 1480,
    playedAt: new Date('2020-03-04T12:00:00Z').getTime(),
    speed: 'blitz',
    timeControl: '5+3',
    rated: true,
    userColor: 'w',
    outcome: 'win',
    plies: 41,
    ...over,
  };
}

type FetchPage = typeof fetchGamesPage;

function renderGames(props: Partial<React.ComponentProps<typeof OnlineGames>> = {}, pages: ImportPage[] = []) {
  const queue = [...pages];
  const fetchPage = vi.fn<FetchPage>(() => Promise.resolve(queue.shift() ?? { games: [], cursor: null }));
  const onSelect = vi.fn();
  render(<OnlineGames userPseudo="alice" selectedKey={null} onSelect={onSelect} fetchPage={fetchPage} {...props} />);
  return { fetchPage, onSelect };
}

const search = () => userEvent.click(screen.getByRole('button', { name: 'Chercher' }));

beforeEach(() => {
  localStorage.clear();
});

describe('OnlineGames', () => {
  it('starts on chess.com with the player’s pseudo', () => {
    renderGames();
    expect(screen.getByRole('button', { name: 'chess.com' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Lichess' }).getAttribute('aria-pressed')).toBe('false');
    expect((screen.getByRole('textbox', { name: 'Pseudo chess.com' }) as HTMLInputElement).value).toBe('alice');
  });

  it('cannot search without a pseudo', async () => {
    renderGames({ userPseudo: '' });
    expect((screen.getByRole('button', { name: 'Chercher' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists the games of the search, from the player’s point of view', async () => {
    const { fetchPage } = renderGames({}, [
      {
        games: [
          game(),
          game({
            id: 'g2',
            userColor: 'b',
            outcome: 'loss',
            white: 'Carl',
            whiteRating: 1700,
            black: 'alice',
            plies: 60,
          }),
        ],
        cursor: null,
      },
    ]);
    await search();

    expect(fetchPage).toHaveBeenCalledWith(
      'chesscom',
      'alice',
      expect.objectContaining({ speed: 'all', cursor: null, signal: expect.any(AbortSignal) })
    );
    const rows = await screen.findAllByRole('button', { name: /^Charger la partie/ });
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Bob (1480)');
    expect(rows[0].textContent).toContain('Victoire');
    expect(rows[0].textContent).toContain('Blitz 5+3 · 21 coups');
    expect(rows[1].textContent).toContain('Carl (1700)');
    expect(rows[1].textContent).toContain('Défaite');
    expect(rows[1].getAttribute('aria-label')).toContain('avec les Noirs');
    expect(screen.getByRole('status').textContent).toBe('2 parties affichées.');
  });

  it('hands the picked game and the pseudo it was found with to the form, and marks it', async () => {
    const picked = game();
    const { onSelect } = renderGames({}, [{ games: [picked], cursor: null }]);
    await search();
    await userEvent.click(await screen.findByRole('button', { name: /^Charger la partie contre Bob/ }));
    expect(onSelect).toHaveBeenCalledWith(picked, 'alice');
    expect(screen.getByRole('status').textContent).toBe("Partie chargée : alice – Bob. Lancez l'analyse.");
  });

  it('marks the game that is loaded in the form', async () => {
    renderGames({ selectedKey: 'chesscom:g1' }, [{ games: [game(), game({ id: 'g2' })], cursor: null }]);
    await search();
    const rows = await screen.findAllByRole('button', { name: /^Charger la partie/ });
    expect(rows.map((row) => row.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('shows the message of a failed import and lets the player try again', async () => {
    const fetchPage = vi
      .fn<FetchPage>()
      .mockRejectedValueOnce(new ImportError('not_found', 'Aucun joueur de ce nom sur chess.com.'));
    renderGames({ fetchPage });
    await search();
    expect((await screen.findByRole('alert')).textContent).toContain('Aucun joueur de ce nom sur chess.com.');

    fetchPage.mockResolvedValueOnce({ games: [game()], cursor: null });
    await search();
    await screen.findByRole('button', { name: /^Charger la partie/ });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when nothing matches', async () => {
    renderGames();
    await search();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Aucune partie trouvée avec ce filtre.'));
  });

  it('keeps a pseudo per site and forgets the list when the site changes', async () => {
    const { fetchPage } = renderGames({}, [{ games: [game()], cursor: null }]);
    await search();
    await screen.findByRole('button', { name: /^Charger la partie/ });

    await userEvent.click(screen.getByRole('button', { name: 'Lichess' }));
    expect(screen.queryByRole('button', { name: /^Charger la partie/ })).toBeNull();
    const lichessField = screen.getByRole('textbox', { name: 'Pseudo Lichess' }) as HTMLInputElement;
    expect(lichessField.value).toBe('alice');
    await userEvent.clear(lichessField);
    await userEvent.type(lichessField, 'DrNyk');
    await search();
    expect(fetchPage).toHaveBeenLastCalledWith('lichess', 'DrNyk', expect.anything());

    await userEvent.click(screen.getByRole('button', { name: 'chess.com' }));
    expect((screen.getByRole('textbox', { name: 'Pseudo chess.com' }) as HTMLInputElement).value).toBe('alice');
    expect(localStorage.getItem('chess_import_user_lichess')).toBe('DrNyk');
    expect(localStorage.getItem('chess_import_source')).toBe('chesscom');
  });

  it('offers the speeds of the site, and falls back to all of them for one it does not have', async () => {
    localStorage.setItem('chess_import_speed', 'classical');
    const { fetchPage } = renderGames();
    const select = screen.getByRole('combobox', { name: 'Cadence' }) as HTMLSelectElement;
    expect(within(select).queryByRole('option', { name: 'Classique' })).toBeNull();
    expect(select.value).toBe('all');

    await userEvent.click(screen.getByRole('button', { name: 'Lichess' }));
    const lichessSelect = screen.getByRole('combobox', { name: 'Cadence' }) as HTMLSelectElement;
    expect(within(lichessSelect).getByRole('option', { name: 'Classique' })).toBeTruthy();
    expect(lichessSelect.value).toBe('classical');
    await search();
    expect(fetchPage).toHaveBeenCalledWith('lichess', 'alice', expect.objectContaining({ speed: 'classical' }));
  });

  it('searches again with the new speed, and remembers it', async () => {
    const { fetchPage } = renderGames();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Cadence' }), 'rapid');
    await search();
    expect(fetchPage).toHaveBeenCalledWith('chesscom', 'alice', expect.objectContaining({ speed: 'rapid' }));
    expect(localStorage.getItem('chess_import_speed')).toBe('rapid');
  });

  it('loads older games with the cursor and does not list a game twice', async () => {
    const cursor = { source: 'lichess', until: 41 } as const;
    const { fetchPage } = renderGames({}, [
      { games: [game({ id: 'a' }), game({ id: 'b' })], cursor },
      { games: [game({ id: 'b' }), game({ id: 'c' })], cursor: null },
    ]);
    await search();
    await userEvent.click(await screen.findByRole('button', { name: 'Voir des parties plus anciennes' }));

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Charger la partie/ })).toHaveLength(3));
    expect(fetchPage).toHaveBeenLastCalledWith('chesscom', 'alice', expect.objectContaining({ cursor }));
    expect(screen.queryByRole('button', { name: 'Voir des parties plus anciennes' })).toBeNull();
  });

  it('stops the search in progress when the player starts another one, and when the form goes away', async () => {
    const signals: AbortSignal[] = [];
    const fetchPage = vi.fn<FetchPage>((_source, _name, options) => {
      signals.push(options!.signal!);
      return new Promise(() => {}); // never answers
    });
    const { unmount } = render(
      <OnlineGames userPseudo="alice" selectedKey={null} onSelect={() => {}} fetchPage={fetchPage} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Chercher' }));
    expect(screen.getByRole('status').textContent).toBe('Recherche des parties de alice sur chess.com…');
    expect((screen.getByRole('button', { name: 'Chercher' }) as HTMLButtonElement).disabled).toBe(true);

    // Enter in the field starts another search: the first one is dropped
    await userEvent.click(screen.getByRole('button', { name: 'Lichess' }));
    expect(signals[0].aborted).toBe(true);
    await userEvent.type(screen.getByRole('textbox', { name: 'Pseudo Lichess' }), '{Enter}');
    expect(signals).toHaveLength(2);
    expect(signals[1].aborted).toBe(false);

    unmount();
    expect(signals[1].aborted).toBe(true);
  });

  it('ignores the answer of a search that was replaced', async () => {
    let answerFirst: (page: ImportPage) => void = () => {};
    const fetchPage = vi
      .fn<FetchPage>()
      .mockImplementationOnce(() => new Promise<ImportPage>((resolve) => (answerFirst = resolve)))
      .mockResolvedValueOnce({ games: [game({ id: 'second', black: 'Second' })], cursor: null });
    renderGames({ fetchPage });
    await search();
    await userEvent.type(screen.getByRole('textbox', { name: 'Pseudo chess.com' }), '2');
    await search();
    await screen.findByRole('button', { name: /contre Second/ });

    await act(async () => answerFirst({ games: [game({ id: 'first', black: 'First' })], cursor: null }));
    expect(screen.queryByRole('button', { name: /contre First/ })).toBeNull();
  });
});
