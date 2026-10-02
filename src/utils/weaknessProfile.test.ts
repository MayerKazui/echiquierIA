import { describe, expect, it, vi } from 'vitest';
import type { MoveAnalysis } from '../types/chess';
import { PSEUDO, blunder, bucket, calmProfile as calm, game, gameBucket, mv } from '../test/profileFixtures';
import type { FaultKind } from './faultKinds';
import {
  ELO_MARGIN,
  MIN_BUCKET_MOVES,
  buildInsights,
  buildStrengths,
  buildProfile,
  classifyTimeControl,
  pressureThreshold,
  type Profile,
} from './weaknessProfile';

describe('which games count', () => {
  it('counts the games that name the player, whatever the case and the spaces, and tells how many were left out', async () => {
    const profile = await buildProfile([
      game({ id: 'a', white: 'alice ' }),
      game({ id: 'b', white: 'Carl', black: 'ALICE' }),
      game({ id: 'c', white: 'Carl', black: 'Dora' }),
    ]);
    expect(profile.counted).toBe(2);
    expect(profile.ignored).toBe(1);
  });

  it('leaves out a game when the player has no pseudo', async () => {
    const profile = await buildProfile([game({ pseudo: '' })]);
    expect(profile.counted).toBe(0);
    expect(profile.ignored).toBe(1);
  });

  it('leaves out a game where both players have the pseudo', async () => {
    expect((await buildProfile([game({ white: PSEUDO, black: PSEUDO })])).counted).toBe(0);
  });

  it('leaves out a game that is too short, and keeps one that is just long enough', async () => {
    const profile = await buildProfile([game({ id: 'short', plies: 9 }), game({ id: 'ok', plies: 10 })]);
    expect(profile.trend.map((g) => g.id)).toEqual(['ok']);
  });

  it('works out the side from the names, not from the colour stored with the game', async () => {
    const source = game({ white: 'Carl', black: PSEUDO, plies: 12 });
    source.result.userColor = 'w'; // wrong on purpose
    const profile = await buildProfile([source]);
    expect(profile.trend[0]).toMatchObject({ color: 'b', opponent: 'Carl' });
    expect(profile.colors.b.games).toBe(1);
    expect(profile.colors.w.games).toBe(0);
  });

  it('is empty without games, with nothing to divide by', async () => {
    const profile = await buildProfile([]);
    expect(profile.counted).toBe(0);
    expect(profile.overview).toMatchObject({ accuracy: 0, score: null, faultsPerGame: 0 });
    expect(profile.baseline).toMatchObject({ moves: 0, accuracy: null });
    expect(profile.trendChange).toBeNull();
    expect(profile.insights).toEqual([]);
  });
});

describe('overview', () => {
  it('counts wins, draws and losses from the point of view of the player', async () => {
    const profile = await buildProfile([
      game({ id: 'w1', meta: { result: '1-0' } }),
      game({ id: 'w2', white: 'Carl', black: PSEUDO, meta: { result: '0-1' } }),
      game({ id: 'd', meta: { result: '1/2-1/2' } }),
      game({ id: 'l', meta: { result: '0-1' } }),
      game({ id: 'u', meta: { result: '*' } }),
    ]);
    expect(profile.overview).toMatchObject({ wins: 2, draws: 1, losses: 1 });
    expect(profile.overview.score).toBeCloseTo(2.5 / 4); // a game without result is not a game played to the end
  });

  it('averages the accuracy of the games, theory included, and the faults per game', async () => {
    const perfect = game({ id: 'p' });
    const flawed = game({
      id: 'f',
      moves: [...Array.from({ length: 10 }, (_, i) => mv(i)), blunder(10), blunder(12)],
    });
    const profile = await buildProfile([perfect, flawed]);
    const [p, f] = profile.trend.slice().sort((a, b) => b.accuracy - a.accuracy);
    expect(p.accuracy).toBeGreaterThan(f.accuracy);
    expect(profile.overview.accuracy).toBeCloseTo((p.accuracy + f.accuracy) / 2);
    expect(profile.overview.faultsPerGame).toBe(1);
  });
});

