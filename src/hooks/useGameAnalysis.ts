import { useCallback, useEffect, useRef, useState } from 'react';
import { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { PlayerColor } from '../types/ui';
import { stockfishService } from '../services/stockfishEngine';
import { loadGame, loadLatestGame, saveGame } from '../services/gameStore';
import { parsePgnHeaders } from '../utils/pgnParser';
import { SAMPLE_GAMES } from '../utils/sampleGames';

export interface AnalysisProgress {
  current: number;
  total: number;
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

/** Picks the side the user played from the PGN player names, falling back to `fallback`. */
function detectUserColor(
  headers: { white?: string; black?: string },
  userPseudo: string,
  fallback: PlayerColor
): PlayerColor {
  if (!userPseudo) return fallback;
  const white = (headers.white || '').toLowerCase();
  const black = (headers.black || '').toLowerCase();
  const pseudo = userPseudo.toLowerCase();
  if (black.includes(pseudo) && !white.includes(pseudo)) return 'b';
  if (white.includes(pseudo)) return 'w';
  return fallback;
}

/**
 * Runs the Stockfish analysis of a PGN and holds its result and progress.
 *
 * Analysed games are kept in the browser (see `gameStore`): analysing a PGN that was already analysed at the
 * same depth or deeper returns the stored result, and `restoreLast` reopens the last game after a reload.
 */
export function useGameAnalysis(userPseudo: string, userColor: PlayerColor) {
  const [pgn, setPgn] = useState<string>(SAMPLE_GAMES[1].pgn);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [result, setResult] = useState<GameAnalysisResult | null>(null);
  /** Search depth of `result`. */
  const [depth, setDepth] = useState<number | null>(null);
  /** True until `restoreLast` has finished (the caller is expected to call it once at startup). */
  const [isRestoring, setIsRestoring] = useState(true);

  const analysisStartedRef = useRef(false);
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
    async (pgnToAnalyze: string, requestedDepth = 12): Promise<GameAnalysisResult | null> => {
      analysisStartedRef.current = true;
      setIsAnalyzing(true);
      setProgress({ current: 0, total: 1 });

      try {
        // Already analysed (at least as deep): no need to run Stockfish again
        const stored = await withTimeout(loadGame(pgnToAnalyze), null, STORAGE_TIMEOUT_MS);
        if (stored && stored.depth >= requestedDepth) {
          const reused: GameAnalysisResult = {
            ...stored.result,
            userColor: detectUserColor(stored.result.metadata, userPseudo, userColor),
            userPseudo,
          };
          setResult(reused);
          setPgn(pgnToAnalyze);
          setDepth(stored.depth);
          return reused;
        }

        const headers = parsePgnHeaders(pgnToAnalyze);
        const { moves, statsWhite, statsBlack, detectedOpening } = await stockfishService.analyzeFullGame(
          pgnToAnalyze,
          requestedDepth,
          (current, total) => setProgress({ current, total })
        );

        // Auto-populate opening from Lichess database if missing in PGN headers
        if (detectedOpening) {
          if (!headers.opening) headers.opening = detectedOpening.name;
          if (!headers.eco) headers.eco = detectedOpening.eco;
        }

        const analysis: GameAnalysisResult = {
          metadata: headers,
          moves,
          statsWhite,
          statsBlack,
          userColor: detectUserColor(headers, userPseudo, userColor),
          userPseudo,
        };
        setResult(analysis);
        setPgn(pgnToAnalyze);
        setDepth(requestedDepth);
        return analysis;
      } catch (err) {
        console.error('Analysis error:', err);
        return null;
      } finally {
        setIsAnalyzing(false);
        setProgress(null);
      }
    },
    [userPseudo, userColor]
  );

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
    setResult((prev) => (prev && prev.userColor !== color ? { ...prev, userColor: color } : prev));
  }, []);

  return {
    pgn,
    isAnalyzing,
    isRestoring,
    progress,
    result,
    analyze,
    restoreLast,
    updateAiExplanation,
    updateUserColor,
  };
}
