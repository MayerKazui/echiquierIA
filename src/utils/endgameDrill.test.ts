import { describe, expect, it, vi } from 'vitest';
import { ENDGAMES, type Endgame } from '../data/endgames';
import type { EngineEvaluation } from '../services/stockfishEngine';
import { Chess } from 'chess.js';
import {
  ENDGAME_ID_PREFIX,
  HOLD_MOVES,
  MATE_SLACK,
  MAX_MOVES,
  SEARCH_DEPTH,
  WON_CP,
  endgameCardId,
  endgameFamilyOf,
  endgameItems,
  isEndSuccess,
  isGoodMove,
  playMove,
  startRun,
  winPercentFor,
} from './endgameDrill';

const ev = (cp: number, bestMoveUci = '', mate: number | null = null): EngineEvaluation => ({
  cp,
  mate,
  bestMoveUci,
  bestMoveSan: '',
  pv: [],
});

/** An engine that answers with what the test tells it for a position (a level score, no move, otherwise). */
const engine = (table: Record<string, EngineEvaluation> = {}) =>
  vi.fn(async (fen: string) => table[fen.split(' ').slice(0, 4).join(' ')] ?? ev(0));

const at = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

const endgame = (goal: Endgame['goal'], fen: string): Endgame => ({
  id: 'test',
  category: 'pawns',
  title: 'Test',
  goal,
  fen,
  idea: '',
});

/** After `uci` from `fen`: the position (the opponent to move). */
function after(fen: string, uci: string): string {
  const chess = new Chess(fen);
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return chess.fen();
}

// White: Ke1, Qd1 ; Black: Ke5. White to move.
const KQK = '8/8/8/4k3/8/8/8/3QK3 w - - 0 1';

describe('the library of endgames', () => {
  it('has legal positions with the player to move, and unique ids', () => {
    expect(new Set(ENDGAMES.map((e) => e.id)).size).toBe(ENDGAMES.length);
    for (const e of ENDGAMES) {
      const chess = new Chess(e.fen);
      expect(chess.isGameOver(), e.id).toBe(false);
      expect(chess.moves().length, e.id).toBeGreaterThan(0);
      expect(e.title.length, e.id).toBeGreaterThan(0);
      expect(e.idea.length, e.id).toBeGreaterThan(20);
    }
  });

  it('gives the session items stable card ids, in the order of the library', () => {
    const items = endgameItems();
    expect(items.map((i) => i.id)).toEqual(ENDGAMES.map((e) => `${ENDGAME_ID_PREFIX}${e.id}`));
    expect(endgameCardId(ENDGAMES[0])).toBe(items[0].id);
    expect(items[0].date).toBeGreaterThan(items[1].date);
  });
});

describe('winPercentFor', () => {
  it('is the Win % of the side asked for', () => {
    expect(winPercentFor(ev(0), 'w')).toBeCloseTo(50);
    expect(winPercentFor(ev(600), 'w')).toBeGreaterThan(75);
    expect(winPercentFor(ev(600), 'b')).toBeLessThan(25);
    // A won position is a won position: a mate, or more than WON_CP, count the same
    expect(winPercentFor(ev(0, '', 4), 'w')).toBeCloseTo(winPercentFor(ev(WON_CP), 'w'));
    expect(winPercentFor(ev(5000), 'w')).toBeCloseTo(winPercentFor(ev(WON_CP), 'w'));
    expect(winPercentFor(ev(0, '', -3), 'b')).toBeCloseTo(winPercentFor(ev(WON_CP), 'w'));
    expect(winPercentFor(ev(0, '', -3), 'w')).toBeLessThan(25);
  });
});

describe('startRun', () => {
  it('evaluates the first position, the player being the side to move', async () => {
    const evaluate = engine({ [at(KQK)]: ev(900, 'd1d5') });
    const run = await startRun(endgame('win', KQK), evaluate);
    expect(evaluate).toHaveBeenCalledWith(KQK, SEARCH_DEPTH, undefined);
    expect(run).toMatchObject({ color: 'w', fen: KQK, moves: 0, history: [] });
    expect(run.evaluation.bestMoveUci).toBe('d1d5');
  });

  it('is on the black side when Black is to move', async () => {
    const fen = 'k7/8/K7/P7/8/8/8/8 b - - 0 1';
    expect((await startRun(endgame('draw', fen), engine())).color).toBe('b');
  });
});

