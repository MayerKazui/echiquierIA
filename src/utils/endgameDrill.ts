import { Chess } from 'chess.js';
import { ENDGAMES, type Endgame, type EndgameCategory } from '../data/endgames';
import type { EngineEvaluation } from '../services/stockfishEngine';
import { ACCEPTED_LOSS } from './judgeAnswer';
import { calculateWinPercentage } from './moveAnalysis';
import type { Rankable } from './spacedRepetition';

/**
 * Training on the theoretical endgames: the player plays a position (see data/endgames.ts) against the engine,
 * which answers every move. Each move is judged by the engine as the replayed errors are (the Win % it gives
 * away, see `judgeAnswer`), and the exercise ends:
 *  - when it is won: checkmate, or a pawn promoted in a position that stays won (goal "win");
 *  - when the draw is held: a draw by the rules, or `HOLD_MOVES` moves without losing it (goal "draw");
 *  - when it is lost: a move that gives away the result (the exercise goes on, see below), or too many moves.
 *
 * A position gets one result, from the first attempt: a move that gives too much away fails it, and so does
 * asking for the solution. The player can take the move back and carry on to the end, for practice.
 * The cards of the positions share the store of the other cards (see `trainingStore`), and so use the same
 * spaced repetition.
 */

/** Cards of the endgames share the store of the other cards: their ids start with this. */
export const ENDGAME_ID_PREFIX = 'finale:';

export const endgameCardId = (endgame: Pick<Endgame, 'id'>): string => `${ENDGAME_ID_PREFIX}${endgame.id}`;

/** Search depth of the engine, for the verdict on a move and for its answer: deep, the positions have few pieces. */
export const SEARCH_DEPTH = 16;

/** Moves (of the player) after which a position that was to be won is given up as too slow. */
export const MAX_MOVES = 40;
/** Moves (of the player) without losing the position that make the draw held. */
export const HOLD_MOVES = 12;
/** Win % from which a pawn that promotes has won the position: what is left is technique. */
export const PROMOTION_WIN_PERCENT = 70;
/**
 * A forced mate may last this many moves longer than the engine's shortest one before the move is called slow:
 * a move that does not lose the mate but lets it slip away is not a mistake yet.
 */
export const MATE_SLACK = 2;

type Evaluate = (fen: string, depth: number, signal?: AbortSignal) => Promise<EngineEvaluation>;

export interface EndgameMove {
  /** English SAN, as chess.js writes it. */
  san: string;
  uci: string;
}

/** The exercise on screen. It never changes: every step returns the next one. */
export interface EndgameRun {
  endgame: Endgame;
  /** The player's side: the one to move in the first position. */
  color: 'w' | 'b';
  /** The position on screen, the player to move. */
  fen: string;
  /** What the engine thinks of `fen` (from White's point of view, like everywhere else). */
  evaluation: EngineEvaluation;
  /** Moves the player has made. */
  moves: number;
  /** The player's moves with the engine's answers. */
  history: Array<{ move: EndgameMove; reply: EndgameMove | null }>;
  /** Every position reached so far (without the move counters): three times the same one is a draw. */
  seen: string[];
}

/** Why a move is bad: it gives Win % away, lets the mate slip, throws a won position into a draw, or gets mated. */
export type BadReason = 'loss' | 'slower' | 'drawn' | 'mated';

export type MoveVerdict =
  /** The engine's move. */
  | { kind: 'best' }
  /** Another move that keeps the position as well (`loss` Win % under the engine's move). */
  | { kind: 'good'; loss: number }
  | { kind: 'bad'; reason: BadReason; loss: number };

export const isGoodMove = (verdict: MoveVerdict): boolean => verdict.kind !== 'bad';

/** How the exercise ended: won, draw held, or a position to be won that took too many moves. */
export type EndgameEnd = 'won' | 'held' | 'slow';

