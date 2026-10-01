// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../../types/chess';
import { clearGames, saveGame } from '../../services/gameStore';
import { createBackup, serializeBackup } from '../../services/backup';
import { GameHistory } from './GameHistory';

function result(white: string, black: string, extra: Partial<GameAnalysisResult['metadata']> = {}): GameAnalysisResult {
  return {
    metadata: { white, black, result: '1-0', opening: 'Sicilian Defense', eco: 'B20', ...extra },
    // The stored statistics are ignored: they are recomputed from the moves when a game is read
    moves: [
      { san: 'e4', fenBefore: 'start', ply: 0, color: 'w', evalBefore: 0, evalAfter: 0, centipawnLoss: 0 },
      { san: 'e5', fenBefore: 'x', ply: 1, color: 'b', evalBefore: 0, evalAfter: 0, centipawnLoss: 0 },
    ] as MoveAnalysis[],
    statsWhite: { accuracy: 1 } as GameAnalysisResult['statsWhite'],
    statsBlack: { accuracy: 1 } as GameAnalysisResult['statsBlack'],
    userColor: 'w',
    userPseudo: '',
  };
}

const PGN_A = '[White "Anna"]\n\n1. e4 *';
const PGN_B = '[White "Boris"]\n\n1. d4 *';

beforeEach(async () => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  await saveGame({ pgn: PGN_A, depth: 12, result: result('Anna', 'Carl') });
  vi.spyOn(Date, 'now').mockReturnValue(2000);
  await saveGame({ pgn: PGN_B, depth: 18, result: result('Boris', 'Dora') });
  vi.restoreAllMocks();
});

describe('GameHistory with a long history', () => {
  const limits = { full: 1, total: 200 };

  async function saveMany(count: number) {
    const now = vi.spyOn(Date, 'now');
    for (let i = 0; i < count; i++) {
      now.mockReturnValue(10_000 + i);
      await saveGame({ pgn: `[White "P${i}"]\n\n1. e4 *`, depth: 12, result: result(`P${i}`, 'X') }, limits);
    }
  }

  it('marks the older games as light versions that analyse again when opened, and not the recent one', async () => {
    await saveMany(3);
    render(<GameHistory currentPgn="" onOpen={() => {}} onClose={() => {}} />);
    const rows = await screen.findAllByRole('listitem');
    // Newest first: the three games saved here, then the two of the beforeEach
    expect(within(rows[0]).queryByText(/Version allégée/)).toBeNull();
    expect(within(rows[1]).getByText(/Version allégée : l'ouverture relance l'analyse/)).toBeTruthy();
    expect(within(rows[4]).getByText(/Version allégée/)).toBeTruthy();
  });

  it('opens a light version with its PGN, to be analysed again', async () => {
    await saveMany(2);
    const onOpen = vi.fn();
    render(<GameHistory currentPgn="" onOpen={onOpen} onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Ouvrir la partie P0 contre X/ }));
    expect(onOpen.mock.calls[0][0]).toMatchObject({ detail: 'summary', pgn: expect.stringContaining('P0') });
  });

  it('shows the games by steps of 50 and says how many are left', async () => {
    await saveMany(60);
    render(<GameHistory currentPgn="" onOpen={() => {}} onClose={() => {}} />);
    await screen.findAllByRole('listitem');
    // 62 games stored: 50 rows and the button
    expect(screen.getAllByRole('button', { name: /^Ouvrir la partie/ })).toHaveLength(50);
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 12 parties plus anciennes' }));
    expect(screen.getAllByRole('button', { name: /^Ouvrir la partie/ })).toHaveLength(62);
    expect(screen.queryByRole('button', { name: /plus anciennes/ })).toBeNull();
  });

  it('has no button for older games when there are exactly 50', async () => {
    await saveMany(48); // plus the two of the beforeEach
    render(<GameHistory currentPgn="" onOpen={() => {}} onClose={() => {}} />);
    await screen.findAllByRole('listitem');
    expect(screen.getAllByRole('button', { name: /^Ouvrir la partie/ })).toHaveLength(50);
    expect(screen.queryByRole('button', { name: /plus anciennes/ })).toBeNull();
  });

  it('shows everything at once when the history is short', async () => {
    await saveMany(2);
    render(<GameHistory currentPgn="" onOpen={() => {}} onClose={() => {}} />);
    await screen.findAllByRole('listitem');
    expect(screen.queryByRole('button', { name: /plus anciennes/ })).toBeNull();
  });

  it('describes the real limits of the history', async () => {
    render(<GameHistory currentPgn="" onOpen={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/Vos 500 dernières parties analysées/)).toBeTruthy();
    expect(screen.getByText(/Les 50 plus récentes/)).toBeTruthy();
    await screen.findAllByRole('listitem');
  });
});

