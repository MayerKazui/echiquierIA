export interface CapturedPiecesSummary {
  pieces: Array<{ type: 'q' | 'r' | 'b' | 'n' | 'p'; count: number }>;
  materialScore: number;
  advantage: number; // positive if this player has material advantage, 0 if equal, negative if deficit
}

export interface BoardMaterialState {
  whiteMaterial: number;
  blackMaterial: number;
  diff: number; // whiteMaterial - blackMaterial
  whiteCaptured: Array<{ type: 'q' | 'r' | 'b' | 'n' | 'p'; count: number }>; // Black pieces captured by White
  blackCaptured: Array<{ type: 'q' | 'r' | 'b' | 'n' | 'p'; count: number }>; // White pieces captured by Black
  whiteAdvantage: number;
  blackAdvantage: number;
}

export function computeBoardMaterial(fen: string): BoardMaterialState {
  if (!fen) {
    return {
      whiteMaterial: 39,
      blackMaterial: 39,
      diff: 0,
      whiteCaptured: [],
      blackCaptured: [],
      whiteAdvantage: 0,
      blackAdvantage: 0,
    };
  }

  const positionPart = fen.trim().split(' ')[0] || '';
  const counts: Record<string, number> = {
    P: 0,
    N: 0,
    B: 0,
    R: 0,
    Q: 0,
    p: 0,
    n: 0,
    b: 0,
    r: 0,
    q: 0,
  };

  for (const char of positionPart) {
    if (counts[char] !== undefined) {
      counts[char]++;
    }
  }

  const PIECE_VALUES: Record<string, number> = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
  };

  const whiteMaterial =
    counts.P * PIECE_VALUES.p +
    counts.N * PIECE_VALUES.n +
    counts.B * PIECE_VALUES.b +
    counts.R * PIECE_VALUES.r +
    counts.Q * PIECE_VALUES.q;

  const blackMaterial =
    counts.p * PIECE_VALUES.p +
    counts.n * PIECE_VALUES.n +
    counts.b * PIECE_VALUES.b +
    counts.r * PIECE_VALUES.r +
    counts.q * PIECE_VALUES.q;

  const diff = whiteMaterial - blackMaterial;

  // Pieces captured by White (black pieces missing from board)
  // Ordered standard: Queen, Rook, Bishop, Knight, Pawn
  const whiteCapturedRaw: Array<{ type: 'q' | 'r' | 'b' | 'n' | 'p'; count: number }> = [
    { type: 'q', count: Math.max(0, 1 - counts.q) },
    { type: 'r', count: Math.max(0, 2 - counts.r) },
    { type: 'b', count: Math.max(0, 2 - counts.b) },
    { type: 'n', count: Math.max(0, 2 - counts.n) },
    { type: 'p', count: Math.max(0, 8 - counts.p) },
  ];

  // Pieces captured by Black (white pieces missing from board)
  const blackCapturedRaw: Array<{ type: 'q' | 'r' | 'b' | 'n' | 'p'; count: number }> = [
    { type: 'q', count: Math.max(0, 1 - counts.Q) },
    { type: 'r', count: Math.max(0, 2 - counts.R) },
    { type: 'b', count: Math.max(0, 2 - counts.B) },
    { type: 'n', count: Math.max(0, 2 - counts.N) },
    { type: 'p', count: Math.max(0, 8 - counts.P) },
  ];

  const whiteCaptured = whiteCapturedRaw.filter((p) => p.count > 0);
  const blackCaptured = blackCapturedRaw.filter((p) => p.count > 0);

  return {
    whiteMaterial,
    blackMaterial,
    diff,
    whiteCaptured,
    blackCaptured,
    whiteAdvantage: diff > 0 ? diff : 0,
    blackAdvantage: diff < 0 ? Math.abs(diff) : 0,
  };
}