export interface EndgameStep {
  verdict: MoveVerdict;
  /** The move of the player. */
  move: EndgameMove;
  /** The answer of the engine, when the exercise goes on after a good move. */
  reply: EndgameMove | null;
  /**
   * The exercise after the step. When the move was bad it is the one before it, unchanged: the player can try
   * another move (the engine's solution is `run.evaluation`).
   */
  run: EndgameRun;
  /** Set when the exercise is over (after a good move). */
  end: EndgameEnd | null;
}

const key = (fen: string): string => fen.split(' ').slice(0, 4).join(' ');

/**
 * Beyond this many centipawns a position is simply won: the engine finds a mate in one search and not in the
 * next, and that must not read as a loss. A forced mate counts as this much too.
 */
export const WON_CP = 600;

/** Win % of `color` in a position, the engine's score being from White's point of view, a won position being capped. */
export function winPercentFor(evaluation: EngineEvaluation, color: 'w' | 'b'): number {
  const { cp, mate } = evaluation;
  const score = mate === null || mate === 0 ? Math.max(-WON_CP, Math.min(WON_CP, cp)) : mate > 0 ? WON_CP : -WON_CP;
  const white = calculateWinPercentage(score);
  return color === 'w' ? white : 100 - white;
}

/** Moves in which `color` mates according to the engine, null when it sees no mate for them. */
function mateFor(evaluation: EngineEvaluation, color: 'w' | 'b'): number | null {
  if (evaluation.mate === null || evaluation.mate === 0) return null;
  const own = color === 'w' ? evaluation.mate : -evaluation.mate;
  return own > 0 ? own : null;
}

const uciOf = (move: { from: string; to: string; promotion?: string }): string =>
  `${move.from}${move.to}${move.promotion ?? ''}`;

/** Plays a UCI move; null when it is not legal there. */
function play(chess: Chess, uci: string): EndgameMove | null {
  try {
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return { san: move.san, uci: uciOf(move) };
  } catch {
    return null;
  }
}

/** Whether the rules make the game a draw here (stalemate, material, 50 moves, or the third time a position comes). */
function isDrawn(chess: Chess, seen: readonly string[]): boolean {
  const current = key(chess.fen());
  return chess.isDraw() || seen.filter((position) => position === current).length >= 3;
}

/** The exercise at its first position. Rejects when the engine cannot evaluate it. */
export async function startRun(endgame: Endgame, evaluate: Evaluate, signal?: AbortSignal): Promise<EndgameRun> {
  const evaluation = await evaluate(endgame.fen, SEARCH_DEPTH, signal);
  return {
    endgame,
    color: new Chess(endgame.fen).turn(),
    fen: endgame.fen,
    evaluation,
    moves: 0,
    history: [],
    seen: [key(endgame.fen)],
  };
}

/**
 * The player plays `uci`. Returns null for an illegal move. Otherwise the engine judges the move; after a good
 * one it answers with its own best move and evaluates the position that results, ready for the next step.
 */
