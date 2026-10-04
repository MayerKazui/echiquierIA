import type { PlayerColor } from '../types/ui';
import { formatScore, type AnalysisLine } from './positionAnalysis';

/** The engine searches until this depth, or `HELP_MAX_MS`, whichever comes first: deep enough to advise, quick enough to wait for. */
export const HELP_DEPTH = 16;
export const HELP_MAX_MS = 4000;

/** How far a hint has gone: nothing, the piece to move, then the move itself. */
export type HintStep = 0 | 1 | 2;

/** The help asked for in the current position (it is forgotten when the position changes). */
export interface HelpRequest {
  fen: string;
  hint: HintStep;
  isEval: boolean;
}

/** The score from the player's point of view: positive when the player is better. */
export function scoreForPlayer(line: Pick<AnalysisLine, 'cp' | 'mate'>, color: PlayerColor) {
  const sign = color === 'w' ? 1 : -1;
  return { cp: line.cp * sign, mate: line.mate === null ? null : line.mate * sign };
}

/** "+0,4", "-1,2", "M3" from the player's side. */
export function formatPlayerScore(line: Pick<AnalysisLine, 'cp' | 'mate'>, color: PlayerColor): string {
  const { cp, mate } = scoreForPlayer(line, color);
  return formatScore(cp, mate);
}

/** What the evaluation means for the player, in a sentence: "Vous êtes un peu mieux", "Stockfish annonce un mat en 3". */
export function describeForPlayer(line: Pick<AnalysisLine, 'cp' | 'mate'>, color: PlayerColor): string {
  const { cp, mate } = scoreForPlayer(line, color);
  if (mate !== null) {
    return mate > 0
      ? `Vous avez un mat en ${mate} coup${mate > 1 ? 's' : ''}.`
      : `Stockfish a un mat en ${-mate} coup${mate < -1 ? 's' : ''}.`;
  }
  const size = Math.abs(cp);
  if (size < 30) return 'La position est équilibrée.';
  const who = cp > 0 ? 'Vous êtes' : 'Stockfish est';
  if (size < 100) return `${who} un peu mieux.`;
  if (size < 250) return `${who} nettement mieux.`;
  if (size < 600) return `${who} bien mieux : l’avantage est important.`;
  return cp > 0 ? 'Votre position est gagnante.' : 'La position de Stockfish est gagnante.';
}
