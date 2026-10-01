import { useCallback, useEffect, useRef, useState } from 'react';
import { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { PlayerColor } from '../types/ui';
import { isAbortError, stockfishService, type GameAnalysisOutput } from '../services/stockfishEngine';
import { loadGame, loadLatestGame, saveGame } from '../services/gameStore';
import { buildGameResult, detectUserColor } from '../services/gameResult';
import { SAMPLE_GAMES } from '../utils/sampleGames';

export interface AnalysisProgress {
  current: number;
  total: number;
}

/** Moves needed before the game is shown while the analysis is still running (fewer for a very short game). */
export const PROGRESSIVE_MIN_PLIES = 8;

export type AnalysisOutcome =
  { status: 'done'; result: GameAnalysisResult } | { status: 'cancelled' } | { status: 'failed' };

export interface AnalyzeCallbacks {
  /** Called once, when the first moves are ready and the game starts to be shown while the analysis goes on. */
  onFirstMoves?: (partial: GameAnalysisResult) => void;
}

/** Wait for the browser storage at most this long: a blocked database must not block the app. */
const STORAGE_TIMEOUT_MS = 2000;
/** Group quick successive changes of the result (e.g. several explanations) into one write. */
const SAVE_DELAY_MS = 250;

function withTimeout<T>(promise: Promise<T>, fallback: T, ms: number): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

/**
 * Runs the Stockfish analysis of a PGN and holds its result and progress.
 *
 * While it runs, `partial` holds the moves analysed so far (once there are `PROGRESSIVE_MIN_PLIES` of them) and
 * `cancel` stops it; `result` only changes when an analysis is complete, so a cancelled one leaves it untouched.
 *
 * Analysed games are kept in the browser (see `gameStore`): analysing a PGN that was already analysed at the
 * same depth or deeper returns the stored result, and `restoreLast` reopens the last game after a reload.
 */
export function useGameAnalysis(userPseudo: string, userColor: PlayerColor) {
  const [pgn, setPgn] = useState<string>(SAMPLE_GAMES[1].pgn);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [result, setResult] = useState<GameAnalysisResult | null>(null);
  /** The game being analysed, as far as it is done (null when no analysis runs or too few moves are ready). */
  const [partial, setPartial] = useState<GameAnalysisResult | null>(null);
  /** PGN of the analysis that is running (what `partial` shows). */
  const [analyzingPgn, setAnalyzingPgn] = useState<string | null>(null);
  /** Search depth of `result`. */
  const [depth, setDepth] = useState<number | null>(null);
  /** True until `restoreLast` has finished (the caller is expected to call it once at startup). */
  const [isRestoring, setIsRestoring] = useState(true);

  const analysisStartedRef = useRef(false);
  /** Aborts the running analysis; null when none runs. */
  const abortRef = useRef<AbortController | null>(null);
  const restorePromiseRef = useRef<Promise<GameAnalysisResult | null> | null>(null);
  /** A restored result is already stored: do not write it back. */
  const skipSaveRef = useRef<GameAnalysisResult | null>(null);

  // Keep the stored copy in sync with the displayed result (new analysis, new AI explanation…)
  useEffect(() => {
    if (!result || depth === null) return;
    if (skipSaveRef.current === result) {
      skipSaveRef.current = null;
      return;
    }
    const timer = setTimeout(() => void saveGame({ pgn, depth, result }), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [result, pgn, depth]);

  /**
   * Reopens the last analysed game, unless an analysis was started in the meantime. Safe to call twice (it
   * only runs once). Resolves with the restored result, or null when there is nothing to restore.
   */
  const restoreLast = useCallback((): Promise<GameAnalysisResult | null> => {
    restorePromiseRef.current ??= withTimeout(loadLatestGame(), null, STORAGE_TIMEOUT_MS).then((stored) => {
      setIsRestoring(false);
      if (!stored || analysisStartedRef.current) return null;
      skipSaveRef.current = stored.result;
      setPgn(stored.pgn);
      setDepth(stored.depth);
      setResult(stored.result);
      return stored.result;
    });
    return restorePromiseRef.current;
  }, []);

  /** Resolves with the new result, or null if the analysis failed. */
  const analyze = useCallback(
    async (pgnToAnalyze: string, requestedDepth = 12, callbacks: AnalyzeCallbacks = {}): Promise<AnalysisOutcome> => {
      analysisStartedRef.current = true;
      abortRef.current?.abort(); // a new analysis replaces a running one
      const controller = new AbortController();
      abortRef.current = controller;
      const isCurrent = () => abortRef.current === controller;
      setIsAnalyzing(true);
      setProgress({ current: 0, total: 1 });
      setPartial(null);
      setAnalyzingPgn(pgnToAnalyze);

      try {
        // Already analysed (at least as deep): no need to run Stockfish again
        const stored = await withTimeout(loadGame(pgnToAnalyze), null, STORAGE_TIMEOUT_MS);
        if (controller.signal.aborted) return { status: 'cancelled' };
        if (stored && stored.depth >= requestedDepth) {
          const reused: GameAnalysisResult = {
            ...stored.result,
            userColor: detectUserColor(stored.result.metadata, userPseudo, userColor),
            userPseudo,
          };
          setResult(reused);
          setPgn(pgnToAnalyze);
          setDepth(stored.depth);
          return { status: 'done', result: reused };
        }

        const toResult = (output: GameAnalysisOutput) => buildGameResult(pgnToAnalyze, output, userPseudo, userColor);

        let firstMovesShown = false;
        const output = await stockfishService.analyzeFullGame(
          pgnToAnalyze,
          requestedDepth,
          (current, total) => {
            if (isCurrent()) setProgress({ current, total });
          },
          {
            signal: controller.signal,
            onPartial: (partialOutput, totalPlies) => {
              if (!isCurrent() || partialOutput.moves.length < Math.min(PROGRESSIVE_MIN_PLIES, totalPlies)) return;
              const partialResult = toResult(partialOutput);
              setPartial(partialResult);
              if (!firstMovesShown) {
                firstMovesShown = true;
                callbacks.onFirstMoves?.(partialResult);
              }
            },
          }
        );

        const analysis = toResult(output);
        setResult(analysis);
        setPgn(pgnToAnalyze);
        setDepth(requestedDepth);
        return { status: 'done', result: analysis };
      } catch (err) {
        if (isAbortError(err)) return { status: 'cancelled' };
        console.error('Analysis error:', err);
        return { status: 'failed' };
      } finally {
        if (isCurrent()) {
          abortRef.current = null;
          setIsAnalyzing(false);
          setProgress(null);
          setPartial(null);
          setAnalyzingPgn(null);
        }
      }
    },
    [userPseudo, userColor]
  );

  /** Stops the running analysis (if any): `analyze` then resolves with `{ status: 'cancelled' }`. */
  const cancel = useCallback(() => abortRef.current?.abort(), []);

  // Leaving the page must not leave the engine busy with a game nobody will see
  useEffect(() => () => abortRef.current?.abort(), []);

  const updateAiExplanation = useCallback((ply: number, explanation: NonNullable<MoveAnalysis['aiExplanation']>) => {
    setResult((prev) => {
      if (!prev) return null;
      const moves = [...prev.moves];
      if (moves[ply]) moves[ply] = { ...moves[ply], aiExplanation: explanation };
      return { ...prev, moves };
    });
  }, []);

  /** Records the side the user plays on the current result, so that it is kept with the stored game. */
  const updateUserColor = useCallback((color: PlayerColor) => {
    const change = (prev: GameAnalysisResult | null) =>
      prev && prev.userColor !== color ? { ...prev, userColor: color } : prev;
    setPartial(change);
    // While a new game is being analysed `result` is the previous game: leave it alone
    if (abortRef.current === null) setResult(change);
  }, []);

  return {
    // The PGN of the game on screen: the one being analysed once its first moves are shown
    pgn: partial && analyzingPgn !== null ? analyzingPgn : pgn,
    isAnalyzing,
    isRestoring,
    progress,
    result,
    partial,
    analyze,
    cancel,
    restoreLast,
    updateAiExplanation,
    updateUserColor,
  };
}
