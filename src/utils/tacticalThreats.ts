import { Chess, Square } from 'chess.js';
import { chessFromFen } from './chessFromFen';

export type TacticalThreatType = 'attack' | 'check' | 'pin' | 'fork' | 'hanging' | 'skewer';

export interface TacticalThreat {
  id: string;
  type: TacticalThreatType;
  sourceSquare: string; // e.g. 'f3' or 'g5'
  targetSquare: string; // e.g. 'f6'
  targetPiece?: string; // 'p', 'n', 'b', 'r', 'q', 'k'
  targetPieceName?: string; // e.g. 'Cavalier', 'Dame', 'Pion'
  targetColor?: 'w' | 'b';
  sourcePiece?: string;
  sourcePieceName?: string;
  sourceColor?: 'w' | 'b';
  label: string; // e.g. "Attaque sur Cf6"
  description: string; // Detailed pedagogical explanation in French
  severity: 'high' | 'medium' | 'low';
  pinThroughSquare?: string; // If pinned, the piece/square behind it (e.g. 'd8')
  pinThroughPieceName?: string;
  isAbsolutePin?: boolean; // Pinned against King
}

export const PIECE_FRENCH_ARTICLE_NAMES: Record<string, { article: string; name: string; full: string }> = {
  p: { article: 'le', name: 'Pion', full: 'le Pion' },
  n: { article: 'le', name: 'Cavalier', full: 'le Cavalier' },
  b: { article: 'le', name: 'Fou', full: 'le Fou' },
  r: { article: 'la', name: 'Tour', full: 'la Tour' },
  q: { article: 'la', name: 'Dame', full: 'la Dame' },
  k: { article: 'le', name: 'Roi', full: 'le Roi' },
};

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

/**
 * Checks if a square is defended by a friendly piece of defenderColor.
 */
export function isSquareDefendedBy(chess: Chess, targetSquare: string, defenderColor: 'w' | 'b'): boolean {
  try {
    const fen = chess.fen();
    const fenParts = fen.split(' ');
    fenParts[1] = defenderColor;
    const testChess = chessFromFen(fenParts.join(' '));

    const currentPiece = testChess.get(targetSquare as Square);
    if (currentPiece && currentPiece.color === defenderColor) {
      const oppColor = defenderColor === 'w' ? 'b' : 'w';
      testChess.remove(targetSquare as Square);
      testChess.put({ type: 'p', color: oppColor }, targetSquare as Square);
    }
    const moves = testChess.moves({ verbose: true });
    return moves.some((m) => m.to === targetSquare);
  } catch {
    return false;
  }
}

/**
 * Analyzes tactical threats, attacked squares, pins, checks, and forks created by a move
 * played from fenBefore (e.g. the engine's suggested best move or the played move).
 */
