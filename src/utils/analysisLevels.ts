export interface AnalysisLevel {
  /** Stockfish search depth (plies). */
  depth: number;
  label: string;
  /** Indicative duration for a game of about 40 moves on a 4-core machine. */
  time: string;
  icon: string;
}

export const DEFAULT_ANALYSIS_DEPTH = 12;

export const ANALYSIS_LEVELS: readonly AnalysisLevel[] = [
  { depth: 8, label: 'Éclair', time: '<1s', icon: '⚡' },
  { depth: 10, label: 'Rapide', time: '~1s', icon: '⏱️' },
  { depth: 12, label: 'Standard', time: '~1s', icon: '🎯' },
  { depth: 14, label: 'Poussé', time: '~2s', icon: '🧠' },
  { depth: 16, label: 'Expert', time: '~6s', icon: '🔬' },
  { depth: 18, label: 'Maître', time: '~15s', icon: '♛' },
];
