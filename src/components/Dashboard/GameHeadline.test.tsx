// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GameAnalysisResult, MoveAnalysis, PlayerStats } from '../../types/chess';
import { computePhaseStats } from '../../utils/phaseStats';
import { GameHeadline } from './GameHeadline';

vi.mock('../../services/gameStore', () => ({ gameId: () => 'current', listGames: () => Promise.resolve([]) }));

const moves = Array.from({ length: 12 }, (_, ply) => ({
  ply,
  moveNumber: Math.floor(ply / 2) + 1,
  color: ply % 2 === 0 ? 'w' : 'b',
  san: 'e4',
  evalBefore: 0,
  evalAfter: 0,
  mateBefore: null,
  mateAfter: null,
  winPercentLoss: 0,
  classification: 'good',
})) as MoveAnalysis[];

const analysis: GameAnalysisResult = {
  metadata: { white: 'Alice', black: 'Bob' },
  moves,
  statsWhite: { accuracy: 80 } as PlayerStats,
  statsBlack: { accuracy: 80 } as PlayerStats,
};

describe('GameHeadline', () => {
  it('shows the lines of the summary for a known player', () => {
    render(<GameHeadline analysis={analysis} pgn="1. e4" userPseudo="Alice" phaseStats={computePhaseStats(moves)} />);
    const list = screen.getByRole('region', { name: 'Résumé de la partie' });
    expect(list.querySelectorAll('li')).toHaveLength(3);
    expect(list.textContent).toContain('Précision de 80 %.');
  });

  it('only gives the decisive moment when the player is not named', () => {
    render(<GameHeadline analysis={analysis} userPseudo="" phaseStats={computePhaseStats(moves)} />);
    expect(screen.getByRole('region', { name: 'Résumé de la partie' }).querySelectorAll('li')).toHaveLength(1);
  });
});
