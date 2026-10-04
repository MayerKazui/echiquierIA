// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../../types/chess';
import { saveNote } from '../../services/gameNoteStore';
import { listGames, saveGame } from '../../services/gameStore';
import { exportPlayedGames, listPlayedGames, savePlayedGame } from '../../services/playedGameStore';
import { makeNote } from '../../utils/gameNotes';
import { makePlayedGame, type PlayedGame } from '../../utils/playedGames';
import { STANDARD_START_FEN, replay } from '../../utils/playGame';
import { GameHistory } from './GameHistory';

const played = (at: number, moves: string[], over: Partial<Parameters<typeof makePlayedGame>[0]> = {}): PlayedGame => {
  const { moves: played } = replay(over.startFen ?? STANDARD_START_FEN, moves);
  return makePlayedGame({
    startFen: STANDARD_START_FEN,
    prefix: [],
    label: 'Partie complète',
    moves: played,
    outcome: { kind: 'resigned', winner: 'b' },
    color: 'w',
    level: { id: 'club', label: 'Club', elo: 1600 },
    userName: 'Alice',
    hints: 0,
    evals: 0,
    now: at,
    ...over,
  });
};

const E4 = played(3000, ['e2e4', 'e7e5']);
const TIMED = played(2500, ['e2e4', 'e7e5'], {
  timeControl: { baseSeconds: 300, incrementSeconds: 3 },
  clocks: [299_000, 300_000],
});
const D4 = played(2000, ['d2d4', 'd7d5'], { level: { id: 'maitre', label: 'Maître', elo: 2600 }, hints: 2, evals: 1 });
const CUSTOM_FEN = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
const CUSTOM = played(1500, ['e2e4', 'e8d8'], { startFen: CUSTOM_FEN, prefix: undefined, label: 'Position choisie' });

function analysed(pgn: string, white: string, black: string): GameAnalysisResult {
  return {
    metadata: { white, black, result: '0-1', opening: 'King’s Pawn Game', eco: 'C20' },
    moves: [
      { san: 'e4', fenBefore: 'start', ply: 0, color: 'w', evalBefore: 0, evalAfter: 0, centipawnLoss: 0 },
      { san: 'e5', fenBefore: 'x', ply: 1, color: 'b', evalBefore: 0, evalAfter: 0, centipawnLoss: 0 },
    ] as MoveAnalysis[],
    statsWhite: { accuracy: 1 } as GameAnalysisResult['statsWhite'],
    statsBlack: { accuracy: 1 } as GameAnalysisResult['statsBlack'],
    userColor: 'w',
    userPseudo: pgn ? 'Alice' : '',
  };
}

const rows = () => screen.findAllByRole('listitem');

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
});

async function renderHistory(props: Partial<React.ComponentProps<typeof GameHistory>> = {}) {
  const handlers = { onOpen: vi.fn(), onAnalyzePlayed: vi.fn(), onClose: vi.fn() };
  render(<GameHistory currentPgn="" {...handlers} {...props} />);
  return handlers;
}

