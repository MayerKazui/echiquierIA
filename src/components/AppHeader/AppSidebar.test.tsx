// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppSidebar } from './AppSidebar';
import type { NavSection } from './navigation';

const sections = (onWoodpecker = vi.fn(), onSound = vi.fn()): NavSection[] => [
  {
    id: 'puzzles',
    label: 'Puzzles',
    items: [
      { id: 'free', label: 'Séance libre', icon: null, onSelect: vi.fn() },
      { id: 'woodpecker', label: 'Woodpecker', icon: null, onSelect: onWoodpecker },
    ],
  },
  {
    id: 'settings',
    label: 'Réglages',
    items: [{ id: 'sound', label: 'Son des coups', icon: null, checked: false, onSelect: onSound }],
  },
];

describe('AppSidebar', () => {
  it('lists every group and every entry at once, with nothing to open first', () => {
    render(<AppSidebar sections={sections()} />);
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    const puzzles = within(nav).getByRole('region', { name: 'Puzzles' });
    expect(
      within(puzzles)
        .getAllByRole('button')
        .map((el) => el.textContent)
    ).toEqual(['Séance libre', 'Woodpecker']);
    expect(within(nav).getByRole('region', { name: 'Réglages' })).toBeTruthy();
  });

  it('opens an entry with one click', async () => {
    const onWoodpecker = vi.fn();
    const user = userEvent.setup();
    render(<AppSidebar sections={sections(onWoodpecker)} />);
    await user.click(screen.getByRole('button', { name: 'Woodpecker' }));
    expect(onWoodpecker).toHaveBeenCalledTimes(1);
  });

  it('announces a switch with its state', async () => {
    const onSound = vi.fn();
    const user = userEvent.setup();
    render(<AppSidebar sections={sections(vi.fn(), onSound)} />);
    const sound = screen.getByRole('switch', { name: /Son des coups/ });
    expect(sound.getAttribute('aria-checked')).toBe('false');
    await user.click(sound);
    expect(onSound).toHaveBeenCalledTimes(1);
  });

  it('shows what waits behind an entry, and says it to a screen reader', () => {
    const withBadge: NavSection[] = [
      {
        id: 'games',
        label: 'Mon jeu',
        items: [
          { id: 'review', label: "À réviser aujourd'hui", icon: null, onSelect: vi.fn(), badge: 12 },
          { id: 'history', label: 'Mes parties', icon: null, onSelect: vi.fn(), badge: 0 },
        ],
      },
    ];
    render(<AppSidebar sections={withBadge} />);
    expect(screen.getByRole('button', { name: "À réviser aujourd'hui, 12 à réviser" })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mes parties' })).toBeTruthy();
  });
});
