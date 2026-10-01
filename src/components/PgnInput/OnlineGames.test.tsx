// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportError, type ImportPage, type ImportedGame, type fetchGamesPage } from '../../services/gameImport';
import { gameId } from '../../services/gameStore';
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

  describe('analysing the latest games in the background', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) => game({ id: `g${i + 1}`, white: 'alice', black: `Opp${i + 1}` }));
    const searchWith = async (count: number, props: Partial<React.ComponentProps<typeof OnlineGames>> = {}) => {
      const onAnalyzeBatch = vi.fn();
      renderGames({ onAnalyzeBatch, ...props }, [{ games: many(count), cursor: null }]);
      await search();
      await screen.findByRole('button', { name: /^Analyser \d+ partie/ });
      return onAnalyzeBatch;
    };

    it('is not offered without a handler', async () => {
      renderGames({}, [{ games: many(3), cursor: null }]);
      await search();
      await screen.findByRole('list');
      expect(screen.queryByRole('button', { name: /^Analyser \d+ partie/ })).toBeNull();
      expect(screen.queryByRole('combobox', { name: 'Analyser les' })).toBeNull();
    });

    it('is not offered before a search', () => {
      renderGames({ onAnalyzeBatch: vi.fn() });
      expect(screen.queryByRole('combobox', { name: 'Analyser les' })).toBeNull();
    });

    it('sends the newest games of the list, ten by default, with the pseudo they were searched with', async () => {
      const onAnalyzeBatch = await searchWith(12);
      await userEvent.click(screen.getByRole('button', { name: 'Analyser 10 parties' }));

      expect(onAnalyzeBatch).toHaveBeenCalledTimes(1);
      const [games, username] = onAnalyzeBatch.mock.calls[0] as [ImportedGame[], string];
      expect(games.map((g) => g.id)).toEqual(Array.from({ length: 10 }, (_, i) => `g${i + 1}`));
      expect(username).toBe('alice');
    });

    it('lets the user choose how many, and remembers it', async () => {
      const onAnalyzeBatch = await searchWith(12);
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Analyser les' }), '5');
      await userEvent.click(screen.getByRole('button', { name: 'Analyser 5 parties' }));
      expect((onAnalyzeBatch.mock.calls[0][0] as ImportedGame[]).map((g) => g.id)).toEqual([
        'g1',
        'g2',
        'g3',
        'g4',
        'g5',
      ]);
      expect(localStorage.getItem('chess_batch_size')).toBe('5');
    });

    it('never asks for more games than the list shows', async () => {
      const onAnalyzeBatch = await searchWith(3);
      await userEvent.click(screen.getByRole('button', { name: 'Analyser 3 parties' }));
      expect((onAnalyzeBatch.mock.calls[0][0] as ImportedGame[]).map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
    });

    it('says "partie" for a single game', async () => {
      await searchWith(1);
      expect(screen.getByRole('button', { name: 'Analyser 1 partie' })).toBeTruthy();
    });

    it('is disabled while a batch runs', async () => {
      const fetchPage = vi.fn<FetchPage>(() => Promise.resolve({ games: many(4), cursor: null }));
      const props = { userPseudo: 'alice', selectedKey: null, onSelect: vi.fn(), onAnalyzeBatch: vi.fn(), fetchPage };
      const { rerender } = render(<OnlineGames {...props} />);
      await search();
      await screen.findByRole('button', { name: 'Analyser 4 parties' });

      rerender(<OnlineGames {...props} isBatchBusy />);
      expect((screen.getByRole('button', { name: 'Analyse en cours…' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('mentions the limits of the history, and that the analysis goes on in the background', async () => {
      await searchWith(5);
      expect(screen.getByText(/« Mes parties » garde vos 500 dernières parties/)).toBeTruthy();
      expect(screen.getByText(/50 plus récentes avec leur analyse complète/)).toBeTruthy();
      expect(screen.getByText(/En arrière-plan, la plus ancienne d'abord/)).toBeTruthy();
    });

    it('offers up to 100 games', async () => {
      await searchWith(3);
      const options = within(screen.getByRole('combobox', { name: 'Analyser les' })).getAllByRole('option');
      expect(options.map((o) => o.textContent)).toEqual(['5', '10', '20', '50', '100']);
    });

    it('tells when the games asked for are more than the list shows and more can be loaded', async () => {
      const onAnalyzeBatch = vi.fn();
      renderGames({ onAnalyzeBatch }, [{ games: many(12), cursor: { source: 'chesscom', months: [], carry: [] } }]);
      await search();
      await screen.findByRole('button', { name: /^Analyser \d+ partie/ });
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Analyser les' }), '50');
      expect(screen.getByText(/Seules les 12 parties affichées sont prises/)).toBeTruthy();
    });

    it('says nothing of the kind when the list is complete or the asked number fits', async () => {
      await searchWith(12);
      expect(screen.queryByText(/Seules les/)).toBeNull();
    });
  });

  describe('the games already analysed', () => {
    const listed = [
      game({ id: 'a', pgn: '1. e4 e5' }),
      game({ id: 'b', pgn: '1. d4 d5' }),
      game({ id: 'c', pgn: '1. c4 c5' }),
    ];
    const known = (...pgns: string[]) => vi.fn(() => Promise.resolve(new Set(pgns.map(gameId))));

    async function searchWithStored(loadAnalyzedIds: () => Promise<ReadonlySet<string>>, props = {}) {
      renderGames({ loadAnalyzedIds, ...props }, [{ games: listed, cursor: null }]);
      await search();
      await screen.findAllByRole('listitem');
    }

    const row = (opponentIndex: number) => screen.getAllByRole('button', { name: /^Charger la partie/ })[opponentIndex];

    it('marks them in the list, and only them', async () => {
      await searchWithStored(known('1. d4 d5'));
      await waitFor(() => expect(row(1).getAttribute('aria-label')).toMatch(/, déjà analysée$/));
      expect(row(0).getAttribute('aria-label')).not.toMatch(/déjà analysée/);
      expect(row(2).getAttribute('aria-label')).not.toMatch(/déjà analysée/);
      expect(within(row(1)).getByText('Analysée')).toBeTruthy();
      expect(within(row(0)).queryByText('Analysée')).toBeNull();
    });

    it('does not read the history before there is a list', () => {
      const loadAnalyzedIds = known('1. d4 d5');
      renderGames({ loadAnalyzedIds });
      expect(loadAnalyzedIds).not.toHaveBeenCalled();
    });

    it('recognises a game whatever the spacing of its PGN', async () => {
      await searchWithStored(known('  1.  d4   d5 '));
      await waitFor(() => expect(within(row(1)).getByText('Analysée')).toBeTruthy());
    });

    it('reads the history again when games were added to it', async () => {
      const loadAnalyzedIds = vi
        .fn<() => Promise<ReadonlySet<string>>>()
        .mockResolvedValueOnce(new Set())
        .mockResolvedValue(new Set([gameId('1. c4 c5')]));
      const fetchPage = vi.fn<FetchPage>(() => Promise.resolve({ games: listed, cursor: null }));
      const props = { userPseudo: 'alice', selectedKey: null, onSelect: vi.fn(), fetchPage, loadAnalyzedIds };
      const { rerender } = render(<OnlineGames {...props} analyzedRevision={0} />);
      await search();
      await screen.findAllByRole('listitem');
      expect(screen.queryByText('Analysée')).toBeNull();

      rerender(<OnlineGames {...props} analyzedRevision={1} />);
      await waitFor(() => expect(within(row(2)).getByText('Analysée')).toBeTruthy());
    });

    it('marks nothing when the history cannot be read', async () => {
      await searchWithStored(() => Promise.resolve(new Set()));
      expect(screen.queryByText('Analysée')).toBeNull();
    });

    it('counts, for the batch, the analysed games among those that would be taken', async () => {
      await searchWithStored(known('1. e4 e5', '1. c4 c5'), { onAnalyzeBatch: vi.fn() });
      expect(await screen.findByText(/2 déjà analysées : elles sont sautées/)).toBeTruthy();
    });

    it('uses the singular for one game', async () => {
      await searchWithStored(known('1. e4 e5'), { onAnalyzeBatch: vi.fn() });
      expect(await screen.findByText(/1 déjà analysée : elle est sautée/)).toBeTruthy();
    });

    it('counts only the games the batch would take', async () => {
      const many = Array.from({ length: 12 }, (_, i) => game({ id: `m${i}`, pgn: `1. a3 a6 ; ${i}` }));
      // The 11th and the 12th are beyond the 10 of the default batch
      const loadAnalyzedIds = known('1. a3 a6 ; 10', '1. a3 a6 ; 11', '1. a3 a6 ; 0');
      renderGames({ loadAnalyzedIds, onAnalyzeBatch: vi.fn() }, [{ games: many, cursor: null }]);
      await search();
      expect(await screen.findByText(/1 déjà analysée : elle est sautée/)).toBeTruthy();
    });

    it('says nothing when none of them is analysed', async () => {
      await searchWithStored(known(), { onAnalyzeBatch: vi.fn() });
      await screen.findByRole('button', { name: 'Analyser 3 parties' });
      expect(screen.queryByText(/déjà analysée/)).toBeNull();
    });
  });
});
