import { describe, expect, it } from 'vitest';
import type { GameAnalysisResult } from '../types/chess';
import type { StoredGame } from '../services/gameStore';
import {
  NO_FILTERS,
  activeFilterCount,
  applyFilters,
  describeCount,
  describeGame,
  filterChoices,
  fold,
  matchesFilters,
  sortFacts,
  type HistoryFilters,
} from './gameFilters';
import type { GameNote } from './gameNotes';

const NOW = Date.UTC(2026, 9, 4);
interface Spec {
  id: string;
  white?: string;
  black?: string;
  result?: string;
  date?: string;
  opening?: string;
  eco?: string;
  color?: 'w' | 'b';
  accuracyWhite?: number;
  accuracyBlack?: number;
  savedAt?: number;
  event?: string;
}

function stored(spec: Spec): StoredGame {
  const { white = 'Alice', black = 'Bob' } = spec;
  const result = {
    metadata: {
      white,
      black,
      result: spec.result ?? '1-0',
      date: spec.date,
      opening: spec.opening,
      eco: spec.eco,
      event: spec.event,
    },
    moves: [],
    statsWhite: { accuracy: spec.accuracyWhite ?? 80 },
    statsBlack: { accuracy: spec.accuracyBlack ?? 70 },
    userColor: spec.color ?? 'w',
  } as unknown as GameAnalysisResult;
  return { id: spec.id, pgn: '', depth: 12, savedAt: spec.savedAt ?? 1000, schemaVersion: 1, result };
}

const note = (id: string, text: string, tags: string[] = []): GameNote => ({ id, note: text, tags, updatedAt: 1 });

const facts = (spec: Spec, n?: GameNote) => describeGame(stored(spec), n);
const filters = (over: Partial<HistoryFilters>): HistoryFilters => ({ ...NO_FILTERS, ...over });
const ids = (list: ReturnType<typeof facts>[]) => list.map((f) => f.game.id);

describe('describeGame', () => {
  it('reads the figures from the side the player had', () => {
    const white = facts({ id: 'a', result: '1-0', color: 'w', accuracyWhite: 91, accuracyBlack: 55 });
    expect(white).toMatchObject({ color: 'w', outcome: 'win', opponent: 'Bob', accuracy: 91 });
    const black = facts({ id: 'b', result: '1-0', color: 'b', accuracyWhite: 91, accuracyBlack: 55 });
    expect(black).toMatchObject({ color: 'b', outcome: 'loss', opponent: 'Alice', accuracy: 55 });
    expect(facts({ id: 'c', result: '1/2-1/2' }).outcome).toBe('draw');
    expect(facts({ id: 'd', result: '*' }).outcome).toBeNull();
  });

  it('uses the date of the game, else the day it was analysed', () => {
    expect(facts({ id: 'a', date: '2026.09.30' }).date).toBe(Date.UTC(2026, 8, 30));
    expect(facts({ id: 'b', date: '2026.??.??', savedAt: 777 }).date).toBe(777);
  });

  it('takes the opening family', () => {
    expect(facts({ id: 'a', opening: 'Sicilian Defense: Najdorf Variation' }).family).toBe('Sicilian Defense');
    expect(facts({ id: 'b' }).family).toBe('');
  });

  it('ignores an emptied note', () => {
    expect(facts({ id: 'a' }, note('a', '', [])).note).toBeUndefined();
    expect(facts({ id: 'a' }, note('a', 'à revoir')).note?.note).toBe('à revoir');
  });
});

describe('fold', () => {
  it('removes accents and case', () => {
    expect(fold('Défense Sicilienne')).toBe('defense sicilienne');
  });
});

