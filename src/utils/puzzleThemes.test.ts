import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TACTIC_THEMES } from './tacticThemes';
import {
  FAULT_PUZZLE_THEMES,
  NO_PUZZLE_THEMES,
  faultPuzzleThemes,
  faultThemeCounts,
  groupThemes,
  knownThemes,
  themeGroup,
  themeLabel,
} from './puzzleThemes';

describe('themeLabel and themeGroup', () => {
  it('give the French name and the group of a known theme', () => {
    expect(themeLabel('fork')).toBe('Fourchette');
    expect(themeGroup('fork')).toBe('motifs');
    expect(themeLabel('backRankMate')).toBe('Mat du couloir');
    expect(themeGroup('backRankMate')).toBe('mates');
    expect(themeGroup('rookEndgame')).toBe('phases');
  });

  it('show an unknown theme under its own name, in "Autres"', () => {
    expect(themeLabel('newLichessTheme')).toBe('newLichessTheme');
    expect(themeGroup('newLichessTheme')).toBe('others');
  });

  it('know every theme of the puzzles shipped with the app', () => {
    const directory = resolve(import.meta.dirname, '../../public/puzzles');
    if (!readdirSync(directory).includes('index.json')) return;
    const index = JSON.parse(readFileSync(resolve(directory, 'index.json'), 'utf-8')) as {
      themes: Record<string, unknown>;
    };
    const unknown = Object.keys(index.themes).filter((theme) => !knownThemes().includes(theme));
    expect(unknown).toEqual([]);
  });
});

describe('groupThemes', () => {
  it('keeps the themes that are available, grouped, the known ones in their order', () => {
    const groups = groupThemes(['mateIn2', 'pin', 'zzz', 'fork', 'endgame', 'mateIn1']);
    expect(groups.map((group) => group.id)).toEqual(['motifs', 'mates', 'phases', 'others']);
    expect(groups[0].themes).toEqual(['fork', 'pin']);
    expect(groups[1].themes).toEqual(['mateIn1', 'mateIn2']);
    expect(groups[3].themes).toEqual(['zzz']);
  });

  it('leaves out a group without themes', () => {
    expect(groupThemes(['fork']).map((group) => group.id)).toEqual(['motifs']);
  });
});

describe('the themes of the faults', () => {
  it('all have puzzles in the index shipped with the app, so that a theme found in a game leads somewhere', () => {
    const directory = resolve(import.meta.dirname, '../../public/puzzles');
    if (!readdirSync(directory).includes('index.json')) return;
    const index = JSON.parse(readFileSync(resolve(directory, 'index.json'), 'utf-8')) as {
      themes: Record<string, unknown>;
    };
    const wanted = [
      ...TACTIC_THEMES.filter((theme) => !NO_PUZZLE_THEMES.has(theme)),
      'mateIn1',
      'mateIn2',
      'mateIn3',
      'mateIn4',
      'mateIn5',
      ...Object.values(FAULT_PUZZLE_THEMES).flat(),
    ];
    expect(wanted.filter((theme) => !(theme in index.themes))).toEqual([]);
  });

  it('are counted by kind, the most frequent first, the mate themes apart from the tactics', () => {
    const found = { fork: 2, pin: 5, backRankMate: 3, mateIn1: 1, skewer: 0 };
    expect(faultThemeCounts('tactic', found)).toEqual([
      ['pin', 5],
      ['fork', 2],
    ]);
    expect(faultThemeCounts('mate', found)).toEqual([
      ['backRankMate', 3],
      ['mateIn1', 1],
    ]);
    expect(faultThemeCounts('hanging', found)).toEqual([]);
  });

  it("give the puzzle themes against a kind: the player's own, three at most, else the usual ones", () => {
    expect(faultPuzzleThemes('tactic', { fork: 1, pin: 2, skewer: 3, discoveredAttack: 4 })).toEqual([
      'discoveredAttack',
      'skewer',
      'pin',
    ]);
    expect(faultPuzzleThemes('tactic', {})).toEqual(['fork', 'pin', 'skewer']);
    expect(faultPuzzleThemes('hanging', { fork: 9 })).toEqual(['hangingPiece']);
    expect(faultPuzzleThemes('other')).toEqual([]);
  });

  it('leave out a theme with no puzzles, so that the plan never offers an empty list', () => {
    expect(faultPuzzleThemes('tactic', { overloading: 9, fork: 2 })).toEqual(['fork']);
    expect(faultPuzzleThemes('tactic', { overloading: 9 })).toEqual(['fork', 'pin', 'skewer']);
  });
});
