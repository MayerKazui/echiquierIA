import { describe, expect, it } from 'vitest';
import { ENDGAMES } from '../data/endgames';
import type { PuzzleEntry } from './puzzleReview';
import { DAY_MS, type Card } from './spacedRepetition';
import { endgameCardId } from './endgameDrill';
import { drillId } from './openingDrill';
import { STOCK_ORDER, summarizeDue, type DueInput } from './dueReviews';
import type { WoodpeckerSet } from './woodpecker';

const NOW = 1_000_000_000_000;

const card = (id: string, dueIn: number | 'mastered' = -1): Card => ({
  id,
  level: dueIn === 'mastered' ? 4 : 1,
  dueAt: dueIn === 'mastered' ? Number.MAX_SAFE_INTEGER : NOW + dueIn * DAY_MS,
  lastSeen: NOW - DAY_MS,
  attempts: 1,
  failures: 0,
});
const cards = (...list: Card[]) => new Map(list.map((c) => [c.id, c]));

const puzzle = (id: string, dueIn: number): PuzzleEntry => ({
  id,
  puzzle: { id, fen: '', moves: [], rating: 1000, themes: [] },
  card: card(id, dueIn),
});

const lot = (queue: string[] | null): WoodpeckerSet =>
  ({
    seed: 1,
    createdAt: 1,
    updatedAt: 1,
    range: { from: 1000, to: 1200 },
    puzzles: Array.from({ length: 50 }, (_, i) => ({ id: `w${i}` })),
    cycles: [],
    progress: queue ? { number: 3, startedAt: 1, elapsedMs: 1, queue, missed: [] } : null,
  }) as unknown as WoodpeckerSet;

const input = (over: Partial<DueInput> = {}): DueInput => ({
  cards: new Map(),
  gameIds: new Set(['g1', 'g2']),
  puzzles: new Map(),
  woodpecker: null,
  now: NOW,
  ...over,
});

const dueOf = (summary: ReturnType<typeof summarizeDue>) =>
  Object.fromEntries(summary.stocks.map((stock) => [stock.id, stock.due]));

describe('summarizeDue', () => {
  it('has nothing to show when nothing was ever worked on', () => {
    const summary = summarizeDue(input());
    expect(summary).toMatchObject({ now: NOW, total: 0, next: null, nextDueAt: null, hasAnything: false });
    expect(summary.stocks.map((s) => s.id)).toEqual([...STOCK_ORDER]);
  });

  it('sorts the cards of the shared store into their stocks and counts the ones due', () => {
    const summary = summarizeDue(
      input({
        cards: cards(
          card('g1:12'), // an error, due
          card('g2:7'), // an error, due
          card('g1:30', 2), // an error, in two days
          card(drillId('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')), // a line, due
          card(endgameCardId(ENDGAMES[0])), // an endgame, due
          card(endgameCardId(ENDGAMES[1]), 'mastered')
        ),
      })
    );
    expect(dueOf(summary)).toEqual({ errors: 2, puzzles: 0, repertoire: 1, endgames: 1, woodpecker: 0 });
    expect(summary.total).toBe(4);
    expect(summary.hasAnything).toBe(true);
  });

  it('does not ask the errors of a game that was deleted, nor a position of a finale that no longer exists', () => {
    const summary = summarizeDue(input({ cards: cards(card('gone:3'), card('finale:unknown')) }));
    expect(summary.total).toBe(0);
    expect(summary.hasAnything).toBe(false);
  });

  it('counts the puzzles missed that are due', () => {
    const summary = summarizeDue(
      input({ puzzles: new Map([puzzle('a', -2), puzzle('b', -0.5), puzzle('c', 3)].map((e) => [e.id, e])) })
    );
    expect(dueOf(summary).puzzles).toBe(2);
    expect(summary.stocks.find((s) => s.id === 'puzzles')?.detail).toBe('2 puzzles à revoir');
  });

  it('counts a Woodpecker cycle in progress as one thing to finish, not as its puzzles', () => {
    const summary = summarizeDue(input({ woodpecker: lot(['w1', 'w2', 'w3']) }));
    const stock = summary.stocks.find((s) => s.id === 'woodpecker')!;
    expect(stock.due).toBe(1);
    expect(stock.detail).toBe('Cycle 3 en cours : 3 puzzles restants');
    expect(summary.total).toBe(1);
  });

  it('has nothing due in a lot without a cycle in progress, but knows it exists', () => {
    const summary = summarizeDue(input({ woodpecker: lot(null) }));
    expect(summary.total).toBe(0);
    expect(summary.hasAnything).toBe(true);
    expect(summary.stocks.find((s) => s.id === 'woodpecker')?.detail).toBe('Lot de 50 puzzles, aucun cycle en cours');
  });

  it('says what comes back next, over all the stocks', () => {
    const summary = summarizeDue(
      input({ cards: cards(card('g1:1', 5), card('g1:2', 2)), puzzles: new Map([['p', puzzle('p', 1)]]) })
    );
    expect(summary.nextDueAt).toBe(NOW + DAY_MS);
    expect(summary.stocks.find((s) => s.id === 'errors')?.nextDueAt).toBe(NOW + 2 * DAY_MS);
  });

  it('puts the first stock with something due as the next one to review, in the fixed order', () => {
    const summary = summarizeDue(
      input({ cards: cards(card(endgameCardId(ENDGAMES[0])), card('g1:1')), woodpecker: lot(['w1']) })
    );
    expect(summary.next?.id).toBe('errors');
    expect(summarizeDue(input({ cards: cards(card(endgameCardId(ENDGAMES[0]))) })).next?.id).toBe('endgames');
  });

  it('has a sentence for each stock', () => {
    const summary = summarizeDue(
      input({
        cards: cards(card('g1:1'), card(drillId('x y z w')), card(endgameCardId(ENDGAMES[0]))),
        puzzles: new Map([['p', puzzle('p', -1)]]),
      })
    );
    expect(summary.stocks.map((s) => s.detail)).toEqual([
      '1 position à rejouer',
      '1 puzzle à revoir',
      '1 ligne à rejouer',
      '1 finale à rejouer',
      'Aucun lot',
    ]);
  });
});
