import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeNote } from '../utils/gameNotes';
import { clearNotesOf, exportNotes, loadNotes, mergeNotes, onNotesChanged, saveNote, writeNote } from './gameNoteStore';

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
});

const note = (id: string, text: string, tags: string[], at: number) => makeNote(id, text, tags, at);

describe('gameNoteStore', () => {
  it('saves a note and reads it back', async () => {
    expect(await saveNote(note('a', 'à revoir', ['finale'], 1))).toBe(true);
    expect([...(await loadNotes())]).toEqual([['a', note('a', 'à revoir', ['finale'], 1)]]);
  });

  it('replaces the note of a game, and keeps an emptied one for the backup but not for the list', async () => {
    await saveNote(note('a', 'un', [], 1));
    await saveNote(note('a', '', [], 2));
    expect((await loadNotes()).size).toBe(0);
    expect(await exportNotes()).toEqual([note('a', '', [], 2)]);
  });

  it('writeNote builds the note from what was typed and resolves with it', async () => {
    const saved = await writeNote('a', '  texte ', ['Tag', 'tag'], 7);
    expect(saved).toEqual({ id: 'a', note: 'texte', tags: ['tag'], updatedAt: 7 });
    expect((await loadNotes()).get('a')).toEqual(saved);
  });

  it('tells the listeners about a change', async () => {
    const listener = vi.fn();
    const off = onNotesChanged(listener);
    await saveNote(note('a', 'x', [], 1));
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    await saveNote(note('a', 'y', [], 2));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('empties the notes of deleted games with a later date, and leaves the others', async () => {
    await saveNote(note('a', 'x', ['t'], 10));
    await saveNote(note('b', 'y', [], 10));
    await clearNotesOf(['a', 'unknown'], 5);
    expect([...(await loadNotes()).keys()]).toEqual(['b']);
    const traces = await exportNotes();
    // The trace is later than the note it replaces, even with a clock set back
    expect(traces.find((n) => n.id === 'a')).toEqual({ id: 'a', note: '', tags: [], updatedAt: 11 });
    expect(traces.find((n) => n.id === 'unknown')).toBeUndefined();
  });

  describe('mergeNotes', () => {
    it('adds the notes that were not there and replaces the older ones', async () => {
      await saveNote(note('a', 'ancienne', [], 1));
      await saveNote(note('b', 'locale', [], 9));
      const report = await mergeNotes([
        note('a', 'récente', [], 5),
        note('b', 'ancienne', [], 3),
        note('c', 'neuve', [], 1),
      ]);
      expect(report).toEqual({ added: 1, replaced: 1, kept: 1 });
      const notes = await loadNotes();
      expect(notes.get('a')?.note).toBe('récente');
      expect(notes.get('b')?.note).toBe('locale');
      expect(notes.get('c')?.note).toBe('neuve');
    });

    it('lets an emptied note win over an older one: a deletion elsewhere reaches this device', async () => {
      await saveNote(note('a', 'x', ['t'], 1));
      await mergeNotes([note('a', '', [], 2)]);
      expect((await loadNotes()).size).toBe(0);
    });

    it('counts a note twice in the file once, the latest', async () => {
      const report = await mergeNotes([note('a', 'v1', [], 1), note('a', 'v2', [], 2)]);
      expect(report).toEqual({ added: 1, replaced: 0, kept: 0 });
      expect((await loadNotes()).get('a')?.note).toBe('v2');
    });

    it('stays silent when asked (a sync restoring must not trigger a sync)', async () => {
      const listener = vi.fn();
      onNotesChanged(listener);
      await mergeNotes([note('a', 'x', [], 1)], { silent: true });
      expect(listener).not.toHaveBeenCalled();
      await mergeNotes([note('b', 'x', [], 1)]);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  it('resolves with nothing stored when IndexedDB is unavailable', async () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadNotes()).toEqual(new Map());
    expect(await saveNote(note('a', 'x', [], 1))).toBe(false);
    expect(await mergeNotes([note('a', 'x', [], 1)])).toBeNull();
    warn.mockRestore();
  });
});
