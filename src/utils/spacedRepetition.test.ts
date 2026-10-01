import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  INTERVAL_DAYS,
  MASTERED_LEVEL,
  NO_FILTER,
  RETRY_DAYS,
  SESSION_SIZE,
  describeDelay,
  matchesFilter,
  pickSession,
  review,
  statusOf,
  summarize,
  type Card,
  type Pickable,
} from './spacedRepetition';

const NOW = Date.UTC(2024, 5, 10, 12);

const card = (id: string, over: Partial<Card> = {}): Card => ({
  id,
  level: 1,
  dueAt: NOW + DAY_MS,
  lastSeen: NOW,
  attempts: 1,
  failures: 0,
  ...over,
});

const pos = (id: string, over: Partial<Pickable> = {}): Pickable => ({
  id,
  kind: 'other',
  phase: 'middlegame',
  loss: 20,
  date: 1,
  ...over,
});

const cardsOf = (...list: Card[]) => new Map(list.map((c) => [c.id, c]));

describe('review', () => {
  it('brings a position found for the first time back in 1 day', () => {
    expect(review('a', undefined, true, NOW)).toEqual({
      id: 'a',
      level: 1,
      dueAt: NOW + 1 * DAY_MS,
      lastSeen: NOW,
      attempts: 1,
      failures: 0,
    });
  });

  it('then in 3 days, then in 7 days, then retires it', () => {
    let current = review('a', undefined, true, NOW);
    expect(INTERVAL_DAYS).toEqual([1, 3, 7]);
    current = review('a', current, true, NOW);
    expect(current.level).toBe(2);
    expect(current.dueAt).toBe(NOW + 3 * DAY_MS);
    current = review('a', current, true, NOW);
    expect(current.level).toBe(3);
    expect(current.dueAt).toBe(NOW + 7 * DAY_MS);
    current = review('a', current, true, NOW);
    expect(current.level).toBe(MASTERED_LEVEL);
    expect(statusOf(current, NOW + 1000 * DAY_MS)).toBe('mastered');
    expect(Number.isFinite(current.dueAt)).toBe(true);
  });

  it('puts a missed position back to the start, due in 1 day', () => {
    const before = card('a', { level: 3, attempts: 3 });
    const after = review('a', before, false, NOW);
    expect(after.level).toBe(0);
    expect(after.dueAt).toBe(NOW + RETRY_DAYS * DAY_MS);
    expect(after.attempts).toBe(4);
    expect(after.failures).toBe(1);
  });

  it('starts the climb again after a failure', () => {
    const missed = review('a', card('a', { level: 3 }), false, NOW);
    const found = review('a', missed, true, NOW);
    expect(found.level).toBe(1);
    expect(found.dueAt).toBe(NOW + 1 * DAY_MS);
  });

  it('counts a position missed on its first try', () => {
    const after = review('a', undefined, false, NOW);
    expect(after).toMatchObject({ level: 0, attempts: 1, failures: 1 });
  });
});

describe('statusOf', () => {
  it('is new without a card', () => {
    expect(statusOf(undefined, NOW)).toBe('new');
  });
  it('is due from its due date on (included)', () => {
    expect(statusOf(card('a', { dueAt: NOW }), NOW)).toBe('due');
    expect(statusOf(card('a', { dueAt: NOW - 1 }), NOW)).toBe('due');
  });
  it('is scheduled before its due date', () => {
    expect(statusOf(card('a', { dueAt: NOW + 1 }), NOW)).toBe('scheduled');
  });
  it('is mastered at the top level, even if its date has come', () => {
    expect(statusOf(card('a', { level: MASTERED_LEVEL, dueAt: 0 }), NOW)).toBe('mastered');
  });
  it('is due a missed position at level 0', () => {
    expect(statusOf(card('a', { level: 0, dueAt: NOW - DAY_MS }), NOW)).toBe('due');
  });
});

describe('matchesFilter', () => {
  const p = pos('a', { kind: 'hanging', phase: 'endgame' });
  it('accepts everything without a choice', () => {
    expect(matchesFilter(p, NO_FILTER)).toBe(true);
  });
  it('needs one of the kinds chosen', () => {
    expect(matchesFilter(p, { kinds: new Set(['hanging', 'mate']), phases: new Set() })).toBe(true);
    expect(matchesFilter(p, { kinds: new Set(['mate']), phases: new Set() })).toBe(false);
  });
  it('needs one of the phases chosen', () => {
    expect(matchesFilter(p, { kinds: new Set(), phases: new Set(['endgame']) })).toBe(true);
    expect(matchesFilter(p, { kinds: new Set(), phases: new Set(['opening']) })).toBe(false);
  });
  it('needs both a kind and a phase when both are chosen', () => {
    expect(matchesFilter(p, { kinds: new Set(['hanging']), phases: new Set(['opening']) })).toBe(false);
    expect(matchesFilter(p, { kinds: new Set(['hanging']), phases: new Set(['endgame']) })).toBe(true);
  });
});