describe('moves that count', () => {
  it('leaves the opponent moves out', async () => {
    const profile = await buildProfile([game({ plies: 40 })]);
    expect(profile.baseline.moves).toBe(20);
  });

  it('leaves the moves of the opening theory out of the figures by phase, but not out of the accuracy of the game', async () => {
    const moves = Array.from({ length: 20 }, (_, i) => mv(i, i < 8 ? { classification: 'book' } : {}));
    const profile = await buildProfile([game({ moves })]);
    expect(profile.baseline.moves).toBe(6); // 10 white moves, 4 of them theory
    expect(profile.trend[0].moves).toBe(10);
  });

  it('counts mistakes, blunders and misses as faults, and not inaccuracies', async () => {
    const moves = [
      ...Array.from({ length: 12 }, (_, i) => mv(i)),
      mv(12, { classification: 'inaccuracy' }),
      mv(14, { classification: 'mistake', faultKind: 'other' }),
      mv(16, { classification: 'blunder', faultKind: 'other' }),
      mv(18, { classification: 'missedWin', faultKind: 'other' }),
    ];
    const profile = await buildProfile([game({ moves })]);
    expect(profile.baseline.faults).toBe(3);
    expect(profile.baseline.faultsPer100).toBeCloseTo((3 / 10) * 100);
  });
});

describe('phases', () => {
  /** Alice's moves number 1..40, a blunder at the given move numbers. */
  const withBlundersAt = (...numbers: number[]) =>
    game({
      moves: Array.from({ length: 80 }, (_, i) => (i % 2 === 0 && numbers.includes(i / 2 + 1) ? blunder(i) : mv(i))),
    });

  it('cuts the game after move 12 and after move 30', async () => {
    const profile = await buildProfile([game({ plies: 80 })]);
    expect(profile.phases.opening.moves).toBe(12);
    expect(profile.phases.middlegame.moves).toBe(18);
    expect(profile.phases.endgame.moves).toBe(10);
  });

  it('puts each move in its phase', async () => {
    const profile = await buildProfile([withBlundersAt(12, 13, 30, 31)]);
    expect(profile.phases.opening.faults).toBe(1);
    expect(profile.phases.middlegame.faults).toBe(2);
    expect(profile.phases.endgame.faults).toBe(1);
  });

  it('gives a lower accuracy to the phase where the faults are', async () => {
    const { phases } = await buildProfile([withBlundersAt(35, 36, 37)]);
    expect(phases.endgame.accuracy!).toBeLessThan(phases.middlegame.accuracy!);
    expect(phases.middlegame.accuracy).toBe(phases.opening.accuracy);
  });
});

describe('kinds of fault', () => {
  const kinds = (...list: Array<FaultKind | undefined>) =>
    game({
      moves: [
        ...Array.from({ length: 12 }, (_, i) => mv(i)),
        ...list.map((k, i) => blunder(12 + 2 * i, { faultKind: k })),
      ],
    });

  it('counts the faults by kind, from the kind stored with the game', async () => {
    const { kinds: result } = await buildProfile([kinds('hanging', 'hanging', 'mate', 'other')]);
    expect(result.counts).toEqual({ mate: 1, hanging: 2, tactic: 0, wasted: 0, other: 1 });
    expect(result.total).toBe(4);
  });

  it('works the kind out for a game stored without it', async () => {
    // No stored kind: a mate missed, which needs nothing but the move itself to be recognised
    const source = game({
      id: 'old',
      moves: [
        ...Array.from({ length: 12 }, (_, i) => mv(i)),
        blunder(12, { faultKind: undefined, mateBefore: 3, mateAfter: null }),
      ],
    });
    const { kinds: result } = await buildProfile([source]);
    expect(result.counts.mate).toBe(1);
  });

  it('does not count the faults of the opponent', async () => {
    const moves = [...Array.from({ length: 12 }, (_, i) => mv(i)), blunder(13), blunder(15)];
    expect((await buildProfile([game({ moves })])).kinds.total).toBe(0);
  });

  it('lists the five worst faults, the worst first, with what they cost', async () => {
    const losses = [10, 40, 25, 60, 15, 33, 5];
    const moves = [
      ...Array.from({ length: 12 }, (_, i) => mv(i)),
      ...losses.map((loss, i) => blunder(12 + 2 * i, { winPercentLoss: loss, san: `m${i}`, bestMoveSan: `b${i}` })),
    ];
    const { worst } = await buildProfile([game({ id: 'x', moves, meta: { date: '2024.03.17' } })]);
    expect(worst.map((w) => w.loss)).toEqual([60, 40, 33, 25, 15]);
    expect(worst[0]).toMatchObject({
      gameId: 'x',
      opponent: 'Bob',
      moveNumber: 10,
      san: 'm3',
      bestSan: 'b3',
      kind: 'other',
      date: Date.UTC(2024, 2, 17),
    });
  });
});

