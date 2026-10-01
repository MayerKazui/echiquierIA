// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('MoveList scrolling', () => {
  const scrollTo = vi.fn();
  const originals: Record<string, PropertyDescriptor | undefined> = {};

  beforeEach(() => {
    scrollTo.mockClear();
    HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
    // jsdom has no layout: the active row is always below the visible part of the list
    for (const [name, value] of [
      ['offsetTop', 1000],
      ['offsetHeight', 20],
      ['clientHeight', 100],
    ] as const) {
      originals[name] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value });
    }
  });

  afterEach(() => {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, name);
    }
    Reflect.deleteProperty(window, 'matchMedia');
  });

  const list = (currentPly: number, isPlaying = false) => (
    <MoveList
      moves={MOVES}
      currentPly={currentPly}
      onSelectPly={() => {}}
      filterOnlyErrors={false}
      onToggleFilter={() => {}}
      isPlaying={isPlaying}
    />
  );
  const lastBehavior = () => scrollTo.mock.lastCall?.[0].behavior;

  it('animates the scroll for a single step, when auto-play is not running', () => {
    const { rerender } = render(list(2));
    scrollTo.mockClear();
    rerender(list(3));
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(lastBehavior()).toBe('smooth');
  });

  it('judges each step from the previous one, not from where the list started', () => {
    const { rerender } = render(list(0));
    for (const ply of [1, 2, 3, 4, 5]) {
      scrollTo.mockClear();
      rerender(list(ply));
      expect(lastBehavior()).toBe('smooth'); // always one ply further, however far from the first one
    }
  });

  it('scrolls at once while auto-play is running', () => {
    const { rerender } = render(list(2, true));
    scrollTo.mockClear();
    rerender(list(3, true));
    expect(lastBehavior()).toBe('auto');
  });

  it('scrolls at once on a jump', () => {
    const { rerender } = render(list(5));
    scrollTo.mockClear();
    rerender(list(0));
    expect(lastBehavior()).toBe('auto');
  });

  it('scrolls at once when the user asked for reduced motion', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
    })) as unknown as typeof window.matchMedia;
    const { rerender } = render(list(2));
    scrollTo.mockClear();
    rerender(list(3));
    expect(lastBehavior()).toBe('auto');
  });

  it('does not scroll when only the auto-play state changes', () => {
    const { rerender } = render(list(2));
    scrollTo.mockClear();
    rerender(list(2, true));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('treats the step on which auto-play stops as played, and animates the next step the user takes', () => {
    const { rerender } = render(list(2, true));
    rerender(list(3, true));
    scrollTo.mockClear();
    rerender(list(4, false)); // the last step of auto-play (the stop arrives in the same render)
    expect(lastBehavior()).toBe('auto');

    scrollTo.mockClear();
    rerender(list(5, false)); // a step by the user
    expect(lastBehavior()).toBe('smooth');
  });

  it('does not keep the playing state after an unrelated render', () => {
    const { rerender } = render(list(2, true));
    rerender(list(2, false)); // stopped without moving
    scrollTo.mockClear();
    rerender(list(3, false));
    expect(lastBehavior()).toBe('smooth');
  });
});
