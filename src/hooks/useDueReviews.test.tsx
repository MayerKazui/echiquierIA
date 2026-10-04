// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { saveGame, gameId } from '../services/gameStore';
import { recordPractice } from '../services/practiceStore';
import { saveCard } from '../services/trainingStore';
import { DAY_MS, type Card } from '../utils/spacedRepetition';
import { useDueReviews } from './useDueReviews';

const NOW = new Date(2026, 9, 4, 14).getTime();
const PGN = '1. e4 *';

const card = (id: string, dueIn = -1): Card => ({
  id,
  level: 1,
  dueAt: NOW + dueIn * DAY_MS,
  lastSeen: NOW - DAY_MS,
  attempts: 1,
  failures: 0,
});

const result = (): GameAnalysisResult => ({
  metadata: { white: 'Alice', black: 'Bob' },
  moves: [{ san: 'e4', fenBefore: 'start', ply: 0, color: 'w' } as MoveAnalysis],
  statsWhite: {} as never,
  statsBlack: {} as never,
  userColor: 'w',
});

let setAppBadge: ReturnType<typeof vi.fn>;
let clearAppBadge: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  setAppBadge = vi.fn().mockResolvedValue(undefined);
  clearAppBadge = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { setAppBadge, clearAppBadge });
  await saveGame({ pgn: PGN, depth: 12, result: result() });
});

afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).setAppBadge;
  delete (navigator as unknown as Record<string, unknown>).clearAppBadge;
});

describe('useDueReviews', () => {
  it('is null until it has read, then holds what is due', async () => {
    await saveCard(card(`${gameId(PGN)}:3`));
    const { result: hook } = renderHook(() => useDueReviews(() => NOW));
    expect(hook.current.summary).toBeNull();
    await waitFor(() => expect(hook.current.summary).not.toBeNull());
    expect(hook.current.summary?.total).toBe(1);
    expect(hook.current.summary?.next?.id).toBe('errors');
  });

  it('puts the count on the icon, and takes it off when nothing is due', async () => {
    await saveCard(card(`${gameId(PGN)}:3`));
    await saveCard(card(`${gameId(PGN)}:5`));
    const { result: hook } = renderHook(() => useDueReviews(() => NOW));
    await waitFor(() => expect(setAppBadge).toHaveBeenCalledWith(2));
    await saveCard(card(`${gameId(PGN)}:3`, 4));
    await saveCard(card(`${gameId(PGN)}:5`, 4));
    await act(() => hook.current.refresh());
    await waitFor(() => expect(clearAppBadge).toHaveBeenCalled());
  });

  it('does not count the errors of a game that is not kept', async () => {
    await saveCard(card('unknown:3'));
    const { result: hook } = renderHook(() => useDueReviews(() => NOW));
    await waitFor(() => expect(hook.current.summary).not.toBeNull());
    expect(hook.current.summary?.total).toBe(0);
    expect(clearAppBadge).toHaveBeenCalled();
  });

  it('reads again when something is practised', async () => {
    const { result: hook } = renderHook(() => useDueReviews(() => NOW));
    await waitFor(() => expect(hook.current.summary?.total).toBe(0));
    await saveCard(card(`${gameId(PGN)}:9`));
    await act(() => recordPractice(NOW));
    await waitFor(() => expect(hook.current.summary?.total).toBe(1), { timeout: 3000 });
  });

  it('reads again when the app comes back in front', async () => {
    const { result: hook } = renderHook(() => useDueReviews(() => NOW));
    await waitFor(() => expect(hook.current.summary?.total).toBe(0));
    await saveCard(card(`${gameId(PGN)}:9`));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(hook.current.summary?.total).toBe(1), { timeout: 3000 });
  });

  it('works where the browser has no badge', async () => {
    delete (navigator as unknown as Record<string, unknown>).setAppBadge;
    delete (navigator as unknown as Record<string, unknown>).clearAppBadge;
    await saveCard(card(`${gameId(PGN)}:3`));
    const { result: hook } = renderHook(() => useDueReviews(() => NOW));
    await waitFor(() => expect(hook.current.summary?.total).toBe(1));
  });
});
