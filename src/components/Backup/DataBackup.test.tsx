// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_APP, MAX_BACKUP_CHARS } from '../../services/backup';
import { listGames, loadGame, saveGame } from '../../services/gameStore';
import { loadCards, saveCard } from '../../services/trainingStore';
import type { GameAnalysisResult, MoveAnalysis } from '../../types/chess';
import { computePlayerStats } from '../../utils/moveAnalysis';
import { DataBackup, describeRestore } from './DataBackup';

const move = {
  san: 'e4',
  fenBefore: 'start',
  ply: 0,
  color: 'w',
  classification: 'best',
  centipawnLoss: 0,
} as MoveAnalysis;
const result: GameAnalysisResult = {
  metadata: { white: 'Alice', black: 'B' },
  moves: [move],
  statsWhite: computePlayerStats([move]),
  statsBlack: computePlayerStats([]),
  userColor: 'w',
  userPseudo: 'Alice',
};

const freshDatabase = () =>
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });

function renderBackup(props: Partial<React.ComponentProps<typeof DataBackup>> = {}) {
  const handlers = { onRestored: vi.fn(), download: vi.fn(), reload: vi.fn() };
  render(<DataBackup {...handlers} {...props} />);
  return handlers;
}

const fileOf = (text: string, name = 'sauvegarde.json') => new File([text], name, { type: 'application/json' });
const chooseFile = (file: File) => userEvent.upload(screen.getByLabelText('Fichier de sauvegarde'), file);

/** The text of a backup holding one game, one card and a setting. */
async function backupText(): Promise<string> {
  await saveGame({ pgn: '1. e4 *', depth: 14, result });
  await saveCard({ id: 'p1', level: 1, dueAt: 1, lastSeen: 1, attempts: 1, failures: 0 });
  localStorage.setItem('chess_board_theme', 'wood');
  const { download, onRestored } = renderBackup();
  void onRestored;
  await userEvent.click(screen.getByRole('button', { name: 'Exporter mes données' }));
  await screen.findByText(/Sauvegarde exportée/);
  const text = download.mock.calls[0][1] as string;
  localStorage.clear();
  freshDatabase();
  document.body.innerHTML = '';
  return text;
}

