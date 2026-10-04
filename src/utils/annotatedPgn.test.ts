import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import {
  ALL_ANNOTATIONS,
  annotatedPgnFileName,
  availableAnnotations,
  clockTag,
  commentSafe,
  evalTag,
  gameToAnnotatedPgn,
} from './annotatedPgn';
import { parseStudyPgn } from './studyPgn';

const ORIGINAL = `[Event "Partie rapide"]
[Site "https://example.org/abc"]
[Date "2026.10.03"]
[White "Alice"]
[Black "Bob"]
[Result "0-1"]
[WhiteElo "1500"]
[TimeControl "300+2"]
[Termination "Time forfeit"]

1. e4 { [%clk 0:05:00] } e5 { [%clk 0:05:00] } 2. Nf3 { [%clk 0:04:58] } Nc6 3. Bb5 a6 0-1`;

const SANS = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'];

function move(ply: number, over: Partial<MoveAnalysis> = {}): MoveAnalysis {
  return {
    ply,
    moveNumber: Math.floor(ply / 2) + 1,
    color: ply % 2 === 0 ? 'w' : 'b',
    san: SANS[ply],
    uci: '',
    from: '',
    to: '',
    fenBefore: '',
    fenAfter: '',
    evalBefore: 0,
    evalAfter: 20,
    mateBefore: null,
    mateAfter: null,
    bestMoveUci: '',
    bestMoveSan: SANS[ply],
    bestMoveFrom: '',
    bestMoveTo: '',
    pv: [],
    centipawnLoss: 0,
    winPercentBefore: 50,
    winPercentAfter: 50,
    winPercentLoss: 0,
    classification: 'best',
    ...over,
  };
}

function result(moves: MoveAnalysis[], metadata: GameAnalysisResult['metadata'] = {}): GameAnalysisResult {
  return {
    metadata: { white: 'Alice', black: 'Bob', result: '0-1', ...metadata },
    moves,
    statsWhite: {} as never,
    statsBlack: {} as never,
    userColor: 'w',
  };
}

const MOVES: MoveAnalysis[] = [
  move(0, { evalAfter: 25, clock: '0:05:00' }),
  move(1, { evalAfter: 30, clock: '0:05:00', classification: 'book' }),
  move(2, { evalAfter: 28, clock: '0:04:58', classification: 'great' }),
  move(3, { evalAfter: -150, classification: 'mistake', bestMoveSan: 'Nf6' }),
  move(4, { evalAfter: -420, classification: 'blunder', bestMoveSan: 'Nc3', mateAfter: -4 }),
  move(5, { evalAfter: -90, classification: 'inaccuracy', bestMoveSan: 'Nf6' }),
];

const annotated = () => gameToAnnotatedPgn({ pgn: ORIGINAL, result: result(MOVES), depth: 14 });

describe('evalTag', () => {
  it('writes pawns from White, with two decimals', () => {
    expect(evalTag({ san: 'e4', evalAfter: 25, mateAfter: null })).toBe('[%eval 0.25]');
    expect(evalTag({ san: 'e5', evalAfter: -150, mateAfter: null })).toBe('[%eval -1.50]');
    expect(evalTag({ san: 'e5', evalAfter: 0, mateAfter: null })).toBe('[%eval 0.00]');
    expect(evalTag({ san: 'e5', evalAfter: -0.2, mateAfter: null })).toBe('[%eval 0.00]');
  });

  it('writes a forced mate as # (positive for White, negative for Black)', () => {
    expect(evalTag({ san: 'Qh5', evalAfter: 10000, mateAfter: 3 })).toBe('[%eval #3]');
    expect(evalTag({ san: 'Qh5', evalAfter: -10000, mateAfter: -2 })).toBe('[%eval #-2]');
  });

  it('writes nothing on the move that gives mate, and caps absurd values', () => {
    expect(evalTag({ san: 'Qxf7#', evalAfter: 10000, mateAfter: 1 })).toBeNull();
    expect(evalTag({ san: 'Qxf7', evalAfter: 25000, mateAfter: null })).toBe('[%eval 99.99]');
  });
});

