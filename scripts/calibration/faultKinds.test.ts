import { beforeAll, describe, expect, it } from 'vitest';
import { ensureOpeningBookLoaded } from '../../src/services/openingBook';
import { loadOpeningsFromDisk } from '../../src/test/openings';
import { FAULT_CLASSIFICATIONS, diagnoseFault, type FaultKind } from '../../src/utils/faultKinds';
import { analyseRecorded, loadReference } from './reference';

/**
 * How the faults of real games are sorted (see `scripts/faultStats.ts` for the figures on all the reference games):
 * "other" must stay a minority, or the profile says nothing about the player. About 12 % of the faults of all the
 * reference games are "other" today; the limit sits well above, so only a real loss of precision fails here.
 */
const SAMPLE = 25;
const MAX_OTHER_SHARE = 0.2;

const counts: Partial<Record<FaultKind, number>> = {};
const themes = new Set<string>();
let total = 0;

beforeAll(async () => {
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
  for (const game of loadReference()
    .games.filter((g) => g.evals)
    .slice(0, SAMPLE)) {
    const { moves } = await analyseRecorded(game);
    for (const move of moves) {
      if (!FAULT_CLASSIFICATIONS.has(move.classification)) continue;
      const { kind, theme } = diagnoseFault(move);
      counts[kind] = (counts[kind] ?? 0) + 1;
      if (theme) themes.add(theme);
      total += 1;
    }
  }
}, 120_000);

describe('the faults of the reference games', () => {
  it('are numerous enough to say something', () => {
    expect(total).toBeGreaterThan(150);
  });

  it('are mostly given a cause: "other" stays a small share', () => {
    expect((counts.other ?? 0) / total).toBeLessThan(MAX_OTHER_SHARE);
  });

  it('use the kinds of the middle of the list, not only the first ones', () => {
    for (const kind of ['hanging', 'tactic', 'exchange', 'principles'] as const) {
      expect(counts[kind] ?? 0).toBeGreaterThan(0);
    }
  });

  it('carry several tactical themes', () => {
    expect(themes.size).toBeGreaterThanOrEqual(4);
  });
});
