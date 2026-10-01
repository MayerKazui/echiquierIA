// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MoveAnalysis } from '../../types/chess';
import { MoveList } from './MoveList';

const make = (ply: number, san: string, classification: MoveAnalysis['classification'], extra = {}): MoveAnalysis =>
  ({
    ply,
    moveNumber: Math.floor(ply / 2) + 1,
    color: ply % 2 === 0 ? 'w' : 'b',
    san,
    classification,
    centipawnLoss: 0,
    evalAfter: 0,
    mateAfter: null,
    ...extra,
  }) as MoveAnalysis;

const MOVES = [
  make(0, 'e4', 'book'),
  make(1, 'e5', 'book'),
  make(2, 'Nf3', 'best'),
  make(3, 'Nc6', 'good'),
  make(4, 'Bb5', 'mistake', { thinkTimeFormatted: '12s', isLongThink: true }),
  make(5, 'Nf6', 'blunder'),
];

function renderList(currentPly = 2, onSelectPly = vi.fn()) {
  render(
    <MoveList
      moves={MOVES}
      currentPly={currentPly}
      onSelectPly={onSelectPly}
      filterOnlyErrors={false}
      onToggleFilter={() => {}}
    />
  );
  return onSelectPly;
}

describe('MoveList accessibility', () => {
  it('is a labelled list with one item per move number', () => {
    renderList();
    const list = screen.getByRole('list', { name: 'Notation des coups' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('names every move with its player, notation and quality, in French', () => {
    renderList();
    expect(screen.getByRole('button', { name: 'Coup 1, Blancs : e4, Coup théorique' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Coup 2, Blancs : Cf3, Meilleur coup' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Coup 2, Noirs : Cc6, Bon coup' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Coup 3, Noirs : Cf6, Gaffe critique' })).toBeTruthy();
  });

  it('adds the think time and the long-think warning to the name', () => {
    renderList();
    expect(
      screen.getByRole('button', { name: 'Coup 3, Blancs : Fb5, Erreur, réflexion longue, temps de réflexion 12s' })
    ).toBeTruthy();
  });

  it('marks only the current move with aria-current', () => {
    renderList(3);
    const current = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('aria-label')).toContain('Coup 2, Noirs : Cc6');
  });

  it('selects a move with the keyboard (Tab then Enter / Space)', async () => {
    const user = userEvent.setup();
    const onSelectPly = renderList(0);
    const target = screen.getByRole('button', { name: /Coup 2, Blancs : Cf3/ });
    target.focus();
    await user.keyboard('{Enter}');
    expect(onSelectPly).toHaveBeenLastCalledWith(2);
    await user.keyboard(' ');
    expect(onSelectPly).toHaveBeenCalledTimes(2);
  });

  it('exposes the filter as a toggle button and names the navigation buttons', () => {
    renderList();
    expect(screen.getByRole('button', { name: /Fautes seules/ }).getAttribute('aria-pressed')).toBe('false');
    for (const name of ['Début de la partie', 'Coup précédent', 'Coup suivant', 'Fin de la partie']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });
});