describe('clockTag', () => {
  it('writes h:mm:ss whatever the clock looked like', () => {
    expect(clockTag('0:09:58')).toBe('[%clk 0:09:58]');
    expect(clockTag('9:58')).toBe('[%clk 0:09:58]');
    expect(clockTag('1:02:03')).toBe('[%clk 1:02:03]');
    expect(clockTag('9:58.4')).toBe('[%clk 0:09:58.4]');
    expect(clockTag('59.97')).toBe('[%clk 0:01:00]');
  });

  it('gives nothing for a missing or unreadable clock', () => {
    expect(clockTag(undefined)).toBeNull();
    expect(clockTag('')).toBeNull();
    expect(clockTag('n/a')).toBeNull();
  });
});

describe('commentSafe', () => {
  it('removes what would end or break a PGN comment', () => {
    expect(commentSafe('a {b}\n  c')).toBe('a (b) c');
  });
});

describe('gameToAnnotatedPgn', () => {
  it('keeps the headers of the original PGN, in the order of the seven tag roster first', () => {
    const lines = annotated().split('\n');
    expect(lines.slice(0, 7)).toEqual([
      '[Event "Partie rapide"]',
      '[Site "https://example.org/abc"]',
      '[Date "2026.10.03"]',
      '[Round "?"]',
      '[White "Alice"]',
      '[Black "Bob"]',
      '[Result "0-1"]',
    ]);
    expect(annotated()).toContain('[WhiteElo "1500"]');
    expect(annotated()).toContain('[TimeControl "300+2"]');
    expect(annotated()).toContain('[Termination "Time forfeit"]');
  });

  it('names the opening from the analysis and says who annotated, with the depth', () => {
    const text = gameToAnnotatedPgn({
      pgn: ORIGINAL,
      result: result(MOVES, { opening: 'Ruy Lopez', eco: 'C60' }),
      depth: 14,
    });
    expect(text).toContain('[ECO "C60"]');
    expect(text).toContain('[Opening "Ruy Lopez"]');
    expect(text).toContain('[Annotator "Échiquier IA (Stockfish, profondeur 14)"]');
    expect(annotated()).not.toContain('[Opening');
  });

  it('writes no link of its own', () => {
    expect(annotated().toLowerCase()).not.toContain('lichess');
    expect(annotated()).not.toContain('http://');
  });

  it('writes the symbols after the moves', () => {
    const text = annotated();
    expect(text).toContain('Nf3!');
    expect(text).toContain('Nc6?');
    expect(text).toContain('Bb5??');
    expect(text).toContain('a6?!');
    expect(text).not.toMatch(/e4[!?]/);
  });

  it('writes the evaluation and the clock of each move in one comment', () => {
    // Lines are broken between tokens: compare without them
    const text = annotated().replace(/\s+/g, ' ');
    expect(text).toContain('1. e4 { [%eval 0.25] [%clk 0:05:00] }');
    expect(text).toContain('2. Nf3! { [%eval 0.28] [%clk 0:04:58]');
    expect(text).toContain('[%eval #-4]');
  });

  it("writes the coach's verdict, the best move and the explanation", () => {
    const moves = [...MOVES];
    moves[3] = {
      ...moves[3],
      aiExplanation: {
        concept: 'Développement',
        whyPlayedIsBad: 'Le cavalier {b8} reste exposé.',
        whyBestIsBetter: 'Cf6 attaque e4.',
        plan: 'Roquer vite',
      },
    };
    const text = gameToAnnotatedPgn({ pgn: ORIGINAL, result: result(moves) });
    const flat = text.replace(/\s+/g, ' ');
    expect(flat).toContain(
      'Erreur. Meilleur coup : Nf6. Idée : Développement Le cavalier (b8) reste exposé. Cf6 attaque e4. Plan : Roquer vite }'
    );
    expect(flat).toContain('Gaffe. Meilleur coup : Nc3. }');
    expect(flat).toContain('Excellent coup. }');
  });

  it('numbers a black move again after a comment, and not after a bare move', () => {
    const bare = gameToAnnotatedPgn(
      { pgn: ORIGINAL, result: result(MOVES) },
      { evals: false, clocks: false, glyphs: false, comments: false }
    );
    expect(bare.split('\n\n')[1]).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1\n');
    expect(annotated().replace(/\s+/g, ' ')).toContain('} 1... e5');
    // Black starts the game (a position set up): its move is numbered
    const fromBlack = gameToAnnotatedPgn(
      { pgn: ORIGINAL, result: result([move(1)]) },
      { evals: false, clocks: false, glyphs: false, comments: false }
    );
    expect(fromBlack).toContain('1... e5 0-1');
  });

  it('leaves out what was not asked for', () => {
    const text = gameToAnnotatedPgn(
      { pgn: ORIGINAL, result: result(MOVES) },
      { evals: true, clocks: false, glyphs: false, comments: false }
    );
    expect(text).toContain('[%eval');
    expect(text).not.toContain('[%clk');
    expect(text).not.toContain('Erreur.');
    expect(text).not.toMatch(/Nc6\?/);
  });

  it('ends with the result and never cuts a line inside a comment', () => {
    const text = annotated();
    const movetext = text.split('\n\n')[1];
    expect(movetext.trimEnd().endsWith('0-1')).toBe(true);
    for (const line of movetext.split('\n')) {
      const open = (line.match(/\{/g) ?? []).length;
      const close = (line.match(/\}/g) ?? []).length;
      expect(open).toBe(close);
    }
  });

  it('is read back by chess.js with the same moves, the comments and the headers', () => {
    const chess = new Chess();
    chess.loadPgn(annotated());
    expect(chess.history()).toEqual(SANS);
    expect(chess.getHeaders().White).toBe('Alice');
    expect(chess.getHeaders().Result).toBe('0-1');
    expect(chess.getComments()).toHaveLength(6);
  });

  it('is read back by the study importer too', () => {
    const parsed = parseStudyPgn(annotated());
    expect(parsed.warnings).toEqual([]);
    expect(parsed.chapters).toHaveLength(1);
  });

  it('falls back on the metadata when the original PGN has no headers', () => {
    const text = gameToAnnotatedPgn(
      { pgn: '1. e4 e5', result: result(MOVES, { white: 'Zoé "Z"', black: 'Yan', date: '2026.01.02' }) },
      ALL_ANNOTATIONS
    );
    expect(text).toContain('[White "Zoé \\"Z\\""]');
    expect(text).toContain('[Date "2026.01.02"]');
    expect(text).toContain('[Event "?"]');
    expect(text).toContain('[Result "0-1"]');
  });
});

describe('availableAnnotations', () => {
  it('says what the game has to offer', () => {
    expect(availableAnnotations(result(MOVES))).toEqual({ evals: true, clocks: true, glyphs: true, comments: true });
    const plain = result([move(0, { clock: undefined }), move(1)]);
    expect(availableAnnotations(plain)).toEqual({ evals: true, clocks: false, glyphs: false, comments: false });
  });
});

describe('annotatedPgnFileName', () => {
  it('is made of the players and the date, safe as a file name', () => {
    expect(annotatedPgnFileName(result(MOVES, { white: 'Zoé Martin', black: 'a/b:c', date: '2026.10.03' }))).toBe(
      'Zoe-Martin-vs-a-b-c-2026-10-03.pgn'
    );
    expect(annotatedPgnFileName(result(MOVES, { white: '', black: undefined, date: '????.??.??' }))).toBe(
      'Blancs-vs-Noirs.pgn'
    );
  });
});
