import { Chess, Square } from 'chess.js';
import { stockfishService } from '../services/stockfishEngine';
import { toFrenchSan } from './chessNotation';
import { PIECE_FRENCH_ARTICLE_NAMES } from './tacticalThreats';

export type ThreatSeverity = 'critical' | 'high' | 'moderate' | 'low';
export type ThreatCategory =
  | 'checkmate'
  | 'queen_loss'
  | 'piece_loss'
  | 'fork'
  | 'pin'
  | 'check'
  | 'infiltration'
  | 'positional';

export interface EnemyThreatRadarResult {
  hasThreat: boolean;
  nullMoveValid: boolean;
  opponentColor: 'w' | 'b';
  threatMove?: {
    from: string;
    to: string;
    san: string;
    uci: string;
    targetSquare: string;
    targetPiece?: string;
    targetPieceName?: string;
    isCapture: boolean;
  };
  threatCategory: ThreatCategory;
  threatSeverity: ThreatSeverity;
  summaryTitle: string;
  detailedDescription: string;
  threatenedSquares: string[]; // For visual board highlights
  hangingPieces: Array<{
    square: string;
    piece: string;
    pieceName: string;
    attackers: string[];
  }>;
}

const PIECE_WEIGHTS: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

/**
 * Creates the null-move FEN by toggling side to move and resetting en-passant square.
 */
function createNullMoveFen(fen: string): { nullFen: string | null; isOpponentInCheck: boolean } {
  try {
    const chess = new Chess(fen);
    const sideToMove = chess.turn(); // 'w' or 'b'
    const oppColor = sideToMove === 'w' ? 'b' : 'w';

    // Verify if opponent is already in check in the current position (e.g. friendly piece is giving check)
    // To check this, test if opponent's King is attacked by friendly pieces
    const parts = fen.split(' ');
    parts[1] = oppColor;
    parts[3] = '-'; // reset en passant
    const testChess = new Chess(parts.join(' '));

    // If opponent is in check, null-move is invalid
    if (testChess.inCheck()) {
      return { nullFen: null, isOpponentInCheck: true };
    }

    return { nullFen: parts.join(' '), isOpponentInCheck: false };
  } catch {
    return { nullFen: null, isOpponentInCheck: false };
  }
}

/**
 * Detects friendly pieces that are hanging (attacked by enemy with insufficient or zero defenders).
 */
