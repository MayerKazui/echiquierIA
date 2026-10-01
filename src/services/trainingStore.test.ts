import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCards, loadCards, saveCard } from './trainingStore';
import type { Card } from '../utils/spacedRepetition';

const card = (id: string, over: Partial<Card> = {}): Card => ({
  id,
  level: 1,
  dueAt: 1000,
  lastSeen: 10,
  attempts: 1,
  failures: 0,
  ...over,
});

function useFreshDatabase() {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
}

/** Writes a value as is, bypassing `saveCard` (to simulate damaged data). */
async function rawPut(value: unknown): Promise<void> {
  await loadCards(); // creates the database and its store
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('echiquier-ia-training', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('cards', 'readwrite');
    tx.objectStore('cards').put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

beforeEach(() => {
  useFreshDatabase();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('trainingStore', () => {
  it('has nothing at first', async () => {
    expect((await loadCards()).size).toBe(0);
  });

  it('gives back what was saved, by position', async () => {
    expect(await saveCard(card('g:6', { level: 2 }))).toBe(true);
    await saveCard(card('g:8'));
    const cards = await loadCards();
    expect([...cards.keys()].sort()).toEqual(['g:6', 'g:8']);
    expect(cards.get('g:6')).toEqual(card('g:6', { level: 2 }));
  });

  it('replaces the card of a position', async () => {
    await saveCard(card('g:6', { level: 1 }));
    await saveCard(card('g:6', { level: 3, dueAt: 5000 }));
    const cards = await loadCards();
    expect(cards.size).toBe(1);
    expect(cards.get('g:6')).toMatchObject({ level: 3, dueAt: 5000 });
  });

  it('keeps a card of a mastered position (a date far away, but finite)', async () => {
    await saveCard(card('g:6', { level: 4, dueAt: Number.MAX_SAFE_INTEGER }));
    expect((await loadCards()).get('g:6')?.dueAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('forgets everything on request', async () => {
    await saveCard(card('g:6'));
    await clearCards();
    expect((await loadCards()).size).toBe(0);
  });

  it('ignores damaged entries and keeps the others', async () => {
    await saveCard(card('good'));
    await rawPut({ id: 'no-level', dueAt: 1, lastSeen: 1, attempts: 1, failures: 0 });
    await rawPut({ id: 'text', level: 'x', dueAt: 1, lastSeen: 1, attempts: 1, failures: 0 });
    await rawPut({ id: 'nan', level: 1, dueAt: NaN, lastSeen: 1, attempts: 1, failures: 0 });
    await rawPut({ id: 'infinite', level: 1, dueAt: Infinity, lastSeen: 1, attempts: 1, failures: 0 });
    await rawPut({ id: 7, level: 1, dueAt: 1, lastSeen: 1, attempts: 1, failures: 0 });
    expect([...(await loadCards()).keys()]).toEqual(['good']);
  });

  describe('when storage is not available', () => {
    beforeEach(() => {
      Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    });

    it('reads nothing', async () => {
      expect((await loadCards()).size).toBe(0);
    });

    it('says the card could not be saved, without throwing', async () => {
      expect(await saveCard(card('g:6'))).toBe(false);
    });

    it('forgets nothing, without throwing', async () => {
      await expect(clearCards()).resolves.toBeUndefined();
    });
  });
});
