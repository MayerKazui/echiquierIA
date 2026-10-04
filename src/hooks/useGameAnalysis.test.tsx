// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { loadGame, loadLatestGame, saveGame } from '../services/gameStore';
import { stockfishService } from '../services/stockfishEngine';
import { PROGRESSIVE_MIN_PLIES, useGameAnalysis } from './useGameAnalysis';

vi.mock('../services/stockfishEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/stockfishEngine')>()),
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

describe('when the game is written', () => {
  const hide = (state: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  /** Timers stopped: only what does not wait for the delay can reach the store. */
  async function withFrozenTimers(run: () => Promise<void>) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await run();
    } finally {
      vi.useRealTimers();
      hide('visible');
    }
  }

  it('writes a finished analysis at once, without waiting for the delay (a reload right after must not lose it)', async () => {
    await withFrozenTimers(async () => {
      const { result } = render();
      await act(() => result.current.analyze(PGN, 14));
      await vi.waitFor(async () => expect((await loadGame(PGN))?.depth).toBe(14));
    });
  });

  it('lets the changes that follow wait for the delay, and writes them when the page is hidden', async () => {
    await withFrozenTimers(async () => {
      const { result } = render();
      await act(() => result.current.analyze(PGN, 12));
      await vi.waitFor(async () => expect(await loadGame(PGN)).not.toBeNull());

      act(() => result.current.updateUserColor('b'));
      await act(async () => {
        await Promise.resolve();
      });
      expect((await loadGame(PGN))?.result.userColor).toBe('w');

      act(() => hide('hidden'));
      await vi.waitFor(async () => expect((await loadGame(PGN))?.result.userColor).toBe('b'));
    });
  });

  it('writes the waiting change on pagehide too (a reload, a closed tab)', async () => {
    await withFrozenTimers(async () => {
      const { result } = render();
      await act(() => result.current.analyze(PGN, 12));
      await vi.waitFor(async () => expect(await loadGame(PGN)).not.toBeNull());
      act(() => result.current.updateUserColor('b'));
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      await vi.waitFor(async () => expect((await loadGame(PGN))?.result.userColor).toBe('b'));
    });
  });

  it('writes a change once: the delayed save finds nothing left after the page was hidden', async () => {
    await withFrozenTimers(async () => {
      const { result } = render();
      await act(() => result.current.analyze(PGN, 12));
      await vi.waitFor(async () => expect(await loadGame(PGN)).not.toBeNull());
      act(() => result.current.updateUserColor('b'));
      act(() => hide('hidden'));
      await vi.waitFor(async () => expect((await loadGame(PGN))?.result.userColor).toBe('b'));
      const written = (await loadGame(PGN))!.savedAt;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect((await loadGame(PGN))!.savedAt).toBe(written);
    });
  });

  it('does nothing when the page becomes visible again, or when nothing waits', async () => {
    const { result } = render();
    await act(() => result.current.analyze(PGN, 12));
    await waitFor(async () => expect(await loadGame(PGN)).not.toBeNull());
    const written = (await loadGame(PGN))!.savedAt;
    act(() => hide('hidden'));
    act(() => hide('visible'));
    expect((await loadGame(PGN))!.savedAt).toBe(written);
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
    const outcome = await act(() => second.result.current.analyze(PGN, 12));
    expect(analyzeFullGame).not.toHaveBeenCalled();
    expect(outcome.status).toBe('done');
    const reused = outcome.status === 'done' ? outcome.result : null;
    expect(reused?.moves[0].san).toBe('e4');
    expect(second.result.current.result).toBe(reused);
    expect(second.result.current.pgn).toBe(PGN);
  });

  it('analyses again a game that was reduced to a summary (its positions are gone), as complete', async () => {
    const limits = { full: 1, total: 5 };
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await saveGame({ pgn: PGN, depth: 14, result: storedResult() }, limits);
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    await saveGame({ pgn: '1. d4 *', depth: 14, result: storedResult() }, limits);
    expect((await loadGame(PGN))?.detail).toBe('summary');

    const { result } = render();
    await act(() => result.current.analyze(PGN, 12));
    expect(analyzeFullGame).toHaveBeenCalledOnce();
    await waitFor(async () => expect((await loadGame(PGN))?.detail).toBe('full'));
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
    const outcome = await act(() => second.result.current.analyze(PGN));
    const reused = outcome.status === 'done' ? outcome.result : null;
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

/** A move list of `n` plies, as the engine reports it while it works. */
function movesOf(n: number, label = 'e4'): MoveAnalysis[] {
  return Array.from({ length: n }, (_, ply) => ({ san: label, fenBefore: 'start', ply }) as MoveAnalysis);
}

type EngineOptions = NonNullable<Parameters<typeof stockfishService.analyzeFullGame>[3]>;

/** An engine that reports `partials` (numbers of plies) and then waits for `finish` or for an abort. */
function controllableEngine(totalPlies: number) {
  let options!: EngineOptions;
  let finish!: (plies?: number) => void;
  analyzeFullGame.mockImplementation(
    (_pgn, _depth, _onProgress, opts) =>
      new Promise((resolve, reject) => {
        options = opts!;
        finish = (plies = totalPlies) => resolve({ ...engineResult(), moves: movesOf(plies) });
        opts?.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
      })
  );
  return {
    report: (plies: number) =>
      options.onPartial!({ ...engineResult(), moves: movesOf(plies), detectedOpening: null }, totalPlies),
    finish: (plies?: number) => finish(plies),
    get signal() {
      return options.signal!;
    },
  };
}

describe('showing the game while it is analysed', () => {
  it('exposes the moves analysed so far once there are enough of them, and tells when the game appears', async () => {
    const engine = controllableEngine(40);
    const { result } = render();
    const onFirstMoves = vi.fn();
    let outcome!: ReturnType<typeof result.current.analyze>;
    await act(async () => {
      outcome = result.current.analyze(PGN, 12, { onFirstMoves });
      await vi.waitFor(() => expect(analyzeFullGame).toHaveBeenCalled());
    });

    act(() => engine.report(PROGRESSIVE_MIN_PLIES - 1)); // not enough yet
    expect(result.current.partial).toBeNull();
    expect(onFirstMoves).not.toHaveBeenCalled();

    act(() => engine.report(PROGRESSIVE_MIN_PLIES));
    expect(result.current.partial?.moves).toHaveLength(PROGRESSIVE_MIN_PLIES);
    expect(onFirstMoves).toHaveBeenCalledOnce();
    expect(result.current.isAnalyzing).toBe(true);

    act(() => engine.report(PROGRESSIVE_MIN_PLIES + 5)); // grows, announced only once
    expect(result.current.partial?.moves).toHaveLength(PROGRESSIVE_MIN_PLIES + 5);
    expect(onFirstMoves).toHaveBeenCalledOnce();

    await act(async () => {
      engine.finish();
      await outcome;
    });
    expect(result.current.partial).toBeNull();
    expect(result.current.result?.moves).toHaveLength(40);
    expect(result.current.isAnalyzing).toBe(false);
  });

  it('shows a short game as soon as it has all the moves it needs', async () => {
    const engine = controllableEngine(4);
    const { result } = render();
    await act(async () => {
      void result.current.analyze(PGN);
      await vi.waitFor(() => expect(analyzeFullGame).toHaveBeenCalled());
    });
    act(() => engine.report(3));
    expect(result.current.partial).toBeNull();
    act(() => engine.report(4));
    expect(result.current.partial?.moves).toHaveLength(4);
  });

  it('gives the PGN of the game on screen: the new one once its moves are shown, the old one otherwise', async () => {
    const first = controllableEngine(10);
    const { result } = render();
    await act(async () => {
      void result.current.analyze(PGN);
      await vi.waitFor(() => expect(analyzeFullGame).toHaveBeenCalled());
    });
    await act(async () => first.finish());
    await waitFor(() => expect(result.current.pgn).toBe(PGN));

    const second = controllableEngine(10);
    await act(async () => {
      void result.current.analyze(OTHER_PGN);
      await vi.waitFor(() => expect(analyzeFullGame).toHaveBeenCalledTimes(2));
    });
    expect(result.current.pgn).toBe(PGN); // nothing of the new game is shown yet
    act(() => second.report(PROGRESSIVE_MIN_PLIES));
    expect(result.current.pgn).toBe(OTHER_PGN);
  });
});

describe('cancelling an analysis', () => {
  it('stops it, resolves as cancelled, keeps the previous game and stores nothing', async () => {
    const previous = controllableEngine(6);
    const { result } = render();
    await act(async () => {
      void result.current.analyze(PGN);
      await vi.waitFor(() => expect(analyzeFullGame).toHaveBeenCalled());
    });
    await act(async () => previous.finish());
    await waitFor(() => expect(result.current.result).not.toBeNull());
    const before = result.current.result;

    const engine = controllableEngine(40);
    let outcome!: ReturnType<typeof result.current.analyze>;
    await act(async () => {
      outcome = result.current.analyze(OTHER_PGN);
      await vi.waitFor(() => expect(analyzeFullGame).toHaveBeenCalledTimes(2));
    });
    act(() => engine.report(PROGRESSIVE_MIN_PLIES));
    expect(result.current.partial).not.toBeNull();

    await act(async () => {
      result.current.cancel();
      expect(await outcome).toEqual({ status: 'cancelled' });
    });
    expect(engine.signal.aborted).toBe(true);
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.partial).toBeNull();
    expect(result.current.progress).toBeNull();
    expect(result.current.result).toBe(before);
    expect(result.current.pgn).toBe(PGN);

    await new Promise((resolve) => setTimeout(resolve, 600)); // longer than the save delay
    expect(await loadGame(OTHER_PGN)).toBeNull();
  });

  it('does nothing when no analysis runs', () => {
    const { result } = render();
    expect(() => act(() => result.current.cancel())).not.toThrow();
    expect(result.current.isAnalyzing).toBe(false);
  });

  it('can be followed by another analysis', async () => {
    const engine = controllableEngine(10);
    const { result } = render();
    let outcome!: ReturnType<typeof result.current.analyze>;
    await act(async () => {
      outcome = result.current.analyze(PGN);
      await vi.waitFor(() => expect(analyzeFullGame).toHaveBeenCalled());
    });
    await act(async () => {
      result.current.cancel();
      await outcome;
    });

    analyzeFullGame.mockImplementation(async () => engineResult('d4'));
    const again = await act(() => result.current.analyze(PGN));
    expect(again.status).toBe('done');
    expect(result.current.result?.moves[0].san).toBe('d4');
    expect(engine.signal.aborted).toBe(true);
  });

  it('is requested when the page is left', async () => {
    const engine = controllableEngine(10);
    const { result, unmount } = render();
    await act(async () => {
      void result.current.analyze(PGN);
      await vi.waitFor(() => expect(analyzeFullGame).toHaveBeenCalled());
    });
    unmount();
    expect(engine.signal.aborted).toBe(true);
  });

  it('resolves as failed, and does not report a failure as a cancellation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    analyzeFullGame.mockRejectedValue(new Error('engine crashed'));
    const { result } = render();
    expect(await act(() => result.current.analyze(PGN))).toEqual({ status: 'failed' });
    expect(result.current.isAnalyzing).toBe(false);
  });
});

describe('a new analysis while another one runs', () => {
  it('replaces it: the first one ends as cancelled and the state follows the second', async () => {
    const first = controllableEngine(20);
    const { result } = render();
    let firstOutcome!: ReturnType<typeof result.current.analyze>;
    await act(async () => {
      firstOutcome = result.current.analyze(PGN);
      await vi.waitFor(() => expect(analyzeFullGame).toHaveBeenCalledTimes(1));
    });

    const second = controllableEngine(20);
    await act(async () => {
      void result.current.analyze(OTHER_PGN);
      await vi.waitFor(() => expect(analyzeFullGame).toHaveBeenCalledTimes(2));
    });
    expect(await firstOutcome).toEqual({ status: 'cancelled' });
    expect(first.signal.aborted).toBe(true);
    expect(result.current.isAnalyzing).toBe(true); // the first analysis ending did not switch it off

    act(() => second.report(PROGRESSIVE_MIN_PLIES));
    expect(result.current.partial).not.toBeNull();
  });
});

describe('the side the user plays, during an analysis', () => {
  it('applies to the game on screen and leaves the previous result alone', async () => {
    const previous = controllableEngine(6);
    const { result } = render('', 'w');
    await act(async () => {
      void result.current.analyze(PGN);
      await vi.waitFor(() => expect(analyzeFullGame).toHaveBeenCalled());
    });
    await act(async () => previous.finish());
    await waitFor(() => expect(result.current.result?.userColor).toBe('w'));

    const engine = controllableEngine(40);
    await act(async () => {
      void result.current.analyze(OTHER_PGN);
      await vi.waitFor(() => expect(analyzeFullGame).toHaveBeenCalledTimes(2));
    });
    act(() => engine.report(PROGRESSIVE_MIN_PLIES));
    act(() => result.current.updateUserColor('b'));

    expect(result.current.partial?.userColor).toBe('b');
    expect(result.current.result?.userColor).toBe('w');
  });
});