describe('search', () => {
  const list = [
    facts({ id: 'a', white: 'Alice', black: 'Zoé', opening: 'Sicilian Defense: Dragon Variation', eco: 'B70' }),
    facts({ id: 'b', white: 'Alice', black: 'Yan', opening: "Queen's Gambit Declined", event: 'Tournoi du club' }),
    facts(
      { id: 'c', white: 'Alice', black: 'Xavier' },
      note('c', 'Perdu au temps dans une finale de tours', ['à revoir'])
    ),
  ];
  const search = (query: string) => ids(list.filter((f) => matchesFilters(f, filters({ query }), NOW)));

  it('finds a player, whatever the case or the accents', () => {
    expect(search('zoe')).toEqual(['a']);
    expect(search('YAN')).toEqual(['b']);
  });

  it('finds an opening by its English or its French name, or its ECO code', () => {
    expect(search('sicilian')).toEqual(['a']);
    expect(search('sicilienne')).toEqual(['a']);
    expect(search('b70')).toEqual(['a']);
  });

  it('finds the event, the note and the tags', () => {
    expect(search('tournoi')).toEqual(['b']);
    expect(search('finale tours')).toEqual(['c']);
    expect(search('A REVOIR')).toEqual(['c']);
  });

  it('wants every word, and an empty search leaves everything', () => {
    expect(search('alice sicilienne')).toEqual(['a']);
    expect(search('alice zoe yan')).toEqual([]);
    expect(search('   ')).toEqual(['a', 'b', 'c']);
  });
});

describe('filters', () => {
  const list = [
    facts({ id: 'win-w', result: '1-0', color: 'w', black: 'Bob', opening: 'Italian Game', accuracyWhite: 92 }),
    facts({ id: 'loss-w', result: '0-1', color: 'w', black: 'Carl', opening: 'Sicilian Defense', accuracyWhite: 55 }),
    facts({ id: 'draw-b', result: '1/2-1/2', color: 'b', white: 'bob', opening: 'Italian Game', accuracyBlack: 75 }),
    facts({ id: 'win-b', result: '0-1', color: 'b', white: 'Dora', accuracyBlack: 85 }, note('win-b', '', ['tournoi'])),
  ];
  const pick = (over: Partial<HistoryFilters>) => ids(applyFilters(list, filters({ ...over, sort: 'recent' }), NOW));

  it('by result, from the player side', () => {
    expect(pick({ result: 'win' })).toEqual(['win-w', 'win-b']);
    expect(pick({ result: 'draw' })).toEqual(['draw-b']);
    expect(pick({ result: 'loss' })).toEqual(['loss-w']);
  });

  it('by side', () => {
    expect(pick({ color: 'w' })).toEqual(['win-w', 'loss-w']);
    expect(pick({ color: 'b' })).toEqual(['draw-b', 'win-b']);
  });

  it('by opponent, whatever the case', () => {
    expect(pick({ opponent: 'Bob' })).toEqual(['win-w', 'draw-b']);
    expect(pick({ opponent: 'dora' })).toEqual(['win-b']);
  });

  it('by opening family', () => {
    expect(pick({ opening: 'Italian Game' })).toEqual(['win-w', 'draw-b']);
  });

  it('by accuracy: at least a threshold, or under 60 %', () => {
    expect(pick({ accuracy: '80' })).toEqual(['win-w', 'win-b']);
    expect(pick({ accuracy: '70' })).toEqual(['win-w', 'draw-b', 'win-b']);
    expect(pick({ accuracy: '<60' })).toEqual(['loss-w']);
  });

  it('leaves out the games without an accuracy when one is asked for', () => {
    const noSide = describeGame({ ...stored({ id: 'x' }), result: { ...stored({ id: 'x' }).result, userColor: null } });
    expect(matchesFilters(noSide, filters({ accuracy: '60' }), NOW)).toBe(false);
    expect(matchesFilters(noSide, filters({ accuracy: 'all' }), NOW)).toBe(true);
    expect(matchesFilters(noSide, filters({ result: 'win' }), NOW)).toBe(false);
  });

  it('by tag', () => {
    expect(pick({ tag: 'tournoi' })).toEqual(['win-b']);
    expect(pick({ tag: 'inconnu' })).toEqual([]);
  });

  it('combines the filters', () => {
    expect(pick({ result: 'win', color: 'b' })).toEqual(['win-b']);
    expect(pick({ result: 'win', opening: 'Italian Game', accuracy: '90' })).toEqual(['win-w']);
  });
});