export async function playMove(
  run: EndgameRun,
  uci: string,
  evaluate: Evaluate,
  signal?: AbortSignal
): Promise<EndgameStep | null> {
  const chess = new Chess(run.fen);
  const move = play(chess, uci);
  if (!move) return null;

  const bad = (reason: BadReason, loss: number): EndgameStep => ({
    verdict: { kind: 'bad', reason, loss },
    move,
    reply: null,
    run,
    end: null,
  });
  const isWin = run.endgame.goal === 'win';
  const afterMove = [...run.seen, key(chess.fen())];
  const moves = run.moves + 1;
  /** The exercise as it stands when the game is over with the move. */
  const over = (): EndgameRun => ({
    ...run,
    fen: chess.fen(),
    moves,
    history: [...run.history, { move, reply: null }],
    seen: afterMove,
  });

  // The game is over with this move
  if (chess.isCheckmate()) {
    return { verdict: { kind: 'best' }, move, reply: null, end: 'won', run: over() };
  }
  if (isDrawn(chess, afterMove)) {
    return isWin
      ? bad('drawn', Math.max(0, winPercentFor(run.evaluation, run.color) - 50))
      : { verdict: { kind: 'good', loss: 0 }, move, reply: null, end: 'held', run: over() };
  }

  const before = run.evaluation;
  const after = await evaluate(chess.fen(), SEARCH_DEPTH, signal);
  // The engine's own move is never refused, even if another search of it does not see the mate any more
  const isBest = move.uci === before.bestMoveUci;
  const loss = isBest ? 0 : Math.max(0, winPercentFor(before, run.color) - winPercentFor(after, run.color));
  if (loss > ACCEPTED_LOSS) return bad('loss', loss);
  const mateBefore = mateFor(before, run.color);
  const mateAfter = mateFor(after, run.color);
  if (!isBest && mateBefore !== null && mateAfter !== null && mateAfter > mateBefore - 1 + MATE_SLACK) {
    return bad('slower', loss);
  }
  const verdict: MoveVerdict = isBest ? { kind: 'best' } : { kind: 'good', loss };

  // A pawn that promotes with the position still won: the rest is technique
  if (isWin && move.uci.length > 4 && winPercentFor(after, run.color) >= PROMOTION_WIN_PERCENT) {
    return { verdict, move, reply: null, end: 'won', run: over() };
  }

  // The engine's answer
  const reply = play(chess, after.bestMoveUci);
  if (!reply) throw new Error('The engine gave no answer to the move');
  const seen = [...afterMove, key(chess.fen())];
  const history = [...run.history, { move, reply }];
  const next = (evaluation: EngineEvaluation): EndgameRun => ({
    ...run,
    fen: chess.fen(),
    evaluation,
    moves,
    history,
    seen,
  });

  if (chess.isCheckmate()) return bad('mated', 100);
  if (isDrawn(chess, seen)) {
    return isWin
      ? bad('drawn', Math.max(0, winPercentFor(before, run.color) - 50))
      : { verdict, move, reply, end: 'held', run: next(after) };
  }
  const evaluation = await evaluate(chess.fen(), SEARCH_DEPTH, signal);
  const advanced = next(evaluation);
  if (!isWin && moves >= HOLD_MOVES) return { verdict, move, reply, end: 'held', run: advanced };
  if (isWin && moves >= MAX_MOVES) return { verdict, move, reply, end: 'slow', run: advanced };
  return { verdict, move, reply, end: null, run: advanced };
}

export const isEndSuccess = (end: EndgameEnd): boolean => end !== 'slow';

/** Endgames as the items of a session (see `pickItems`): the curriculum order, nothing is costlier than another. */
export interface EndgameItem extends Rankable {
  endgame: Endgame;
}

export const endgameItems = (endgames: readonly Endgame[] = ENDGAMES): EndgameItem[] =>
  endgames.map((endgame, index) => ({
    endgame,
    id: endgameCardId(endgame),
    loss: 0,
    // Never worked on: the first of the list comes first (the most recent date wins a tie)
    date: -index,
  }));

/**
 * The theoretical endgames a position belongs to, by what is left on the board: only kings and pawns, only rooks
 * (and pawns), or a lone king against a queen or a rook. Null for any other material (minor pieces, queens with
 * other pieces...): none of the endgames to practise looks like it.
 */
export function endgameFamilyOf(fen: string): EndgameCategory | null {
  const placement = fen.split(' ')[0] ?? '';
  const pieces = placement.replace(/[^a-zA-Z]/g, '');
  const others = pieces.replace(/[kpKP]/g, '');
  if (others.length === 0) return pieces.replace(/[^pP]/g, '').length > 0 ? 'pawns' : null;
  const white = pieces.replace(/[^A-Z]/g, '');
  const black = pieces.replace(/[^a-z]/g, '').toUpperCase();
  const loneKingAgainst = (side: string) => ['KQ', 'QK', 'KR', 'RK'].includes(side);
  if ((white === 'K' && loneKingAgainst(black)) || (black === 'K' && loneKingAgainst(white))) return 'mates';
  if (/^[rR]+$/.test(others)) return 'rooks';
  return null;
}
