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
    result =
      frenchPiece +
      rest.replace(/^([a-h1-8]?)([KQRBN])/, (_, prefix, disambigPiece) => {
        return prefix + (ENGLISH_TO_FRENCH_PIECES[disambigPiece] || disambigPiece);
      });
  }

  return result;
}

const FRENCH_TO_ENGLISH_PIECES: Record<string, string> = Object.fromEntries(
  Object.entries(ENGLISH_TO_FRENCH_PIECES).map(([english, french]) => [french, english])
);

/**
 * Translates French SAN back to English SAN (inverse of toFrenchSan):
 *  'Df3' -> 'Qf3', 'Cbd7' -> 'Nbd7', 'Txd1+' -> 'Rxd1+', 'Rg1' -> 'Kg1', 'e8=D#' -> 'e8=Q#'
 * Pieces are translated in a single pass (Tour -> Rook must not then become King).
 */
export function toEnglishSan(san: string): string {
  if (!san) return '';
  if (san.startsWith('O-O')) return san;

  const promoted = san.replace(/=([DTFC])/g, (_, p) => `=${FRENCH_TO_ENGLISH_PIECES[p] || p}`);
  const first = promoted.charAt(0);
  return FRENCH_TO_ENGLISH_PIECES[first] ? FRENCH_TO_ENGLISH_PIECES[first] + promoted.slice(1) : promoted;
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

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Plays one move of a variation, written in UCI or SAN (English, then French), on the board. */
function playToken(chess: Chess, token: string) {
  if (UCI_MOVE.test(token)) {
    return chess.move({
      from: token.substring(0, 2),
      to: token.substring(2, 4),
      promotion: token.length > 4 ? token[4] : undefined,
    });
  }
  try {
    return chess.move(token);
  } catch {
    return chess.move(toEnglishSan(token));
  }
}

/**
 * Formats a sequence of moves (PV - Principal Variation) into French SAN notation. Each move is either
 * UCI (what the engine gives) or SAN (what the opening book gives: English, or already French).
 * Example:
 *   ['d1f3', 'c7c6', 'h2h3', 'f6d7']
 *   -> 'Df3 c6 h3 Cfd7' (or with move numbers: '10. Df3 c6  11. h3 Cfd7')
 */
export function formatPvToFrench(fen: string, pv: string[], maxMoves = 6, includeMoveNumbers = true): string {
  if (!pv || pv.length === 0) return '';

  const formattedMoves: string[] = [];

  try {
    const chess = new Chess(fen);
    const movesToProcess = pv.slice(0, maxMoves);

    for (const token of movesToProcess) {
      if (!token) break;

      const isWhiteTurn = chess.turn() === 'w';
      // Fullmove number of the position itself (history() is empty when starting from a FEN)
      const moveNumber = chess.moveNumber();

      let move;
      try {
        move = playToken(chess, token);
      } catch {
        break; // Illegal move: keep what was formatted so far
      }

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
    return pv.slice(0, maxMoves).join(' ');
  }

  return formattedMoves.length > 0 ? formattedMoves.join(' ') : pv.slice(0, maxMoves).join(' ');
}

/**
 * Rewrites moves written with English piece letters inside a free text (e.g. an AI explanation that
 * mixes "Qc5" and "Db3") into French notation: Qc5 -> Dc5, Nxf3 -> Cxf3, Bg5+ -> Fg5+, Kg1 -> Rg1.
 * Only K, Q, B and N are rewritten: they are not French piece letters, so they cannot be mistaken for
 * something else. A leading R is left alone (a rook in English, a king in French: ambiguous), as are
 * French moves and ordinary words.
 */
export function frenchifyMoveText(text: string): string {
  if (!text) return '';
  const promotion = (suffix: string) =>
    suffix.replace(/=([QRBN])/, (_, p: string) => `=${ENGLISH_TO_FRENCH_PIECES[p]}`);
  return (
    text
      // Piece moves: Qc5, Nbd7, Bxf7+, Kg1
      .replace(
        /(?<![\p{L}\p{N}])([KQBN])([a-h]?[1-8]?x?[a-h][1-8][+#]?)(?![\p{L}\p{N}])/gu,
        (_, piece: string, rest: string) => `${ENGLISH_TO_FRENCH_PIECES[piece]}${rest}`
      )
      // Pawn promotions: e8=Q#, exd8=N+
      .replace(/(?<![\p{L}\p{N}])([a-h]x?[a-h]?[18]=[QRBN][+#]?)(?![\p{L}\p{N}])/gu, (_, move: string) =>
        promotion(move)
      )
  );
}
