import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { EngineEvaluation } from '../services/stockfishEngine';
import { calculateWinPercentage, GREAT_MOVE_GAP } from './moveAnalysis';
import { BRILLIANT_MAX_ADVANTAGE, moveContext } from './moveContext';

const evaluation = (cp: number, extra: Partial<EngineEvaluation> = {}): EngineEvaluation => ({
  cp,
  mate: null,
  bestMoveUci: '',
  bestMoveSan: '',
  pv: [],
  ...extra,
});

/** The context of `san` played in `fen`, with the engine's evaluations before and after (White's view). */
function contextOf(
  fen: string,
  san: string,
  before: EngineEvaluation,
  after: EngineEvaluation,
  options: { winPctDrop?: number; previous?: string; previousFen?: string } = {}
) {
  const chess = new Chess(options.previousFen ?? fen);
  const previous = options.previous ? chess.move(options.previous) : undefined;
  const move = chess.move(san);
  return moveContext({
    move,
    previous,
    fenBefore: previous ? new Chess(options.previousFen).fen() : fen,
    before,
    after,
    winPctBefore: calculateWinPercentage(before.cp),
    winPctDrop: options.winPctDrop ?? 0,
    previousOpponentDrop: 0,
  });
}

describe('moveContext: a real sacrifice', () => {
  // Bxh7+ Kxh7: a bishop for a pawn
  const GIFT = '6k1/7p/8/8/8/3B4/8/4K3 w - - 0 1';

  it('is a move that gives up material and leaves the player better', () => {
    expect(contextOf(GIFT, 'Bxh7+', evaluation(50), evaluation(250)).isSacrifice).toBe(true);
  });

  it('is not a move that wins material for free', () => {
    // The pawn is not defended: Bxh7 only wins it
    expect(contextOf('4k3/7p/8/8/8/3B4/8/4K3 w - - 0 1', 'Bxh7', evaluation(50), evaluation(250)).isSacrifice).toBe(
      false
    );
  });

  it('is not a good quiet move by a piece, which the old rule called a sacrifice', () => {
    expect(contextOf('4k3/8/8/8/8/3B4/8/4K3 w - - 0 1', 'Be4', evaluation(50), evaluation(300)).isSacrifice).toBe(
      false
    );
  });

  it('is not a move that is not good enough', () => {
    expect(contextOf(GIFT, 'Bxh7+', evaluation(50), evaluation(250), { winPctDrop: 3 }).isSacrifice).toBe(false);
  });

  it('is not a move that leaves the player no better', () => {
    expect(contextOf(GIFT, 'Bxh7+', evaluation(50), evaluation(80)).isSacrifice).toBe(false);
  });

  it('is not a move by a player who was already winning clearly', () => {
    expect(contextOf(GIFT, 'Bxh7+', evaluation(BRILLIANT_MAX_ADVANTAGE + 1), evaluation(900)).isSacrifice).toBe(false);
    expect(contextOf(GIFT, 'Bxh7+', evaluation(BRILLIANT_MAX_ADVANTAGE), evaluation(900)).isSacrifice).toBe(true);
  });

  it('is seen from the side of the player: Black gives a bishop for a pawn, the evaluations the other way round', () => {
    // Bxh2+ Kxh2
    const fen = '4k3/8/3b4/8/8/8/7P/6K1 b - - 0 1';
    expect(contextOf(fen, 'Bxh2+', evaluation(-50), evaluation(-250)).isSacrifice).toBe(true);
    expect(contextOf(fen, 'Bxh2+', evaluation(-50), evaluation(-50)).isSacrifice).toBe(false);
  });
});

