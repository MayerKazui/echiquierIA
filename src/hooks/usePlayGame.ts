import { useCallback, useEffect, useMemo, useState } from 'react';
import { enginePlayer, EngineUnavailableError } from '../services/enginePlayer';
import { isAbortError } from '../services/stockfishEngine';
import type { PlayerColor } from '../types/ui';
import type { PlayLevel } from '../utils/playLevels';
import { lengthAfterTakeback, replay, type PlayOutcome } from '../utils/playGame';

export interface PlayGameOptions {
  startFen: string;
  userColor: PlayerColor;
  level: PlayLevel;
}

/**
 * A game against the engine: the player's moves go through `play`, and the engine answers by itself. The state is
 * the list of moves (UCI) from the start position: everything else (the position, the notation, the result by
 * the rules) is read from it, so taking a move back is just a shorter list.
 */
export function usePlayGame({ startFen, userColor, level }: PlayGameOptions) {
  const [uciMoves, setUciMoves] = useState<string[]>([]);
  const [resigned, setResigned] = useState<PlayerColor | null>(null);
  const [engineFailed, setEngineFailed] = useState(false);
  /** Bumped to ask the engine again after a failure. */
  const [retries, setRetries] = useState(0);

  const state = useMemo(() => replay(startFen, uciMoves), [startFen, uciMoves]);
  const turn: PlayerColor = state.fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const startTurn: PlayerColor = startFen.split(' ')[1] === 'b' ? 'b' : 'w';

  const outcome: PlayOutcome | null =
    state.outcome ?? (resigned ? { kind: 'resigned', winner: resigned === 'w' ? 'b' : 'w' } : null);
  const isOver = outcome !== null;
  const isEngineTurn = !isOver && turn !== userColor;

  // The engine's answer
  useEffect(() => {
    if (!isEngineTurn || engineFailed) return;
    const controller = new AbortController();
    enginePlayer.chooseMove({ startFen, moves: uciMoves, level, signal: controller.signal }).then(
      (uci) => {
        if (!controller.signal.aborted) setUciMoves((moves) => [...moves, uci]);
      },
      (err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        if (!(err instanceof EngineUnavailableError)) console.warn('The engine could not play:', err);
        setEngineFailed(true);
      }
    );
    return () => controller.abort();
    // `retries` asks again after a failure
  }, [isEngineTurn, engineFailed, startFen, uciMoves, level, retries]);

  /** The player's move; ignored when it is not their turn. */
  const play = useCallback(
    (uci: string) => {
      if (isOver || turn !== userColor) return;
      setUciMoves((moves) => [...moves, uci]);
    },
    [isOver, turn, userColor]
  );

  const takebackTo = lengthAfterTakeback(uciMoves.length, startTurn, userColor, turn);
  const canTakeBack = !resigned && takebackTo < uciMoves.length;
  const takeBack = useCallback(() => {
    if (!canTakeBack) return;
    setEngineFailed(false);
    setUciMoves((moves) => moves.slice(0, takebackTo));
  }, [canTakeBack, takebackTo]);

  const resign = useCallback(() => setResigned(userColor), [userColor]);
  const retryEngine = useCallback(() => {
    setEngineFailed(false);
    setRetries((n) => n + 1);
  }, []);

  return {
    fen: state.fen,
    moves: state.moves,
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
  };
}
