import { describe, expect, it } from 'vitest';
import { chapterToPgn, parseStudyPgn, readComment, studyToPgn } from './studyPgn';
import { START_FEN, countMoves, mainLine } from './studyTree';
import type { Study } from '../types/study';

const sans = (nodes: Array<{ san: string }>) => nodes.map((n) => n.san);

describe('parseStudyPgn', () => {
  it('reads a main line with comments and glyphs', () => {
    const { chapters, warnings } = parseStudyPgn('1. e4 {Le centre.} e5 2. Nf3!? $14 Nc6 { Défendu. } 3. Bb5 *');
    expect(warnings).toEqual([]);
    expect(chapters).toHaveLength(1);
    const line = mainLine(chapters[0].root);
    expect(sans(line)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(line[0].comment).toBe('Le centre.');
    expect(line[2].nags).toEqual([5, 14]);
    expect(line[3].comment).toBe('Défendu.');
    expect(line[4].fen.split(' ')[0]).toBe('r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R');
  });

  it('keeps the variations, nested ones included, as other children of the move they replace', () => {
    const { chapters } = parseStudyPgn('1. e4 e5 (1... c5 2. Nf3 (2. c3 d5) 2... d6) 2. Nf3 Nc6 *');
    const root = chapters[0].root;
    const e4 = root.children[0];
    expect(sans(e4.children)).toEqual(['e5', 'c5']);
    const c5 = e4.children[1];
    expect(sans(c5.children)).toEqual(['Nf3', 'c3']);
    expect(sans(c5.children[0].children)).toEqual(['d6']);
    expect(sans(c5.children[1].children)).toEqual(['d5']);
    expect(sans(e4.children[0].children)).toEqual(['Nf3']);
    expect(countMoves(root)).toBe(9);
  });

  it('reads the move numbers glued to the moves, the zero castling and the ; comments', () => {
    const { chapters } = parseStudyPgn('1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.0-0 ; roque\nNf6 *');
    const line = mainLine(chapters[0].root);
    expect(sans(line)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6']);
    expect(line[6].comment).toBe('roque');
  });

  it('takes the comment before the first move as the introduction of the chapter', () => {
    const { chapters } = parseStudyPgn('{ Les Blancs prennent le centre. } 1. e4 *');
    expect(chapters[0].root.comment).toBe('Les Blancs prennent le centre.');
  });

  it('reads the Lichess drawing commands and drops the clock', () => {
    const { chapters } = parseStudyPgn('1. e4 { [%cal Ge2e4,Rb1c3] [%csl Ge4] [%clk 0:03:00] Bon. } *');
    const e4 = chapters[0].root.children[0];
    expect(e4.comment).toBe('Bon.');
    expect(e4.shapes).toEqual([
      { brush: 'G', from: 'e2', to: 'e4' },
      { brush: 'R', from: 'b1', to: 'c3' },
      { brush: 'G', from: 'e4', to: 'e4' },
    ]);
  });

  it('splits a study into chapters and reads the Lichess headers', () => {
    const { name, chapters } = parseStudyPgn(`[Event "Mon répertoire: Italienne"]
[StudyName "Mon répertoire"]
[ChapterName "Italienne"]
[Orientation "black"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 *

[Event "Mon répertoire: Espagnole"]
[StudyName "Mon répertoire"]
[ChapterName "Espagnole"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 *
`);
    expect(name).toBe('Mon répertoire');
    expect(chapters.map((c) => c.name)).toEqual(['Italienne', 'Espagnole']);
    expect(chapters.map((c) => c.orientation)).toEqual(['b', 'w']);
    expect(sans(mainLine(chapters[1].root)).at(-1)).toBe('Bb5');
  });

  it('splits games that follow each other with a result and no blank line between the headers and moves', () => {
    const { chapters } = parseStudyPgn(
      '[White "A"]\n[Black "B"]\n1. d4 d5 1-0\n[White "C"]\n[Black "D"]\n1. c4 e5 0-1'
    );
    expect(chapters.map((c) => c.name)).toEqual(['A – B', 'C – D']);
  });

  it('starts from the FEN of the header', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const { chapters } = parseStudyPgn(`[FEN "${fen}"]\n[SetUp "1"]\n\n1. e4 Kd7 *`);
    expect(chapters[0].root.fen).toBe(fen);
    expect(sans(mainLine(chapters[0].root))).toEqual(['e4', 'Kd7']);
  });

  it('skips a chapter with an invalid position, or another variant, and says so', () => {
    const { chapters, warnings } = parseStudyPgn(
      '[ChapterName "A"]\n[FEN "nope"]\n\n1. e4 *\n\n[ChapterName "B"]\n[Variant "Atomic"]\n\n1. e4 *\n\n[ChapterName "C"]\n\n1. d4 *'
    );
    expect(chapters.map((c) => c.name)).toEqual(['C']);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('« A »');
    expect(warnings[1]).toContain('Atomic');
  });

  it('stops a line at an illegal move, keeps what came before, and goes on after a bad variation', () => {
    const { chapters, warnings } = parseStudyPgn('[ChapterName "X"]\n\n1. e4 e5 (1... e4 2. d4) 2. Nf3 Nc6 *');
    expect(sans(mainLine(chapters[0].root))).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(warnings).toEqual(['Chapitre « X » : coup illégal « 1...e4 », la suite de cette ligne est ignorée.']);

    const main = parseStudyPgn('[ChapterName "Y"]\n\n1. e4 e5 2. Ke4 Nc6 *');
    expect(sans(mainLine(main.chapters[0].root))).toEqual(['e4', 'e5']);
    expect(main.warnings[0]).toContain('2.Ke4');
  });

  it('merges a variation that repeats the move of the main line', () => {
    const { chapters } = parseStudyPgn('1. e4 e5 (1... e5 2. Nf3) 2. Nc3 *');
    const e5 = chapters[0].root.children[0].children[0];
    expect(sans(e5.children)).toEqual(['Nf3', 'Nc3']);
  });

  it('returns nothing for a text without a game', () => {
    expect(parseStudyPgn('').chapters).toEqual([]);
    expect(parseStudyPgn('pas du PGN').chapters).toEqual([]);
  });
});

describe('readComment', () => {
  it('returns the plain text and the shapes', () => {
    expect(readComment(' [%csl Gd4]  Un  trou ').text).toBe('Un trou');
  });
});

describe('chapterToPgn / studyToPgn', () => {
  const source = `[ChapterName "Sicilienne"]
[Orientation "black"]

{ Intro. } 1. e4 c5 (1... e5 { Ouvert. } 2. Nf3 $1) 2. Nf3 { [%cal Gg1f3] Développe. } d6 (2... Nc6 3. Bb5) 3. d4 *`;

  it('writes a PGN that reads back to the same tree', () => {
    const { chapters } = parseStudyPgn(source);
    const study: Study = {
      id: 's',
      name: 'Études « test »',
      description: '',
      chapters,
      createdAt: 0,
      updatedAt: 0,
      schemaVersion: 1,
    };
    const pgn = studyToPgn(study);
    expect(pgn).toContain('[StudyName "Études « test »"]');
    expect(pgn).toContain('[Orientation "black"]');
    const again = parseStudyPgn(pgn);
    expect(again.warnings).toEqual([]);
    expect(again.name).toBe('Études « test »');
    const strip = (node: ReturnType<typeof parseStudyPgn>['chapters'][number]['root']): unknown => ({
      san: node.san,
      fen: node.fen,
      comment: node.comment,
      nags: node.nags,
      shapes: node.shapes,
      children: node.children.map(strip),
    });
    expect(strip(again.chapters[0].root)).toEqual(strip(chapters[0].root));
    expect(again.chapters[0].orientation).toBe('b');
  });

  it('numbers the black moves that open a variation or follow a comment', () => {
    const { chapters } = parseStudyPgn('1. e4 { Roi. } e5 (1... c5) 2. Nf3 *');
    const pgn = chapterToPgn({ name: 'N' }, chapters[0]);
    expect(pgn).toContain('1.e4 { Roi. } 1...e5 ( 1...c5 ) 2.Nf3 *');
  });

  it('writes the position of a chapter that does not start from the initial one', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const { chapters } = parseStudyPgn(`[FEN "${fen}"]\n\n1. e4 *`);
    const pgn = chapterToPgn({ name: 'N' }, chapters[0]);
    expect(pgn).toContain(`[FEN "${fen}"]`);
    expect(pgn).toContain('[SetUp "1"]');
    expect(parseStudyPgn(pgn).chapters[0].root.fen).toBe(fen);
    expect(START_FEN).not.toBe(fen);
  });
});
