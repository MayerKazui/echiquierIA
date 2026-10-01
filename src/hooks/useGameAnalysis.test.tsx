// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { loadGame, loadLatestGame, saveGame } from '../services/gameStore';
import { stockfishService } from '../services/stockfishEngine';
import { useGameAnalysis } from './useGameAnalysis';

vi.mock('../services/stockfishEngine', () => ({
  stockfishService: { analyzeFullGame: vi.fn() },
}));

const analyzeFullGame = vi.mocked(stockfishService.analyzeFullGame);

const PGN = '[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 2. Nf3 Nc6 *';
const OTHER_PGN = '[White "Carol"]\n[Black "Dan"]\n\n1. d4 d5 *';

const stats = {} as Awaited<ReturnType<typeof stockfishService.analyzeFullGame>>['statsWhite'];

function engineResult(label = 'e4') {
  const moves = [{ san: label, fenBefore: 'start', ply: 0 } as MoveAnalysis];
  return { moves, statsWhite: stats, statsBlack: stats, detectedOpening: null };
}

/** A result complete enough to be accepted by the store (the engine mock only returns the moves). */
function storedResult(label = 'e4'): GameAnalysisResult {
  return { ...engineResult(label), metadata: { white: 'Alice', black: 'Bob' }, userColor: 'w', userPseudo: '' };
}

function render(userPseudo = '', userColor: 'w' | 'b' = 'w') {
  return renderHook(() => useGameAnalysis(userPseudo, userColor));
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  analyzeFullGame.mockReset();
  analyzeFullGame.mockImplementation(async () => engineResult());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('saving analysed games', () => {
  it('stores a new analysis with its depth', async () => {
    const { result } = render();
    await act(() => result.current.analyze(PGN, 14));
    await waitFor(async () => expect((await loadGame(PGN))?.depth).toBe(14));
    expect((await loadGame(PGN))?.result.moves[0].san).toBe('e4');
  });

  it('stores the AI explanations that are added afterwards', async () => {
    const { result } = render();
    await act(() => result.current.analyze(PGN));
    await waitFor(async () => expect(await loadGame(PGN)).not.toBeNull());

    act(() =>
      result.current.updateAiExplanation(0, { concept: 'c', whyPlayedIsBad: '', whyBestIsBetter: 'b', plan: 'p' })
    );
    await waitFor(async () => expect((await loadGame(PGN))?.result.moves[0].aiExplanation?.concept).toBe('c'));
  });
});

describe('changing the side the user plays', () => {
  it('is stored with the game', async () => {
    const { result } = render('', 'w');
    await act(() => result.current.analyze(PGN));
    await waitFor(async () => expect(await loadGame(PGN)).not.toBeNull());

    act(() => result.current.updateUserColor('b'));
    await waitFor(async () => expect((await loadGame(PGN))?.result.userColor).toBe('b'));
  });

  it('does not rewrite the stored game when the side is unchanged', async () => {
    const { result } = render('', 'w');
    await act(() => result.current.analyze(PGN));
    await waitFor(async () => expect(await loadGame(PGN)).not.toBeNull());
    const analysed = result.current.result;

    act(() => result.current.updateUserColor('w'));
    expect(result.current.result).toBe(analysed);
  });
});

describe('analysing a game that was already analysed', () => {
  it('reuses the stored result without running Stockfish when it is deep enough', async () => {
    const first = render();
    await act(() => first.result.current.analyze(PGN, 14));
    await waitFor(async () => expect(await loadGame(PGN)).not.toBeNull());
    analyzeFullGame.mockClear();

    const second = render();
    const reused = await act(() => second.result.current.analyze(PGN, 12));
    expect(analyzeFullGame).not.toHaveBeenCalled();
    expect(reused?.moves[0].san).toBe('e4');
    expect(second.result.current.result).toBe(reused);
    expect(second.result.current.pgn).toBe(PGN);
  });

  it('runs Stockfish again when a deeper analysis is requested, and keeps the deeper one', async () => {
    const first = render();
    await act(() => first.result.current.analyze(PGN, 10));
    await waitFor(async () => expect(await loadGame(PGN)).not.toBeNull());
    analyzeFullGame.mockClear();

    const second = render();
    await act(() => second.result.current.analyze(PGN, 16));
    expect(analyzeFullGame).toHaveBeenCalledOnce();
    await waitFor(async () => expect((await loadGame(PGN))?.depth).toBe(16));
  });

  it('uses the current pseudo and colour, not those of the stored analysis', async () => {
    const first = render('Alice', 'w');
    await act(() => first.result.current.analyze(PGN));
    await waitFor(async () => expect(await loadGame(PGN)).not.toBeNull());

    const second = render('Bob', 'w');
    const reused = await act(() => second.result.current.analyze(PGN));
    expect(reused?.userPseudo).toBe('Bob');
    expect(reused?.userColor).toBe('b');
  });

  it('analyses a different game normally', async () => {
    const first = render();
    await act(() => first.result.current.analyze(PGN));
    await waitFor(async () => expect(await loadGame(PGN)).not.toBeNull());
    analyzeFullGame.mockClear();

    await act(() => first.result.current.analyze(OTHER_PGN));
    expect(analyzeFullGame).toHaveBeenCalledOnce();
  });
});

describe('restoreLast', () => {
  it('reopens the last analysed game and does not write it back', async () => {
    await saveGame({ pgn: PGN, depth: 14, result: { ...storedResult(), userColor: 'b' } });
    const savedAt = (await loadLatestGame())!.savedAt;

    const { result } = render();
    expect(result.current.isRestoring).toBe(true);
    const restored = await act(() => result.current.restoreLast());

    expect(restored?.userColor).toBe('b');
    expect(result.current.result).toBe(restored);
    expect(result.current.pgn).toContain('1. e4 e5');
    expect(result.current.isRestoring).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 600)); // longer than the save delay
    expect((await loadLatestGame())!.savedAt).toBe(savedAt);
  });

  it('does nothing when there is no stored game', async () => {
    const { result } = render();
    const restored = await act(() => result.current.restoreLast());
    expect(restored).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.isRestoring).toBe(false);
  });

  it('only restores once', async () => {
    await saveGame({ pgn: PGN, depth: 12, result: storedResult() });
    const { result } = render();
    const first = await act(() => result.current.restoreLast());
    const second = await act(() => result.current.restoreLast());
    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  it('does not replace an analysis that was started in the meantime', async () => {
    await saveGame({ pgn: PGN, depth: 12, result: storedResult('old') });
    const { result } = render();
    const restoring = result.current.restoreLast();
    await act(() => result.current.analyze(OTHER_PGN));
    expect(await restoring).toBeNull();
    expect(result.current.pgn).toBe(OTHER_PGN);
    expect(result.current.result?.moves[0].san).toBe('e4'); // the new analysis, not the stored 'old' one
  });

  it('gives up when the storage does not answer', async () => {
    vi.useFakeTimers();
    try {
      // A database that never opens
      Object.defineProperty(globalThis, 'indexedDB', {
        value: { open: () => ({}) },
        configurable: true,
        writable: true,
      });
      const { result } = render();
      let restored: unknown = 'pending';
      const done = result.current.restoreLast().then((value) => (restored = value));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
        await done;
      });
      expect(restored).toBeNull();
      expect(result.current.isRestoring).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
