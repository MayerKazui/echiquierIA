import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { SAMPLE_GAMES } from './sampleGames';
import { convertUciToFrenchSan, formatPvToFrench, frenchifyMoveText, toEnglishSan, toFrenchSan } from './chessNotation';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('toFrenchSan', () => {
  it.each<[string, string]>([
    ['Qf3', 'Df3'],
    ['Nf6', 'Cf6'],
    ['Bg5', 'Fg5'],
    ['Rad1', 'Tad1'],
    ['Kg1', 'Rg1'],
    ['Nbd7', 'Cbd7'],
    ['Bxf7+', 'Fxf7+'],
    ['Qxd8#', 'Dxd8#'],
    ['e8=Q#', 'e8=D#'],
    ['exd8=N+', 'exd8=C+'],
    ['e4', 'e4'],
    ['O-O', 'O-O'],
    ['O-O-O+', 'O-O-O+'],
    ['', ''],
  ])('%s -> %s', (san, expected) => {
    expect(toFrenchSan(san)).toBe(expected);
  });
});

describe('toEnglishSan', () => {
  it.each<[string, string]>([
    ['Df3', 'Qf3'],
    ['Cf6', 'Nf6'],
    ['Fg5', 'Bg5'],
    ['Tad1', 'Rad1'],
    ['Txd1+', 'Rxd1+'],
    ['Rg1', 'Kg1'],
    ['Cbd7', 'Nbd7'],
    ['e8=D#', 'e8=Q#'],
    ['exd8=C+', 'exd8=N+'],
    ['e4', 'e4'],
    ['O-O-O', 'O-O-O'],
    ['', ''],
  ])('%s -> %s', (san, expected) => {
    expect(toEnglishSan(san)).toBe(expected);
  });

  it('is the inverse of toFrenchSan for every move of the sample games', () => {
    for (const game of SAMPLE_GAMES) {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      for (const san of chess.history()) {
        expect(toEnglishSan(toFrenchSan(san)), `${game.name}: ${san}`).toBe(san);
      }
    }
  });
});

describe('convertUciToFrenchSan', () => {
  it('converts a UCI move to French SAN from a position', () => {
    expect(convertUciToFrenchSan(START, 'g1f3')).toBe('Cf3');
    expect(convertUciToFrenchSan(START, 'e2e4')).toBe('e4');
  });

  it('handles promotions', () => {
    expect(convertUciToFrenchSan('7k/4P3/8/8/8/8/8/K7 w - - 0 1', 'e7e8q')).toBe('e8=D+');
  });

  it('returns the UCI string when the move is illegal or malformed', () => {
    expect(convertUciToFrenchSan(START, 'e2e5')).toBe('e2e5');
    expect(convertUciToFrenchSan(START, 'e2')).toBe('e2');
    expect(convertUciToFrenchSan(START, '')).toBe('');
  });
});

describe('formatPvToFrench', () => {
  it('numbers the moves of a variation starting with White', () => {
    expect(formatPvToFrench(START, ['e2e4', 'e7e5', 'g1f3', 'b8c6'])).toBe('1. e4 e5 2. Cf3 Cc6');
  });

  it('marks a variation starting with Black with an ellipsis', () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(formatPvToFrench(afterE4, ['e7e5', 'g1f3'])).toBe('1... e5 2. Cf3');
  });

  it('numbers moves from the fullmove counter of a mid-game position', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 10';
    expect(formatPvToFrench(fen, ['f1b5', 'a7a6', 'b5a4'])).toBe('10. Fb5 a6 11. Fa4');
  });

  it('can omit move numbers and limit the length', () => {
    expect(formatPvToFrench(START, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 3, false)).toBe('e4 e5 Cf3');
  });

  it('also reads a variation written in SAN (the opening book), English or French', () => {
    expect(formatPvToFrench(START, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], 6, false)).toBe('e4 e5 Cf3 Cc6 Fb5');
    expect(formatPvToFrench(START, ['e4', 'e5', 'Cf3', 'Cc6'])).toBe('1. e4 e5 2. Cf3 Cc6');
    expect(formatPvToFrench(START, ['e2e4', 'e5', 'Nf3'], 6, false)).toBe('e4 e5 Cf3');
  });

  it('stops at the first illegal move and handles empty input', () => {
    expect(formatPvToFrench(START, ['e2e4', 'e2e4', 'g1f3'])).toBe('1. e4');
    expect(formatPvToFrench(START, [])).toBe('');
  });
});

describe('frenchifyMoveText', () => {
  it.each<[string, string]>([
    ['En jouant Qc5, tu permets ...Nf6', 'En jouant Dc5, tu permets ...Cf6'],
    ['Bxf7+ puis Qxd8# et Kg1', 'Fxf7+ puis Dxd8# et Rg1'],
    ['Nbd7 ou N5f3', 'Cbd7 ou C5f3'],
    ['promotion e8=Q# ou exd8=N+', 'promotion e8=D# ou exd8=C+'],
    ['(Qh5)', '(Dh5)'],
  ])('%s', (text, expected) => {
    expect(frenchifyMoveText(text)).toBe(expected);
  });

  it('leaves French moves, ordinary words and a leading R alone', () => {
    const text = 'Db3 puis Cf3, Fg5, Txd1 et Rg1 ; Bonjour, Quelle case : e4 ? Nous Bravo';
    expect(frenchifyMoveText(text)).toBe(text);
    expect(frenchifyMoveText('Rad1')).toBe('Rad1');
  });

  it('does not touch letters inside a longer word or square names alone', () => {
    expect(frenchifyMoveText('Nf3x Bd5abc Qe4s')).toBe('Nf3x Bd5abc Qe4s');
    expect(frenchifyMoveText('la case b5 et le pion e4')).toBe('la case b5 et le pion e4');
  });

  it('handles empty text', () => {
    expect(frenchifyMoveText('')).toBe('');
  });
});
