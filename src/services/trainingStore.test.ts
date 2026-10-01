import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCards, loadCards, mergeCards, saveCard } from './trainingStore';
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

describe('mergeCards', () => {
  it('adds the cards that are not there', async () => {
    expect(await mergeCards([card('a'), card('b')])).toEqual({ added: 2, replaced: 0, kept: 0 });
    expect([...(await loadCards()).keys()].sort()).toEqual(['a', 'b']);
  });

  it('keeps the card that was worked on last', async () => {
    await saveCard(card('a', { lastSeen: 100, level: 2 }));
    await saveCard(card('b', { lastSeen: 100, level: 2 }));
    const report = await mergeCards([card('a', { lastSeen: 200, level: 3 }), card('b', { lastSeen: 50, level: 0 })]);
    expect(report).toEqual({ added: 0, replaced: 1, kept: 1 });
    const cards = await loadCards();
    expect(cards.get('a')?.level).toBe(3);
    expect(cards.get('b')?.level).toBe(2);
  });

  it('at the same time, keeps the card with the most attempts', async () => {
    await saveCard(card('a', { lastSeen: 100, attempts: 2, level: 1 }));
    expect(await mergeCards([card('a', { lastSeen: 100, attempts: 3, level: 2 })])).toMatchObject({ replaced: 1 });
    expect((await loadCards()).get('a')?.level).toBe(2);
    expect(await mergeCards([card('a', { lastSeen: 100, attempts: 3, level: 0 })])).toMatchObject({
      replaced: 0,
      kept: 1,
    });
    expect((await loadCards()).get('a')?.level).toBe(2);
  });

  it('counts a card that is twice in the list once, the one worked on last', async () => {
    const report = await mergeCards([card('a', { lastSeen: 10, level: 1 }), card('a', { lastSeen: 20, level: 2 })]);
    expect(report).toEqual({ added: 1, replaced: 0, kept: 0 });
    expect((await loadCards()).get('a')?.level).toBe(2);
  });

  it('ignores what is not a card', async () => {
    const report = await mergeCards([card('a'), { id: 'b' } as Card, { ...card('c'), level: NaN }]);
    expect(report).toEqual({ added: 1, replaced: 0, kept: 0 });
  });

  it('works with nothing to add', async () => {
    expect(await mergeCards([])).toEqual({ added: 0, replaced: 0, kept: 0 });
  });

  it('keeps a mastered position mastered through a round trip (its date is a finite number)', async () => {
    const mastered = card('m', { level: 4, dueAt: Number.MAX_SAFE_INTEGER });
    const copy = JSON.parse(JSON.stringify(mastered)) as Card;
    await mergeCards([copy]);
    expect((await loadCards()).get('m')?.dueAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('resolves with null when the storage is unavailable', async () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    expect(await mergeCards([card('a')])).toBeNull();
  });
});
