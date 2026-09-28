import { Chess } from 'chess.js';
import { EngineEvaluation } from './stockfishEngine';

/**
 * Standard grandmaster opening repertoires to evaluate opening positions in 0 ms.
 * Covers mainlines of 1. e4, 1. d4, 1. c4, 1. Nf3 and their key defenses.
 */
const OPENING_LINES: string[][] = [
  // Ruy Lopez (Espagnole)
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Nb8', 'd4'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'O-O', 'c3', 'd5'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'O-O', 'Nxe4', 'd4', 'Nd6', 'Bxc6', 'dxc6', 'dxe5', 'Nf5', 'Qxd8+', 'Kxd8'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'e5', 'Nd5', 'O-O'],

  // Italian Game (Italienne)
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O', 'h3', 'a6', 'Bb3', 'Ba7'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'd3', 'd6', 'c3', 'a6', 'a4', 'Ba7'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Be7', 'O-O', 'O-O', 'Re1', 'd6', 'c3', 'Na5'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5', 'Bb5+', 'c6', 'dxc6', 'bxc6', 'Be2', 'h6', 'Nf3', 'e4'],

  // Sicilian Defense (Sicilienne)
  // Najdorf
  ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5', 'Nb3', 'Be6', 'f3', 'Be7', 'Qd2', 'O-O', 'O-O-O', 'Nbd7'],
  ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Bg5', 'e6', 'f4', 'Be7', 'Qf3', 'Qc7', 'O-O-O', 'Nbd7'],
  ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Bc4', 'e6', 'Bb3', 'b5', 'Bg5', 'Be7', 'Qf3', 'Qc7', 'O-O-O', 'Bb7'],
  // Classical / Dragon / Richter-Rauzer
  ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'Nc6', 'Bg5', 'e6', 'Qd2', 'a6', 'O-O-O', 'Bd7'],
  ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'Bg7', 'f3', 'O-O', 'Qd2', 'Nc6', 'Bc4', 'Bd7', 'O-O-O'],
  // Sveshnikov
  ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5', 'Ndb5', 'd6', 'Bg5', 'a6', 'Na3', 'b5', 'Nd5', 'Be7', 'Bxf6', 'Bxf6', 'c3'],
  // Paulsen / Kan / Taimanov
  ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'a6', 'Bd3', 'Nf6', 'O-O', 'Qc7', 'Qe2', 'd6', 'c4', 'g6'],
  ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'Nc6', 'Nc3', 'Qc7', 'Be3', 'a6', 'Qd2', 'Nf6', 'O-O-O'],
  // Alapin
  ['e4', 'c5', 'c3', 'd5', 'exd5', 'Qxd5', 'd4', 'Nf6', 'Nf3', 'e6', 'Be2', 'Be7', 'O-O', 'O-O'],

  // French Defense (Française)
  ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e5', 'Nfd7', 'Bxe7', 'Qxe7', 'f4', 'O-O', 'Nf3', 'c5'],
  ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+', 'bxc3', 'Ne7', 'Qg4', 'O-O', 'Bd3', 'Nbc6'],
  ['e4', 'e6', 'd4', 'd5', 'Nd2', 'c5', 'exd5', 'Qxd5', 'Ngf3', 'cxd4', 'Bc4', 'Qd6', 'O-O', 'Nf6'],
  ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3', 'Qb6', 'a3', 'c4', 'Nbd2', 'Na5'],

  // Caro-Kann Defense
  ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6', 'h4', 'h6', 'Nf3', 'Nd7', 'h5', 'Bh7', 'Bd3', 'Bxd3', 'Qxd3'],
  ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2', 'c5', 'Be3', 'Qb6', 'Nc3', 'Nc6', 'O-O'],
  ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'Bd3', 'Nc6', 'c3', 'Nf6', 'Bf4', 'Bg4', 'Qb3', 'Qc8'],

  // Queen's Gambit Declined (Gambit Dame)
  ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6', 'Bh4', 'b6', 'cxd5', 'Nxd5', 'Bxe7', 'Qxe7', 'Nxd5', 'exd5'],
  ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'cxd5', 'exd5', 'Bg5', 'c6', 'e3', 'Be7', 'Bd3', 'O-O', 'Qc2', 'Nbd7'],
  // Slav Defense (Slave)
  ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4', 'a4', 'Bf5', 'e3', 'e6', 'Bxc4', 'Bb4', 'O-O', 'O-O', 'Qe2', 'Nbd7'],
  ['d4', 'd5', 'c4', 'c6', 'Nc3', 'Nf6', 'e3', 'e6', 'Nf3', 'Nbd7', 'Bd3', 'dxc4', 'Bxc4', 'b5', 'Bd3', 'Bb7'],

  // King's Indian Defense (Est-Indienne)
  ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'O-O', 'Nc6', 'd5', 'Ne7', 'Ne1', 'Nd7', 'Be3', 'f5'],
  ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f3', 'O-O', 'Be3', 'e5', 'd5', 'c6', 'Qd2', 'cxd5', 'cxd5'],

  // Grünfeld Defense
  ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'cxd5', 'Nxd5', 'e4', 'Nxc3', 'bxc3', 'Bg7', 'Nf3', 'c5', 'Rb1', 'O-O', 'Be2'],

  // Nimzo-Indian Defense
  ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3', 'O-O', 'Bd3', 'd5', 'Nf3', 'c5', 'O-O', 'Nc6', 'a3', 'Bxc3', 'bxc3', 'dxc4', 'Bxc4'],
  ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'Qc2', 'O-O', 'a3', 'Bxc3+', 'Qxc3', 'b6', 'Bg5', 'Bb7'],

  // English Opening (Anglaise)
  ['c4', 'e5', 'Nc3', 'Nf6', 'Nf3', 'Nc6', 'g3', 'd5', 'cxd5', 'Nxd5', 'Bg2', 'Nb6', 'O-O', 'Be7', 'd3', 'O-O'],
  ['c4', 'c5', 'Nc3', 'Nc6', 'g3', 'g6', 'Bg2', 'Bg7', 'Nf3', 'Nf6', 'O-O', 'O-O', 'd4', 'cxd4', 'Nxd4'],

  // Reti / King's Indian Attack
  ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2', 'c6', 'O-O', 'Bf5', 'd3', 'e6', 'Nbd2', 'h6', 'Qe1', 'Be7', 'e4'],
  ['Nf3', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'Be7', 'O-O', 'O-O', 'b3', 'c5', 'Bb2', 'Nc6'],

  // Scandinavian Defense (Scandinave)
  ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'Nf6', 'Nf3', 'c6', 'Bc4', 'Bf5', 'Bd2', 'e6', 'Nd5', 'Qd8'],

  // Philidor Defense
  ['e4', 'e5', 'Nf3', 'd6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nc3', 'Be7', 'Be2', 'O-O', 'O-O', 'Re8'],
];

