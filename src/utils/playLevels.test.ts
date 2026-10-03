import { describe, expect, it } from 'vitest';
import { DEFAULT_LEVEL_ID, PLAY_LEVELS, levelById, levelCommands } from './playLevels';

describe('levels', () => {
  it('have distinct ids, and the Elo ones are within what the engine accepts and increase', () => {
    expect(new Set(PLAY_LEVELS.map((l) => l.id)).size).toBe(PLAY_LEVELS.length);
    const elos = PLAY_LEVELS.flatMap((l) => (l.elo === null ? [] : [l.elo]));
    expect(elos).toEqual([...elos].sort((a, b) => a - b));
    for (const elo of elos) expect(elo >= 1320 && elo <= 3190).toBe(true);
  });

  it('fall back to the default level for an unknown id', () => {
    expect(levelById('nimporte').id).toBe(DEFAULT_LEVEL_ID);
    expect(levelById(undefined).id).toBe(DEFAULT_LEVEL_ID);
    expect(levelById('expert').id).toBe('expert');
  });

  it('set every option, so that the previous game leaves nothing behind', () => {
    expect(levelCommands(levelById('club'))).toEqual([
      'setoption name Skill Level value 20',
      'setoption name UCI_LimitStrength value true',
      'setoption name UCI_Elo value 1600',
    ]);
    expect(levelCommands(levelById('debutant'))).toEqual([
      'setoption name Skill Level value 0',
      'setoption name UCI_LimitStrength value false',
    ]);
    expect(levelCommands(levelById('maximum'))).toContain('setoption name UCI_LimitStrength value false');
  });
});
