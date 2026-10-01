// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../../types/chess';
import { saveGame } from '../../services/gameStore';
import { GameHistory } from './GameHistory';

function result(white: string, black: string, extra: Partial<GameAnalysisResult['metadata']> = {}): GameAnalysisResult {
  return {
    metadata: { white, black, result: '1-0', opening: 'Sicilian Defense', eco: 'B20', ...extra },
    moves: [{ san: 'e4', fenBefore: 'start', ply: 0 } as MoveAnalysis],
    statsWhite: { accuracy: 91.4 } as GameAnalysisResult['statsWhite'],
    statsBlack: { accuracy: 72 } as GameAnalysisResult['statsBlack'],
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

describe('GameHistory', () => {
  it('lists the stored games, the latest first, with their details', async () => {
    render(<GameHistory currentPgn="" onOpen={() => {}} onClose={() => {}} />);
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(/Boris/)).toBeTruthy();
    expect(within(rows[1]).getByText(/Anna/)).toBeTruthy();
    expect(within(rows[0]).getByText(/\[B20\] Sicilian Defense/)).toBeTruthy();
    expect(within(rows[0]).getByText(/profondeur 18/)).toBeTruthy();
    expect(within(rows[0]).getByText(/précision 91 %/)).toBeTruthy();
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
