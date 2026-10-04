import { describe, expect, it } from 'vitest';
import {
  MAX_NOTE_LENGTH,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  hasContent,
  isGameNote,
  makeNote,
  normalizeTag,
  parseTags,
  tagCounts,
} from './gameNotes';

describe('normalizeTag', () => {
  it('trims, lowers the case, drops a leading # and collapses the spaces', () => {
    expect(normalizeTag('  #À   Revoir ')).toBe('à revoir');
    expect(normalizeTag('##tournoi')).toBe('tournoi');
    expect(normalizeTag('   ')).toBe('');
  });

  it('cuts a long tag', () => {
    expect(normalizeTag('x'.repeat(100))).toHaveLength(MAX_TAG_LENGTH);
  });
});

describe('parseTags', () => {
  it('reads tags separated by commas, semicolons or line breaks, without duplicates or empties', () => {
    expect(parseTags('à revoir, Tournoi;à REVOIR\n,, finale')).toEqual(['à revoir', 'tournoi', 'finale']);
    expect(parseTags('')).toEqual([]);
  });

  it('keeps no more than the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`).join(',');
    expect(parseTags(many)).toHaveLength(MAX_TAGS);
  });
});

describe('makeNote', () => {
  it('trims and cuts the text and normalises the tags', () => {
    const note = makeNote('g', `  ${'a'.repeat(MAX_NOTE_LENGTH + 50)}  `, ['Zeitnot', 'zeitnot', ' '], 42);
    expect(note.note).toHaveLength(MAX_NOTE_LENGTH);
    expect(note).toMatchObject({ id: 'g', tags: ['zeitnot'], updatedAt: 42 });
  });
});

describe('hasContent', () => {
  it('is false for no note and for an emptied one', () => {
    expect(hasContent(undefined)).toBe(false);
    expect(hasContent(makeNote('g', '  ', [], 1))).toBe(false);
    expect(hasContent(makeNote('g', 'x', [], 1))).toBe(true);
    expect(hasContent(makeNote('g', '', ['a'], 1))).toBe(true);
  });
});

describe('isGameNote', () => {
  const valid = { id: 'g', note: 'x', tags: ['a'], updatedAt: 5 };

  it('accepts a note, and refuses what is not one', () => {
    expect(isGameNote(valid)).toBe(true);
    expect(isGameNote({ ...valid, id: '' })).toBe(false);
    expect(isGameNote({ ...valid, note: 5 })).toBe(false);
    expect(isGameNote({ ...valid, tags: ['a', 2] })).toBe(false);
    expect(isGameNote({ ...valid, tags: 'a' })).toBe(false);
    expect(isGameNote({ ...valid, updatedAt: NaN })).toBe(false);
    expect(isGameNote({ ...valid, note: 'x'.repeat(MAX_NOTE_LENGTH + 1) })).toBe(false);
    expect(isGameNote({ ...valid, tags: Array.from({ length: MAX_TAGS + 1 }, () => 'a') })).toBe(false);
    expect(isGameNote(null)).toBe(false);
  });
});

describe('tagCounts', () => {
  it('counts the tags, the most used first, then in alphabetical order', () => {
    const notes = [makeNote('1', '', ['b', 'a'], 1), makeNote('2', '', ['b', 'é'], 1), makeNote('3', '', ['c'], 1)];
    expect(tagCounts(notes)).toEqual([
      { tag: 'b', count: 2 },
      { tag: 'a', count: 1 },
      { tag: 'c', count: 1 },
      { tag: 'é', count: 1 },
    ]);
  });
});
