// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PlanItem } from '../../utils/trainingPlan';
import { Plan } from './Plan';

let items: PlanItem[] = [];
vi.mock('../../hooks/usePlan', () => ({
  usePlan: () => ({ status: 'ready', plan: { items, note: null } }),
}));

const item = (over: Partial<PlanItem>): PlanItem => ({
  id: 'train-endgame',
  title: 'Rejouez vos erreurs de la finale',
  why: "C'est votre phase la plus fragile : 70 % de précision, contre 80 % en moyenne.",
  action: { kind: 'puzzles', themes: ['endgame'] },
  ...over,
});

const renderPlan = () => {
  const onEndgames = vi.fn();
  render(
    <Plan
      onClose={vi.fn()}
      onTrain={vi.fn()}
      onShowLine={vi.fn()}
      onDrill={vi.fn()}
      onEndgames={onEndgames}
      onImport={vi.fn()}
      onPuzzles={vi.fn()}
    />
  );
  return { onEndgames };
};

describe('Plan: the theoretical endgames', () => {
  it('opens them from the objective on the endgame', async () => {
    items = [item({ endgames: true })];
    const user = userEvent.setup();
    const { onEndgames } = renderPlan();
    await user.click(screen.getByRole('button', { name: 'Finales théoriques' }));
    expect(onEndgames).toHaveBeenCalledTimes(1);
  });

  it('does not offer them for the other objectives', () => {
    items = [item({ id: 'train-middlegame', title: 'Rejouez vos erreurs du milieu de jeu' })];
    renderPlan();
    expect(screen.queryByRole('button', { name: 'Finales théoriques' })).toBeNull();
  });
});