describe('summarize', () => {
  const positions = [pos('new1'), pos('new2'), pos('due'), pos('later'), pos('later2'), pos('done')];
  const cards = cardsOf(
    card('due', { dueAt: NOW - 1 }),
    card('later', { dueAt: NOW + 3 * DAY_MS }),
    card('later2', { dueAt: NOW + 2 * DAY_MS }),
    card('done', { level: MASTERED_LEVEL })
  );

  it('counts each status, and finds the nearest due date', () => {
    expect(summarize(positions, cards, NOW)).toEqual({
      due: 1,
      fresh: 2,
      scheduled: 2,
      mastered: 1,
      nextDueAt: NOW + 2 * DAY_MS,
    });
  });

  it('has no next date without scheduled positions', () => {
    expect(summarize([pos('a')], cardsOf(), NOW).nextDueAt).toBeNull();
  });

  it('counts only the positions of the filter', () => {
    const mixed = [pos('a', { kind: 'mate' }), pos('b', { kind: 'hanging' }), pos('c', { kind: 'hanging' })];
    const filter = { kinds: new Set(['hanging' as const]), phases: new Set<'opening'>() };
    expect(summarize(mixed, cardsOf(), NOW, filter).fresh).toBe(2);
  });

  it('ignores the cards of positions that are not in the list', () => {
    expect(summarize([pos('a')], cardsOf(card('gone', { dueAt: 0 })), NOW)).toMatchObject({ due: 0, fresh: 1 });
  });
});

describe('pickSession', () => {
  it('puts the positions due before the new ones', () => {
    const picked = pickSession([pos('new'), pos('due')], cardsOf(card('due', { dueAt: NOW - 1 })), NOW);
    expect(picked.map((p) => p.id)).toEqual(['due', 'new']);
  });

  it('puts the longest overdue first', () => {
    const cards = cardsOf(card('b', { dueAt: NOW - 1 * DAY_MS }), card('a', { dueAt: NOW - 3 * DAY_MS }));
    expect(pickSession([pos('b'), pos('a')], cards, NOW).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('puts the costliest new fault first, the most recent game on a tie', () => {
    const picked = pickSession(
      [pos('small', { loss: 10 }), pos('old', { loss: 30, date: 1 }), pos('recent', { loss: 30, date: 2 })],
      cardsOf(),
      NOW
    );
    expect(picked.map((p) => p.id)).toEqual(['recent', 'old', 'small']);
  });

  it('leaves out the scheduled and the mastered positions', () => {
    const cards = cardsOf(card('later'), card('done', { level: MASTERED_LEVEL }));
    expect(pickSession([pos('later'), pos('done')], cards, NOW)).toEqual([]);
  });

  it('takes the scheduled ones, the soonest first, when asked to work in advance', () => {
    const cards = cardsOf(card('far', { dueAt: NOW + 5 * DAY_MS }), card('near', { dueAt: NOW + DAY_MS }));
    const picked = pickSession([pos('far'), pos('near'), pos('new')], cards, NOW, { includeUpcoming: true });
    expect(picked.map((p) => p.id)).toEqual(['new', 'near', 'far']);
  });

  it('keeps to the filter', () => {
    const picked = pickSession([pos('a', { phase: 'endgame' }), pos('b', { phase: 'opening' })], cardsOf(), NOW, {
      filter: { kinds: new Set(), phases: new Set(['endgame']) },
    });
    expect(picked.map((p) => p.id)).toEqual(['a']);
  });

  it('stops at the size of a session', () => {
    const many = Array.from({ length: SESSION_SIZE + 5 }, (_, i) => pos(`p${i}`));
    expect(pickSession(many, cardsOf(), NOW)).toHaveLength(SESSION_SIZE);
    expect(pickSession(many, cardsOf(), NOW, { size: 3 })).toHaveLength(3);
  });

  it('does not change the list it is given', () => {
    const list = [pos('a', { loss: 1 }), pos('b', { loss: 9 })];
    pickSession(list, cardsOf(), NOW);
    expect(list.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('describeDelay', () => {
  it('says today when it is due', () => {
    expect(describeDelay(NOW, NOW)).toBe("aujourd'hui");
    expect(describeDelay(NOW - DAY_MS, NOW)).toBe("aujourd'hui");
  });
  it('says tomorrow within a day', () => {
    expect(describeDelay(NOW + DAY_MS, NOW)).toBe('demain');
    expect(describeDelay(NOW + 2 * 60 * 60 * 1000, NOW)).toBe('demain');
  });
  it('counts the days after that', () => {
    expect(describeDelay(NOW + 3 * DAY_MS, NOW)).toBe('dans 3 jours');
    expect(describeDelay(NOW + 7 * DAY_MS, NOW)).toBe('dans 7 jours');
  });
});
