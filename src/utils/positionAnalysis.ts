import { Chess } from 'chess.js';
import { toFrenchSan } from './chessNotation';

/** One line of the engine's analysis (a candidate move and what follows it). */
export interface AnalysisLine {
  /** 1 for the best line, 2 for the next one… (the `multipv` of UCI). */
  rank: number;
  depth: number;
  /** Centipawns from White's point of view (+ White is better, - Black is). */
  cp: number;
  /** Mate in N moves from White's point of view (+ White mates, - Black mates); null without a mate. */
  mate: number | null;
  /** The line, in UCI. */
  pv: string[];
}

/**
 * What an `info` line of the engine says, with the score seen from White's side (the engine gives it from the side
 * to move). Null for the lines that carry no usable line: no score or no moves, a bound that is not the true score
 * yet (`lowerbound`, `upperbound`), `info string`, `info currmove`…
 */
export function parseInfoLine(line: string, whiteToMove: boolean): (AnalysisLine & { nps?: number }) | null {
  if (!line.startsWith('info ')) return null;
  const parts = line.split(' ');
  if (parts.includes('lowerbound') || parts.includes('upperbound')) return null;

  const number = (key: string): number | undefined => {
    const at = parts.indexOf(key);
    if (at === -1) return undefined;
    const value = parseInt(parts[at + 1], 10);
    return Number.isNaN(value) ? undefined : value;
  };

  const depth = number('depth');
  const pvAt = parts.indexOf('pv');
  const scoreAt = parts.indexOf('score');
  if (depth === undefined || pvAt === -1 || scoreAt === -1 || !parts[pvAt + 1]) return null;

  const scoreType = parts[scoreAt + 1];
  const scoreValue = parseInt(parts[scoreAt + 2], 10);
  if (Number.isNaN(scoreValue) || (scoreType !== 'cp' && scoreType !== 'mate')) return null;
  const sign = whiteToMove ? 1 : -1;
  const mate = scoreType === 'mate' ? sign * scoreValue : null;
  // A mate is far beyond any evaluation, and the sooner the further
  const cp = mate !== null ? (mate > 0 ? 10000 : -10000) - mate * 10 : sign * scoreValue;

  return {
    rank: number('multipv') ?? 1,
    depth,
    cp,
    mate,
    pv: parts.slice(pvAt + 1).filter(Boolean),
    nps: number('nps'),
  };
}

/** "+0,3", "-1,2", "0,0", "M3" (White mates in 3), "-M3": the score of a line. */
export function formatScore(cp: number, mate: number | null): string {
  if (mate !== null) return `${mate < 0 ? '-' : ''}M${Math.abs(mate)}`;
  const pawns = (Math.abs(cp) / 100).toFixed(1).replace('.', ',');
  if (pawns === '0,0') return '0,0';
  return `${cp < 0 ? '-' : '+'}${pawns}`;
}

/** The score in words, for a screen reader. */
export function describeScore(cp: number, mate: number | null): string {
  if (mate !== null) return `mat en ${Math.abs(mate)} pour les ${mate > 0 ? 'Blancs' : 'Noirs'}`;
  const text = (Math.abs(cp) / 100).toFixed(1).replace('.', ',');
  if (text === '0,0') return 'position égale';
  return `${text} pion${Math.abs(cp) >= 200 ? 's' : ''} d’avantage pour les ${cp > 0 ? 'Blancs' : 'Noirs'}`;
}

export interface LineMove {
  uci: string;
  san: string;
  color: 'w' | 'b';
  /** "12.Cf3" for White's move, "12…Cc6" for Black's. */
  label: string;
  /** The position after the move. */
  fen: string;
}

/**
 * The moves of a line (UCI) from a position: the notation, the number and the position after each. Stops at the first
 * move that is not legal (an engine line can run past a game end), and at `limit` moves.
 */
export function lineMoves(fen: string, uciMoves: readonly string[], limit = 12): LineMove[] {
  const moves: LineMove[] = [];
  try {
    const chess = new Chess(fen);
    for (const uci of uciMoves.slice(0, limit)) {
      const number = chess.moveNumber();
      const isWhite = chess.turn() === 'w';
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      moves.push({
        uci,
        san: toFrenchSan(move.san),
        color: isWhite ? 'w' : 'b',
        label: `${number}${isWhite ? '.' : '…'}${toFrenchSan(move.san)}`,
        fen: chess.fen(),
      });
    }
  } catch {
    // The line stops where it stops being legal
  }
  return moves;
}

/** The first move of a line as an arrow of the board: its squares. */
export function arrowOf(line: Pick<AnalysisLine, 'pv'>): { from: string; to: string } | null {
  const first = line.pv[0];
  return first && first.length >= 4 ? { from: first.slice(0, 2), to: first.slice(2, 4) } : null;
}

/** The colors of the lines, on the board and in the list: the best one, then the others. */
export const LINE_COLORS = ['#10b981', '#38bdf8', '#f59e0b', '#a78bfa', '#fb7185'] as const;
