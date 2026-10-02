import { describe, expect, it } from 'vitest';
import type { StoredGame } from '../services/gameStore';
import { game } from '../test/profileFixtures';
import { estimateElo, playerEloIn } from './usePlayerElo';

const stored = (over: Parameters<typeof game>[0] = {}): StoredGame => {
  const source = game(over);
  return { id: source.id, pgn: '', depth: 12, savedAt: source.savedAt, schemaVersion: 1, result: source.result };
};

describe('playerEloIn', () => {
  it('reads the rating of the side the player has', () => {
    expect(playerEloIn(stored({ meta: { whiteElo: '1450', blackElo: '1600' } }))).toBe(1450);
    expect(playerEloIn(stored({ white: 'Bob', black: 'Alice', meta: { whiteElo: '1600', blackElo: '1450' } }))).toBe(
      1450
    );
  });

  it('is null without a rating, or when the player is not named in the game', () => {
    expect(playerEloIn(stored())).toBeNull();
    expect(playerEloIn(stored({ white: 'Carl', black: 'Dora', meta: { whiteElo: '1500' } }))).toBeNull();
    expect(playerEloIn(stored({ meta: { whiteElo: '?' } }))).toBeNull();
  });
});

describe('estimateElo', () => {
  it('is the middle rating of the games that have one', () => {
    const games = [1400, 1500, 1800].map((elo, i) =>
      stored({ id: `g${i}`, savedAt: i, meta: { whiteElo: String(elo) } })
    );
    expect(estimateElo([...games, stored({ id: 'none', savedAt: 9 })])).toBe(1500);
  });

  it('looks at the latest games only', () => {
    const old = Array.from({ length: 30 }, (_, i) => stored({ id: `o${i}`, savedAt: i, meta: { whiteElo: '1000' } }));
    const recent = Array.from({ length: 30 }, (_, i) =>
      stored({ id: `r${i}`, savedAt: 100 + i, meta: { whiteElo: '1600' } })
    );
    expect(estimateElo([...old, ...recent])).toBe(1600);
  });

  it('is null without any rating', () => {
    expect(estimateElo([])).toBeNull();
    expect(estimateElo([stored()])).toBeNull();
  });
});
