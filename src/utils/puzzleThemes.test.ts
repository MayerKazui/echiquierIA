import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { groupThemes, knownThemes, themeGroup, themeLabel } from './puzzleThemes';

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