describe('time', () => {
  /** 30 moves of Alice: the first `rushed` with 20 s left, the others with 200 s (a 300 s game: the limit is 30 s). */
  const timed = (rushed: number, over: Partial<MoveAnalysis> = {}) =>
    game({
      meta: { timeControl: '300' },
      moves: Array.from({ length: 60 }, (_, i) =>
        mv(i, i % 2 === 0 ? { clock: i / 2 < rushed ? '0:20' : '3:20', thinkTimeSeconds: 5, ...over } : {})
      ),
    });

  it('separates the moves played with little time left (a tenth of the time control) from the others', async () => {
    const { time } = await buildProfile([timed(8)]);
    expect(time.pressure.moves).toBe(8);
    expect(time.comfortable.moves).toBe(22);
    expect(time.gamesWithClocks).toBe(1);
  });

  it('counts the limit itself as little time', async () => {
    const source = timed(0);
    source.result.moves[0] = mv(0, { clock: '0:30', thinkTimeSeconds: 5 });
    expect((await buildProfile([source])).time.pressure.moves).toBe(1);
  });

  it('reads clocks with hours', async () => {
    const source = game({
      meta: { timeControl: '7200' },
      moves: Array.from({ length: 20 }, (_, i) => mv(i, i === 0 ? { clock: '0:01:50' } : {})),
    });
    // 7200 s: the limit is 2 minutes
    expect((await buildProfile([source])).time.pressure.moves).toBe(1);
  });

  it('has no figures for a game without clocks', async () => {
    const { time } = await buildProfile([game()]);
    expect(time.gamesWithClocks).toBe(0);
    expect(time.pressure.moves + time.comfortable.moves + time.instant.moves + time.thoughtful.moves).toBe(0);
  });

  it('separates the moves played at once (3 s or less) from the others', async () => {
    const moves = Array.from({ length: 40 }, (_, i) =>
      mv(i, i % 2 === 0 ? { thinkTimeSeconds: i % 4 === 0 ? 3 : 4 } : { thinkTimeSeconds: 0 })
    );
    const { time } = await buildProfile([game({ moves })]);
    expect(time.instant.moves).toBe(10);
    expect(time.thoughtful.moves).toBe(10);
  });

  it('computes the limit of the clock', () => {
    expect(pressureThreshold(null)).toBe(20);
    expect(pressureThreshold(10)).toBe(20);
    expect(pressureThreshold(60)).toBe(10);
    expect(pressureThreshold(300)).toBe(30);
    expect(pressureThreshold(1800)).toBe(120);
    expect(pressureThreshold(7200)).toBe(120);
  });
});

describe('colours', () => {
  it('splits the moves and the score by colour', async () => {
    const profile = await buildProfile([
      game({ id: 'a', meta: { result: '1-0' } }),
      game({ id: 'b', meta: { result: '0-1' } }),
      game({ id: 'c', white: 'Carl', black: PSEUDO, meta: { result: '0-1' } }),
    ]);
    expect(profile.colors.w).toMatchObject({ games: 2, score: 0.5 });
    expect(profile.colors.b).toMatchObject({ games: 1, score: 1 });
    expect(profile.colors.w.moves).toBe(40);
  });
});

