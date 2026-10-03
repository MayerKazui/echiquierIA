// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppMenu } from './AppMenu';
import type { NavSection } from './navigation';

const sections = (over: Partial<Record<string, () => void>> = {}): NavSection[] => [
  {
    id: 'games',
    label: 'Mon jeu',
    items: [
      { id: 'a', label: 'Mes parties', hint: 'Rouvrir une partie', icon: null, onSelect: over.a ?? vi.fn() },
      { id: 'b', label: 'Mon profil', icon: null, onSelect: over.b ?? vi.fn() },
    ],
  },
  {
    id: 'puzzles',
    label: 'Puzzles',
    items: [
      { id: 'c', label: 'Woodpecker', icon: null, onSelect: over.c ?? vi.fn() },
      { id: 'd', label: 'Statistiques', icon: null, onSelect: over.d ?? vi.fn() },
    ],
  },
  {
    id: 'settings',
    label: 'Réglages',
    items: [{ id: 'sound', label: 'Son des coups', icon: null, checked: true, onSelect: over.sound ?? vi.fn() }],
  },
];

const button = () => screen.getByRole('button', { name: 'Menu' });

describe('AppMenu', () => {
  it('is closed at first, and announces that it opens a menu', () => {
    render(<AppMenu sections={sections()} />);
    expect(button().getAttribute('aria-haspopup')).toBe('menu');
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on a click, with the focus on the first entry', async () => {
    const user = userEvent.setup();
    render(<AppMenu sections={sections()} />);
    await user.click(button());
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu', { name: 'Menu' })).toBeTruthy();
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Mes parties',
      'Mon profil',
      'Woodpecker',
      'Statistiques',
    ]);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /Mes parties/ }));
  });

  it('opens with the down arrow on the button', async () => {
    const user = userEvent.setup();
    render(<AppMenu sections={sections()} />);
    button().focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('moves between the entries with the arrows, Home and End, and wraps around', async () => {
    const user = userEvent.setup();
    render(<AppMenu sections={sections()} />);
    await user.click(button());
    const focused = () => document.activeElement?.textContent;
    await user.keyboard('{ArrowDown}');
    expect(focused()).toBe('Mon profil');
    await user.keyboard('{ArrowDown}');
    expect(focused()).toBe('Woodpecker');
    await user.keyboard('{End}');
    expect(focused()).toContain('Son des coups');
    await user.keyboard('{ArrowDown}');
    expect(focused()).toContain('Mes parties');
    await user.keyboard('{ArrowUp}');
    expect(focused()).toContain('Son des coups');
    await user.keyboard('{Home}');
    expect(focused()).toContain('Mes parties');
  });

  it('does the action of an entry, closes, and gives the focus back to the button', async () => {
    const onProfile = vi.fn();
    const user = userEvent.setup();
    render(<AppMenu sections={sections({ b: onProfile })} />);
    await user.click(button());
    await user.click(screen.getByRole('menuitem', { name: 'Mon profil' }));
    expect(onProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('shows every group open, as headings the entries are listed under', async () => {
    const user = userEvent.setup();
    render(<AppMenu sections={sections()} />);
    await user.click(button());
    const puzzles = screen.getByRole('group', { name: 'Puzzles' });
    expect(
      within(puzzles)
        .getAllByRole('menuitem')
        .map((el) => el.textContent)
    ).toEqual(['Woodpecker', 'Statistiques']);
    expect(screen.getByRole('group', { name: 'Mon jeu' })).toBeTruthy();
  });

  it('opens a sub-view directly, in a single choice after the menu is open', async () => {
    const onStats = vi.fn();
    const user = userEvent.setup();
    render(<AppMenu sections={sections({ d: onStats })} />);
    await user.click(button());
    await user.click(screen.getByRole('menuitem', { name: 'Statistiques' }));
    expect(onStats).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('selects the focused entry with Enter', async () => {
    const onParties = vi.fn();
    const user = userEvent.setup();
    render(<AppMenu sections={sections({ a: onParties })} />);
    await user.click(button());
    await user.keyboard('{Enter}');
    expect(onParties).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape, back on the button, without the page hearing the key', async () => {
    const onKey = vi.fn();
    document.addEventListener('keydown', onKey);
    const user = userEvent.setup();
    render(<AppMenu sections={sections()} />);
    await user.click(button());
    onKey.mockClear();
    await user.keyboard('{Escape}');
    document.removeEventListener('keydown', onKey);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(onKey).not.toHaveBeenCalled();
  });

  it('closes on a click outside, and on Tab', async () => {
    const user = userEvent.setup();
    render(
      <>
        <AppMenu sections={sections()} />
        <p>Dehors</p>
      </>
    );
    await user.click(button());
    await user.click(screen.getByText('Dehors'));
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(button());
    await user.keyboard('{Tab}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when the button is pressed again', async () => {
    const user = userEvent.setup();
    render(<AppMenu sections={sections()} />);
    await user.click(button());
    await user.click(button());
    expect(screen.queryByRole('menu')).toBeNull();
  });

  describe('a switch entry', () => {
    it('is announced as a checkbox with its state, and keeps the menu open', async () => {
      const onSound = vi.fn();
      const user = userEvent.setup();
      render(<AppMenu sections={sections({ sound: onSound })} />);
      await user.click(button());
      const sound = screen.getByRole('menuitemcheckbox', { name: /Son des coups/ });
      expect(sound.getAttribute('aria-checked')).toBe('true');
      await user.click(sound);
      expect(onSound).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('menu')).toBeTruthy();
    });
  });
});
