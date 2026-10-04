// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../../types/chess';
import { ExportPgn } from './ExportPgn';

const move = (ply: number, over: Partial<MoveAnalysis> = {}): MoveAnalysis =>
  ({
    ply,
    moveNumber: Math.floor(ply / 2) + 1,
    color: ply % 2 === 0 ? 'w' : 'b',
    san: ply % 2 === 0 ? 'e4' : 'e5',
    evalAfter: 30,
    mateAfter: null,
    bestMoveSan: 'e4',
    classification: 'best',
    ...over,
  }) as MoveAnalysis;

const result = (moves: MoveAnalysis[]): GameAnalysisResult => ({
  metadata: { white: 'Alice', black: 'Bob', result: '1-0' },
  moves,
  statsWhite: {} as never,
  statsBlack: {} as never,
  userColor: 'w',
});

const GAME = {
  pgn: '[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 1-0',
  result: result([move(0, { clock: '0:05:00' }), move(1, { classification: 'blunder', bestMoveSan: 'c5' })]),
  depth: 12,
};

describe('ExportPgn', () => {
  it('offers every annotation the game has, and saves the file with them', async () => {
    const download = vi.fn();
    render(<ExportPgn game={GAME} onClose={() => {}} download={download} />);
    for (const name of ['Évaluations', 'Pendules', 'Symboles des coups', 'Commentaires du coach']) {
      expect((screen.getByRole('checkbox', { name }) as HTMLInputElement).checked).toBe(true);
    }
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer le \.pgn/ }));
    expect(download).toHaveBeenCalledTimes(1);
    const [fileName, text, type] = download.mock.calls[0] as [string, string, string];
    expect(fileName).toBe('Alice-vs-Bob.pgn');
    expect(type).toBe('application/x-chess-pgn');
    expect(text).toContain('[%eval 0.30]');
    expect(text).toContain('[%clk 0:05:00]');
    expect(text).toContain('e5??');
    expect(text).toContain('Meilleur coup : c5.');
    expect(screen.getByRole('status').textContent).toContain('Fichier PGN enregistré.');
  });

  it('leaves out what is unticked', async () => {
    const download = vi.fn();
    render(<ExportPgn game={GAME} onClose={() => {}} download={download} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pendules' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Commentaires du coach' }));
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    const text = (download.mock.calls[0] as [string, string])[1];
    expect(text).not.toContain('[%clk');
    expect(text).not.toContain('Meilleur coup');
    expect(text).toContain('[%eval');
  });

  it('disables what the game cannot give', () => {
    const plain = { ...GAME, result: result([move(0), move(1)]) };
    render(<ExportPgn game={plain} onClose={() => {}} />);
    const clocks = screen.getByRole('checkbox', { name: 'Pendules' }) as HTMLInputElement;
    expect(clocks.disabled).toBe(true);
    expect(clocks.checked).toBe(false);
    expect(screen.getByText("Cette partie n'a pas de pendules.")).toBeTruthy();
  });

  it('copies the text, and says so when the browser refuses', async () => {
    const copy = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    render(<ExportPgn game={GAME} onClose={() => {}} copy={copy} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copier le texte' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('PGN copié'));
    expect(copy.mock.calls[0][0]).toContain('[Annotator "Échiquier IA (Stockfish, profondeur 12)"]');
    await userEvent.click(screen.getByRole('button', { name: 'Copier le texte' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('a refusé la copie'));
  });

  it('closes', async () => {
    const onClose = vi.fn();
    render(<ExportPgn game={GAME} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });
});