describe('opponents', () => {
  const rated = (id: string, user: string, opponent: string) =>
    game({ id, meta: { whiteElo: user, blackElo: opponent } });

  it('separates stronger, similar and weaker opponents at 50 points', async () => {
    expect(ELO_MARGIN).toBe(50);
    const { opponents } = await buildProfile([
      rated('s', '1500', '1550'),
      rated('s2', '1500', '1700'),
      rated('m1', '1500', '1549'),
      rated('m2', '1500', '1451'),
      rated('w', '1500', '1450'),
    ]);
    expect([opponents.stronger.games, opponents.similar.games, opponents.weaker.games]).toEqual([2, 2, 1]);
  });

  it('reads the ratings from the side of the player', async () => {
    const source = game({ white: 'Carl', black: PSEUDO, meta: { whiteElo: '1900', blackElo: '1500' } });
    expect((await buildProfile([source])).opponents.stronger.games).toBe(1);
  });

  it('leaves out games without both ratings', async () => {
    const { opponents } = await buildProfile([
      game({ id: 'a', meta: { whiteElo: '1500' } }),
      game({ id: 'b', meta: { whiteElo: '1500', blackElo: '?' } }),
      game({ id: 'c' }),
    ]);
    expect(opponents.stronger.games + opponents.similar.games + opponents.weaker.games).toBe(0);
  });
});

describe('time controls', () => {
  it('classifies a time control', () => {
    expect(classifyTimeControl('60')).toBe('bullet');
    expect(classifyTimeControl('179')).toBe('bullet');
    expect(classifyTimeControl('180')).toBe('blitz');
    expect(classifyTimeControl('300+3')).toBe('blitz'); // 300 + 40 × 3 = 420
    expect(classifyTimeControl('300+5')).toBe('rapid'); // 500
    expect(classifyTimeControl('600')).toBe('rapid');
    expect(classifyTimeControl('1500')).toBe('classical');
    expect(classifyTimeControl('1/86400')).toBe('daily');
    expect(classifyTimeControl('40/7200:3600')).toBe('daily');
    expect(classifyTimeControl('-')).toBeNull();
    expect(classifyTimeControl(undefined)).toBeNull();
  });

  it('groups the games by time control, leaving out the classes without game', async () => {
    const { timeControls } = await buildProfile([
      game({ id: 'a', meta: { timeControl: '180' } }),
      game({ id: 'b', meta: { timeControl: '300' } }),
      game({ id: 'c', meta: { timeControl: '1/86400' } }),
      game({ id: 'd' }),
    ]);
    expect(Object.keys(timeControls).sort()).toEqual(['blitz', 'daily']);
    expect(timeControls.blitz?.games).toBe(2);
  });
});

