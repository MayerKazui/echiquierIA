import type { PlayerColor } from './ui';

/** A circle (`to` equals `from`) or an arrow drawn on the board, in a Lichess brush colour (G, R, Y, B). */
export interface StudyShape {
  brush: 'G' | 'R' | 'Y' | 'B';
  from: string;
  to: string;
}

/**
 * One move of a chapter, with what follows it. `children[0]` is the main continuation, the other children are
 * the variations played instead of it. The root of a chapter is the starting position (no move).
 */
export interface StudyNode {
  id: string;
  /** English SAN of the move; empty on the root. */
  san: string;
  from: string;
  to: string;
  promotion?: string;
  /** Position after the move. */
  fen: string;
  /** What the author says about the move (or about the starting position, on the root). */
  comment?: string;
  /** Numeric annotation glyphs: 1 "!", 2 "?", 3 "!!", 4 "??", 5 "!?", 6 "?!", 10 "=", 13 "∞", 14 "⩲", 16 "±"… */
  nags?: number[];
  shapes?: StudyShape[];
  children: StudyNode[];
}

export interface StudyChapter {
  id: string;
  name: string;
  /** The side at the bottom of the board, and the side the player takes when the chapter is played. */
  orientation: PlayerColor;
  root: StudyNode;
}

export interface Study {
  id: string;
  name: string;
  /** The introduction of the study. */
  description: string;
  chapters: StudyChapter[];
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}
