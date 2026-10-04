import { describe, expect, it } from 'vitest';
import { lichessImportSchema } from './schemas';

describe('lichessImportSchema', () => {
  it('accepts a PGN and rejects empty, oversized or missing ones', () => {
    expect(lichessImportSchema.safeParse({ pgn: '1. e4 e5' }).success).toBe(true);
    expect(lichessImportSchema.safeParse({ pgn: '' }).success).toBe(false);
    expect(lichessImportSchema.safeParse({ pgn: 'x'.repeat(60_001) }).success).toBe(false);
    expect(lichessImportSchema.safeParse({}).success).toBe(false);
    expect(lichessImportSchema.safeParse({ pgn: 42 }).success).toBe(false);
  });
});
