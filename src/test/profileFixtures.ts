import type { GameMetadata, MoveAnalysis } from '../types/chess';
import type { Profile, ProfileSource } from '../utils/weaknessProfile';

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

export const bucket = (moves: number, accuracy: number | null) => ({ moves, accuracy, faults: 0, faultsPer100: 0 });
export const gameBucket = (moves: number, accuracy: number | null) => ({
  ...bucket(moves, accuracy),
  games: 5,
  score: 0.5,
});

/** A profile with nothing to point out. */
export const calmProfile = (): Profile => ({
  counted: 20,
  ignored: 0,
  overview: { accuracy: 80, wins: 10, draws: 0, losses: 10, score: 0.5, faultsPerGame: 3 },
  baseline: bucket(600, 80),
  phases: { opening: bucket(240, 80), middlegame: bucket(240, 80), endgame: bucket(120, 80) },
  kinds: { counts: { mate: 0, hanging: 0, tactic: 0, wasted: 0, other: 20 }, total: 20 },
  worst: [],
  colors: { w: gameBucket(300, 80), b: gameBucket(300, 80) },
  time: {
    pressure: bucket(100, 80),
    comfortable: bucket(400, 80),
    instant: bucket(0, null),
    thoughtful: bucket(0, null),
    gamesWithClocks: 10,
  },
  opponents: { stronger: gameBucket(0, null), similar: gameBucket(0, null), weaker: gameBucket(0, null) },
  timeControls: {},
  trend: [],
  trendChange: { count: 10, accuracy: { recent: 80, previous: 80 }, faults: { recent: 3, previous: 3 } },
  insights: [],
  strengths: [],
});
