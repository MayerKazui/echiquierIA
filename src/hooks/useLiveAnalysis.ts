import { useCallback, useEffect, useState } from 'react';
import { analysisEngine, type LiveAnalysis } from '../services/analysisEngine';

export type LiveStatus = 'idle' | 'searching' | 'done' | 'unavailable';

export interface LiveAnalysisOptions {
  /** The position to analyse; null: nothing to search (the editor is open, the game is over…). */
  fen: string | null;
  /** How many lines to search. */
  lines: number;
  /** False pauses the search; the lines found so far stay on screen. */
  isRunning: boolean;
}

interface Result {
  /** The search the result comes from (position, lines asked for, attempt): what its status says is not for another. */
  key: string;
  /** The position the result is for: it is not shown for another one. */
  fen: string | null;
  analysis: LiveAnalysis | null;
  status: LiveStatus;
}

/**
 * The engine's best lines for a position, as they come. A new position or a new number of lines starts a new
 * search, the search stops when the component goes away (or `isRunning` is false), and nothing from an old position
 * is ever shown for the new one.
 */
export function useLiveAnalysis({ fen, lines, isRunning }: LiveAnalysisOptions) {
  const [result, setResult] = useState<Result>({ key: '', fen: null, analysis: null, status: 'idle' });
  /** Bumped to start again after the engine failed. */
  const [attempt, setAttempt] = useState(0);

  const key = `${fen}|${lines}|${attempt}`;

  useEffect(() => {
    if (!fen || !isRunning) {
      analysisEngine.stop();
      return;
    }
    let cancelled = false;
    analysisEngine.analyze({
      fen,
      lines,
      onUpdate: (analysis) => {
        if (!cancelled) setResult({ key, fen, analysis, status: 'searching' });
      },
      onDone: (analysis) => {
        if (!cancelled) setResult({ key, fen, analysis, status: 'done' });
      },
      onError: () => {
        if (!cancelled) setResult((previous) => ({ ...previous, key, fen, status: 'unavailable' }));
      },
    });
    return () => {
      cancelled = true;
      analysisEngine.stop();
    };
  }, [key, fen, lines, isRunning]);

  // The engine and its worker are released with the last user of the hook
  useEffect(() => () => analysisEngine.dispose(), []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // What was found for this position stays on screen while a new search of it starts (more lines asked for, say)
  const analysis = fen !== null && result.fen === fen ? result.analysis : null;
  // Before the first report of a search it is searching; paused, it is not (a finished or failed one stays so)
  const reported = result.key === key ? result.status : null;
  let status: LiveStatus;
  if (!fen) status = 'idle';
  else if (!isRunning) status = reported === 'done' || reported === 'unavailable' ? reported : 'idle';
  else status = reported ?? 'searching';
  return { analysis, status, retry };
}