describe('GameHistory', () => {
  it('lists the stored games, the latest first, with their details', async () => {
    render(<GameHistory currentPgn="" onOpen={() => {}} onClose={() => {}} />);
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(/Boris/)).toBeTruthy();
    expect(within(rows[1]).getByText(/Anna/)).toBeTruthy();
    expect(within(rows[0]).getByText(/\[B20\] Défense sicilienne/)).toBeTruthy();
    expect(within(rows[0]).getByText(/profondeur 18/)).toBeTruthy();
    expect(within(rows[0]).getByText(/précision 100 %/)).toBeTruthy();
  });

  it('opens a game with its stored PGN and depth', async () => {
    const onOpen = vi.fn();
    render(<GameHistory currentPgn="" onOpen={onOpen} onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Ouvrir la partie Anna contre Carl/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0]).toMatchObject({ depth: 12 });
  });

  it('marks the game on screen', async () => {
    render(<GameHistory currentPgn={PGN_B} onOpen={() => {}} onClose={() => {}} />);
    const rows = await screen.findAllByRole('listitem');
    expect(within(rows[0]).getByText('Affichée')).toBeTruthy();
    expect(within(rows[1]).queryByText('Affichée')).toBeNull();
  });

  it('deletes one game, in the list and in the store', async () => {
    render(<GameHistory currentPgn="" onOpen={() => {}} onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer la partie Boris contre Dora/ }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    const { listGames } = await import('../../services/gameStore');
    expect((await listGames()).map((g) => g.result.metadata.white)).toEqual(['Anna']);
  });

  it('asks before clearing everything, and can be cancelled', async () => {
    render(<GameHistory currentPgn="" onOpen={() => {}} onClose={() => {}} />);
    await screen.findAllByRole('listitem');
    await userEvent.click(screen.getByRole('button', { name: 'Tout effacer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Tout effacer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tout supprimer' }));
    expect(await screen.findByText(/Aucune partie enregistrée/)).toBeTruthy();
  });

  it('says so when nothing is stored, and closes', async () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
    const onClose = vi.fn();
    render(<GameHistory currentPgn="" onOpen={() => {}} onClose={onClose} />);
    expect(await screen.findByText(/Aucune partie enregistrée/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('GameHistory backup', () => {
  it('offers the export and the import, also when no game is stored (to restore after a cleared browser)', async () => {
    await clearGames();
    render(<GameHistory currentPgn="" onOpen={() => {}} onClose={() => {}} />);
    await screen.findByText(/Aucune partie enregistrée/);
    expect(screen.getByRole('button', { name: 'Exporter mes données' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Importer une sauvegarde' })).toBeTruthy();
  });

  it('shows the games of a backup as soon as it is restored', async () => {
    const text = serializeBackup(await createBackup());
    await clearGames();
    render(<GameHistory currentPgn="" onOpen={() => {}} onClose={() => {}} />);
    await screen.findByText(/Aucune partie enregistrée/);

    await userEvent.upload(screen.getByLabelText('Fichier de sauvegarde'), new File([text], 'sauvegarde.json'));
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(/Boris/)).toBeTruthy();
  });
});
