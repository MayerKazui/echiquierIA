import { useCallback, useEffect, useMemo, useState } from 'react';
import { enginePlayer, EngineUnavailableError } from '../services/enginePlayer';
import { isAbortError } from '../services/stockfishEngine';
import type { PlayerColor } from '../types/ui';
import type { PlayLevel } from '../utils/playLevels';
import {
  afterMove,
  engineMoveTime,
  pauseClock,
  remaining,
  resumeClock,
  startClock,
  type ClockState,
  type TimeControl,
} from '../utils/playClock';
import { flagOutcome, lengthAfterTakeback, replay, type PlayOutcome } from '../utils/playGame';

export interface PlayGameOptions {
  startFen: string;
  userColor: PlayerColor;
  level: PlayLevel;
  /** The moves already played (UCI), when a game in progress is resumed. */
  initialMoves?: readonly string[];
  /** The clock of the game; without it there is no clock. */
  timeControl?: TimeControl | null;
  /** The clock of the game in progress that is resumed: the time left to each side, and the time after each move. */
  initialClock?: { w: number; b: number; log: readonly number[] };
}

/** The clocks of a game, and the time left (ms) to the mover after each move (one per move). */
export interface Timing {
  clock: ClockState;
  log: number[];
}

/**
 * A game against the engine: the player's moves go through `play`, and the engine answers by itself. The state is
 * the list of moves (UCI) from the start position: everything else (the position, the notation, the result by
 * the rules) is read from it, so taking a move back is just a shorter list.
 */
export function usePlayGame({ startFen, userColor, level, initialMoves, timeControl, initialClock }: PlayGameOptions) {
  const [uciMoves, setUciMoves] = useState<string[]>(() => [...(initialMoves ?? [])]);
  const [resigned, setResigned] = useState<PlayerColor | null>(null);
  /** The side whose time ran out. */
  const [flagged, setFlagged] = useState<PlayerColor | null>(null);
  const [timing, setTiming] = useState<Timing | null>(() => {
    if (!timeControl) return null;
    const now = Date.now();
    if (!initialClock) return { clock: startClock(timeControl, now), log: [] };
    return { clock: { w: initialClock.w, b: initialClock.b, since: now }, log: [...initialClock.log] };
  });
  const [engineFailed, setEngineFailed] = useState(false);
  /** Bumped to ask the engine again after a failure. */
  const [retries, setRetries] = useState(0);

  const state = useMemo(() => replay(startFen, uciMoves), [startFen, uciMoves]);
  const turn: PlayerColor = state.fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const startTurn: PlayerColor = startFen.split(' ')[1] === 'b' ? 'b' : 'w';

  const outcome: PlayOutcome | null =
    state.outcome ??
    (flagged ? flagOutcome(state.fen, flagged) : null) ??
    (resigned ? { kind: 'resigned', winner: resigned === 'w' ? 'b' : 'w' } : null);
  const isOver = outcome !== null;
  const isEngineTurn = !isOver && turn !== userColor;

  /** A move is played: it goes on the list, and on the clock. */
  const commit = useCallback(
    (uci: string, mover: PlayerColor) => {
      const now = Date.now();
      setUciMoves((moves) => [...moves, uci]);
      if (!timeControl) return;
      setTiming((t) => {
        if (!t) return t;
        const clock = afterMove(t.clock, mover, now, timeControl);
        return { clock, log: [...t.log, clock[mover]] };
      });
    },
    [timeControl]
  );

  // The engine's answer, in the time its clock leaves it
  useEffect(() => {
    if (!isEngineTurn || engineFailed) return;
    const controller = new AbortController();
    const left = timing && timeControl ? remaining(timing.clock, turn, turn, Date.now()) : null;
    const moveTimeMs = left !== null && timeControl ? engineMoveTime(level.moveTimeMs, left, timeControl) : undefined;
    enginePlayer.chooseMove({ startFen, moves: uciMoves, level, moveTimeMs, signal: controller.signal }).then(
      (uci) => {
        if (!controller.signal.aborted) commit(uci, turn);
      },
      (err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        if (!(err instanceof EngineUnavailableError)) console.warn('The engine could not play:', err);
        setEngineFailed(true);
        // Nobody's time runs down while the engine cannot answer
        setTiming((t) => (t ? { ...t, clock: pauseClock(t.clock, turn, Date.now()) } : t));
      }
    );
    return () => controller.abort();
    // `retries` asks again after a failure
  }, [isEngineTurn, engineFailed, startFen, uciMoves, level, retries, commit, timing, timeControl, turn]);

  // The clock of the side to move runs out
  const running = timing !== null && timing.clock.since !== null && !isOver && !engineFailed;
  useEffect(() => {
    if (!timing || !running) return;
    const left = remaining(timing.clock, turn, turn, Date.now());
    const timer = setTimeout(() => setFlagged(turn), left + 10);
    return () => clearTimeout(timer);
  }, [timing, running, turn]);

  /** The player's move; ignored when it is not their turn. */
  const play = useCallback(
    (uci: string) => {
      if (isOver || turn !== userColor) return;
      if (timing && running && remaining(timing.clock, turn, turn, Date.now()) <= 0) {
        setFlagged(turn);
        return;
      }
      commit(uci, turn);
    },
    [isOver, turn, userColor, timing, running, commit]
  );

  const takebackTo = lengthAfterTakeback(uciMoves.length, startTurn, userColor, turn);
  const canTakeBack = !resigned && flagged === null && takebackTo < uciMoves.length;
  const takeBack = useCallback(() => {
    if (!canTakeBack) return;
    setEngineFailed(false);
    setUciMoves((moves) => moves.slice(0, takebackTo));
    // Taking a move back gives no time back: the clock of the player runs on from here
    const now = Date.now();
    setTiming((t) =>
      t
        ? {
            clock: resumeClock(isOver ? t.clock : pauseClock(t.clock, turn, now), now),
            log: t.log.slice(0, takebackTo),
          }
        : t
    );
  }, [canTakeBack, takebackTo, isOver, turn]);

  const resign = useCallback(() => setResigned(userColor), [userColor]);
  const retryEngine = useCallback(() => {
    setEngineFailed(false);
    setRetries((n) => n + 1);
    setTiming((t) => (t ? { ...t, clock: resumeClock(t.clock, Date.now()) } : t));
  }, []);

  return {
    fen: state.fen,
    moves: state.moves,
    uciMoves,
    turn,
    outcome,
    isOver,
    isEngineTurn: isEngineTurn && !engineFailed,
    engineFailed,
    play,
    canTakeBack,
    takeBack,
    resign,
    retryEngine,
    /** The clocks, when the game has some, and whether they are running. */
    timing,
    clockRunning: running,
    flagged,
  };
}
