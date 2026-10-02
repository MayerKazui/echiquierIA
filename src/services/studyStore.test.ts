import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_STUDY_DELETIONS,
  deleteStudy,
  isStudy,
  listStudies,
  listStudyDeletions,
  mergeStudies,
  onStudiesChanged,
  saveStudy,
  STUDY_SCHEMA_VERSION,
} from './studyStore';
import { addChild, createChapter, makeNode } from '../utils/studyTree';
import type { Study } from '../types/study';

function study(id: string, name = 'Italienne', updatedAt = 1): Study {
  const chapter = createChapter('Ligne principale');
  const e4 = makeNode(chapter.root, 'e4')!;
  return {
    id,
    name,
    description: 'Intro',
    chapters: [{ ...chapter, root: addChild(chapter.root, chapter.root.id, e4) }],
    createdAt: 1,
    updatedAt,
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
      const request = indexedDB.open('echiquier-ia-studies');
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

describe('studyStore, deletions', () => {
  it('leaves a trace of a deleted study, never dated before its last change', async () => {
    await saveStudy(study('a'));
    const [saved] = await listStudies();
    await deleteStudy('a');
    const [trace] = await listStudyDeletions();
    expect(trace.id).toBe('a');
    expect(trace.deletedAt).toBeGreaterThanOrEqual(saved.updatedAt);
    expect(await deleteStudy('absent')).toBe(true);
    expect(await listStudyDeletions()).toHaveLength(1); // nothing was there: no trace
  });

  it('keeps a database of the first version and its studies when it is upgraded', async () => {
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('echiquier-ia-studies', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('studies', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = old.transaction('studies', 'readwrite');
      tx.objectStore('studies').put(study('legacy'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    old.close();
    expect((await listStudies()).map((s) => s.id)).toEqual(['legacy']);
    await deleteStudy('legacy');
    expect(await listStudyDeletions()).toHaveLength(1);
  });

  it('tells the listeners about a save, a deletion and a merge, but not about a silent one', async () => {
    const listener = vi.fn();
    const off = onStudiesChanged(listener);
    await saveStudy(study('a'));
    expect(listener).toHaveBeenCalledTimes(1);
    await deleteStudy('a');
    expect(listener).toHaveBeenCalledTimes(2);
    await mergeStudies([study('b', 'B', 5)]);
    expect(listener).toHaveBeenCalledTimes(3);
    await mergeStudies([study('c', 'C', 5)], [], { silent: true });
    expect(listener).toHaveBeenCalledTimes(3);
    await mergeStudies([study('c', 'C', 5)]); // nothing changes
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    await saveStudy(study('d'));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('forgets the oldest traces beyond the limit', async () => {
    const many = Array.from({ length: MAX_STUDY_DELETIONS + 5 }, (_, i) => ({ id: `s${i}`, deletedAt: i + 1 }));
    await mergeStudies([], many);
    const kept = await listStudyDeletions();
    expect(kept).toHaveLength(MAX_STUDY_DELETIONS);
    expect(kept.some((t) => t.id === 's0')).toBe(false);
    expect(kept.some((t) => t.id === `s${MAX_STUDY_DELETIONS + 4}`)).toBe(true);
  });
});

describe('mergeStudies', () => {
  const names = async () => (await listStudies()).map((s) => `${s.id}:${s.name}:${s.updatedAt}`).sort();

  it('adds the studies that are not there, and counts them', async () => {
    expect(await mergeStudies([study('a', 'A', 10), study('b', 'B', 20)])).toEqual({
      added: 2,
      replaced: 0,
      kept: 0,
      deleted: 0,
    });
    expect(await names()).toEqual(['a:A:10', 'b:B:20']);
  });

  it('replaces a study only by a version changed more recently', async () => {
    await mergeStudies([study('a', 'Ancienne', 10), study('b', 'Récente', 30), study('c', 'Même', 20)]);
    const report = await mergeStudies([
      study('a', 'Plus récente', 15),
      study('b', 'Plus ancienne', 5),
      study('c', 'Même bis', 20),
    ]);
    expect(report).toEqual({ added: 0, replaced: 1, kept: 2, deleted: 0 });
    expect(await names()).toEqual(['a:Plus récente:15', 'b:Récente:30', 'c:Même:20']);
  });

  it('counts a study that is twice in the file once, the more recent one', async () => {
    await mergeStudies([study('a', 'Vieille', 1), study('a', 'Neuve', 9), study('a', 'Milieu', 5)]);
    expect(await names()).toEqual(['a:Neuve:9']);
  });

  it('removes the study deleted elsewhere after its last change, and keeps one edited since', async () => {
    await mergeStudies([study('gone', 'G', 10), study('edited', 'E', 50)]);
    const report = await mergeStudies(
      [],
      [
        { id: 'gone', deletedAt: 10 },
        { id: 'edited', deletedAt: 40 },
      ]
    );
    expect(report?.deleted).toBe(1);
    expect(await names()).toEqual(['edited:E:50']);
    expect((await listStudyDeletions()).map((t) => t.id).sort()).toEqual(['edited', 'gone']);
  });

  it('does not take back a study that a trace covers, but takes one saved after the deletion', async () => {
    await mergeStudies([], [{ id: 'a', deletedAt: 100 }]);
    await mergeStudies([study('a', 'Avant', 100), study('b', 'Autre', 1)], []);
    expect(await names()).toEqual(['b:Autre:1']);
    await mergeStudies([study('a', 'Après', 101)]);
    expect(await names()).toEqual(['a:Après:101', 'b:Autre:1']);
  });

  it('keeps the latest of two traces of one study, and ignores damaged ones', async () => {
    await mergeStudies(
      [],
      [
        { id: 'a', deletedAt: 5 },
        { id: 'a', deletedAt: 9 },
        { id: '', deletedAt: 1 },
        { id: 'x', deletedAt: Number.NaN },
      ]
    );
    expect(await listStudyDeletions()).toEqual([{ id: 'a', deletedAt: 9 }]);
  });

  it('brings back a study the user deleted when told to (a file chosen by the user)', async () => {
    await saveStudy(study('a', 'Locale'));
    await deleteStudy('a');
    const [{ deletedAt }] = await listStudyDeletions();
    await mergeStudies([study('a', 'Du fichier', 1)], [], { override: true });
    const [back] = await listStudies();
    expect(back.name).toBe('Du fichier');
    // Dated just after the deletion, so that the deletion does not take it away again elsewhere
    expect(back.updatedAt).toBe(deletedAt + 1);
  });

  it('ignores damaged studies and writes nothing when storage is unavailable', async () => {
    expect(await mergeStudies([{ id: 'x' } as unknown as Study])).toEqual({
      added: 0,
      replaced: 0,
      kept: 0,
      deleted: 0,
    });
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    expect(await mergeStudies([study('a')])).toBeNull();
  });
});