export function analyzeTacticalThreatsForMove(fenBefore: string, moveUci: string): TacticalThreat[] {
  if (!fenBefore || !moveUci || moveUci.length < 4) return [];

  const threats: TacticalThreat[] = [];

  try {
    const from = moveUci.substring(0, 2);
    const to = moveUci.substring(2, 4);
    const promotion = moveUci.length > 4 ? moveUci[4] : undefined;

    const chess = chessFromFen(fenBefore);
    const moveObj = chess.move({
      from,
      to,
      promotion,
    });

    if (!moveObj) return [];

    const movingColor = moveObj.color; // 'w' | 'b'
    const oppColor = movingColor === 'w' ? 'b' : 'w';
    const pieceType = moveObj.piece;
    const sourceMeta = PIECE_FRENCH_ARTICLE_NAMES[pieceType] || { article: 'le', name: 'Pièce', full: 'la pièce' };
    const fenAfter = chess.fen();

    // 1. King in Check
    if (chess.inCheck()) {
      let kingSquare = '';
      const board = chess.board();
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const sq = board[r][f];
          if (sq && sq.type === 'k' && sq.color === oppColor) {
            kingSquare = String.fromCharCode(97 + f) + (8 - r);
            break;
          }
        }
      }

      if (kingSquare) {
        threats.push({
          id: `check-${to}-${kingSquare}`,
          type: 'check',
          sourceSquare: to,
          targetSquare: kingSquare,
          targetPiece: 'k',
          targetPieceName: 'Roi',
          targetColor: oppColor,
          sourcePiece: pieceType,
          sourcePieceName: sourceMeta.name,
          sourceColor: movingColor,
          label: `Échec au Roi en ${kingSquare}`,
          description: `${sourceMeta.full.charAt(0).toUpperCase() + sourceMeta.full.slice(1)} en ${to} place directement le Roi adverse en échec sur ${kingSquare}.`,
          severity: 'high',
        });
      }
    }

    // 2. Direct attacks and captures from the landing square 'to'
    const fenParts = fenAfter.split(' ');
    fenParts[1] = movingColor;
    const attackChess = chessFromFen(fenParts.join(' '));
    const movesFromTo = attackChess.moves({ verbose: true }).filter((m) => m.from === to);

    const attacksOnPieces = movesFromTo.filter((m) => Boolean(m.captured));

    for (const atk of attacksOnPieces) {
      const targetSq = atk.to;
      const targetPieceType = atk.captured || 'p';
      const targetMeta = PIECE_FRENCH_ARTICLE_NAMES[targetPieceType] || {
        article: 'le',
        name: 'Pièce',
        full: 'la pièce',
      };
      const isDefended = isSquareDefendedBy(chess, targetSq, oppColor);
      const isTargetHighVal = targetPieceType === 'q' || targetPieceType === 'r';
      const isHanging = !isDefended;

      threats.push({
        id: `atk-${to}-${targetSq}`,
        type: isHanging ? 'hanging' : 'attack',
        sourceSquare: to,
        targetSquare: targetSq,
        targetPiece: targetPieceType,
        targetPieceName: targetMeta.name,
        targetColor: oppColor,
        sourcePiece: pieceType,
        sourcePieceName: sourceMeta.name,
        sourceColor: movingColor,
        label: isHanging
          ? `Pièce en prise : ${targetMeta.name} en ${targetSq}`
          : `Attaque sur ${targetMeta.full} ${targetSq}`,
        description: isHanging
          ? `${targetMeta.full.charAt(0).toUpperCase() + targetMeta.full.slice(1)} en ${targetSq} est attaqué(e) et sans défenseur !`
          : `${sourceMeta.full.charAt(0).toUpperCase() + sourceMeta.full.slice(1)} en ${to} attaque directement ${targetMeta.full} en ${targetSq}.`,
        severity: isHanging || isTargetHighVal ? 'high' : 'medium',
      });
    }

    // 3. Sliding piece pins (Bishops, Rooks, Queens)
    const SLIDING_DIRS: Record<string, number[][]> = {
      b: [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ],
      r: [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ],
      q: [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ],
    };

    const dirs = SLIDING_DIRS[pieceType];
    if (dirs) {
      const file0 = to.charCodeAt(0) - 97;
      const rank0 = parseInt(to[1], 10) - 1;

      for (const [df, dr] of dirs) {
        let f = file0 + df;
        let r = rank0 + dr;
        let firstPiece = null;
        let firstSq = '';
        let secondPiece = null;
        let secondSq = '';

        while (f >= 0 && f < 8 && r >= 0 && r < 8) {
          const sq = String.fromCharCode(97 + f) + (r + 1);
          const p = chess.get(sq as Square);
          if (p) {
            if (!firstPiece) {
              firstPiece = p;
              firstSq = sq;
            } else {
              secondPiece = p;
              secondSq = sq;
              break;
            }
          }
          f += df;
          r += dr;
        }

        // Pin detected if firstPiece is opponent and secondPiece is opponent and second is King or higher value
        if (firstPiece && firstPiece.color === oppColor && secondPiece && secondPiece.color === oppColor) {
          const isAbsolute = secondPiece.type === 'k';
          const isRelative = PIECE_VALUES[secondPiece.type] > PIECE_VALUES[firstPiece.type];

          if (isAbsolute || isRelative) {
            const firstMeta = PIECE_FRENCH_ARTICLE_NAMES[firstPiece.type] || {
              article: 'le',
              name: 'Pièce',
              full: 'la pièce',
            };
            const secondMeta = PIECE_FRENCH_ARTICLE_NAMES[secondPiece.type] || {
              article: 'le',
              name: 'Pièce',
              full: 'la pièce',
            };

            threats.push({
              id: `pin-${to}-${firstSq}-${secondSq}`,
              type: 'pin',
              sourceSquare: to,
              targetSquare: firstSq,
              targetPiece: firstPiece.type,
              targetPieceName: firstMeta.name,
              targetColor: oppColor,
              sourcePiece: pieceType,
              sourcePieceName: sourceMeta.name,
              sourceColor: movingColor,
              pinThroughSquare: secondSq,
              pinThroughPieceName: secondMeta.name,
              isAbsolutePin: isAbsolute,
              label: isAbsolute
                ? `Clouage absolu du ${firstMeta.name} ${firstSq}`
                : `Clouage du ${firstMeta.name} ${firstSq}`,
              description: isAbsolute
                ? `${firstMeta.full.charAt(0).toUpperCase() + firstMeta.full.slice(1)} en ${firstSq} est cloué(e) devant le Roi en ${secondSq} (tout déplacement est interdit).`
                : `${firstMeta.full.charAt(0).toUpperCase() + firstMeta.full.slice(1)} en ${firstSq} est cloué(e) devant ${secondMeta.full} en ${secondSq}.`,
              severity: 'high',
            });
          }
        }
      }
    }

    // 4. Double Attack / Fork
    if (attacksOnPieces.length >= 2) {
      const targetsStr = attacksOnPieces
        .map((a) => {
          const m = PIECE_FRENCH_ARTICLE_NAMES[a.captured || 'p'];
          return `${m ? m.full : 'pièce'} en ${a.to}`;
        })
        .join(' et ');

      threats.push({
        id: `fork-${to}`,
        type: 'fork',
        sourceSquare: to,
        targetSquare: attacksOnPieces.map((a) => a.to).join(','),
        sourcePiece: pieceType,
        sourcePieceName: sourceMeta.name,
        sourceColor: movingColor,
        label: `Fourchette / Attaque double`,
        description: `${sourceMeta.full.charAt(0).toUpperCase() + sourceMeta.full.slice(1)} en ${to} attaque simultanément ${targetsStr}.`,
        severity: 'high',
      });
    }
  } catch (err) {
    console.error('Error analyzing tactical threats for move:', err);
  }

  return threats;
}
