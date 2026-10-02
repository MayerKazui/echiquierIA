import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteStudy, isStudy, listStudies, saveStudy, STUDY_SCHEMA_VERSION } from './studyStore';
import { addChild, createChapter, makeNode } from '../utils/studyTree';
import type { Study } from '../types/study';

function study(id: string, name = 'Italienne'): Study {
  const chapter = createChapter('Ligne principale');
  const e4 = makeNode(chapter.root, 'e4')!;
  return {
    id,
    name,
    description: 'Intro',
    chapters: [{ ...chapter, root: addChild(chapter.root, chapter.root.id, e4) }],
    createdAt: 1,
    updatedAt: 1,
    schemaVersion: STUDY_SCHEMA_VERSION,
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('studyStore', () => {
  it('starts empty', async () => {
    expect(await listStudies()).toEqual([]);
  });

  it('saves a study and reads it back whole, the most recently changed first', async () => {
    expect(await saveStudy(study('a', 'A'))).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await saveStudy(study('b', 'B'))).toBe(true);
    const all = await listStudies();
    expect(all.map((s) => s.id)).toEqual(['b', 'a']);
    expect(all[1].chapters[0].root.children[0].san).toBe('e4');
    expect(all[0].updatedAt).toBeGreaterThan(1);
  });

  it('replaces a study saved under the same id', async () => {
    await saveStudy(study('a', 'Avant'));
    await saveStudy(study('a', 'Après'));
    const all = await listStudies();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Après');
  });

  it('deletes a study', async () => {
    await saveStudy(study('a'));
    await saveStudy(study('b'));
    expect(await deleteStudy('a')).toBe(true);
    expect((await listStudies()).map((s) => s.id)).toEqual(['b']);
  });

  it('ignores damaged or outdated entries', async () => {
    await saveStudy(study('ok'));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('echiquier-ia-studies', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('studies', 'readwrite');
      tx.objectStore('studies').put({ id: 'broken', name: 3 });
      tx.objectStore('studies').put({ ...study('old'), schemaVersion: 0 });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    expect((await listStudies()).map((s) => s.id)).toEqual(['ok']);
  });

  it('resolves with nothing stored when IndexedDB is unavailable', async () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    expect(await listStudies()).toEqual([]);
    expect(await saveStudy(study('a'))).toBe(false);
    expect(await deleteStudy('a')).toBe(false);
  });

  it('isStudy rejects a chapter without a valid tree', () => {
    const bad = study('a');
    (bad.chapters[0] as unknown as { root: unknown }).root = { id: 'x' };
    expect(isStudy(bad)).toBe(false);
    expect(isStudy(study('a'))).toBe(true);
  });
});
