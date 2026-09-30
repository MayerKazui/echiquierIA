import { Chess, Square } from 'chess.js';

export interface SquareControl {
  square: string;
  whiteCount: number;
  blackCount: number;
  net: number; // positive = White dominates, negative = Black dominates, 0 = neutral/equal
  isContested: boolean;
}

export interface BoardHeatmapData {
  squares: Record<string, SquareControl>;
  whiteControlledCount: number; // Net > 0
  blackControlledCount: number; // Net < 0
  whiteTotalCovered: number; // whiteCount > 0
  blackTotalCovered: number; // blackCount > 0
  whiteTotalAttacks: number;
  blackTotalAttacks: number;
  contestedCount: number;
  neutralCount: number;
  whitePercent: number;
  blackPercent: number;
}

/**
 * Computes exact space and square control heatmap for a given FEN
 */
export function computeBoardHeatmap(fen: string): BoardHeatmapData {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    chess = new Chess();
  }

  const whiteAttacks: Record<string, number> = {};
  const blackAttacks: Record<string, number> = {};

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  // Initialize all 64 squares with 0
  for (let r = 1; r <= 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = `${files[c]}${r}`;
      whiteAttacks[sq] = 0;
      blackAttacks[sq] = 0;
    }
  }

  const isValidCoord = (col: number, rank: number) => col >= 0 && col < 8 && rank >= 1 && rank <= 8;
  const toSquare = (col: number, rank: number) => `${files[col]}${rank}`;

  // Trace ray for sliding pieces (B, R, Q)
  const traceRay = (
    startCol: number,
    startRank: number,
    dCol: number,
    dRank: number,
    attackMap: Record<string, number>
  ) => {
    let c = startCol + dCol;
    let r = startRank + dRank;

    while (isValidCoord(c, r)) {
      const targetSq = toSquare(c, r);
      attackMap[targetSq] = (attackMap[targetSq] || 0) + 1;

      // If an obstacle piece is encountered, ray stops (the occupied square IS protected/attacked)
      const piece = chess.get(targetSq as Square);
      if (piece) {
        break;
      }

      c += dCol;
      r += dRank;
    }
  };

  // Iterate over all squares to find pieces
  for (let rank = 1; rank <= 8; rank++) {
    for (let col = 0; col < 8; col++) {
      const sq = toSquare(col, rank);
      const piece = chess.get(sq as Square);
      if (!piece) continue;

      const isWhite = piece.color === 'w';
      const attackMap = isWhite ? whiteAttacks : blackAttacks;
      const pieceType = piece.type.toLowerCase();

      // 1. Pawn attacks (diagonals forward)
      if (pieceType === 'p') {
        const forward = isWhite ? 1 : -1;
        const targetRank = rank + forward;
        [-1, 1].forEach((dCol) => {
          const targetCol = col + dCol;
          if (isValidCoord(targetCol, targetRank)) {
            const targetSq = toSquare(targetCol, targetRank);
            attackMap[targetSq] = (attackMap[targetSq] || 0) + 1;
          }
        });
      }

      // 2. Knight attacks (8 jumps)
      else if (pieceType === 'n') {
        const jumps = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1],
        ];
        jumps.forEach(([dCol, dRank]) => {
          const targetCol = col + dCol;
          const targetRank = rank + dRank;
          if (isValidCoord(targetCol, targetRank)) {
            const targetSq = toSquare(targetCol, targetRank);
            attackMap[targetSq] = (attackMap[targetSq] || 0) + 1;
          }
        });
      }

      // 3. King attacks (8 adjacent squares)
      else if (pieceType === 'k') {
        const deltas = [
          [-1, -1], [-1, 0], [-1, 1],
          [0, -1],           [0, 1],
          [1, -1],  [1, 0],  [1, 1],
        ];
        deltas.forEach(([dCol, dRank]) => {
          const targetCol = col + dCol;
          const targetRank = rank + dRank;
          if (isValidCoord(targetCol, targetRank)) {
            const targetSq = toSquare(targetCol, targetRank);
            attackMap[targetSq] = (attackMap[targetSq] || 0) + 1;
          }
        });
      }

      // 4. Bishop attacks (4 diagonals)
      else if (pieceType === 'b') {
        [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dCol, dRank]) => {
          traceRay(col, rank, dCol, dRank, attackMap);
        });
      }

      // 5. Rook attacks (4 orthogonals)
      else if (pieceType === 'r') {
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dCol, dRank]) => {
          traceRay(col, rank, dCol, dRank, attackMap);
        });
      }

      // 6. Queen attacks (8 directions)
      else if (pieceType === 'q') {
        [
          [-1, -1], [-1, 1], [1, -1], [1, 1],
          [-1, 0],  [1, 0],  [0, -1], [0, 1],
        ].forEach(([dCol, dRank]) => {
          traceRay(col, rank, dCol, dRank, attackMap);
        });
      }
    }
  }

  // Aggregate results for all 64 squares
  const squares: Record<string, SquareControl> = {};
  let whiteControlledCount = 0;
  let blackControlledCount = 0;
  let whiteTotalCovered = 0;
  let blackTotalCovered = 0;
  let whiteTotalAttacks = 0;
  let blackTotalAttacks = 0;
  let contestedCount = 0;
  let neutralCount = 0;

  for (let r = 1; r <= 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = toSquare(c, r);
      const w = whiteAttacks[sq] || 0;
      const b = blackAttacks[sq] || 0;
      const net = w - b;
      const isContested = w > 0 && b > 0 && w === b;

      whiteTotalAttacks += w;
      blackTotalAttacks += b;

      if (w > 0) whiteTotalCovered++;
      if (b > 0) blackTotalCovered++;

      if (net > 0) {
        whiteControlledCount++;
      } else if (net < 0) {
        blackControlledCount++;
      } else if (isContested) {
        contestedCount++;
      } else {
        neutralCount++;
      }

      squares[sq] = {
        square: sq,
        whiteCount: w,
        blackCount: b,
        net,
        isContested,
      };
    }
  }

  const whitePercent = Math.round((whiteControlledCount / 64) * 100);
  const blackPercent = Math.round((blackControlledCount / 64) * 100);

  return {
    squares,
    whiteControlledCount,
    blackControlledCount,
    whiteTotalCovered,
    blackTotalCovered,
    whiteTotalAttacks,
    blackTotalAttacks,
    contestedCount,
    neutralCount,
    whitePercent,
    blackPercent,
  };
}
