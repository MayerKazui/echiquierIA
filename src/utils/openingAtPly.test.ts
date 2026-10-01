import { describe, expect, it } from 'vitest';
import { openingAtPly } from './openingAtPly';
import type { MoveAnalysis } from '../types/chess';

const move = (openingName?: string, eco?: string) => ({ openingName, eco }) as MoveAnalysis;

describe('openingAtPly', () => {
  const moves = [
    move("King's Pawn Game", 'B00'),
    move('Sicilian Defense', 'B20'),
    move(),
    move('Sicilian Defense: Najdorf', 'B90'),
  ];

  it('follows the game: the name reached so far, never a later one', () => {
    expect(openingAtPly(moves, 0)).toEqual({ name: "King's Pawn Game", eco: 'B00' });
    expect(openingAtPly(moves, 1)).toEqual({ name: 'Sicilian Defense', eco: 'B20' });
    expect(openingAtPly(moves, 3)).toEqual({ name: 'Sicilian Defense: Najdorf', eco: 'B90' });
  });

  it('keeps the last name on the moves that carry none', () => {
    expect(openingAtPly(moves, 2)).toEqual({ name: 'Sicilian Defense', eco: 'B20' });
  });

  it('is null before any name, without moves, and clamps a ply past the end', () => {
    expect(openingAtPly([move(), move('X', 'A00')], 0)).toBeNull();
    expect(openingAtPly(undefined, 3)).toBeNull();
    expect(openingAtPly([], 0)).toBeNull();
    expect(openingAtPly(moves, 99)?.name).toBe('Sicilian Defense: Najdorf');
  });
});