describe('period', () => {
  const list = [
    facts({ id: 'today', date: '2026.10.04' }),
    facts({ id: 'week', date: '2026.09.28' }),
    facts({ id: 'month', date: '2026.09.10' }),
    facts({ id: 'quarter', date: '2026.08.01' }),
    facts({ id: 'old', date: '2025.01.01' }),
  ];
  const pick = (over: Partial<HistoryFilters>) => ids(applyFilters(list, filters({ ...over, sort: 'date-desc' }), NOW));

  it('keeps the last days, months', () => {
    expect(pick({ period: '7d' })).toEqual(['today', 'week']);
    expect(pick({ period: '30d' })).toEqual(['today', 'week', 'month']);
    expect(pick({ period: '90d' })).toEqual(['today', 'week', 'month', 'quarter']);
    expect(pick({ period: '365d' })).toEqual(['today', 'week', 'month', 'quarter']);
    expect(pick({ period: 'all' })).toHaveLength(5);
  });

  it('keeps the days between two dates, both included', () => {
    expect(pick({ period: 'custom', from: '2026-09-10', to: '2026-09-28' })).toEqual(['week', 'month']);
    expect(pick({ period: 'custom', from: '2026-09-11' })).toEqual(['today', 'week']);
    expect(pick({ period: 'custom', to: '2026-08-01' })).toEqual(['quarter', 'old']);
    // A date that is not one leaves the bound open
    expect(pick({ period: 'custom', from: 'oops', to: '' })).toHaveLength(5);
  });
});

describe('sort', () => {
  const list = [
    facts({ id: 'a', black: 'Mia', date: '2026.01.01', accuracyWhite: 60, savedAt: 30 }),
    facts({ id: 'b', black: 'bob', date: '2026.03.01', accuracyWhite: 90, savedAt: 10 }),
    facts({ id: 'c', black: 'Éric', date: '2026.02.01', accuracyWhite: 75, savedAt: 20 }),
  ];
  const order = (sort: HistoryFilters['sort']) => ids(sortFacts(list, sort));

  it('puts the latest analysed first by default', () => {
    expect(order('recent')).toEqual(['a', 'c', 'b']);
  });

  it('by date of the game', () => {
    expect(order('date-desc')).toEqual(['b', 'c', 'a']);
    expect(order('date-asc')).toEqual(['a', 'c', 'b']);
  });

  it('by accuracy', () => {
    expect(order('accuracy-desc')).toEqual(['b', 'c', 'a']);
    expect(order('accuracy-asc')).toEqual(['a', 'c', 'b']);
  });

  it('by opponent, accents and case aside', () => {
    expect(order('opponent')).toEqual(['b', 'c', 'a']);
  });

  it('puts the games without a figure last, and does not touch the list it is given', () => {
    const noSide = describeGame({
      ...stored({ id: 'z', savedAt: 40 }),
      result: { ...stored({ id: 'z' }).result, userColor: null },
    });
    const withUnknown = [noSide, ...list];
    expect(ids(sortFacts(withUnknown, 'accuracy-desc'))).toEqual(['b', 'c', 'a', 'z']);
    expect(ids(sortFacts(withUnknown, 'accuracy-asc'))).toEqual(['a', 'c', 'b', 'z']);
    expect(ids(sortFacts(withUnknown, 'opponent'))).toEqual(['b', 'c', 'a', 'z']);
    expect(ids(withUnknown)).toEqual(['z', 'a', 'b', 'c']);
  });
});

describe('filterChoices and counts', () => {
  const list = [
    facts({ id: 'a', black: 'Bob', opening: 'Italian Game' }),
    facts({ id: 'b', black: 'bob', opening: 'Italian Game: Giuoco Piano' }),
    facts({ id: 'c', black: 'Carl', opening: 'Sicilian Defense' }),
    facts({ id: 'd', black: 'Carl' }),
  ];

  it('lists opponents and openings, the most frequent first, a name once whatever its case', () => {
    expect(filterChoices(list)).toEqual({
      opponents: [
        { name: 'Bob', count: 2 },
        { name: 'Carl', count: 2 },
      ],
      openings: [
        { name: 'Italian Game', count: 2 },
        { name: 'Sicilian Defense', count: 1 },
      ],
    });
  });

  it('counts the filters set, the sort not included', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount(filters({ sort: 'opponent' }))).toBe(0);
    expect(activeFilterCount(filters({ query: ' ', result: 'win', tag: 'x', period: '7d' }))).toBe(3);
  });

  it('says how many games are shown', () => {
    expect(describeCount(1, 1)).toBe('1 partie');
    expect(describeCount(340, 340)).toBe('340 parties');
    expect(describeCount(12, 340)).toBe('12 parties sur 340');
    expect(describeCount(0, 5)).toBe('0 partie sur 5');
  });
});