describe('moveContext: an only move', () => {
  const FEN = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';

  it('is the gap of Win% between the best move and the second choice', () => {
    const gap = contextOf(
      FEN,
      'a3',
      evaluation(100, { second: { cp: -300, mate: null, moveUci: 'b2b3' } }),
      evaluation(100)
    ).onlyMoveGap;
    expect(gap).toBeCloseTo(calculateWinPercentage(100) - calculateWinPercentage(-300), 5);
    expect(gap).toBeGreaterThan(GREAT_MOVE_GAP);
  });

  it('is small when the second choice is nearly as good', () => {
    const { onlyMoveGap } = contextOf(
      FEN,
      'a3',
      evaluation(100, { second: { cp: 60, mate: null, moveUci: 'b2b3' } }),
      evaluation(100)
    );
    expect(onlyMoveGap).toBeLessThan(GREAT_MOVE_GAP);
  });

  it('measures from the side of the player: Black needs the mirror image', () => {
    const black = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R b KQkq - 0 1';
    const white = contextOf(
      FEN,
      'a3',
      evaluation(100, { second: { cp: -300, mate: null, moveUci: 'b2b3' } }),
      evaluation(100)
    );
    const mirrored = contextOf(
      black,
      'Bb7',
      evaluation(-100, { second: { cp: 300, mate: null, moveUci: 'a6a5' } }),
      evaluation(-100)
    );
    expect(mirrored.onlyMoveGap).toBeCloseTo(white.onlyMoveGap!, 5);
  });

  it('is 0 without a second choice (a single legal move, the opening book)', () => {
    expect(contextOf(FEN, 'a3', evaluation(100), evaluation(100)).onlyMoveGap).toBe(0);
  });

  it('counts a forced mate as the only winning move', () => {
    const { onlyMoveGap } = contextOf(
      FEN,
      'a3',
      evaluation(9990, { mate: 1, second: { cp: 300, mate: null, moveUci: 'b2b3' } }),
      evaluation(10000, { mate: 1 })
    );
    expect(onlyMoveGap).toBeGreaterThan(GREAT_MOVE_GAP);
  });

  it('is 0 for taking back the piece that was just taken: that is no find', () => {
    // Black just took on d5; White takes back
    const start = 'rnbqkbnr/ppp2ppp/8/3pp3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';
    const second = { cp: -900, mate: null, moveUci: 'g1f3' };
    const recapture = contextOf(start, 'exd5', evaluation(100, { second }), evaluation(100));
    expect(recapture.onlyMoveGap).toBeGreaterThan(GREAT_MOVE_GAP); // a capture, but of a pawn that was not just taken

    const afterCapture = 'rnbqkbnr/ppp2ppp/8/3Pp3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const taken = new Chess(afterCapture);
    const exd5 = new Chess(start).move('exd5');
    const move = taken.move('Qxd5');
    const context = moveContext({
      move,
      previous: exd5,
      fenBefore: afterCapture,
      before: evaluation(-100, { second: { cp: 900, mate: null, moveUci: 'a7a6' } }),
      after: evaluation(-100),
      winPctBefore: calculateWinPercentage(-100),
      winPctDrop: 0,
      previousOpponentDrop: 0,
    });
    expect(context.onlyMoveGap).toBe(0);
  });
});

describe('moveContext: a forced mate given up', () => {
  const FEN = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  const BLACK = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R b KQkq - 0 1';
  const mateIn = (mate: number) => evaluation((mate > 0 ? 10000 : -10000) - mate * 10, { mate });

  it('is a move after which the mate is gone', () => {
    expect(contextOf(FEN, 'a3', mateIn(3), evaluation(500)).lostForcedMate).toBe(true);
  });

  it('is not a move that keeps a mate, even a slower one', () => {
    expect(contextOf(FEN, 'a3', mateIn(3), mateIn(5)).lostForcedMate).toBe(false);
    expect(contextOf(FEN, 'a3', mateIn(3), mateIn(1)).lostForcedMate).toBe(false);
  });

  it('is not a move without a mate to lose', () => {
    expect(contextOf(FEN, 'a3', evaluation(500), evaluation(100)).lostForcedMate).toBe(false);
  });

  it('is not the loss of a mate that was against the player', () => {
    expect(contextOf(FEN, 'a3', mateIn(-3), evaluation(0)).lostForcedMate).toBe(false);
  });

  it('is a mate for Black when the mate score is negative', () => {
    expect(contextOf(BLACK, 'Bb7', mateIn(-3), evaluation(-500)).lostForcedMate).toBe(true);
    expect(contextOf(BLACK, 'Bb7', mateIn(-3), mateIn(-5)).lostForcedMate).toBe(false);
    expect(contextOf(BLACK, 'Bb7', mateIn(3), evaluation(500)).lostForcedMate).toBe(false);
  });

  it('is a move that lets the opponent mate instead', () => {
    expect(contextOf(FEN, 'a3', mateIn(3), mateIn(-2)).lostForcedMate).toBe(true);
  });
});
