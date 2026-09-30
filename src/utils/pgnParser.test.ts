import { describe, expect, it } from 'vitest';
import { parsePgnHeaders, validatePgn } from './pgnParser';

describe('parsePgnHeaders', () => {
  it('reads the standard headers', () => {
    const headers = parsePgnHeaders(`[Event "Casual game"]
[Site "lichess.org"]
[Date "2024.05.01"]
[Round "3"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[WhiteElo "1850"]
[BlackElo "1790"]
[ECO "C50"]
[Opening "Italian Game"]
[TimeControl "600+5"]

1. e4 e5 1-0`);

    expect(headers).toEqual({
      event: 'Casual game',
      site: 'lichess.org',
      date: '2024.05.01',
      round: '3',
      white: 'Alice',
      black: 'Bob',
      result: '1-0',
      whiteElo: '1850',
      blackElo: '1790',
      eco: 'C50',
      opening: 'Italian Game',
      timeControl: '600+5',
    });
  });

  it('matches header names case-insensitively and ignores unknown ones', () => {
    const headers = parsePgnHeaders('[WHITE "Alice"]\n[whiteelo "1500"]\n[Annotator "Someone"]');
    expect(headers.white).toBe('Alice');
    expect(headers.whiteElo).toBe('1500');
    expect(headers).not.toHaveProperty('annotator');
  });

  it('keeps quotes and spaces inside values and tolerates CRLF line endings', () => {
    const headers = parsePgnHeaders('[White "Jean \\"JP\\" Dupont"]\r\n[Black "  Marie  "]\r\n');
    expect(headers.white).toBe('Jean \\"JP\\" Dupont');
    expect(headers.black).toBe('  Marie  ');
  });

  it('falls back to defaults when headers are missing', () => {
    expect(parsePgnHeaders('1. e4 e5')).toEqual({
      white: 'Joueur Blancs',
      black: 'Joueur Noirs',
      result: '*',
    });
  });

  it('ignores lines that are not well-formed headers', () => {
    const headers = parsePgnHeaders('[White Alice]\n[Black "Bob"\nnot a header');
    expect(headers.white).toBe('Joueur Blancs');
    expect(headers.black).toBe('Joueur Noirs');
  });
});

describe('validatePgn', () => {
  it('accepts a legal game and counts its plies', () => {
    expect(validatePgn('1. e4 e5 2. Nf3 Nc6')).toEqual({ valid: true, moveCount: 4 });
  });

  it('rejects a PGN without moves', () => {
    const result = validatePgn('[Event "Empty"]\n\n*');
    expect(result.valid).toBe(false);
    expect(result.moveCount).toBe(0);
    expect(result.error).toMatch(/Aucun coup/);
  });

  it('rejects an illegal move with an error message', () => {
    const result = validatePgn('1. e4 e5 2. Ke3');
    expect(result.valid).toBe(false);
    expect(result.moveCount).toBe(0);
    expect(result.error).toBeTruthy();
  });

  it('accepts the bundled sample games', async () => {
    const { SAMPLE_GAMES } = await import('./sampleGames');
    for (const game of SAMPLE_GAMES) {
      expect(validatePgn(game.pgn).valid, game.name).toBe(true);
    }
  });
});
