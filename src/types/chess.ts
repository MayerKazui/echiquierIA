export type MoveClassification =
  'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'missedWin' | 'book';

export type GamePhase = 'opening' | 'middlegame' | 'endgame';

export interface MoveAnalysis {
  ply: number;
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion?: string;
  fenBefore: string;
  fenAfter: string;
  evalBefore: number; // Centipawns from White's perspective (+ = White advantage)
  evalAfter: number; // Centipawns from White's perspective
  mateBefore: number | null;
  mateAfter: number | null;
  bestMoveUci: string;
  bestMoveSan: string;
  bestMoveFrom: string;
  bestMoveTo: string;
  pv: string[];
  centipawnLoss: number; // Loss for player whose turn it was (>= 0)
  winPercentBefore: number;
  winPercentAfter: number;
  winPercentLoss: number;
  classification: MoveClassification;
  /** The phase of the game the move was played in, from the material on the board (see `phaseOfPosition`). */
  phase?: GamePhase;
  /** What kind of fault this is (mistake, blunder, miss only); filled in when the game is stored, see `faultKinds`. */
  faultKind?: 'mate' | 'hanging' | 'tactic' | 'wasted' | 'other';
  clock?: string;
  thinkTimeSeconds?: number;
  thinkTimeFormatted?: string;
  isLongThink?: boolean;
  isRushed?: boolean;
  thinkRatioToAverage?: number;
  openingName?: string;
  eco?: string;
  aiExplanation?: {
    concept: string;
    whyPlayedIsBad: string;
    whyBestIsBetter: string;
    plan: string;
  };
}

export interface PlayerStats {
  accuracy: number;
  totalMoves: number;
  book?: number;
  brilliant: number;
  great: number;
  best: number;
  excellent: number;
  good: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  missedWins: number;
  avgCentipawnLoss: number;
  openingBlunders: number;
  middlegameBlunders: number;
  endgameBlunders: number;
  avgThinkTimeSeconds?: number;
  longThinksCount?: number;
  rushedMovesCount?: number;
}

export interface GameMetadata {
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white?: string;
  black?: string;
  result?: string;
  whiteElo?: string;
  blackElo?: string;
  eco?: string;
  opening?: string;
  timeControl?: string;
  hasClockData?: boolean;
}

export interface GameAnalysisResult {
  metadata: GameMetadata;
  moves: MoveAnalysis[];
  statsWhite: PlayerStats;
  statsBlack: PlayerStats;
  userColor?: 'w' | 'b' | null;
  userPseudo?: string;
}
