import { useEffect, useRef, useState } from 'react';
import { analysisEngine, type LiveAnalysis } from '../services/analysisEngine';
import type { AnalysisLine } from '../utils/positionAnalysis';
import { HELP_DEPTH, HELP_MAX_MS } from '../utils/playHelp';

export type BestLineStatus = 'idle' | 'searching' | 'ready' | 'unavailable';

interface Result {
  fen: string;
  line: AnalysisLine | null;
  status: 'searching' | 'ready' | 'unavailable';
}

/**
 * The engine's best line for a position, on demand: nothing is searched until `isWanted` is true, the search stops
 * by itself at `HELP_DEPTH` (or after `HELP_MAX_MS`), and what was found stays for that position. A new position
 * stops the search and forgets the result: it is never shown for another position. The engine has a worker of its
 * own, apart from the one the opponent plays with.
 */
export function useBestLine(fen: string, isWanted: boolean): { line: AnalysisLine | null; status: BestLineStatus } {
  const [result, setResult] = useState<Result | null>(null);
  /** The position a finished search is kept for: asking again does not search again. */
  const readyFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isWanted || readyFor.current === fen) return;
    let cancelled = false;
    let latest: LiveAnalysis | null = null;

    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      clearTimeout(timer);
      analysisEngine.stop();
      readyFor.current = fen;
      setResult({ fen, line: latest?.lines[0] ?? null, status: 'ready' });
    };

    setResult({ fen, line: null, status: 'searching' });
    const timer = setTimeout(finish, HELP_MAX_MS);
    analysisEngine.analyze({
      fen,
      lines: 1,
      onUpdate: (analysis) => {
        if (cancelled) return;
        latest = analysis;
        if (analysis.depth >= HELP_DEPTH) finish();
        else setResult({ fen, line: analysis.lines[0] ?? null, status: 'searching' });
      },
      onDone: (analysis) => {
        latest = analysis;
        finish();
      },
      onError: () => {
        if (cancelled) return;
        cancelled = true;
        clearTimeout(timer);
        setResult({ fen, line: null, status: 'unavailable' });
      },
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      analysisEngine.stop();
    };
  }, [fen, isWanted]);

  // The worker is released with the game
  useEffect(() => () => analysisEngine.dispose(), []);

  // A position change forgets a finished search
  useEffect(() => {
    if (readyFor.current !== fen) readyFor.current = null;
  }, [fen]);

  const current = result !== null && result.fen === fen ? result : null;
  if (!isWanted || current === null) return { line: null, status: 'idle' };
  return { line: current.line, status: current.status };
}