describe('playMove', () => {
  const best = 'd1d4';
  const start = async (table: Record<string, EngineEvaluation> = {}) => {
    const evaluate = engine({ [at(KQK)]: ev(900, best), ...table });
    return { evaluate, run: await startRun(endgame('win', KQK), evaluate) };
  };

  it('ignores an illegal move', async () => {
    const { evaluate, run } = await start();
    expect(await playMove(run, 'd1h8', evaluate)).toBeNull();
    expect(await playMove(run, 'e1e1', evaluate)).toBeNull();
  });

  it("calls the engine's move best, plays its answer, and evaluates the new position", async () => {
    const afterBest = after(KQK, best);
    const reply = 'e5f5';
    const afterReply = after(afterBest, reply);
    const { evaluate, run } = await start({
      [at(afterBest)]: ev(900, reply),
      [at(afterReply)]: ev(900, 'd4d6'),
    });
    const step = (await playMove(run, best, evaluate))!;
    expect(step.verdict).toEqual({ kind: 'best' });
    expect(step.move).toMatchObject({ san: 'Qd4+', uci: best });
    expect(step.reply).toMatchObject({ uci: reply });
    expect(step.end).toBeNull();
    expect(step.run).toMatchObject({ fen: afterReply, moves: 1 });
    expect(step.run.evaluation.bestMoveUci).toBe('d4d6');
    expect(step.run.history).toHaveLength(1);
    // The run it was given is not touched
    expect(run).toMatchObject({ fen: KQK, moves: 0, history: [] });
  });

  it('accepts another move that keeps the position', async () => {
    const other = 'd1d2';
    const afterOther = after(KQK, other);
    const { evaluate, run } = await start({ [at(afterOther)]: ev(880, 'e5f5') });
    const step = (await playMove(run, other, evaluate))!;
    expect(step.verdict.kind).toBe('good');
    expect(isGoodMove(step.verdict)).toBe(true);
    expect(step.reply).not.toBeNull();
  });

  it('is bad when the move gives the position away, and then nothing moves', async () => {
    const blunder = 'd1a4';
    const { evaluate, run } = await start({ [at(after(KQK, blunder))]: ev(0, 'e5e4') });
    const step = (await playMove(run, blunder, evaluate))!;
    expect(step.verdict).toMatchObject({ kind: 'bad', reason: 'loss' });
    expect(isGoodMove(step.verdict)).toBe(false);
    expect((step.verdict as { loss: number }).loss).toBeGreaterThan(20);
    expect(step.reply).toBeNull();
    expect(step.end).toBeNull();
    expect(step.run).toBe(run);
    // The solution stays available to be shown
    expect(step.run.evaluation.bestMoveUci).toBe(best);
  });

  it('works out the verdict for Black with the score from White’s point of view', async () => {
    const fen = '3k4/8/r7/3PK3/7R/8/8/8 b - - 0 1';
    const start = engine({ [at(fen)]: ev(0, 'a6g6') });
    const run = await startRun(endgame('draw', fen), start);
    // Ra1?? loses: the score for White becomes +800, that is a loss for Black
    const lose = engine({ [at(after(fen, 'a6a1'))]: ev(800, 'h4h8') });
    expect((await playMove(run, 'a6a1', lose))!.verdict).toMatchObject({ kind: 'bad', reason: 'loss' });
    // …and the same score the other way round is no loss
    const fine = engine({ [at(after(fen, 'a6a1'))]: ev(-30, 'h4h8') });
    expect((await playMove(run, 'a6a1', fine))!.verdict.kind).toBe('good');
  });

  it('is bad when a mate that was close slips away', async () => {
    const mateBefore = 5;
    const afterBest = after(KQK, best);
    const slow = 'd1d2';
    const afterSlow = after(KQK, slow);
    const { evaluate, run } = await start({
      [at(KQK)]: ev(10000, best, mateBefore),
      [at(afterBest)]: ev(10000, 'e5f5', mateBefore - 1),
      [at(afterSlow)]: ev(10000, 'e5f5', mateBefore - 1 + MATE_SLACK + 1),
    });
    const bad = (await playMove(run, slow, evaluate))!;
    expect(bad.verdict).toMatchObject({ kind: 'bad', reason: 'slower' });
    expect(bad.run).toBe(run);
    const good = (await playMove(run, best, evaluate))!;
    expect(good.verdict.kind).toBe('best');
  });

  it("never refuses the engine's own move, even when another search no longer sees the mate", async () => {
    const afterBest = after(KQK, best);
    const { evaluate, run } = await start({
      [at(KQK)]: ev(10000, best, 4),
      [at(afterBest)]: ev(300, 'e5f5'),
    });
    expect((await playMove(run, best, evaluate))!.verdict).toEqual({ kind: 'best' });
  });

  it('wins with a checkmate, without asking the engine', async () => {
    const fen = '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1';
    const evaluate = engine({ [at(fen)]: ev(10000, 'g1g7', 1) });
    const run = await startRun(endgame('win', fen), evaluate);
    evaluate.mockClear();
    const step = (await playMove(run, 'g1g7', evaluate))!;
    expect(step.end).toBe('won');
    expect(step.verdict).toEqual({ kind: 'best' });
    expect(step.run).toMatchObject({ moves: 1, history: [{ move: { san: 'Qg7#' }, reply: null }] });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('is bad to stalemate when the position was to be won, and holds the draw when it was to be drawn', async () => {
    const fen = '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1';
    const evaluate = engine({ [at(fen)]: ev(10000, 'g1g7', 1) });
    const win = await startRun(endgame('win', fen), evaluate);
    const stalemate = (await playMove(win, 'g1g6', evaluate))!;
    expect(stalemate.verdict).toMatchObject({ kind: 'bad', reason: 'drawn' });
    expect(stalemate.end).toBeNull();

    const draw = await startRun(endgame('draw', fen), evaluate);
    const held = (await playMove(draw, 'g1g6', evaluate))!;
    expect(held.end).toBe('held');
    expect(isGoodMove(held.verdict)).toBe(true);
  });

  it('has won when a pawn promotes in a position that stays won', async () => {
    const fen = '8/P7/8/8/8/8/k7/2K5 w - - 0 1';
    const afterQueen = after(fen, 'a7a8q');
    const evaluate = engine({ [at(fen)]: ev(900, 'a7a8q'), [at(afterQueen)]: ev(900, 'a2b3') });
    const run = await startRun(endgame('win', fen), evaluate);
    const won = (await playMove(run, 'a7a8q', evaluate))!;
    expect(won.end).toBe('won');
    expect(won.run.moves).toBe(1);

    // …not when the promotion throws the win away (a knight cannot mate: a draw by the rules)
    const knight = engine({ [at(fen)]: ev(900, 'a7a8q') });
    const run2 = await startRun(endgame('win', fen), knight);
    const step = (await playMove(run2, 'a7a8n', knight))!;
    expect(step.verdict).toMatchObject({ kind: 'bad', reason: 'drawn' });
    expect(step.end).toBeNull();
  });

  it('holds the draw after enough moves, when nothing was lost', async () => {
    const fen = '4k2r/8/8/8/8/8/8/R3K3 w - - 0 1';
    const evaluate = engine({ [at(fen)]: ev(0, 'a1a2'), [at(after(fen, 'a1a2'))]: ev(0, 'h8h7') });
    const run = { ...(await startRun(endgame('draw', fen), evaluate)), moves: HOLD_MOVES - 1 };
    const step = (await playMove(run, 'a1a2', evaluate))!;
    expect(step.end).toBe('held');
    expect(step.run.moves).toBe(HOLD_MOVES);
    const early = (await playMove({ ...run, moves: HOLD_MOVES - 2 }, 'a1a2', evaluate))!;
    expect(early.end).toBeNull();
  });

  it('gives up a position to be won that takes too many moves', async () => {
    const fen = '4k2r/8/8/8/8/8/8/R3K3 w - - 0 1';
    const evaluate = engine({ [at(fen)]: ev(900, 'a1a2'), [at(after(fen, 'a1a2'))]: ev(900, 'h8h7') });
    const run = { ...(await startRun(endgame('win', fen), evaluate)), moves: MAX_MOVES - 1 };
    const step = (await playMove(run, 'a1a2', evaluate))!;
    expect(step.end).toBe('slow');
    expect(isEndSuccess('slow')).toBe(false);
    expect(isEndSuccess('won')).toBe(true);
    expect(isEndSuccess('held')).toBe(true);
    expect(isGoodMove(step.verdict)).toBe(true);
  });

  it('is a draw when the same position comes for the third time', async () => {
    // Both sides shuffle a rook: the first position is back after four plies, and again after eight
    const fen = '4k2r/8/8/8/8/8/8/R3K3 w - - 0 1';
    const replies = ['h8h7', 'h7h8'];
    let answered = 0;
    const evaluate = vi.fn(async (position: string) =>
      ev(0, position.split(' ')[1] === 'b' ? replies[answered++ % replies.length] : '')
    );
    let run = await startRun(endgame('draw', fen), evaluate);
    const player = ['a1a2', 'a2a1'];
    for (let i = 0; i < 4; i++) {
      const step = (await playMove(run, player[i % 2], evaluate))!;
      expect(step.verdict.kind).not.toBe('bad');
      run = step.run;
      if (i < 3) expect(step.end).toBeNull();
      else expect(step.end).toBe('held');
    }
    expect(run.moves).toBe(4);
  });

  it('rejects when the engine cannot be reached, and when the search is cancelled', async () => {
    const { evaluate, run } = await start();
    const broken = vi.fn(async () => {
      throw new Error('no engine');
    });
    await expect(playMove(run, best, broken)).rejects.toThrow('no engine');
    const controller = new AbortController();
    controller.abort();
    const aborting = vi.fn(async (_fen: string, _depth: number, signal?: AbortSignal) => {
      if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
      return ev(0);
    });
    await expect(playMove(run, best, aborting, controller.signal)).rejects.toThrow('cancelled');
    expect(evaluate).toHaveBeenCalled();
  });
});

describe('endgameFamilyOf', () => {
  it('names the family of the endgames to practise from what is left on the board', () => {
    expect(endgameFamilyOf('8/8/3k4/8/4PK2/8/8/8 w - - 0 1')).toBe('pawns');
    expect(endgameFamilyOf('8/5pk1/6p1/8/8/6P1/5PK1/8 w - - 0 40')).toBe('pawns');
    expect(endgameFamilyOf('8/5pk1/6p1/8/8/6P1/5PK1/R6r w - - 0 40')).toBe('rooks');
    expect(endgameFamilyOf('6k1/8/8/8/8/8/8/R3K2R w - - 0 1')).toBe('rooks');
    expect(endgameFamilyOf('8/8/8/4k3/8/8/8/3QK3 w - - 0 1')).toBe('mates');
    expect(endgameFamilyOf('8/8/8/4k3/8/8/8/3RK3 b - - 0 1')).toBe('mates');
    expect(endgameFamilyOf('3rk3/8/8/8/8/8/8/4K3 w - - 0 1')).toBe('mates');
  });

  it('has none when the material fits no endgame to practise', () => {
    expect(endgameFamilyOf('8/8/3k4/8/4PKB1/8/8/8 w - - 0 1')).toBeNull(); // a bishop
    expect(endgameFamilyOf('8/5pk1/6p1/8/8/6P1/5PK1/Q6r w - - 0 40')).toBeNull(); // queen and rook
    expect(endgameFamilyOf('8/8/8/4k3/8/8/8/4K3 w - - 0 1')).toBeNull(); // bare kings
    expect(endgameFamilyOf('8/8/8/4k3/8/8/8/3QKR2 w - - 0 1')).toBeNull();
  });
});
