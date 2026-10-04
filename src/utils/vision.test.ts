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
  BLIND_GAME_SCORES,
  MAX_HISTORY,
  applyRun,
  blindGameResult,
  blindGameResultOf,
  coordinatesKind,
  ownVisionGames,
  parseTypedMove,
  recentAverage,
  roundsOf,
  sameRecord,
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
      record: { key, best: 18, bestAt: 1000, runs: 1, history: [{ at: 1000, score: 18 }] },
    });
    const worse = applyRun(first.record, key, 12, 2000);
    expect(worse.isRecord).toBe(false);
    expect(worse.record).toEqual({
      key,
      best: 18,
      bestAt: 1000,
      runs: 2,
      history: [
        { at: 1000, score: 18 },
        { at: 2000, score: 12 },
      ],
    });
    const tie = applyRun(worse.record, key, 18, 3000);
    expect(tie.isRecord).toBe(false);
    expect(tie.record.bestAt).toBe(1000);
    const better = applyRun(tie.record, key, 19, 4000);
    expect(better).toMatchObject({ previousBest: 18, isRecord: true, record: { best: 19, bestAt: 4000, runs: 4 } });
  });

  it('keeps the latest rounds only, oldest first', () => {
    let record: VisionRecord | undefined;
    for (let i = 0; i < MAX_HISTORY + 5; i++) record = applyRun(record, key, i % 7, 1000 + i).record;
    expect(record!.runs).toBe(MAX_HISTORY + 5);
    expect(record!.history).toHaveLength(MAX_HISTORY);
    expect(record!.history![0].at).toBe(1005);
    expect(record!.history![MAX_HISTORY - 1].at).toBe(1000 + MAX_HISTORY + 4);
  });

  it('starts the history of a record made before it existed', () => {
    const old: VisionRecord = { key, best: 9, bestAt: 5, runs: 4 };
    expect(applyRun(old, key, 3, 99).record).toEqual({
      key,
      best: 9,
      bestAt: 5,
      runs: 5,
      history: [{ at: 99, score: 3 }],
    });
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

  it('merges the rounds of two copies, the same round once, oldest first', () => {
    const a: VisionRecord = {
      key,
      best: 10,
      bestAt: 2,
      runs: 2,
      history: [
        { at: 1, score: 4 },
        { at: 2, score: 10 },
      ],
    };
    const b: VisionRecord = {
      key,
      best: 10,
      bestAt: 2,
      runs: 3,
      history: [
        { at: 2, score: 10 },
        { at: 3, score: 6 },
      ],
    };
    const merged = mergeRecords(a, b);
    expect(merged.history).toEqual([
      { at: 1, score: 4 },
      { at: 2, score: 10 },
      { at: 3, score: 6 },
    ]);
    expect(merged.runs).toBe(3);
    // A copy without rounds (an old backup) does not wipe the ones kept here
    expect(mergeRecords(a, { key, best: 3, bestAt: 1, runs: 1 }).history).toEqual(a.history);
    expect(mergeRecords({ ...a, history: undefined }, { ...b, history: undefined })).not.toHaveProperty('history');
  });

  it('tells two copies of a record apart by their rounds too', () => {
    const a: VisionRecord = { key, best: 5, bestAt: 1, runs: 1, history: [{ at: 1, score: 5 }] };
    expect(sameRecord(a, { ...a, history: [{ at: 1, score: 5 }] })).toBe(true);
    expect(sameRecord(a, { ...a, history: [{ at: 1, score: 4 }] })).toBe(false);
    expect(sameRecord(a, { ...a, history: undefined })).toBe(false);
    expect(sameRecord({ ...a, history: undefined }, { ...a, history: [] })).toBe(true);
  });

  it('recognises a record, and nothing else', () => {
    expect(isVisionRecord({ key: 'blind:long', best: 5, bestAt: 1, runs: 2 })).toBe(true);
    expect(isVisionRecord({ key: 'lines:short', best: 0, bestAt: 0, runs: 1 })).toBe(true);
    expect(isVisionRecord({ key: 'game:club', best: 2, bestAt: 1, runs: 1, history: [{ at: 1, score: 2 }] })).toBe(
      true
    );
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
      { key: 'blind:long', best: 5, bestAt: 1, runs: 1, history: 'x' },
      { key: 'blind:long', best: 5, bestAt: 1, runs: 1, history: [{ at: 1, score: -1 }] },
      { key: 'blind:long', best: 5, bestAt: 1, runs: 1, history: [{ at: 'now', score: 1 }] },
      { key: 'blind:long', best: 5, bestAt: 1, runs: 1, history: Array(MAX_HISTORY + 1).fill({ at: 1, score: 1 }) },
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

describe('the coordinates levels', () => {
  it('ask three ways', () => {
    expect(['white', 'black', 'name', 'color'].map(coordinatesKind)).toEqual(['find', 'find', 'name', 'color']);
    expect(VISION_LEVELS.coordinates.map((level) => level.id)).toEqual(['white', 'black', 'name', 'color']);
  });
});

describe('own games', () => {
  const game = (id: string, moves: string[]) => ({ id, moves, white: 'Moi', black: 'Toi', date: '2026.10.01' });
  const long = VISION_GAMES[0].moves;

  it('become exercise material, with a title that says whose they are', () => {
    const [made] = ownVisionGames([game('g1', long)], 6, seeded(1));
    expect(made).toEqual({
      id: 'own:g1',
      name: 'Moi – Toi, 2026-10-01 (une de vos parties)',
      moves: long,
    });
    // ... and work with the rounds like any other game
    expect(makeBlindRound([made], 6, seeded(1))!.questions).toHaveLength(QUESTIONS_PER_ROUND);
    expect(makeLineRound([made], 4, seeded(1)).length).toBeGreaterThan(0);
  });

  it('leave out games that are too short, or that cannot be replayed from the initial position', () => {
    const games = [
      game('short', ['e4', 'e5']),
      game('broken', ['e4', 'e5', 'Nf3', 'Nf3', 'd4', 'd5', 'c4', 'c5']),
      game('ok', long),
    ];
    expect(ownVisionGames(games, 6, seeded(2)).map((g) => g.id)).toEqual(['own:ok']);
    expect(ownVisionGames([], 6, seeded(2))).toEqual([]);
    expect(ownVisionGames([game('ok', long)], long.length + 1, seeded(2))).toEqual([]);
  });

  it('are a handful at most, drawn at random', () => {
    const many = Array.from({ length: 80 }, (_, i) => game(`g${i}`, long));
    const picked = ownVisionGames(many, 6, seeded(3));
    expect(picked).toHaveLength(30);
    expect(new Set(picked.map((g) => g.id)).size).toBe(30);
  });

  it('are titled without a date when the PGN has none, or a strange one', () => {
    expect(ownVisionGames([{ id: 'a', moves: long }], 6, seeded(1))[0].name).toBe('? – ? (une de vos parties)');
    expect(
      ownVisionGames([{ id: 'a', moves: long, date: '????.??.??', white: 'A', black: 'B' }], 6, seeded(1))[0].name
    ).toBe('A – B (une de vos parties)');
  });
});

describe('typed moves', () => {
  const move = (fen: string, text: string) => parseTypedMove(fen, text)?.uci ?? null;

  it('are read in English, in French and as coordinates', () => {
    for (const text of ['Nf3', 'Cf3', 'g1f3', 'g1-f3', ' nf3 '.trim().replace('n', 'N'), 'G1F3']) {
      expect(move(START, text), text).toBe('g1f3');
    }
    expect(move(START, 'e4')).toBe('e2e4');
    expect(parseTypedMove(START, 'Cf3')!.san).toBe('Nf3');
  });

  it('read a king and a rook the way the position allows', () => {
    expect(move('4k3/8/8/8/8/8/8/4K2R w - - 0 1', 'Rd1')).toBe('e1d1'); // the rook is blocked: the French king
    expect(move('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Rd1')).toBe('a1d1'); // a rook can go there: the English rook
  });

  it('read captures, check signs, promotion and castling', () => {
    expect(move('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'exd5')).toBe('e4d5');
    expect(move('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'ed5')).toBe('e4d5');
    expect(move('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a8=D+')).toBe('a7a8q');
    expect(move('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7a8n')).toBe('a7a8n');
    const castle = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
    expect(move(castle, 'O-O')).toBe('e1g1');
    expect(move(castle, '0-0-0')).toBe('e1c1');
  });

  it('refuse what is not a legal move here, or not a move', () => {
    for (const text of ['', '   ', 'e5', 'Nf6', 'Ke2', 'hello', 'a9', 'e2e5', 'O-O']) {
      expect(parseTypedMove(START, text), text).toBeNull();
    }
  });
});

describe('the game played blindfold', () => {
  it('scores a win 2, a draw 1, a loss 0, from the player side', () => {
    expect(blindGameResult({ kind: 'checkmate', winner: 'w' }, 'w')).toBe('win');
    expect(blindGameResult({ kind: 'checkmate', winner: 'w' }, 'b')).toBe('loss');
    expect(blindGameResult({ kind: 'resigned', winner: 'b' }, 'w')).toBe('loss');
    expect(blindGameResult({ kind: 'draw', reason: 'stalemate' }, 'b')).toBe('draw');
    expect(Object.values(BLIND_GAME_SCORES)).toEqual([2, 1, 0]);
    expect([2, 1, 0].map(blindGameResultOf)).toEqual(['win', 'draw', 'loss']);
  });

  it('has a level for each strength of the engine, with a valid record key', () => {
    expect(VISION_LEVELS.game.map((level) => level.id)).toEqual([
      'debutant',
      'facile',
      'club',
      'confirme',
      'expert',
      'maitre',
      'maximum',
    ]);
    for (const level of VISION_LEVELS.game) {
      expect(isVisionRecord({ key: recordKey('game', level.id), best: 1, bestAt: 1, runs: 1 })).toBe(true);
    }
  });
});

describe('progress', () => {
  const key = 'coordinates:white';
  const rounds = (...scores: number[]) => scores.map((score, i) => ({ at: i, score }));

  it('reads the rounds of a level, none when there are not any', () => {
    const records = new Map([[key, { key, best: 3, bestAt: 1, runs: 1, history: rounds(3) }]]);
    expect(roundsOf(records, key)).toEqual(rounds(3));
    expect(roundsOf(records, 'blind:long')).toEqual([]);
    expect(roundsOf(null, key)).toEqual([]);
    expect(roundsOf(new Map([[key, { key, best: 3, bestAt: 1, runs: 1 }]]), key)).toEqual([]);
  });

  it('averages the latest rounds, once there are enough of them', () => {
    expect(recentAverage(rounds(1, 2, 3, 4), 5)).toBeNull();
    expect(recentAverage(rounds(9, 1, 2, 3, 4, 5), 5)).toBe(3);
  });
});
