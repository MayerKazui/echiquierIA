import { z } from 'zod';

// Request validation for the API routes.
export const lichessImportSchema = z.object({
  pgn: z.string().min(1).max(60_000),
});
export type LichessImportRequest = z.infer<typeof lichessImportSchema>;
