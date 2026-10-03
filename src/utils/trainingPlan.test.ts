import { describe, expect, it } from 'vitest';
import { bucket, calmProfile } from '../test/profileFixtures';
import type { Family, RecurringExit, Repertoire } from './openingRepertoire';
import { DAY_MS, SESSION_SIZE, type Card, type Pickable } from './spacedRepetition';
import { MAX_ITEMS, MIN_PLAN_GAMES, buildPlan, type PlanAction } from './trainingPlan';
import { PLAN_PUZZLE_TARGET } from './puzzleHistory';
import type { Profile } from './weaknessProfile';

const NOW = 100 * DAY_MS;

const emptyRepertoire = (): Repertoire => ({ counted: 20, ignored: 0, colors: { w: [], b: [] } });

const family = (recurring: Array<Partial<RecurringExit>>, name = 'Sicilian Defense'): Family => ({
  name,
  eco: 'B20',
  tally: { games: 10, wins: 5, draws: 0, losses: 5 },
  variations: [],
  exits: { player: 6, opponent: 2, none: 2 },
  recurring: recurring.map((r) => ({
    moveNumber: 8,
    san: 'h3',
    line: ['e4', 'c5'],
    count: 4,
    loss: 10,
    isCostly: true,
    tally: { games: 4, wins: 1, draws: 0, losses: 3 },
    ...r,
  })),
});

const positions = (count: number, over: Partial<Pickable> = {}): Pickable[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `p${over.kind ?? 'other'}${over.phase ?? 'middlegame'}${i}`,
    kind: 'other',
    phase: 'middlegame',
    loss: 20,
    date: i,
    ...over,
  }));

const card = (id: string, over: Partial<Card> = {}): Card => ({
  id,
  level: 1,
  dueAt: NOW + DAY_MS,
  lastSeen: NOW - DAY_MS,
  attempts: 1,
  failures: 0,
  ...over,
});

/** A profile where a quarter of the faults or more are pieces left hanging. */
const hangingProfile = (): Profile => {
  const p = calmProfile();
  p.kinds = { counts: { mate: 0, hanging: 10, tactic: 2, wasted: 1, other: 7 }, total: 20 };
  return p;
};

const plan = (over: Partial<Parameters<typeof buildPlan>[0]> = {}) =>
  buildPlan({
    profile: calmProfile(),
    repertoire: emptyRepertoire(),
    positions: [],
    cards: new Map(),
    now: NOW,
    ...over,
  });

const kindsOf = (action: PlanAction) => (action.kind === 'train' ? [...action.filter.kinds] : []);
const phasesOf = (action: PlanAction) => (action.kind === 'train' ? [...action.filter.phases] : []);

