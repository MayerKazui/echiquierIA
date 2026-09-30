import { Chess } from 'chess.js';
import { z } from 'zod';
import type { MoveClassification as ClientMoveClassification } from '../src/types/chess';

// Request validation. Every string that ends up in the Gemini prompt is restricted to a
// character set with no quotes, braces or line breaks, so it cannot carry instructions.
export const MOVE_CLASSIFICATIONS = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
  'missedWin',
  'book',
] as const satisfies readonly ClientMoveClassification[];
export type MoveClassification = (typeof MOVE_CLASSIFICATIONS)[number];

// Moves that deserve praise rather than a critique (mirrors the client-side list).
const GOOD_CLASSIFICATIONS: readonly MoveClassification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book'];
export const isGoodClassification = (key: MoveClassification) => GOOD_CLASSIFICATIONS.includes(key);

const moveToken = z
  .string()
  .max(12)
  .regex(/^[\p{L}\p{N}+#=\-@()]*$/u);
const moveRef = z.object({ san: moveToken.optional(), uci: moveToken.optional() });
export type MoveRef = z.infer<typeof moveRef>;
const evalLabel = z.string().regex(/^(M\d{1,3}|[+-]?\d{1,5}(\.\d)?)$/);

const isValidFen = (fen: string) => {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
};

export const explainSchema = z.object({
  fen: z.string().max(100).refine(isValidFen, 'FEN invalide'),
  movePlayed: moveRef,
  moveBest: moveRef,
  evalPlayed: evalLabel,
  evalBest: evalLabel,
  // Raw MoveClassification from the client: drives the good/bad logic (no French substring tests).
  classificationKey: z.enum(MOVE_CLASSIFICATIONS),
  // Display label for the prompt. Usually "Gaffe critique", but it can also be an opening name.
  classification: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[\p{L}\p{N} '’:,.()\-/&]+$/u),
  pv: z
    .string()
    .max(120)
    .regex(/^[\p{L}\p{N}+#=\-@() ]*$/u)
    .optional(),
  playerColor: z.enum(['white', 'black']),
  moveNumber: z.number().int().min(1).max(1000),
  sanHistory: z.array(moveToken).max(1000).optional(),
});

export const lichessImportSchema = z.object({
  pgn: z.string().min(1).max(60_000),
});
export type LichessImportRequest = z.infer<typeof lichessImportSchema>;

export type ExplainRequest = z.infer<typeof explainSchema>;

/** Shape Gemini must return (extra fields are dropped); mirrors MoveAnalysis['aiExplanation']. */
export const explanationSchema = z.object({
  concept: z.string(),
  whyPlayedIsBad: z.string().default(''),
  whyBestIsBetter: z.string(),
  plan: z.string(),
});

export type Explanation = z.infer<typeof explanationSchema>;
