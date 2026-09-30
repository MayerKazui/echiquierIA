import { describe, expect, it } from 'vitest';
import { ANALYSIS_LEVELS, DEFAULT_ANALYSIS_DEPTH } from './analysisLevels';

describe('ANALYSIS_LEVELS', () => {
  it('lists strictly increasing, unique depths', () => {
    const depths = ANALYSIS_LEVELS.map((level) => level.depth);
    expect(new Set(depths).size).toBe(depths.length);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });

  it('includes the default depth', () => {
    expect(ANALYSIS_LEVELS.map((level) => level.depth)).toContain(DEFAULT_ANALYSIS_DEPTH);
  });

  it('gives every level a label, an icon and an indicative duration', () => {
    for (const level of ANALYSIS_LEVELS) {
      expect(level.label && level.icon && level.time).toBeTruthy();
    }
  });
});
