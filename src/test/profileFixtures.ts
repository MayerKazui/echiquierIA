import type { GameMetadata, MoveAnalysis } from '../types/chess';
import type { ProfileSource } from '../utils/weaknessProfile';

export const PSEUDO = 'Alice';

/** A move of the given ply (0 = White's first). Without `fault`, a perfect move. */
export function mv(ply: number, over: Partial<MoveAnalysis> = {}): MoveAnalysis {
  return {
    ply,
    moveNumber: Math.floor(ply / 2) + 1,
    color: ply % 2 === 0 ? 'w' : 'b',
    san: 'e4',
    uci: 'e2e4',
    from: 'e2',
    to: 'e4',
    fenBefore: '',
    fenAfter: '',
    evalBefore: 0,
    evalAfter: 0,
    mateBefore: null,
    mateAfter: null,
    bestMoveUci: 'e2e4',
    bestMoveSan: 'e4',
    bestMoveFrom: 'e2',
    bestMoveTo: 'e4',
    pv: [],
    centipawnLoss: 0,
    winPercentBefore: 50,
    winPercentAfter: 50,
    winPercentLoss: 0,
    classification: 'best',
    ...over,
  };
}

/** A blunder (the player loses about 300 cp). */
export const blunder = (ply: number, over: Partial<MoveAnalysis> = {}) =>
  mv(ply, {
    classification: 'blunder',
    evalAfter: ply % 2 === 0 ? -300 : 300,
    winPercentLoss: 25,
    faultKind: 'other',
    ...over,
  });

export interface GameOptions {
  id?: string;
  white?: string;
  black?: string;
  plies?: number;
  moves?: MoveAnalysis[];
  meta?: GameMetadata;
  savedAt?: number;
  pseudo?: string;
}

/** The player (Alice, White by default) in a game of `plies` perfect moves, unless `moves` is given. */
export function game({
  id = 'g',
  white = PSEUDO,
  black = 'Bob',
  plies = 40,
  moves,
  meta,
  savedAt = 1,
  pseudo = PSEUDO,
}: GameOptions = {}): ProfileSource {
  return {
    id,
    savedAt,
    result: {
      metadata: { white, black, result: '1-0', ...meta },
      moves: moves ?? Array.from({ length: plies }, (_, i) => mv(i)),
      statsWhite: {} as never,
      statsBlack: {} as never,
      userColor: 'w',
      userPseudo: pseudo,
    },
  };
}
