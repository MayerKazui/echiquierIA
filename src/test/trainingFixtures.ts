import type { MoveAnalysis } from '../types/chess';
import type { TrainingPosition } from '../utils/trainingPositions';

/** White to move: 4.Qxf7# wins at once (the Bxf7+ of the engine's line is the other way to take the pawn). */
export const SCHOLAR = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';

/**
 * The Scholar's-mate position with a black pawn of the 7th rank removed, so that each `index` (0 to 5) is another
 * position (the same position in two games is asked once).
 */
export function distinctFen(index: number): string {
  const ranks = ['1ppp1ppp', 'p1pp1ppp', 'pp1p1ppp', 'ppp2ppp', 'pppp2pp', 'pppp1p1p'];
  return SCHOLAR.replace('pppp1ppp', ranks[index]);
}

/** A position to replay. Defaults: White missing 4.Qxf7# (engine's move) by playing 4.Qh4. */
export function position(over: Partial<TrainingPosition> = {}): TrainingPosition {
  return {
    id: 'g:6',
    gameId: 'g',
    ply: 6,
    moveNumber: 4,
    color: 'w',
    fen: SCHOLAR,
    playedUci: 'h5h4',
    playedSan: 'Qh4',
    bestUci: 'h5f7',
    bestSan: 'Qxf7#',
    pv: ['h5f7'],
    classification: 'blunder',
    kind: 'mate',
    phase: 'opening',
    loss: 45,
    winBefore: 90,
    opponent: 'Bob',
    date: Date.UTC(2024, 2, 17),
    ...over,
  };
}

/** The same as a fault of a stored game (what `collectPositions` reads). */
export function faultMove(over: Partial<MoveAnalysis> = {}): MoveAnalysis {
  return {
    ply: 6,
    moveNumber: 4,
    color: 'w',
    san: 'Qh4',
    uci: 'h5h4',
    from: 'h5',
    to: 'h4',
    fenBefore: SCHOLAR,
    fenAfter: '',
    evalBefore: 1000,
    evalAfter: 20,
    mateBefore: 1,
    mateAfter: null,
    bestMoveUci: 'h5f7',
    bestMoveSan: 'Qxf7#',
    bestMoveFrom: 'h5',
    bestMoveTo: 'f7',
    pv: ['h5f7'],
    centipawnLoss: 980,
    winPercentBefore: 90,
    winPercentAfter: 50,
    winPercentLoss: 40,
    classification: 'blunder',
    faultKind: 'mate',
    ...over,
  };
}