describe('GameHistory with games played against the engine', () => {
  it('lists them with their label, level and help asked for, newest first', async () => {
    await savePlayedGame(D4);
    await savePlayedGame(E4);
    await renderHistory();
    const [first, second] = await rows();
    expect(within(first).getByText('Contre Stockfish · Club')).toBeTruthy();
    expect(within(first).getByText(/Alice/)).toBeTruthy();
    expect(within(first).getByText('0-1')).toBeTruthy();
    expect(within(first).getByText(/Pas encore analysée/)).toBeTruthy();
    expect(within(first).getByText(/Partie complète/)).toBeTruthy();
    expect(within(second).getByText('Contre Stockfish · Maître')).toBeTruthy();
    expect(within(second).getByText(/avec 2 indices et 1 évaluation/)).toBeTruthy();
    expect(within(second).getByText(/2 demi-coups/)).toBeTruthy();
  });

  it('tells the time control of a game that had a clock', async () => {
    await savePlayedGame(TIMED);
    await renderHistory();
    const [row] = await rows();
    expect(within(row).getByText(/pendule 5 min \+ 3 s/)).toBeTruthy();
  });

  it('mixes them with the analysed games by date', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2500);
    await saveGame({ pgn: '[White "Anna"]\n\n1. a3 *', depth: 12, result: analysed('', 'Anna', 'Carl') });
    vi.restoreAllMocks();
    await savePlayedGame(D4);
    await savePlayedGame(E4);
    await renderHistory();
    const list = await rows();
    expect(list).toHaveLength(3);
    expect(within(list[0]).getByText('Contre Stockfish · Club')).toBeTruthy();
    expect(within(list[1]).getByText(/Anna/)).toBeTruthy();
    expect(within(list[1]).queryByText(/Contre Stockfish/)).toBeNull();
    expect(within(list[2]).getByText('Contre Stockfish · Maître')).toBeTruthy();
  });

  it('opens one that was not analysed by asking for its analysis, not as an analysed game', async () => {
    await savePlayedGame(E4);
    const { onOpen, onAnalyzePlayed } = await renderHistory();
    await userEvent.click(
      await screen.findByRole('button', { name: /Ouvrir la partie Alice contre Stockfish \(Club\)/ })
    );
    expect(onAnalyzePlayed).toHaveBeenCalledWith(E4.pgn);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows a game once when it has been analysed, with its label, and opens the analysis', async () => {
    await savePlayedGame(E4);
    await saveGame({ pgn: E4.pgn, depth: 14, result: analysed(E4.pgn, 'Alice', 'Stockfish (Club)') });
    const { onOpen, onAnalyzePlayed } = await renderHistory();
    const list = await rows();
    expect(list).toHaveLength(1);
    expect(within(list[0]).getByText('Contre Stockfish · Club')).toBeTruthy();
    expect(within(list[0]).getByText(/profondeur 14/)).toBeTruthy();
    expect(within(list[0]).queryByText(/Pas encore analysée/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Ouvrir la partie/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onAnalyzePlayed).not.toHaveBeenCalled();
  });

  it('offers no analysis for a game that began on a position of its own, but its moves and the PGN to copy', async () => {
    await savePlayedGame(CUSTOM);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await renderHistory();
    const [row] = await rows();
    expect(within(row).queryByRole('button', { name: /Ouvrir la partie/ })).toBeNull();
    expect(within(row).getByText(/ne peut pas être analysée/)).toBeTruthy();
    expect(within(row).getByText('1.e4 1…Rd8')).toBeTruthy();
    expect(within(row).getByText('Position choisie')).toBeTruthy();
    await userEvent.click(within(row).getByRole('button', { name: /Copier le PGN/ }));
    expect(writeText).toHaveBeenCalledWith(CUSTOM.pgn);
    expect(await screen.findByText('PGN copié')).toBeTruthy();
  });

  it('offers to copy the PGN of a game that was not analysed, but not the annotated export', async () => {
    await savePlayedGame(E4);
    await renderHistory();
    await rows();
    expect(screen.getByRole('button', { name: /Copier le PGN/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Exporter la partie/ })).toBeNull();
  });

  it('offers the annotated export, and no copy, once the game is analysed', async () => {
    await savePlayedGame(E4);
    await saveGame({ pgn: E4.pgn, depth: 14, result: analysed(E4.pgn, 'Alice', 'Stockfish (Club)') });
    await renderHistory({ onExport: vi.fn() });
    await rows();
    expect(screen.getByRole('button', { name: /Exporter la partie/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Copier le PGN/ })).toBeNull();
  });

  it('deletes a game that was not analysed, in the list and in the store (with a tombstone)', async () => {
    await savePlayedGame(E4);
    await savePlayedGame(D4);
    await renderHistory();
    await userEvent.click(
      await screen.findByRole('button', { name: /Supprimer la partie Alice contre Stockfish \(Club\)/ })
    );
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect((await listPlayedGames()).map((g) => g.id)).toEqual([D4.id]);
    expect((await exportPlayedGames()).some((r) => r.id === E4.id && 'deleted' in r)).toBe(true);
  });

  it('deletes an analysed game and the record it comes from, so that it does not come back', async () => {
    await savePlayedGame(E4);
    await saveGame({ pgn: E4.pgn, depth: 14, result: analysed(E4.pgn, 'Alice', 'Stockfish (Club)') });
    await renderHistory();
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer la partie/ }));
    expect(await screen.findByText(/Aucune partie enregistrée/)).toBeTruthy();
    expect(await listGames()).toEqual([]);
    expect(await listPlayedGames()).toEqual([]);
  });

  it('clears everything, the games against the engine included', async () => {
    await savePlayedGame(E4);
    await savePlayedGame(D4);
    await renderHistory();
    await rows();
    await userEvent.click(screen.getByRole('button', { name: 'Tout effacer' }));
    expect(screen.getByText(/Supprimer les 2 parties/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Tout supprimer' }));
    expect(await screen.findByText(/Aucune partie enregistrée/)).toBeTruthy();
    expect(await listPlayedGames()).toEqual([]);
  });

  it('carries the tags and notes of the player, found by the search and the tag filter', async () => {
    await savePlayedGame(E4);
    await savePlayedGame(D4);
    await saveNote(makeNote(E4.id, 'trop vite au 10e coup', ['à revoir'], 5));
    await renderHistory();
    const [first] = await rows();
    expect(within(first).getByText('à revoir')).toBeTruthy();
    expect(within(first).getByText(/trop vite/)).toBeTruthy();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher une partie' }), 'trop vite');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
  });

  it('is found by the search on the engine and its level', async () => {
    await savePlayedGame(E4);
    await savePlayedGame(D4);
    await renderHistory();
    await rows();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher une partie' }), 'maître');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(within(screen.getByRole('listitem')).getByText('Contre Stockfish · Maître')).toBeTruthy();
  });

  it('filters on where the games come from, the filter being offered only when there are games against the engine', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2500);
    await saveGame({ pgn: '[White "Anna"]\n\n1. a3 *', depth: 12, result: analysed('', 'Anna', 'Carl') });
    vi.restoreAllMocks();
    await renderHistory();
    await rows();
    await userEvent.click(screen.getByRole('button', { name: /Filtres/ }));
    expect(screen.queryByLabelText('Origine')).toBeNull();
  });

  it('filters on the origin of the games', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2500);
    await saveGame({ pgn: '[White "Anna"]\n\n1. a3 *', depth: 12, result: analysed('', 'Anna', 'Carl') });
    vi.restoreAllMocks();
    await savePlayedGame(E4);
    await renderHistory();
    expect(await rows()).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: /Filtres/ }));
    await userEvent.selectOptions(screen.getByLabelText('Origine'), 'Contre Stockfish');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(within(screen.getByRole('listitem')).getByText('Contre Stockfish · Club')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Origine'), 'Autres parties');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(within(screen.getByRole('listitem')).getByText(/Anna/)).toBeTruthy();
  });

  it('comes back with the games of a backup that holds some', async () => {
    await savePlayedGame(E4);
    const { createBackup, serializeBackup } = await import('../../services/backup');
    const text = serializeBackup(await createBackup());
    Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
    await renderHistory();
    await screen.findByText(/Aucune partie enregistrée/);
    await userEvent.upload(screen.getByLabelText('Fichier de sauvegarde'), new File([text], 'sauvegarde.json'));
    const list = await rows();
    expect(list).toHaveLength(1);
    expect(within(list[0]).getByText('Contre Stockfish · Club')).toBeTruthy();
  });
});
