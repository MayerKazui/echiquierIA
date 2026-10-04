// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENDGAMES } from '../../data/endgames';
import { recordPractice } from '../../services/practiceStore';
import { saveCard } from '../../services/trainingStore';
import { endgameCardId } from '../../utils/endgameDrill';
import { summarizeDue, type DueSummary } from '../../utils/dueReviews';
import { DAY_MS, type Card } from '../../utils/spacedRepetition';
import { ReviewToday } from './ReviewToday';

const NOW = new Date(2026, 9, 4, 14).getTime();

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
});

const card = (id: string, dueIn = -1): Card => ({
  id,
  level: 1,
  dueAt: NOW + dueIn * DAY_MS,
  lastSeen: NOW - DAY_MS,
  attempts: 1,
  failures: 0,
});

const summaryOf = (cards: Card[]): DueSummary =>
  summarizeDue({
    cards: new Map(cards.map((c) => [c.id, c])),
    gameIds: new Set(['g1']),
    puzzles: new Map(),
    woodpecker: null,
    now: NOW,
  });

const renderToday = (props: Partial<React.ComponentProps<typeof ReviewToday>> = {}) =>
  render(
    <ReviewToday
      summary={summaryOf([card('g1:1'), card('g1:2'), card(endgameCardId(ENDGAMES[0]))])}
      onReview={() => {}}
      onReviewAll={() => {}}
      {...props}
    />
  );

describe('ReviewToday', () => {
  it('says how many things come back today and lists the stocks with what waits in each', () => {
    renderToday();
    expect(screen.getByRole('status').textContent).toContain('3 choses à réviser');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(within(items[0]).getByText(/2 positions à rejouer/)).toBeTruthy();
    expect(within(items[3]).getByText(/1 finale à rejouer/)).toBeTruthy();
  });

  it('starts one stock, and only the ones that have something due', async () => {
    const onReview = vi.fn();
    renderToday({ onReview });
    const puzzles = screen.getByRole('button', { name: 'Réviser : Puzzles ratés' }) as HTMLButtonElement;
    expect(puzzles.disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Réviser : Mes erreurs' }));
    await userEvent.click(screen.getByRole('button', { name: 'Réviser : Finales' }));
    expect(onReview.mock.calls).toEqual([['errors'], ['endgames']]);
  });

  it('has a button to review everything, which says "Continuer" during a review', async () => {
    const onReviewAll = vi.fn();
    const { unmount } = renderToday({ onReviewAll });
    await userEvent.click(screen.getByRole('button', { name: 'Tout réviser' }));
    expect(onReviewAll).toHaveBeenCalledTimes(1);
    unmount();
    renderToday({ isChain: true });
    expect(screen.getByRole('button', { name: 'Continuer à réviser' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tout réviser' })).toBeNull();
  });

  it('says that all is up to date, and when the next review comes back', () => {
    renderToday({ summary: summaryOf([card('g1:1', 3), card('g1:2', 5)]) });
    expect(screen.getByRole('status').textContent).toContain('Tout est à jour');
    expect(screen.getByRole('status').textContent).toContain('la prochaine révision revient dans 3 jours');
    expect(screen.queryByRole('button', { name: /^Tout réviser|Continuer/ })).toBeNull();
    expect(screen.getByText("Rien à réviser pour l'instant.")).toBeTruthy();
  });

  it('closes, when it is in a window', async () => {
    const onClose = vi.fn();
    renderToday({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('waits while the counts are being read', () => {
    renderToday({ summary: null });
    expect(screen.getByRole('status').textContent).toBe('Chargement…');
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('ReviewToday as a card of the start screen', () => {
  it('shows nothing before there is something to review or a day practised', () => {
    const { container } = renderToday({ variant: 'card', summary: summaryOf([]) });
    expect(container.textContent).toBe('');
  });

  it('shows up once there is something', () => {
    renderToday({ variant: 'card' });
    expect(screen.getByRole('button', { name: 'Tout réviser' })).toBeTruthy();
  });

  it('shows up for a player who practised, even with nothing due', async () => {
    await recordPractice(NOW - DAY_MS);
    renderToday({ variant: 'card', summary: summaryOf([]) });
    await screen.findByText(/Série/);
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('ReviewToday streak and calendar', () => {
  it('shows the streak, the record and the calendar from the days practised', async () => {
    for (const offset of [0, 1, 2, 10, 11, 12, 13]) await recordPractice(NOW - offset * DAY_MS);
    renderToday();
    await screen.findByText('Série : 3 jours');
    expect(screen.getByText('Record : 4 jours')).toBeTruthy();
    expect(screen.getByText("Aujourd'hui : déjà fait")).toBeTruthy();
    expect(screen.getByRole('img', { name: /7 jours d'entraînement sur les 16 dernières semaines/ })).toBeTruthy();
  });

  it('keeps the streak alive while today is not done, and says so', async () => {
    await recordPractice(NOW - DAY_MS);
    await recordPractice(NOW - 2 * DAY_MS);
    renderToday();
    await screen.findByText('Série : 2 jours');
    expect(screen.getByText(/Aujourd'hui : pas encore, la série continue/)).toBeTruthy();
  });

  it('counts what was practised before the days were logged, from the cards', async () => {
    // A card last worked on yesterday: the day shows in the calendar though nothing was logged
    await saveCard(card('g1:1'));
    renderToday();
    await screen.findByText(/Série/);
    await waitFor(() => expect(screen.getByRole('img', { name: /1 jour d'entraînement/ })).toBeTruthy());
  });

  it('gives each day a tooltip with its date and its count', async () => {
    await recordPractice(NOW);
    await recordPractice(NOW);
    const { container } = renderToday();
    await screen.findByText('Série : 1 jour');
    expect(container.querySelector('[title="dimanche 4 octobre : 2 révisions"]')).not.toBeNull();
  });
});
