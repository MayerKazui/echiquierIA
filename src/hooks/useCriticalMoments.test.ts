import { describe, expect, it } from 'vitest';
import type { MoveAnalysis, MoveClassification } from '../types/chess';
import { isPauseWorthy } from './useCriticalMoments';

const move = (classification: MoveClassification) => ({ classification }) as MoveAnalysis;

describe('isPauseWorthy', () => {
  it.each<MoveClassification>(['mistake', 'blunder', 'missedWin'])('stops auto-play on a %s', (classification) => {
    expect(isPauseWorthy(move(classification))).toBe(true);
  });

  it.each<MoveClassification>(['inaccuracy', 'good', 'excellent', 'best', 'great', 'brilliant', 'book'])(
    'does not stop on %s: it would stop all the time',
    (classification) => {
      expect(isPauseWorthy(move(classification))).toBe(false);
    }
  );

  it('does not stop when there is no move', () => {
    expect(isPauseWorthy(undefined)).toBe(false);
  });
});