beforeEach(() => {
  freshDatabase();
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('DataBackup', () => {
  describe('export', () => {
    it('downloads a file named after the date, with the games, the training and the settings', async () => {
      await saveGame({ pgn: '1. e4 *', depth: 14, result });
      await saveCard({ id: 'p1', level: 1, dueAt: 1, lastSeen: 1, attempts: 1, failures: 0 });
      localStorage.setItem('chess_board_theme', 'wood');
      const { download } = renderBackup();
      await userEvent.click(screen.getByRole('button', { name: 'Exporter mes données' }));

      await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
      const [name, text] = download.mock.calls[0] as [string, string];
      expect(name).toMatch(/^echiquier-ia-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
      const data = JSON.parse(text);
      expect(data).toMatchObject({ app: BACKUP_APP, format: 6, preferences: { chess_board_theme: 'wood' } });
      expect(data.games).toHaveLength(1);
      expect(data.cards).toHaveLength(1);
    });

    it('says what was exported', async () => {
      await saveGame({ pgn: '1. e4 *', depth: 14, result });
      renderBackup();
      await userEvent.click(screen.getByRole('button', { name: 'Exporter mes données' }));
      expect(await screen.findByText("Sauvegarde exportée : 1 partie, 0 position d'entraînement.")).toBeTruthy();
    });

    it('uses the plural', async () => {
      await saveGame({ pgn: '1. e4 *', depth: 14, result });
      await saveGame({ pgn: '1. d4 *', depth: 14, result });
      renderBackup();
      await userEvent.click(screen.getByRole('button', { name: 'Exporter mes données' }));
      expect(await screen.findByText(/2 parties, 0 position/)).toBeTruthy();
    });

    it('works with nothing stored', async () => {
      const { download } = renderBackup();
      await userEvent.click(screen.getByRole('button', { name: 'Exporter mes données' }));
      expect(await screen.findByText(/0 partie, 0 position/)).toBeTruthy();
      expect(download).toHaveBeenCalled();
    });

    it('says when the file could not be made', async () => {
      const download = vi.fn(() => {
        throw new Error('no memory');
      });
      renderBackup({ download });
      await userEvent.click(screen.getByRole('button', { name: 'Exporter mes données' }));
      expect((await screen.findByRole('alert')).textContent).toContain("L'export a échoué");
    });
  });

  describe('import', () => {
    it('restores the games, the training and the settings, and tells the history to read again', async () => {
      const text = await backupText();
      const { onRestored } = renderBackup();
      await chooseFile(fileOf(text));

      await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
      expect((await loadGame('1. e4 *'))?.depth).toBe(14);
      expect((await loadCards()).has('p1')).toBe(true);
      expect(localStorage.getItem('chess_board_theme')).toBe('wood');
      expect(screen.getByRole('status').textContent).toContain('Parties : 1 partie ajoutée.');
    });

    it('offers to reload the page when settings were restored, and only then', async () => {
      const text = await backupText();
      const { reload } = renderBackup();
      await chooseFile(fileOf(text));
      await userEvent.click(await screen.findByRole('button', { name: 'Recharger' }));
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does not offer to reload when no setting was restored', async () => {
      const text = await backupText();
      localStorage.setItem('chess_board_theme', 'blue'); // already chosen in this browser
      renderBackup();
      await chooseFile(fileOf(text));
      await screen.findByText(/Parties : 1 partie ajoutée/);
      expect(screen.queryByRole('button', { name: 'Recharger' })).toBeNull();
      expect(localStorage.getItem('chess_board_theme')).toBe('blue');
    });

    it('refuses a file that is not a backup, with a message, and changes nothing', async () => {
      const { onRestored } = renderBackup();
      await chooseFile(fileOf('{"hello": 1}'));
      expect((await screen.findByRole('alert')).textContent).toContain("n'est pas une sauvegarde d'Échiquier IA");
      expect(onRestored).not.toHaveBeenCalled();
      expect(await listGames()).toEqual([]);
    });

    it('refuses a file that is not JSON', async () => {
      renderBackup();
      await chooseFile(fileOf('not json at all'));
      expect((await screen.findByRole('alert')).textContent).toContain('pas un fichier JSON lisible');
    });

    it('refuses a file that is too large without reading it', async () => {
      renderBackup();
      const file = fileOf('x');
      Object.defineProperty(file, 'size', { value: MAX_BACKUP_CHARS + 1 });
      const read = vi.spyOn(file, 'text');
      await chooseFile(file);
      expect((await screen.findByRole('alert')).textContent).toContain('trop volumineux');
      expect(read).not.toHaveBeenCalled();
    });

    it('says when the file cannot be read', async () => {
      renderBackup();
      const file = fileOf('x');
      vi.spyOn(file, 'text').mockRejectedValue(new Error('disk'));
      await chooseFile(file);
      expect((await screen.findByRole('alert')).textContent).toContain("n'a pas pu être lu");
    });

    it('says when nothing could be written', async () => {
      const text = await backupText();
      Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
      renderBackup();
      await chooseFile(fileOf(text));
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain("Les parties n'ont pas pu être écrites");
      expect(alert.textContent).toContain("La progression d'entraînement n'a pas pu être écrite");
    });

    it('tells a partial success from a failure: the games were written, the training could not be', async () => {
      const text = await backupText();
      const real = new IDBFactory();
      const onlyGames = {
        open: (name: string, version?: number) => {
          if (name.includes('training')) throw new Error('blocked');
          return real.open(name, version);
        },
      };
      Object.defineProperty(globalThis, 'indexedDB', { value: onlyGames, configurable: true, writable: true });
      renderBackup();
      await chooseFile(fileOf(text));
      const status = await screen.findByRole('status');
      expect(status.textContent).toContain('Parties : 1 partie ajoutée.');
      expect(status.textContent).toContain("La progression d'entraînement n'a pas pu être écrite");
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('resets the input, so that choosing the same file again is noticed by the browser', async () => {
      const text = await backupText();
      const { onRestored } = renderBackup();
      await chooseFile(fileOf(text));
      await waitFor(() => expect(onRestored).toHaveBeenCalled());
      expect((screen.getByLabelText('Fichier de sauvegarde') as HTMLInputElement).value).toBe('');
    });

    it('can take the same file twice', async () => {
      const text = await backupText();
      const { onRestored } = renderBackup();
      await chooseFile(fileOf(text));
      await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
      await chooseFile(fileOf(text));
      await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(2));
      expect(await screen.findByText(/Tout était déjà à jour|déjà à jour/)).toBeTruthy();
    });

    it('leaves out the items that are damaged, and says how many', async () => {
      const data = JSON.parse(await backupText());
      data.games.push({ id: 'broken' });
      data.cards.push({ id: 'x' });
      renderBackup();
      await chooseFile(fileOf(JSON.stringify(data)));
      expect(await screen.findByText(/2 éléments illisibles ignorés/)).toBeTruthy();
    });
  });

  it('is not usable twice at once: the buttons wait while a file is being read', async () => {
    renderBackup();
    const file = fileOf('x');
    let finish: (value: string) => void = () => {};
    vi.spyOn(file, 'text').mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    await chooseFile(file);
    expect((screen.getByRole('button', { name: 'Exporter mes données' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Importer une sauvegarde' }) as HTMLButtonElement).disabled).toBe(true);
    finish('nope');
    await screen.findByRole('alert');
    expect((screen.getByRole('button', { name: 'Exporter mes données' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('says plainly that the file is not encrypted', () => {
    renderBackup();
    expect(screen.getByText(/n'est pas chiffré/)).toBeTruthy();
  });
});

describe('describeRestore', () => {
  const none = { games: 0, cards: 0, studies: 0, puzzles: 0 };
  const games = (over = {}) => ({ added: 0, replaced: 0, kept: 0, trimmed: 0, deleted: 0, ...over });
  const cards = (over = {}) => ({ added: 0, replaced: 0, kept: 0, ...over });
  const studies = (over = {}) => ({ added: 0, replaced: 0, kept: 0, deleted: 0, ...over });
  const puzzles = (over = {}) => ({ added: 0, replaced: 0, kept: 0, ...over });
  const report = (over: Partial<Parameters<typeof describeRestore>[0]> = {}) => ({
    games: games(),
    cards: cards(),
    studies: studies(),
    puzzles: puzzles(),
    woodpecker: 'kept' as const,
    puzzleHistory: { added: 0 },
    preferencesApplied: 0,
    ...over,
  });

  it('says that all was up to date when nothing changed and nothing was lost', () => {
    expect(describeRestore(report(), none)).toBe('Tout était déjà à jour : rien à restaurer.');
  });

  it('counts the games added, updated and already up to date, with singular and plural', () => {
    expect(describeRestore(report({ games: games({ added: 1, replaced: 1, kept: 1 }) }), none)).toBe(
      'Parties : 1 partie ajoutée, 1 mise à jour, 1 déjà à jour.'
    );
    expect(describeRestore(report({ games: games({ added: 3, replaced: 2, kept: 5 }) }), none)).toBe(
      'Parties : 3 parties ajoutées, 2 mises à jour, 5 déjà à jour.'
    );
  });

  it('leaves out what is zero', () => {
    expect(describeRestore(report({ games: games({ kept: 4 }) }), none)).toBe('Parties : 4 déjà à jour.');
  });

  it('tells about the old games dropped to stay within the limit', () => {
    expect(describeRestore(report({ games: games({ added: 5, trimmed: 1 }) }), none)).toContain(
      '1 partie ancienne supprimée pour rester dans la limite'
    );
    expect(describeRestore(report({ games: games({ added: 5, trimmed: 2 }) }), none)).toContain(
      '2 parties anciennes supprimées'
    );
  });

  it('counts the training positions restored (added or updated), not the ones that were up to date', () => {
    expect(describeRestore(report({ cards: cards({ added: 2, replaced: 1, kept: 9 }) }), none)).toBe(
      'Entraînement : 3 positions restaurées.'
    );
    expect(describeRestore(report({ cards: cards({ added: 1 }) }), none)).toBe('Entraînement : 1 position restaurée.');
  });

  it('counts the training positions that were updated', () => {
    expect(describeRestore(report({ cards: cards({ replaced: 1 }) }), none)).toBe(
      'Entraînement : 1 position restaurée.'
    );
  });

  it('counts the settings restored and asks for a reload', () => {
    expect(describeRestore(report({ preferencesApplied: 1 }), none)).toBe(
      '1 réglage restauré (rechargez la page pour les appliquer).'
    );
    expect(describeRestore(report({ preferencesApplied: 4 }), none)).toContain('4 réglages restaurés');
  });

  it('counts the studies restored (added or replaced) and the ones deleted on another device', () => {
    expect(describeRestore(report({ studies: studies({ added: 2, replaced: 1, kept: 5 }) }), none)).toBe(
      'Études : 3 études restaurées.'
    );
    expect(describeRestore(report({ studies: studies({ added: 1 }) }), none)).toBe('Études : 1 étude restaurée.');
    expect(describeRestore(report({ studies: studies({ deleted: 2 }) }), none)).toBe(
      '2 études supprimées (supprimées sur un autre appareil).'
    );
    expect(describeRestore(report({ studies: studies({ kept: 3 }) }), none)).toBe(
      'Tout était déjà à jour : rien à restaurer.'
    );
  });

  it('says when the studies could not be written', () => {
    expect(describeRestore(report({ studies: null }), none)).toContain(
      "Les études n'ont pas pu être écrites dans ce navigateur."
    );
  });

  it('tells when the Woodpecker lot came back, and when it could not be written', () => {
    expect(describeRestore(report({ woodpecker: 'added' }), none)).toContain('Woodpecker : lot et cycles restaurés.');
    expect(describeRestore(report({ woodpecker: 'replaced' }), none)).toContain('Woodpecker');
    expect(describeRestore(report({ woodpecker: 'kept' }), none)).not.toContain('Woodpecker');
    expect(describeRestore(report({ woodpecker: null }), none)).toContain(
      "Le lot Woodpecker n'a pas pu être écrit dans ce navigateur."
    );
  });

  it('tells when the history of the puzzles came back, and when it could not be written', () => {
    expect(describeRestore(report({ puzzleHistory: { added: 5 } }), none)).toContain(
      'Historique des puzzles : 5 éléments restaurés.'
    );
    expect(describeRestore(report({ puzzleHistory: { added: 0 } }), none)).not.toContain('Historique');
    expect(describeRestore(report({ puzzleHistory: null }), none)).toContain(
      "L'historique des puzzles n'a pas pu être écrit dans ce navigateur."
    );
  });

  it('counts the missed puzzles restored, and the ones that could not be written', () => {
    expect(describeRestore(report({ puzzles: puzzles({ added: 2, replaced: 1 }) }), none)).toContain(
      'Puzzles ratés : 3 puzzles restaurés.'
    );
    expect(describeRestore(report({ puzzles: null }), none)).toContain(
      "Les puzzles ratés n'ont pas pu être écrits dans ce navigateur."
    );
  });

  it('counts the items that could not be read', () => {
    expect(describeRestore(report(), { games: 1, cards: 0, studies: 0, puzzles: 0 })).toContain(
      '1 élément illisible ignoré.'
    );
    expect(describeRestore(report(), { games: 2, cards: 1, studies: 0, puzzles: 0 })).toContain(
      '3 éléments illisibles ignorés.'
    );
    expect(describeRestore(report(), { games: 0, cards: 0, studies: 2, puzzles: 0 })).toContain(
      '2 éléments illisibles ignorés.'
    );
    expect(describeRestore(report(), { games: 0, cards: 0, studies: 0, puzzles: 1 })).toContain(
      '1 élément illisible ignoré.'
    );
  });

  it('says which part could not be written', () => {
    expect(describeRestore(report({ games: null }), none)).toContain("Les parties n'ont pas pu être écrites");
    expect(describeRestore(report({ cards: null }), none)).toContain(
      "La progression d'entraînement n'a pas pu être écrite"
    );
  });
});