describe('trend and window', () => {
  /** Games of Alice, game i played on the i-th day of March 2024; the later ones are the better ones. */
  const series = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      game({
        id: `g${i}`,
        savedAt: 1000 - i, // stored in the reverse order, to check that the date counts
        meta: { date: `2024.03.${String(i + 1).padStart(2, '0')}` },
        moves: Array.from({ length: 30 }, (_, ply) =>
          ply % 2 === 0 && ply / 2 < 8 - Math.floor(i / 2) ? blunder(ply) : mv(ply)
        ),
      })
    );

  it('orders the games from the oldest to the newest by their date', async () => {
    const profile = await buildProfile(series(5).reverse());
    expect(profile.trend.map((g) => g.id)).toEqual(['g0', 'g1', 'g2', 'g3', 'g4']);
  });

  it('orders the games of one day by the moment they were stored', async () => {
    const sameDay = ['b', 'a', 'c'].map((id, i) =>
      game({ id, savedAt: [20, 10, 30][i], meta: { date: '2024.03.01' } })
    );
    expect((await buildProfile(sameDay)).trend.map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('uses the moment a game was stored when its date is missing or partial', async () => {
    const profile = await buildProfile([
      game({ id: 'late', savedAt: 3000, meta: { date: '????.??.??' } }),
      game({ id: 'undated', savedAt: 2000 }),
    ]);
    expect(profile.trend.map((g) => g.date)).toEqual([2000, 3000]);
  });

  it('keeps the latest games when a window is asked, and counts only them', async () => {
    const profile = await buildProfile(series(12), 5);
    expect(profile.counted).toBe(5);
    expect(profile.trend.map((g) => g.id)).toEqual(['g7', 'g8', 'g9', 'g10', 'g11']);
  });

  it('does not count the games out of the window as left out', async () => {
    expect((await buildProfile(series(12), 5)).ignored).toBe(0);
  });

  it('has no change under 6 games', async () => {
    expect((await buildProfile(series(5))).trendChange).toBeNull();
  });

  it('compares the last games with the ones before, half and half when there are few', async () => {
    const change = (await buildProfile(series(6))).trendChange!;
    expect(change.count).toBe(3);
    expect(change.accuracy.recent).toBeGreaterThan(change.accuracy.previous);
    expect(change.faults.recent).toBeLessThan(change.faults.previous);
  });

  it('compares windows of 10 games at most', async () => {
    expect((await buildProfile(series(30))).trendChange!.count).toBe(10);
    expect((await buildProfile(series(21))).trendChange!.count).toBe(10);
    expect((await buildProfile(series(7))).trendChange!.count).toBe(3);
  });
});

describe('letting the page breathe', () => {
  it('gives the hand back between games when the work is long', async () => {
    const yieldToUi = vi.fn(() => Promise.resolve());
    await buildProfile([game({ id: 'a' }), game({ id: 'b' }), game({ id: 'c' })], undefined, {
      yieldToUi,
      sliceMs: -1,
    });
    expect(yieldToUi).toHaveBeenCalledTimes(3);
  });

  it('does not, when the work is short', async () => {
    const yieldToUi = vi.fn(() => Promise.resolve());
    await buildProfile([game({ id: 'a' }), game({ id: 'b' })], undefined, { yieldToUi, sliceMs: 60_000 });
    expect(yieldToUi).not.toHaveBeenCalled();
  });

  it('stops when the page says so', async () => {
    const yieldToUi = () => Promise.reject(new Error('stop'));
    await expect(buildProfile([game()], undefined, { yieldToUi, sliceMs: -1 })).rejects.toThrow('stop');
  });
});

describe('insights', () => {
  it('has nothing to say when nothing stands out', () => {
    expect(buildInsights(calm())).toEqual([]);
  });

  describe('the kind of fault that comes back', () => {
    const withKind = (kind: FaultKind, count: number, total = 20): Profile => {
      const p = calm();
      p.kinds = { counts: { ...p.kinds.counts, other: total - count, [kind]: count }, total };
      return p;
    };

    it('points out a kind that makes a quarter of the faults, with its count', () => {
      expect(buildInsights(withKind('hanging', 8))).toEqual([
        { id: 'fault', text: '40 % de vos erreurs (8 sur 20) laissent une pièce en prise.' },
      ]);
    });

    it('has a sentence for each kind', () => {
      expect(buildInsights(withKind('mate', 8))[0].text).toContain('sont un mat manqué ou subi');
      expect(buildInsights(withKind('tactic', 8))[0].text).toContain('fourchette');
      expect(buildInsights(withKind('wasted', 8))[0].text).toContain('position gagnée');
    });

    it('wants 25 % of the faults at least', () => {
      expect(buildInsights(withKind('hanging', 5, 21))).toEqual([]); // 23.8 %
      expect(buildInsights(withKind('hanging', 5, 20))).toHaveLength(1); // 25 %
    });

    it('wants 5 faults at least', () => {
      expect(buildInsights(withKind('hanging', 4, 8))).toEqual([]);
      expect(buildInsights(withKind('hanging', 5, 8))).toHaveLength(1);
    });

    it('never points out "other", which says nothing', () => {
      const p = calm();
      p.kinds = { counts: { mate: 0, hanging: 0, tactic: 0, wasted: 0, other: 30 }, total: 30 };
      expect(buildInsights(p)).toEqual([]);
    });

    it('takes the most frequent kind', () => {
      const p = calm();
      p.kinds = { counts: { mate: 6, hanging: 9, tactic: 7, wasted: 0, other: 0 }, total: 22 };
      expect(buildInsights(p)[0].text).toContain('pièce en prise');
    });
  });

  describe('the weakest phase', () => {
    const withEndgame = (accuracy: number, moves = 120): Profile => {
      const p = calm();
      p.phases.endgame = bucket(moves, accuracy);
      return p;
    };

    it('points out a phase 3 points under the average', () => {
      expect(buildInsights(withEndgame(77))).toEqual([
        { id: 'phase', text: 'Votre phase la plus fragile est la finale : 77 % de précision, contre 80 % en moyenne.' },
      ]);
    });

    it('does not for 2 points', () => {
      expect(buildInsights(withEndgame(78))).toEqual([]);
    });

    it('wants 60 moves in the phase', () => {
      expect(buildInsights(withEndgame(60, 59))).toEqual([]);
      expect(buildInsights(withEndgame(60, 60))).toHaveLength(1);
    });

    it('names the right phase', () => {
      const p = calm();
      p.phases.opening = bucket(240, 70);
      p.phases.middlegame = bucket(240, 75);
      expect(buildInsights(p)[0].text).toContain("l'ouverture");
      p.phases.opening = bucket(240, 80);
      expect(buildInsights(p)[0].text).toContain('le milieu de jeu');
    });
  });

  describe('time pressure', () => {
    const withTime = (pressure: number, pressureMoves = 100, comfortableMoves = 400): Profile => {
      const p = calm();
      p.time.pressure = bucket(pressureMoves, pressure);
      p.time.comfortable = bucket(comfortableMoves, 80);
      return p;
    };

    it('points out a drop of 8 points under pressure', () => {
      expect(buildInsights(withTime(72))).toEqual([
        { id: 'time', text: 'Avec peu de temps à la pendule, votre précision tombe à 72 % (contre 80 % sinon).' },
      ]);
    });

    it('does not for 7 points', () => {
      expect(buildInsights(withTime(73))).toEqual([]);
    });

    it(`wants ${MIN_BUCKET_MOVES} moves on each side`, () => {
      expect(buildInsights(withTime(50, MIN_BUCKET_MOVES - 1))).toEqual([]);
      expect(buildInsights(withTime(50, MIN_BUCKET_MOVES, MIN_BUCKET_MOVES - 1))).toEqual([]);
      expect(buildInsights(withTime(50, MIN_BUCKET_MOVES, MIN_BUCKET_MOVES))).toHaveLength(1);
    });

    it('does not mind playing better under pressure', () => {
      expect(buildInsights(withTime(95))).toEqual([]);
    });
  });

  describe('colour', () => {
    it('points out the colour played worse, from 5 points', () => {
      const p = calm();
      p.colors.b = gameBucket(300, 74);
      expect(buildInsights(p)).toEqual([
        {
          id: 'color',
          text: 'Avec les Noirs, vous jouez moins bien : 74 % de précision, contre 80 % avec les Blancs.',
        },
      ]);
      const q = calm();
      q.colors.w = gameBucket(300, 74);
      expect(buildInsights(q)[0].text).toBe(
        'Avec les Blancs, vous jouez moins bien : 74 % de précision, contre 80 % avec les Noirs.'
      );
    });

    it('does not for 4 points, or without moves with one of the colours', () => {
      const p = calm();
      p.colors.b = gameBucket(300, 76);
      expect(buildInsights(p)).toEqual([]);
      p.colors.b = gameBucket(10, 60);
      expect(buildInsights(p)).toEqual([]);
    });
  });

  describe('trend', () => {
    const withTrend = (recent: number, previous: number): Profile => {
      const p = calm();
      p.trendChange = { count: 10, accuracy: { recent, previous }, faults: { recent: 3, previous: 3 } };
      return p;
    };

    it('says it improves, from 3 points', () => {
      expect(buildInsights(withTrend(83, 80))).toEqual([
        { id: 'trend', text: 'Vos 10 dernières parties : 83 % de précision, 3 points de plus que les 10 précédentes.' },
      ]);
    });

    it('says it drops', () => {
      expect(buildInsights(withTrend(77, 80))[0].text).toContain('3 points de moins');
      expect(buildInsights(withTrend(79, 80.4))).toEqual([]);
    });

    it('does not say anything for 2 points', () => {
      expect(buildInsights(withTrend(82, 80))).toEqual([]);
    });

    it('rounds the difference to whole points', () => {
      expect(buildInsights(withTrend(83.4, 80))[0].text).toContain('3 points');
    });
  });

  it('lists the insights in a fixed order: faults, phase, time, colour, trend', () => {
    const p = calm();
    p.kinds = { counts: { mate: 0, hanging: 10, tactic: 0, wasted: 0, other: 10 }, total: 20 };
    p.phases.endgame = bucket(120, 70);
    p.time.pressure = bucket(100, 60);
    p.colors.b = gameBucket(300, 70);
    p.trendChange = { count: 10, accuracy: { recent: 70, previous: 80 }, faults: { recent: 3, previous: 3 } };
    expect(buildInsights(p).map((i) => i.id)).toEqual(['fault', 'phase', 'time', 'color', 'trend']);
  });

  it('is part of the profile', async () => {
    const moves = [
      ...Array.from({ length: 12 }, (_, i) => mv(i)),
      ...Array.from({ length: 6 }, (_, i) => blunder(12 + 2 * i, { faultKind: 'hanging' })),
    ];
    const profile = await buildProfile([game({ moves })]);
    expect(profile.insights.map((i) => i.id)).toContain('fault');
  });
});

describe('strengths', () => {
  /** A profile with nothing to point out, as a strength either (under time pressure the precision drops 3 points). */
  const plain = (): Profile => {
    const p = calm();
    p.time.pressure = bucket(100, 77);
    p.opponents.stronger = { ...bucket(0, null), games: 0, score: null };
    return p;
  };

  it('has nothing to say when nothing stands out', () => {
    expect(buildStrengths(plain())).toEqual([]);
  });

  describe('the phase above the average', () => {
    it('names the most accurate phase, with its figure and the average', () => {
      const p = plain();
      p.phases.middlegame = bucket(240, 86);
      expect(buildStrengths(p)).toEqual([
        {
          id: 'phase',
          text: 'Votre phase la plus solide est le milieu de jeu : 86 % de précision, contre 80 % en moyenne.',
        },
      ]);
    });

    it('wants 3 points above the average', () => {
      const p = plain();
      p.phases.endgame = bucket(120, 82.9);
      expect(buildStrengths(p)).toEqual([]);
      p.phases.endgame = bucket(120, 83);
      expect(buildStrengths(p).map((s) => s.id)).toEqual(['phase']);
    });

    it('wants enough moves behind the figure', () => {
      const p = plain();
      p.phases.endgame = bucket(59, 95);
      expect(buildStrengths(p)).toEqual([]);
      p.phases.endgame = bucket(60, 95);
      expect(buildStrengths(p)).toHaveLength(1);
    });

    it('takes the best one when several are above', () => {
      const p = plain();
      p.phases.opening = bucket(240, 85);
      p.phases.endgame = bucket(120, 90);
      expect(buildStrengths(p)[0].text).toContain('la finale');
    });

    it('says nothing without an average', () => {
      const p = plain();
      p.baseline = bucket(0, null);
      p.phases.endgame = bucket(120, 95);
      expect(buildStrengths(p)).toEqual([]);
    });
  });

  describe('a precision that holds', () => {
    it('says it holds under time pressure, when the loss is under 2 points', () => {
      const p = plain();
      p.time.pressure = bucket(100, 79);
      expect(buildStrengths(p)).toEqual([
        { id: 'time', text: 'Vous gardez votre précision quand le temps manque : 79 %, contre 80 % avec du temps.' },
      ]);
      p.time.pressure = bucket(100, 78);
      expect(buildStrengths(p)).toEqual([]);
    });

    it('wants enough moves on both sides', () => {
      const p = plain();
      p.time.pressure = bucket(29, 80);
      expect(buildStrengths(p)).toEqual([]);
    });

    it('says the quick moves are as good as the others, under the same rule', () => {
      const p = plain();
      p.time.instant = bucket(40, 80);
      p.time.thoughtful = bucket(300, 81);
      expect(buildStrengths(p).map((s) => s.id)).toContain('speed');
      p.time.instant = bucket(40, 70);
      expect(buildStrengths(p).map((s) => s.id)).not.toContain('speed');
    });

    it('says nothing for a figure that does not exist', () => {
      const p = plain();
      p.time.pressure = bucket(100, null);
      expect(buildStrengths(p)).toEqual([]);
    });
  });

  describe('the score against stronger players', () => {
    const against = (games: number, score: number | null): Profile => {
      const p = plain();
      p.opponents.stronger = { ...gameBucket(100, 78), games, score };
      return p;
    };

    it('says it from half a point per game, with the number of games', () => {
      expect(buildStrengths(against(5, 0.6))).toEqual([
        { id: 'opponent', text: 'Vous tenez tête aux joueurs plus forts : 60 % des points sur 5 parties.' },
      ]);
      expect(buildStrengths(against(5, 0.5))).toHaveLength(1);
      expect(buildStrengths(against(5, 0.4))).toEqual([]);
    });

    it('wants 3 games', () => {
      expect(buildStrengths(against(2, 1))).toEqual([]);
      expect(buildStrengths(against(3, 1))).toHaveLength(1);
    });

    it('says nothing without a result', () => {
      expect(buildStrengths(against(5, null))).toEqual([]);
    });
  });

  describe('a kind of fault that is rare', () => {
    const withKinds = (counts: Partial<Record<FaultKind, number>>): Profile => {
      const p = plain();
      const all = { mate: 0, hanging: 0, tactic: 0, wasted: 0, other: 0, ...counts };
      p.kinds = { counts: all, total: Object.values(all).reduce((a, b) => a + b, 0) };
      return p;
    };

    it('points out the rarest, with its count', () => {
      expect(buildStrengths(withKinds({ mate: 0, hanging: 8, tactic: 7, wasted: 5, other: 4 }))).toEqual([
        { id: 'kind', text: 'Vous voyez bien les mats : 0 de vos 24 erreurs seulement en relèvent.' },
      ]);
    });

    it('has a sentence for each kind', () => {
      const rare = (kind: FaultKind) => {
        const counts = { mate: 8, hanging: 8, tactic: 8, wasted: 8, [kind]: 0 };
        return buildStrengths(withKinds(counts))[0].text;
      };
      expect(rare('hanging')).toContain('rarement une pièce en prise');
      expect(rare('tactic')).toContain('fourchettes');
      expect(rare('wasted')).toContain('positions gagnées');
    });

    it('wants it at 5 % of the faults at most', () => {
      expect(buildStrengths(withKinds({ mate: 1, hanging: 5, tactic: 7, wasted: 7 }))).toHaveLength(1); // 1/20 = 5 %
      expect(buildStrengths(withKinds({ mate: 2, hanging: 5, tactic: 6, wasted: 7 }))).toEqual([]); // 2/20 = 10 %
    });

    it('wants 20 faults to speak of', () => {
      expect(buildStrengths(withKinds({ hanging: 10, tactic: 9 }))).toEqual([]);
    });

    it('does not speak when most faults are unclassified', () => {
      expect(buildStrengths(withKinds({ hanging: 5, tactic: 4, other: 30 }))).toEqual([]);
    });
  });

  it('lists the strengths in a fixed order: phase, time, speed, opponent, kind', () => {
    const p = plain();
    p.phases.endgame = bucket(120, 90);
    p.time.instant = bucket(40, 80);
    p.time.thoughtful = bucket(300, 80);
    p.time.pressure = bucket(100, 80);
    p.opponents.stronger = { ...gameBucket(100, 78), games: 5, score: 0.7 };
    p.kinds = { counts: { mate: 0, hanging: 8, tactic: 8, wasted: 8, other: 0 }, total: 24 };
    expect(buildStrengths(p).map((s) => s.id)).toEqual(['phase', 'time', 'speed', 'opponent', 'kind']);
  });

  it('is part of the profile', async () => {
    const profile = await buildProfile([game()]);
    expect(Array.isArray(profile.strengths)).toBe(true);
  });
});