describe('buildPlan', () => {
  describe('with too few games', () => {
    it('asks for more games, and nothing else, even when something stands out', () => {
      const few = plan({ profile: { ...hangingProfile(), counted: 4 }, positions: positions(6, { kind: 'hanging' }) });
      expect(few.note).toBe('few-games');
      expect(few.items).toHaveLength(1);
      expect(few.items[0]).toMatchObject({ id: 'import', action: { kind: 'import' } });
      expect(few.items[0].why).toContain("4 pour l'instant, il en faut 5 au moins");
    });

    it('makes a plan from the fifth game', () => {
      expect(plan({ profile: { ...calmProfile(), counted: MIN_PLAN_GAMES } }).note).toBe('nothing');
    });
  });

  it('has nothing to propose when nothing stands out, and says so', () => {
    expect(plan()).toEqual({ items: [], note: 'nothing' });
  });

  describe('the errors that come back', () => {
    it('proposes to replay that kind, with the share of the faults', () => {
      const result = plan({ profile: hangingProfile(), positions: positions(6, { kind: 'hanging' }) });
      const [item] = result.items;
      expect(item.id).toBe('train-hanging');
      expect(item.title).toBe('Rejouez vos erreurs : pièce laissée en prise');
      expect(item.why).toBe('50 % de vos erreurs (10 sur 20) sont de ce type.');
      expect(kindsOf(item.action)).toEqual(['hanging']);
      expect(phasesOf(item.action)).toEqual([]);
    });

    it('sets the goal at the positions to replay, up to a session', () => {
      const few = plan({ profile: hangingProfile(), positions: positions(6, { kind: 'hanging' }) });
      expect(few.items[0].goal).toEqual({ done: 0, target: 6 });
      const many = plan({ profile: hangingProfile(), positions: positions(25, { kind: 'hanging' }) });
      expect(many.items[0].goal).toEqual({ done: 0, target: SESSION_SIZE });
    });

    it('counts the positions replayed in the last 7 days as done', () => {
      const pos = positions(8, { kind: 'hanging' });
      const cards = new Map([
        [pos[0].id, card(pos[0].id, { lastSeen: NOW - 6 * DAY_MS, dueAt: NOW + 5 * DAY_MS })],
        [pos[1].id, card(pos[1].id, { lastSeen: NOW - 2 * DAY_MS, dueAt: NOW + 5 * DAY_MS })],
        [pos[2].id, card(pos[2].id, { lastSeen: NOW - 8 * DAY_MS, dueAt: NOW + 5 * DAY_MS })], // too old
      ]);
      const [item] = plan({ profile: hangingProfile(), positions: pos, cards }).items;
      // 2 replayed this week + 5 new (the third is scheduled, not due)
      expect(item.goal).toEqual({ done: 2, target: 7 });
    });

    it('counts a due position as still to replay, and ignores the positions of another kind', () => {
      const pos = [...positions(3, { kind: 'hanging' }), ...positions(5, { kind: 'mate' })];
      const cards = new Map([[pos[0].id, card(pos[0].id, { dueAt: NOW - DAY_MS, lastSeen: NOW - 9 * DAY_MS })]]);
      const [item] = plan({ profile: hangingProfile(), positions: pos, cards }).items;
      expect(item.goal).toEqual({ done: 0, target: 3 });
    });

    it('is complete when the week’s target is reached, up to 10 positions', () => {
      const pos = positions(12, { kind: 'hanging' });
      const cards = new Map(
        pos.slice(0, SESSION_SIZE).map((p) => [p.id, card(p.id, { dueAt: NOW + 3 * DAY_MS, lastSeen: NOW - DAY_MS })])
      );
      const [item] = plan({ profile: hangingProfile(), positions: pos, cards }).items;
      expect(item.goal).toEqual({ done: SESSION_SIZE, target: SESSION_SIZE });
    });

    it('does not go past its target when more than a session was replayed', () => {
      const pos = positions(12, { kind: 'hanging' });
      const cards = new Map(pos.map((p) => [p.id, card(p.id, { dueAt: NOW + 3 * DAY_MS, lastSeen: NOW - DAY_MS })]));
      const [item] = plan({ profile: hangingProfile(), positions: pos, cards }).items;
      expect(item.goal).toEqual({ done: SESSION_SIZE, target: SESSION_SIZE });
    });

    it('goes to the puzzles of the theme when there is nothing to replay in that kind', () => {
      const [item] = plan({ profile: hangingProfile(), positions: positions(5, { kind: 'mate' }) }).items;
      expect(item).toEqual({
        id: 'train-hanging',
        title: 'Faites des puzzles : pièce laissée en prise',
        why: '50 % de vos erreurs (10 sur 20) sont de ce type.',
        action: { kind: 'puzzles', themes: ['hangingPiece'] },
        puzzleGoal: { done: 0, target: PLAN_PUZZLE_TARGET },
      });
    });

    it('counts the puzzles of the theme played this week, up to the target', () => {
      const attempt = (ago: number, themes: string[], id: string) => ({
        at: NOW - ago,
        id,
        ok: true,
        rating: 1000,
        themes,
      });
      const log = [
        attempt(DAY_MS, ['hangingPiece', 'short'], 'a'),
        attempt(2 * DAY_MS, ['hangingPiece'], 'b'),
        attempt(3 * DAY_MS, ['fork'], 'c'), // another theme
        attempt(9 * DAY_MS, ['hangingPiece'], 'd'), // too long ago
      ];
      const [item] = plan({
        profile: hangingProfile(),
        positions: positions(6, { kind: 'hanging' }),
        puzzleLog: log,
      }).items;
      expect(item.puzzleGoal).toEqual({ done: 2, target: PLAN_PUZZLE_TARGET });
      const many = Array.from({ length: 15 }, (_, i) => attempt(i * 1000, ['hangingPiece'], `m${i}`));
      expect(plan({ profile: hangingProfile(), puzzleLog: many }).items[0].puzzleGoal?.done).toBe(PLAN_PUZZLE_TARGET);
    });

    it('goes to the puzzles too when everything is mastered or waits for later and nothing was replayed this week', () => {
      const pos = positions(2, { kind: 'hanging' });
      const cards = new Map(
        pos.map((p) => [p.id, card(p.id, { level: 4, dueAt: Number.MAX_SAFE_INTEGER, lastSeen: NOW - 30 * DAY_MS })])
      );
      const [item] = plan({ profile: hangingProfile(), positions: pos, cards }).items;
      expect(item.action).toEqual({ kind: 'puzzles', themes: ['hangingPiece'] });
      expect(item.goal).toBeUndefined();
    });

    it('offers the puzzles of the theme beside the errors to replay', () => {
      const [item] = plan({ profile: hangingProfile(), positions: positions(6, { kind: 'hanging' }) }).items;
      expect(item.action.kind).toBe('train');
      expect(item.puzzles).toEqual(['hangingPiece']);
    });

    it.each([
      ['mate', ['mateIn1', 'mateIn2']],
      ['tactic', ['fork', 'pin', 'skewer']],
      ['wasted', ['crushing', 'advantage']],
    ] as const)('names the Lichess themes of %s', (kind, themes) => {
      const p = calmProfile();
      p.kinds = { counts: { mate: 0, hanging: 0, tactic: 0, wasted: 0, other: 5, [kind]: 15 }, total: 20 };
      const [item] = plan({ profile: p, positions: positions(6, { kind }) }).items;
      expect(item.puzzles).toEqual(themes);
    });
  });

  describe('the weakest phase', () => {
    const weakEndgame = (): Profile => {
      const p = calmProfile();
      p.phases.endgame = bucket(120, 70);
      return p;
    };

    it('proposes to replay the errors of that phase, with the accuracy', () => {
      const [item] = plan({ profile: weakEndgame(), positions: positions(4, { phase: 'endgame' }) }).items;
      expect(item.id).toBe('train-endgame');
      expect(item.title).toBe('Rejouez vos erreurs de la finale');
      expect(item.why).toBe("C'est votre phase la plus fragile : 70 % de précision, contre 80 % en moyenne.");
      expect(phasesOf(item.action)).toEqual(['endgame']);
      expect(kindsOf(item.action)).toEqual([]);
      expect(item.puzzles).toEqual(['endgame']);
    });

    it('goes to the puzzles of that phase when there is nothing of it to replay', () => {
      const [item] = plan({ profile: weakEndgame() }).items;
      expect(item.title).toBe('Faites des puzzles : finale');
      expect(item.action).toEqual({ kind: 'puzzles', themes: ['endgame'] });
    });

    it('comes after the kind, the exit and the habit, and only if there is room', () => {
      const p = hangingProfile();
      p.phases.endgame = bucket(120, 70);
      p.time.pressure = bucket(100, 60);
      p.insights = [{ id: 'time', text: 'Avec peu de temps…' }];
      const pos = [...positions(4, { kind: 'hanging' }), ...positions(4, { phase: 'endgame' })];
      const repertoire = emptyRepertoire();
      repertoire.colors.w = [family([{}])];
      const items = plan({ profile: p, positions: pos, repertoire }).items;
      expect(items.map((i) => i.id)).toEqual(['train-hanging', 'exit', 'habit-time']);
      expect(items).toHaveLength(MAX_ITEMS);

      const withoutHabit = { ...p, insights: [] };
      expect(plan({ profile: withoutHabit, positions: pos, repertoire }).items.map((i) => i.id)).toEqual([
        'train-hanging',
        'exit',
        'train-endgame',
      ]);
    });
  });

  describe('the opening', () => {
    const withExits = (white: Array<Partial<RecurringExit>>, black: Array<Partial<RecurringExit>> = []) => {
      const repertoire = emptyRepertoire();
      repertoire.colors.w = [family(white)];
      repertoire.colors.b = [family(black, 'French Defense')];
      return repertoire;
    };

    it('proposes to prepare the costliest recurring exit, with the position to show', () => {
      const [item] = plan({ repertoire: withExits([{ count: 4, loss: 10 }]) }).items;
      expect(item.id).toBe('exit');
      expect(item.title).toBe('Préparez votre sortie de théorie : 8.h3');
      expect(item.why).toBe(
        'Dans Défense sicilienne, vous quittez le livre 4 fois avec ce coup, qui coûte en moyenne 10 points de chances de gain.'
      );
      expect(item.action).toEqual({ kind: 'openings', line: ['e4', 'c5'] });
      expect(item.goal).toBeUndefined();
    });

    it('takes the one that costs most in all: frequency times cost, whatever the colour', () => {
      const repertoire = withExits(
        [{ count: 4, loss: 10, san: 'h3' }], // 40
        [{ count: 3, loss: 20, san: 'a3', moveNumber: 5, line: ['e4', 'e6'] }] // 60, as Black
      );
      const [item] = plan({ repertoire }).items;
      expect(item.title).toBe('Préparez votre sortie de théorie : 5…a3');
      expect(item.action).toMatchObject({ line: ['e4', 'e6'] });
    });

    it('leaves out an exit that does not cost much', () => {
      expect(plan({ repertoire: withExits([{ isCostly: false, loss: 2 }]) }).items).toEqual([]);
    });

    it('names an opening that has no name', () => {
      const repertoire = emptyRepertoire();
      repertoire.colors.w = [family([{}], '')];
      expect(plan({ repertoire }).items[0].why).toContain('Dans cette ouverture');
    });
  });

  describe('the clock', () => {
    it('proposes a habit when the precision drops with little time', () => {
      const p = calmProfile();
      p.insights = [{ id: 'time', text: 'Avec peu de temps à la pendule, votre précision tombe à 60 %.' }];
      const [item] = plan({ profile: p }).items;
      expect(item).toMatchObject({
        id: 'habit-time',
        title: 'Gardez du temps pour la suite de la partie',
        why: 'Avec peu de temps à la pendule, votre précision tombe à 60 %.',
        action: { kind: 'habit' },
      });
    });

    it('proposes a habit for quick moves that lose 5 points or more', () => {
      const p = calmProfile();
      p.time.instant = bucket(40, 70);
      p.time.thoughtful = bucket(300, 80);
      const [item] = plan({ profile: p }).items;
      expect(item.id).toBe('habit-speed');
      expect(item.why).toBe(
        "Vos coups joués d'un seul coup perdent en précision : 70 %, contre 80 % pour les coups réfléchis."
      );
    });

    it('proposes it from a gap of exactly 5 points', () => {
      const p = calmProfile();
      p.time.instant = bucket(40, 75);
      p.time.thoughtful = bucket(300, 80);
      expect(plan({ profile: p }).items.map((i) => i.id)).toEqual(['habit-speed']);
    });

    it('says nothing for a gap under 5 points, or too few moves', () => {
      const p = calmProfile();
      p.time.instant = bucket(40, 76);
      p.time.thoughtful = bucket(300, 80);
      expect(plan({ profile: p }).items).toEqual([]);
      p.time.instant = bucket(29, 60);
      expect(plan({ profile: p }).items).toEqual([]);
    });
  });

  it('keeps three items at most', () => {
    const p = hangingProfile();
    p.time.instant = bucket(40, 60);
    p.time.thoughtful = bucket(300, 80);
    p.phases.endgame = bucket(120, 70);
    const repertoire = emptyRepertoire();
    repertoire.colors.w = [family([{}])];
    const pos = [...positions(4, { kind: 'hanging' }), ...positions(4, { phase: 'endgame' })];
    expect(plan({ profile: p, positions: pos, repertoire }).items).toHaveLength(3);
  });
});
