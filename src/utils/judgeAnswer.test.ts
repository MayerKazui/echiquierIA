import { describe, expect, it, vi } from 'vitest';
import type { EngineEvaluation } from '../services/stockfishEngine';
import { position } from '../test/trainingFixtures';
import { calculateWinPercentage } from './moveAnalysis';
import { ACCEPTED_LOSS, CHECK_DEPTH, isSuccess, judgeAnswer, type Verdict } from './judgeAnswer';

const evaluation = (cp: number, mate: number | null = null): EngineEvaluation => ({
  cp,
  mate,
  bestMoveUci: '',
  bestMoveSan: '',
  pv: [],
});

/** A position where the engine's move is Nf3 and White has 0 % to lose or keep, to be set by `winBefore`. */
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const quiet = (over = {}) =>
  position({ fen: START, bestUci: 'g1f3', bestSan: 'Nf3', playedUci: 'a2a3', playedSan: 'a3', winBefore: 54, ...over });

describe('judgeAnswer', () => {
  it("accepts the engine's move without asking the engine", async () => {
    const evaluate = vi.fn();
    expect(await judgeAnswer(quiet(), 'g1f3', evaluate)).toEqual({ kind: 'best' });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('refuses the move of the game without asking the engine', async () => {
    const evaluate = vi.fn();
    expect(await judgeAnswer(quiet(), 'a2a3', evaluate)).toEqual({ kind: 'played' });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('accepts a checkmate even when it is not the engine move', async () => {
    const evaluate = vi.fn();
    // The engine's line was the check Bxf7+, but Qxf7# ends the game
    expect(await judgeAnswer(position({ bestUci: 'c4f7' }), 'h5f7', evaluate)).toEqual({ kind: 'best' });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('refuses an illegal move', async () => {
    const evaluate = vi.fn();
    expect(await judgeAnswer(quiet(), 'e2e5', evaluate)).toEqual({ kind: 'bad', loss: null });
    expect(evaluate).not.toHaveBeenCalled();
  });

  describe('another move', () => {
    it('asks the engine about the position it leads to', async () => {
      const evaluate = vi.fn().mockResolvedValue(evaluation(20));
      await judgeAnswer(quiet(), 'd2d4', evaluate);
      expect(evaluate).toHaveBeenCalledTimes(1);
      expect(evaluate.mock.calls[0][0]).toBe('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1');
      expect(evaluate.mock.calls[0][1]).toBe(CHECK_DEPTH);
    });

    it('passes the signal on to the engine', async () => {
      const evaluate = vi.fn().mockResolvedValue(evaluation(20));
      const { signal } = new AbortController();
      await judgeAnswer(quiet(), 'd2d4', evaluate, signal);
      expect(evaluate.mock.calls[0][2]).toBe(signal);
    });

    it('accepts it when it keeps about as much as the engine move', async () => {
      const after = calculateWinPercentage(30);
      const verdict = await judgeAnswer(quiet({ winBefore: after + 2 }), 'd2d4', async () => evaluation(30));
      expect(verdict.kind).toBe('good');
      expect(verdict.kind === 'good' && verdict.loss).toBeCloseTo(2, 5);
    });

    it('accepts a move that does better than the stored analysis (it never loses a negative amount)', async () => {
      const verdict = await judgeAnswer(quiet({ winBefore: 50 }), 'd2d4', async () => evaluation(400));
      expect(verdict).toEqual({ kind: 'good', loss: 0 });
    });

    it('refuses it when it gives away more than a good move may', async () => {
      const after = calculateWinPercentage(0);
      const verdict = await judgeAnswer(quiet({ winBefore: after + ACCEPTED_LOSS + 1 }), 'd2d4', async () =>
        evaluation(0)
      );
      expect(verdict.kind).toBe('bad');
      expect(verdict.kind === 'bad' && verdict.loss).toBeCloseTo(ACCEPTED_LOSS + 1, 5);
    });

    it('accepts it at exactly the limit', async () => {
      const after = calculateWinPercentage(0);
      const verdict = await judgeAnswer(quiet({ winBefore: after + ACCEPTED_LOSS }), 'd2d4', async () => evaluation(0));
      expect(verdict.kind).toBe('good');
    });

    it('reads the score from the side of Black when the player is Black', async () => {
      // Black to move; after the move the engine says White is +300 cp: bad for Black
      const black = position({
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        color: 'b',
        bestUci: 'e7e5',
        playedUci: 'a7a6',
        winBefore: 50,
      });
      const bad = await judgeAnswer(black, 'd7d5', async () => evaluation(300));
      expect(bad.kind).toBe('bad');
      const good = await judgeAnswer(black, 'd7d5', async () => evaluation(-300));
      expect(good.kind).toBe('good');
    });

    it('counts a mate of the player as the largest advantage, and a mate against as the largest loss', async () => {
      const mating = await judgeAnswer(quiet({ winBefore: calculateWinPercentage(1000) }), 'd2d4', async () =>
        evaluation(0, 3)
      );
      expect(mating.kind).toBe('good');
      const mated = await judgeAnswer(quiet({ winBefore: 60 }), 'd2d4', async () => evaluation(0, -2));
      expect(mated.kind).toBe('bad');
    });

    it('reads a mate against Black as good for White', async () => {
      const black = position({
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        color: 'b',
        bestUci: 'e7e5',
        playedUci: 'a7a6',
        winBefore: 50,
      });
      expect((await judgeAnswer(black, 'd7d5', async () => evaluation(0, 4))).kind).toBe('bad');
      expect((await judgeAnswer(black, 'd7d5', async () => evaluation(0, -4))).kind).toBe('good');
    });

    it('judges it wrong when the engine cannot say', async () => {
      const verdict = await judgeAnswer(quiet(), 'd2d4', () => Promise.reject(new Error('worker lost')));
      expect(verdict).toEqual({ kind: 'bad', loss: null });
    });

    it('lets a cancelled check go instead of judging', async () => {
      const controller = new AbortController();
      const evaluate = () => {
        controller.abort();
        return Promise.reject(new Error('aborted'));
      };
      await expect(judgeAnswer(quiet(), 'd2d4', evaluate, controller.signal)).rejects.toThrow('aborted');
    });

    it('promotes with the piece given', async () => {
      const promoting = position({
        fen: '8/P7/8/8/8/8/8/k6K w - - 0 1',
        bestUci: 'a7a8q',
        playedUci: 'h1g1',
        winBefore: 99,
      });
      const evaluate = vi.fn().mockResolvedValue(evaluation(300));
      await judgeAnswer(promoting, 'a7a8r', evaluate);
      expect(evaluate.mock.calls[0][0]).toBe('R7/8/8/8/8/8/8/k6K b - - 0 1');
    });
  });
});

describe('isSuccess', () => {
  it.each<[Verdict, boolean]>([
    [{ kind: 'best' }, true],
    [{ kind: 'good', loss: 1 }, true],
    [{ kind: 'played' }, false],
    [{ kind: 'bad', loss: 30 }, false],
    [{ kind: 'bad', loss: null }, false],
    [{ kind: 'revealed' }, false],
  ])('%j is %s', (verdict, expected) => {
    expect(isSuccess(verdict)).toBe(expected);
  });
});
