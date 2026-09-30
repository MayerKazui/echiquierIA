import { Chess } from 'chess.js';

/**
 * Maps standard English chess piece letters to French chess notation:
 * K (King)   -> R (Roi)
 * Q (Queen)  -> D (Dame)
 * R (Rook)   -> T (Tour)
 * B (Bishop) -> F (Fou)
 * N (Knight) -> C (Cavalier)
 */
export const ENGLISH_TO_FRENCH_PIECES: Record<string, string> = {
  K: 'R',
  Q: 'D',
  R: 'T',
  B: 'F',
  N: 'C',
};

/**
 * Translates standard SAN (Standard Algebraic Notation) from English to French.
 * Examples:
 *  'Qf3' -> 'Df3'
 *  'Nf6' -> 'Cf6'
 *  'Bg5' -> 'Fg5'
 *  'Rad1' -> 'Tad1'
 *  'Nbd7' -> 'Cbd7'
 *  'Bxf7+' -> 'Fxf7+'
 *  'e8=Q#' -> 'e8=D#'
 *  'O-O' -> 'O-O'
 *  'c6' -> 'c6'
 */
export function toFrenchSan(san: string): string {
  if (!san) return '';

  let result = san;

  // Replace piece promotions at end (e.g. =Q, =N, =R, =B)
  result = result.replace(/=([QRBN])/g, (_, p) => `=${ENGLISH_TO_FRENCH_PIECES[p] || p}`);

  // If starts with castling O-O or O-O-O, return as is
  if (result.startsWith('O-O')) return result;

  // Replace leading piece letter if present (K, Q, R, B, N)
  const firstChar = result.charAt(0);
  if (ENGLISH_TO_FRENCH_PIECES[firstChar]) {
    const frenchPiece = ENGLISH_TO_FRENCH_PIECES[firstChar];
    const rest = result.slice(1);
    // If disambiguation has a piece letter (e.g. N/R disambiguation like Nbd7), check
    result = frenchPiece + rest.replace(/^([a-h1-8]?)([KQRBN])/, (_, prefix, disambigPiece) => {
      return prefix + (ENGLISH_TO_FRENCH_PIECES[disambigPiece] || disambigPiece);
    });
  }

  return result;
}

/**
 * Converts a single UCI move (e.g. 'd1f3') played from a given FEN into French SAN (e.g. 'Df3').
 */
export function convertUciToFrenchSan(fen: string, uciMove: string): string {
  if (!uciMove || uciMove.length < 4) return uciMove || '';

  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uciMove.substring(0, 2),
      to: uciMove.substring(2, 4),
      promotion: uciMove.length > 4 ? uciMove[4] : undefined,
    });
    if (move && move.san) {
      return toFrenchSan(move.san);
    }
  } catch {
    // If illegal or parse error, fallback
  }

  return uciMove;
}

/**
 * Formats a sequence of UCI moves (PV - Principal Variation) into French SAN notation.
 * Example:
 *   ['d1f3', 'c7c6', 'h2h3', 'f6d7']
 *   -> 'Df3 c6 h3 Cfd7' (or with move numbers: '10. Df3 c6  11. h3 Cfd7')
 */
export function formatPvToFrench(
  fen: string,
  pvUci: string[],
  maxMoves = 6,
  includeMoveNumbers = true
): string {
  if (!pvUci || pvUci.length === 0) return '';

  const formattedMoves: string[] = [];

  try {
    const chess = new Chess(fen);
    const movesToProcess = pvUci.slice(0, maxMoves);

    for (const uci of movesToProcess) {
      if (!uci || uci.length < 4) break;

      const isWhiteTurn = chess.turn() === 'w';
      const moveNumber = Math.floor(chess.history().length / 2) + 1;

      const move = chess.move({
        from: uci.substring(0, 2),
        to: uci.substring(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });

      if (!move) break;

      const sanFr = toFrenchSan(move.san);

      if (includeMoveNumbers) {
        if (formattedMoves.length === 0) {
          formattedMoves.push(isWhiteTurn ? `${moveNumber}. ${sanFr}` : `${moveNumber}... ${sanFr}`);
        } else if (isWhiteTurn) {
          formattedMoves.push(`${moveNumber}. ${sanFr}`);
        } else {
          formattedMoves.push(sanFr);
        }
      } else {
        formattedMoves.push(sanFr);
      }
    }
  } catch {
    // Fallback if simulation fails
    return pvUci.slice(0, maxMoves).join(' ');
  }

  return formattedMoves.length > 0 ? formattedMoves.join(' ') : pvUci.slice(0, maxMoves).join(' ');
}
