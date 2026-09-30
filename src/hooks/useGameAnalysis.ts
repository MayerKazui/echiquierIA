import { useCallback, useState } from 'react';
import { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { PlayerColor } from '../types/ui';
import { stockfishService } from '../services/stockfishEngine';
import { parsePgnHeaders } from '../utils/pgnParser';
import { SAMPLE_GAMES } from '../utils/sampleGames';

export interface AnalysisProgress {
  current: number;
  total: number;
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

/** Runs the Stockfish analysis of a PGN and holds its result and progress. */
export function useGameAnalysis(userPseudo: string, userColor: PlayerColor) {
  const [pgn, setPgn] = useState<string>(SAMPLE_GAMES[1].pgn);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [result, setResult] = useState<GameAnalysisResult | null>(null);

  /** Resolves with the new result, or null if the analysis failed. */
  const analyze = useCallback(
    async (pgnToAnalyze: string, depth = 12): Promise<GameAnalysisResult | null> => {
      setIsAnalyzing(true);
      setProgress({ current: 0, total: 1 });

      try {
        const headers = parsePgnHeaders(pgnToAnalyze);
        const { moves, statsWhite, statsBlack, detectedOpening } = await stockfishService.analyzeFullGame(
          pgnToAnalyze,
          depth,
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

  return { pgn, isAnalyzing, progress, result, analyze, updateAiExplanation };
}