/**
 * Normalizes FEN by keeping only piece placement, active color, castling rights, and en passant target.
 * Ignores halfmove clock and fullmove number to match transpositions.
 */
export function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  return parts.slice(0, 4).join(' ');
}

// Map of normalized FEN -> Book move evaluation & Opening details
export interface BookEntry {
  eval: EngineEvaluation;
  eco?: string;
  name?: string;
}

const bookCache = new Map<string, BookEntry>();
let isBookInitialized = false;
let isFullDatasetLoaded = false;

function initOpeningBook() {
  if (isBookInitialized) return;

  try {
    for (const line of OPENING_LINES) {
      const chess = new Chess();
      for (let i = 0; i < line.length - 1; i++) {
        const normFen = normalizeFen(chess.fen());
        const moveSan = line[i];
        const nextMoves = line.slice(i, i + 4);

        if (!bookCache.has(normFen)) {
          // Verify legal move
          const moveRes = chess.move(moveSan);
          if (moveRes) {
            const uci = moveRes.from + moveRes.to + (moveRes.promotion || '');
            const isWhiteTurn = chess.turn() === 'b';
            bookCache.set(normFen, {
              eval: {
                cp: isWhiteTurn ? 20 : 15,
                mate: null,
                bestMoveSan: moveSan,
                bestMoveUci: uci,
                pv: nextMoves,
              },
            });
            continue;
          }
        } else {
          chess.move(moveSan);
        }
      }
    }
  } catch (err) {
    console.warn('Error populating base opening book:', err);
  } finally {
    isBookInitialized = true;
  }

  // Asynchronously load complete Lichess dataset from /openings.json
  if (typeof window !== 'undefined' && !isFullDatasetLoaded) {
    fetch('/openings.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Record<string, [string, string, string, string, string[]]>) => {
        for (const [normFen, [bestMoveSan, bestMoveUci, eco, name, pv]] of Object.entries(data)) {
          const isWhiteTurn = normFen.includes(' w ');
          bookCache.set(normFen, {
            eval: {
              cp: isWhiteTurn ? 20 : 15,
              mate: null,
              bestMoveSan: bestMoveSan || '',
              bestMoveUci: bestMoveUci || '',
              pv: pv || [],
            },
            eco,
            name,
          });
        }
        isFullDatasetLoaded = true;
      })
      .catch((err) => {
        console.info('Loaded base opening book (full Lichess openings.json fallback ready):', err);
      });
  }
}

/**
 * Check if position is a known opening theoretical book move.
 * Returns instant EngineEvaluation in 0 ms.
 */
export function getOpeningBookEvaluation(fen: string): EngineEvaluation | null {
  if (!isBookInitialized) {
    initOpeningBook();
  }

  const normFen = normalizeFen(fen);
  const entry = bookCache.get(normFen);
  return entry ? entry.eval : null;
}

/**
 * Checks if a played move is a recognized theoretical book move from the position.
 */
export function checkIsTheoreticalMove(
  fenBefore: string,
  moveSan: string
): { isBook: boolean; eco?: string; name?: string } {
  if (!isBookInitialized) {
    initOpeningBook();
  }

  const normFen = normalizeFen(fenBefore);
  const entry = bookCache.get(normFen);
  if (!entry) return { isBook: false };

  // If the move matches the primary theoretical recommendation or is known in theory
  if (entry.eval.bestMoveSan === moveSan) {
    return { isBook: true, eco: entry.eco, name: entry.name };
  }

  return { isBook: false };
}

/**
 * Analyzes the played sequence of positions to identify the exact opening and ECO code
 * using the Lichess master openings database.
 */
export function identifyGameOpening(fensAfter: string[]): { eco: string; name: string } | null {
  if (!isBookInitialized) {
    initOpeningBook();
  }

  // Scan backwards from ply 30 down to find the deepest recognized named theoretical variation
  const maxScan = Math.min(fensAfter.length - 1, 30);
  for (let i = maxScan; i >= 0; i--) {
    const norm = normalizeFen(fensAfter[i]);
    const entry = bookCache.get(norm);
    if (entry && entry.eco && entry.name) {
      return {
        eco: entry.eco,
        name: entry.name,
      };
    }
  }

  return null;
}
