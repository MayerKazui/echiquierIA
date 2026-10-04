import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { VISION_GAMES, type VisionGame } from '../data/visionGames';
import { seeded } from '../test/seeded';
import {
  EMPTY,
  PIECE_CODES,
  QUESTIONS_PER_ROUND,
  SQUARES,
  VISION_LEVELS,
  applyRun,
  contentDefinite,
  contentLabel,
  contentWithArticle,
  contentsOf,
  isLightSquare,
  isVisionRecord,
  makeBlindRound,
  makeLineQuestion,
  makeLineRound,
  mergeRecords,
  nextTarget,
  recordKey,
  replay,
  shuffled,
  type VisionRecord,
} from './vision';

const START = new Chess().fen();

describe('the games', () => {
  it.each(VISION_GAMES.map((game) => [game.id, game] as const))('%s is a legal game', (_id, game) => {
    const chess = new Chess();
    for (const san of game.moves) expect(() => chess.move(san), `${san} in ${game.id}`).not.toThrow();
    expect(game.name.length).toBeGreaterThan(5);
  });

  it('are long enough for every level of both exercises', () => {
    for (const mode of ['blind', 'lines'] as const) {
      for (const level of VISION_LEVELS[mode]) {
        const long = VISION_GAMES.filter((game) => game.moves.length >= level.plies!);
        expect(long.length, `${mode}:${level.id}`).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('have distinct ids', () => {
    expect(new Set(VISION_GAMES.map((game) => game.id)).size).toBe(VISION_GAMES.length);
  });
});

describe('records', () => {
  const key = recordKey('coordinates', 'white');

  it('makes the first record, then only beats it with a better score', () => {
    const first = applyRun(undefined, key, 18, 1000);
    expect(first).toEqual({
      previousBest: null,
      isRecord: true,
      record: { key, best: 18, bestAt: 1000, runs: 1 },
    });
    const worse = applyRun(first.record, key, 12, 2000);
    expect(worse.isRecord).toBe(false);
    expect(worse.record).toEqual({ key, best: 18, bestAt: 1000, runs: 2 });
    const tie = applyRun(worse.record, key, 18, 3000);
    expect(tie.isRecord).toBe(false);
    expect(tie.record.bestAt).toBe(1000);
    const better = applyRun(tie.record, key, 19, 4000);
    expect(better).toMatchObject({ previousBest: 18, isRecord: true, record: { best: 19, bestAt: 4000, runs: 4 } });
  });

  it('never calls a score of 0 a record', () => {
    expect(applyRun(undefined, key, 0, 1000)).toMatchObject({ isRecord: false, record: { best: 0, runs: 1 } });
  });

  it('merges two copies by the larger best score and the larger number of rounds', () => {
    const a: VisionRecord = { key, best: 10, bestAt: 500, runs: 7 };
    const b: VisionRecord = { key, best: 14, bestAt: 900, runs: 3 };
    expect(mergeRecords(a, b)).toEqual({ key, best: 14, bestAt: 900, runs: 7 });
    expect(mergeRecords(b, a)).toEqual({ key, best: 14, bestAt: 900, runs: 7 });
    expect(mergeRecords(a, { ...a, bestAt: 300 })).toEqual({ key, best: 10, bestAt: 300, runs: 7 });
  });

  it('recognises a record, and nothing else', () => {
    expect(isVisionRecord({ key: 'blind:long', best: 5, bestAt: 1, runs: 2 })).toBe(true);
    expect(isVisionRecord({ key: 'lines:short', best: 0, bestAt: 0, runs: 1 })).toBe(true);
    for (const bad of [
      null,
      'x',
      { key: 'puzzles:short', best: 5, bestAt: 1, runs: 2 },
      { key: 'blind:Long', best: 5, bestAt: 1, runs: 2 },
      { key: 'blind:long', best: -1, bestAt: 1, runs: 2 },
      { key: 'blind:long', best: 1.5, bestAt: 1, runs: 2 },
      { key: 'blind:long', best: 5001, bestAt: 1, runs: 2 },
      { key: 'blind:long', best: 5, bestAt: Infinity, runs: 2 },
      { key: 'blind:long', best: 5, bestAt: 1, runs: 0 },
      { key: 'blind:long', best: 5, bestAt: 1 },
    ]) {
      expect(isVisionRecord(bad)).toBe(false);
    }
  });

  it('has a record key for every level', () => {
    for (const [mode, levels] of Object.entries(VISION_LEVELS)) {
      for (const level of levels) {
        expect(isVisionRecord({ key: recordKey(mode as 'blind', level.id), best: 1, bestAt: 1, runs: 1 })).toBe(true);
      }
    }
  });
});

describe('squares', () => {
  it('has 64 distinct squares, a1 dark and h1 light', () => {
    expect(new Set(SQUARES).size).toBe(64);
    expect(isLightSquare('a1')).toBe(false);
    expect(isLightSquare('h1')).toBe(true);
    expect(isLightSquare('e4')).toBe(true);
    expect(isLightSquare('d4')).toBe(false);
  });

  it('never asks the same square twice in a row, and reaches all of them', () => {
    const random = seeded(7);
    const seen = new Set<string>();
    let previous: string | null = null;
    for (let i = 0; i < 3000; i++) {
      const next = nextTarget(previous, random);
      expect(next).not.toBe(previous);
      seen.add(next);
      previous = next;
    }
    expect(seen.size).toBe(64);
  });

  it('shuffles without losing or inventing anything', () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect([...shuffled(items, seeded(3))].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('contents', () => {
  it('reads every square of a position', () => {
    const contents = contentsOf(START);
    expect(Object.keys(contents)).toHaveLength(64);
    expect(contents.e1).toBe('wk');
    expect(contents.d8).toBe('bq');
    expect(contents.e4).toBe(EMPTY);
    expect(PIECE_CODES).toHaveLength(12);
    expect(contentLabel('wn')).toBe('cavalier blanc');
    expect(contentLabel('bq')).toBe('dame noire');
    expect(contentLabel(EMPTY)).toBe('vide');
  });

  it('puts the right article before a piece', () => {
    expect(contentWithArticle('wn')).toBe('un cavalier blanc');
    expect(contentWithArticle('bq')).toBe('une dame noire');
    expect(contentWithArticle('wr')).toBe('une tour blanche');
    expect(contentWithArticle(EMPTY)).toBe('rien');
    expect(contentDefinite('bn')).toBe('le cavalier noir');
    expect(contentDefinite('wq')).toBe('la dame blanche');
  });
});

describe('replay', () => {
  const at = (r: NonNullable<ReturnType<typeof replay>>, origin: string) => r.pieces.find((p) => p.origin === origin)!;

  it('follows a piece through moves and a capture', () => {
    const r = replay(START, ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5'])!;
    expect(at(r, 'e2')).toMatchObject({ square: null, moves: 2 }); // the e pawn took, then was taken
    expect(at(r, 'd7')).toMatchObject({ square: null, moves: 1 }); // taken on d5
    expect(at(r, 'd8')).toMatchObject({ square: 'a5', moves: 2 });
    expect(at(r, 'b1')).toMatchObject({ square: 'c3', moves: 1 });
    expect(at(r, 'a1')).toMatchObject({ square: 'a1', moves: 0 });
    expect(r.labels).toEqual(['1.e4', '1…d5', '2.exd5', '2…Dxd5', '3.Cc3', '3…Da5']);
  });

  it('moves the rook when the king castles, on both sides', () => {
    const short = replay('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['O-O', 'O-O-O'])!;
    expect(at(short, 'e1')).toMatchObject({ square: 'g1', moves: 1 });
    expect(at(short, 'h1')).toMatchObject({ square: 'f1', moves: 1 });
    expect(at(short, 'a1')).toMatchObject({ square: 'a1', moves: 0 });
    expect(at(short, 'e8')).toMatchObject({ square: 'c8', moves: 1 });
    expect(at(short, 'a8')).toMatchObject({ square: 'd8', moves: 1 });
  });

  it('takes the pawn on its own square after en passant', () => {
    const r = replay(START, ['e4', 'a6', 'e5', 'd5', 'exd6'])!;
    expect(at(r, 'd7')).toMatchObject({ square: null, moves: 1 });
    expect(at(r, 'e2')).toMatchObject({ square: 'd6', moves: 3 });
    expect(contentsOf(r.end).d5).toBe(EMPTY);
  });

  it('follows a pawn that promotes', () => {
    const r = replay('8/P6k/8/8/8/8/8/K7 w - - 0 1', ['a8=Q'])!;
    expect(at(r, 'a7')).toMatchObject({ square: 'a8', moves: 1 });
    expect(contentsOf(r.end).a8).toBe('wq');
  });

  it('ends in the position chess.js reaches', () => {
    for (const game of VISION_GAMES) {
      const chess = new Chess();
      for (const san of game.moves) chess.move(san);
      expect(replay(START, game.moves)!.end).toBe(chess.fen());
    }
  });

  it('puts every piece that is still there on the square the position shows', () => {
    for (const game of VISION_GAMES) {
      const r = replay(START, game.moves)!;
      const contents = contentsOf(r.end);
      for (const piece of r.pieces) {
        if (piece.square === null) continue;
        const found = contents[piece.square];
        expect(found[0], `${game.id} ${piece.origin}`).toBe(piece.color);
        // A promoted pawn is no longer a pawn: only the colour is certain
        if (piece.type !== 'p') expect(found[1]).toBe(piece.type);
      }
      const alive = r.pieces.filter((piece) => piece.square !== null).length;
      expect(alive).toBe(Object.values(contents).filter((c) => c !== EMPTY).length);
    }
  });

  it('refuses an illegal move or a bad position', () => {
    expect(replay(START, ['e4', 'e4'])).toBeNull();
    expect(replay('not a fen', ['e4'])).toBeNull();
  });
});

describe('blind rounds', () => {
  it('announce the moves of a real game and ask about squares whose answer is the real position', () => {
    for (const level of VISION_LEVELS.blind) {
      for (let seed = 1; seed <= 40; seed++) {
        const round = makeBlindRound(VISION_GAMES, level.plies!, seeded(seed))!;
        expect(round.labels).toHaveLength(level.plies!);
        expect(round.labels[0]).toMatch(/^1\./);
        const chess = new Chess();
        for (const san of round.game.moves.slice(0, level.plies!)) chess.move(san);
        expect(round.fen).toBe(chess.fen());
        const contents = contentsOf(round.fen);
        expect(round.questions).toHaveLength(QUESTIONS_PER_ROUND);
        expect(new Set(round.questions.map((q) => q.square)).size).toBe(QUESTIONS_PER_ROUND);
        for (const q of round.questions) expect(q.answer).toBe(contents[q.square]);
      }
    }
  });

  it('ask about the squares the moves changed, and about empty ones too', () => {
    let empty = 0;
    let occupied = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const round = makeBlindRound(VISION_GAMES, 12, seeded(seed))!;
      const before = contentsOf(START);
      const after = contentsOf(round.fen);
      expect(round.questions.some((q) => before[q.square] !== after[q.square])).toBe(true);
      for (const q of round.questions) {
        if (q.answer === EMPTY) empty++;
        else occupied++;
      }
    }
    expect(empty).toBeGreaterThan(30);
    expect(occupied).toBeGreaterThan(100);
  });

  it('only use games that are long enough, and say so when none is', () => {
    const short: VisionGame[] = [{ id: 'x', name: 'Une partie très courte', moves: ['e4', 'e5'] }];
    expect(makeBlindRound(short, 6, seeded(1))).toBeNull();
    expect(makeBlindRound(short, 2, seeded(1))).not.toBeNull();
    for (let seed = 1; seed <= 30; seed++) {
      expect(makeBlindRound(VISION_GAMES, 40, seeded(seed))!.game.moves.length).toBeGreaterThanOrEqual(40);
    }
  });
});

describe('line questions', () => {
  it('give the answer the rules give, for every level', () => {
    const kinds = new Set<string>();
    for (const level of VISION_LEVELS.lines) {
      for (let seed = 1; seed <= 60; seed++) {
        const q = makeLineQuestion(VISION_GAMES, level.plies!, seeded(seed))!;
        expect(q).not.toBeNull();
        kinds.add(q.kind);
        expect(q.plies).toBe(level.plies);
        // The line starts from a position of the game and ends where chess.js says
        const chess = new Chess();
        for (const san of q.game.moves.slice(0, q.from)) chess.move(san);
        expect(chess.fen()).toBe(q.startFen);
        const start = contentsOf(q.startFen);
        for (const san of q.game.moves.slice(q.from, q.from + level.plies!)) chess.move(san);
        expect(q.endFen).toBe(chess.fen());
        const end = contentsOf(q.endFen);
        expect(q.line.length).toBeGreaterThan(0);
        if (q.kind === 'what') {
          expect(q.answer).toBe(end[q.square]);
          expect(start[q.square]).not.toBe(end[q.square]); // the line changed this square
        } else {
          expect(start[q.piece.origin]).toBe(`${q.piece.color}${q.piece.type}`);
          if (q.answer !== null) {
            expect(end[q.answer][0]).toBe(q.piece.color);
          } else {
            // Taken: one piece of that kind less than there was (no promotion in these stretches)
            const count = (c: Record<string, string>) =>
              Object.values(c).filter((v) => v === `${q.piece.color}${q.piece.type}`).length;
            expect(count(end)).toBeLessThan(count(start));
          }
        }
      }
    }
    expect(kinds).toEqual(new Set(['where', 'what']));
  });

  it('only ask about a piece that the line moved or took', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const q = makeLineQuestion(VISION_GAMES, 4, seeded(seed))!;
      if (q.kind !== 'where') continue;
      const moved = q.answer === null || q.answer !== q.piece.origin;
      const returned = q.answer === q.piece.origin; // went away and came back: allowed
      expect(moved || returned).toBe(true);
    }
  });

  it('write the line in French with the number of its first move', () => {
    const game: VisionGame = {
      id: 'x',
      name: 'Partie de test',
      moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'],
    };
    // A line starts at least 4 half-moves in, and no later than the game allows
    expect(makeLineQuestion([game], 2, () => 0)).toMatchObject({ from: 4, line: '3. Fb5 a6' });
    expect(makeLineQuestion([game], 2, () => 0.999)).toMatchObject({ from: 8, line: '5. O-O Fe7' });
    expect(makeLineQuestion([game], 3, () => 0.999)).toMatchObject({ from: 7, line: '4... Cf6 5. O-O Fe7' });
  });

  it('say so when no game is long enough', () => {
    expect(makeLineQuestion([{ id: 'x', name: 'Une partie très courte', moves: ['e4'] }], 4, seeded(1))).toBeNull();
  });
});

describe('line rounds', () => {
  it('hold five different stretches of games, whatever the dice say', () => {
    for (const level of VISION_LEVELS.lines) {
      for (let seed = 1; seed <= 20; seed++) {
        const round = makeLineRound(VISION_GAMES, level.plies!, seeded(seed));
        expect(round).toHaveLength(QUESTIONS_PER_ROUND);
        expect(new Set(round.map((q) => `${q.game.id}:${q.from}`)).size).toBe(QUESTIONS_PER_ROUND);
      }
    }
  });

  it('are shorter, not endless, when the dice always give the same stretch', () => {
    expect(makeLineRound(VISION_GAMES, 2, () => 0)).toHaveLength(1);
  });

  it('are empty when no game is long enough', () => {
    expect(makeLineRound([{ id: 'x', name: 'Une partie très courte', moves: ['e4'] }], 4, seeded(1))).toEqual([]);
  });
});