function detectHangingFriendlyPieces(
  chess: Chess,
  friendlyColor: 'w' | 'b'
): Array<{ square: string; piece: string; pieceName: string; attackers: string[] }> {
  const hanging: Array<{ square: string; piece: string; pieceName: string; attackers: string[] }> = [];
  const enemyColor = friendlyColor === 'w' ? 'b' : 'w';

  // Make opponent turn to see what opponent can capture
  const fenParts = chess.fen().split(' ');
  fenParts[1] = enemyColor;
  fenParts[3] = '-';

  try {
    const oppTurnChess = new Chess(fenParts.join(' '));
    const oppMoves = oppTurnChess.moves({ verbose: true });

    // Find all friendly pieces
    for (let f = 0; f < 8; f++) {
      const file = 'abcdefgh'[f];
      for (let r = 1; r <= 8; r++) {
        const sq = `${file}${r}` as Square;
        const piece = chess.get(sq);
        if (piece && piece.color === friendlyColor && piece.type !== 'k') {
          // Find all enemy moves that capture this piece
          const enemyAttacks = oppMoves.filter((m) => m.to === sq);
          if (enemyAttacks.length > 0) {
            // Check if this friendly piece is undefended or attacked by a lesser piece
            const pieceVal = PIECE_WEIGHTS[piece.type] || 1;
            const attackerValues = enemyAttacks.map((m) => PIECE_WEIGHTS[m.piece] || 1);
            const minAttackerVal = Math.min(...attackerValues);

            // If attacked by a piece of lesser value (e.g. Rook attacked by Pawn or Knight), it is in danger regardless
            const attackedByLesser = minAttackerVal < pieceVal;

            if (attackedByLesser || enemyAttacks.length >= 2) {
              const info = PIECE_FRENCH_ARTICLE_NAMES[piece.type] || { name: 'Pièce' };
              hanging.push({
                square: sq,
                piece: piece.type,
                pieceName: info.name,
                attackers: enemyAttacks.map((m) => m.from),
              });
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return hanging;
}

/**
 * Analyzes what the opponent threatens to do if they had two consecutive moves (Null-Move Heuristic).
 */
export async function detectEnemyThreatRadar(fen: string): Promise<EnemyThreatRadarResult> {
  const chess = new Chess(fen);
  const friendlyColor = chess.turn(); // The side that has the move right now
  const opponentColor = friendlyColor === 'w' ? 'b' : 'w';
  const oppLabel = opponentColor === 'w' ? 'les Blancs' : 'les Noirs';

  // 1. Detect existing hanging pieces
  const hangingPieces = detectHangingFriendlyPieces(chess, friendlyColor);

  // 2. Build Null-Move position
  const { nullFen, isOpponentInCheck } = createNullMoveFen(fen);

  if (isOpponentInCheck || !nullFen) {
    return {
      hasThreat: false,
      nullMoveValid: false,
      opponentColor,
      threatCategory: 'positional',
      threatSeverity: 'low',
      summaryTitle: `L'adversaire est sous échec`,
      detailedDescription: `Le roi adverse est actuellement sous échec. L'adversaire est contraint de répondre à votre attaque et ne peut initier de menace indépendante.`,
      threatenedSquares: [],
      hangingPieces,
    };
  }

  try {
    // 3. Evaluate the null-move FEN using Stockfish (shallow depth 10 for blazing fast 20-50ms response)
    const evalResult = await stockfishService.evaluatePosition(nullFen, 10);
    const bestMoveUci = evalResult.bestMoveUci;

    if (!bestMoveUci || bestMoveUci.length < 4) {
      return {
        hasThreat: false,
        nullMoveValid: true,
        opponentColor,
        threatCategory: 'positional',
        threatSeverity: 'low',
        summaryTitle: `Aucune menace directe majeure`,
        detailedDescription: `Si vous passiez votre tour, ${oppLabel} n'ont pas de coup tactique décisif immédiat. Vous pouvez développer vos pièces ou exécuter votre plan en toute sérénité.`,
        threatenedSquares: hangingPieces.map((h) => h.square),
        hangingPieces,
      };
    }

    const fromSq = bestMoveUci.substring(0, 2);
    const toSq = bestMoveUci.substring(2, 4);

    // Apply the opponent's threat move in a clone to see what happens
    const oppTestChess = new Chess(nullFen);
    const playedMove = oppTestChess.move({
      from: fromSq,
      to: toSq,
      promotion: bestMoveUci.length > 4 ? bestMoveUci[4] : undefined,
    });

    const isCheckmate = oppTestChess.isCheckmate();
    const givesCheck = oppTestChess.inCheck();
    const isCapture = Boolean(playedMove?.captured);
    const capturedType = playedMove?.captured;

    // Categorize threat severity and message
    let threatCategory: ThreatCategory = 'positional';
    let threatSeverity: ThreatSeverity = 'low';
    let summaryTitle = '';
    let detailedDescription = '';

    const frenchSan = playedMove ? toFrenchSan(playedMove.san) : bestMoveUci;
    const threatenedSquares = [fromSq, toSq];

    if (isCheckmate) {
      threatCategory = 'checkmate';
      threatSeverity = 'critical';
      summaryTitle = `Menace de Mat immédiat : ${frenchSan}`;
      detailedDescription = `Attention critique ! Si vous ne défendez pas, ${oppLabel} jouent ${frenchSan} et vous infligent échec et mat ! Vous devez impérativement créer une échappatoire ou bloquer la menace.`;
    } else if (evalResult.mate !== null && Math.sign(evalResult.mate) === (opponentColor === 'w' ? 1 : -1)) {
      threatCategory = 'checkmate';
      threatSeverity = 'critical';
      summaryTitle = `Menace de réseau de Mat : ${frenchSan}`;
      detailedDescription = `Si vous passiez votre tour, ${oppLabel} enclenchent une séquence de mat forcé en ${Math.abs(evalResult.mate)} coup(s) via ${frenchSan}.`;
    } else if (isCapture && capturedType === 'q') {
      threatCategory = 'queen_loss';
      threatSeverity = 'critical';
      summaryTitle = `Menace de capture de la Dame : ${frenchSan}`;
      detailedDescription = `L'adversaire prépare la capture directe de votre Dame sur ${toSq.toUpperCase()} par ${frenchSan} !`;
      threatenedSquares.push(toSq);
    } else if (isCapture && (capturedType === 'r' || capturedType === 'b' || capturedType === 'n')) {
      const pieceName = PIECE_FRENCH_ARTICLE_NAMES[capturedType]?.full || 'votre pièce';
      threatCategory = 'piece_loss';
      threatSeverity = 'high';
      summaryTitle = `Menace de gain de matériel : ${frenchSan} (${pieceName})`;
      detailedDescription = `Si vous ne réagissez pas, ${oppLabel} capturent ${pieceName} en ${toSq.toUpperCase()} sans compensation favorable.`;
      threatenedSquares.push(toSq);
    } else if (givesCheck) {
      threatCategory = 'check';
      threatSeverity = 'moderate';
      summaryTitle = `Menace d'échec agressif : ${frenchSan}`;
      detailedDescription = `${oppLabel} menacent de jouer ${frenchSan}, forçant votre Roi à bouger et désorganisant votre défense.`;
    } else if (toSq.endsWith('7') || toSq.endsWith('8') || toSq.endsWith('2') || toSq.endsWith('1')) {
      threatCategory = 'infiltration';
      threatSeverity = 'moderate';
      summaryTitle = `Menace d'infiltration : ${frenchSan}`;
      detailedDescription = `${oppLabel} préparent une intrusion en territoire ennemi (${toSq.toUpperCase()}) pour assiéger vos pions arrière.`;
    } else {
      threatCategory = 'positional';
      threatSeverity = 'low';
      summaryTitle = `Pression positionnelle : ${frenchSan}`;
      detailedDescription = `${oppLabel} ont pour idée directrice de jouer ${frenchSan} afin d'améliorer leur placement et d'accroître leur espace.`;
    }

    // Add squares of hanging pieces
    for (const h of hangingPieces) {
      if (!threatenedSquares.includes(h.square)) {
        threatenedSquares.push(h.square);
      }
    }

    return {
      hasThreat: threatSeverity !== 'low' || hangingPieces.length > 0,
      nullMoveValid: true,
      opponentColor,
      threatMove: {
        from: fromSq,
        to: toSq,
        san: frenchSan,
        uci: bestMoveUci,
        targetSquare: toSq,
        targetPiece: capturedType,
        targetPieceName: capturedType ? PIECE_FRENCH_ARTICLE_NAMES[capturedType]?.name : undefined,
        isCapture,
      },
      threatCategory,
      threatSeverity,
      summaryTitle,
      detailedDescription,
      threatenedSquares,
      hangingPieces,
    };
  } catch (err) {
    console.warn('Failed to compute enemy threat radar:', err);
    return {
      hasThreat: hangingPieces.length > 0,
      nullMoveValid: false,
      opponentColor,
      threatCategory: 'positional',
      threatSeverity: hangingPieces.length > 0 ? 'high' : 'low',
      summaryTitle: hangingPieces.length > 0 ? 'Pièce(s) en prise détectée(s)' : 'Position stable',
      detailedDescription:
        hangingPieces.length > 0
          ? `Vous avez ${hangingPieces.length} pièce(s) attaquée(s) sous pression directe.`
          : `Aucune menace critique immédiate détectée.`,
      threatenedSquares: hangingPieces.map((h) => h.square),
      hangingPieces,
    };
  }
}
