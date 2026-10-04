import { useEffect, useRef, useState } from 'react';
import { listGames } from '../services/gameStore';
import type { OwnGame } from '../utils/vision';

export type OwnGames = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; games: OwnGame[] };

/**
 * The games the player analysed, as material for the vision exercises. Read from the browser once, when `isWanted`
 * first becomes true (the full history is not read for someone who never asks for it).
 */
export function useOwnVisionGames(isWanted: boolean): OwnGames {
  const [state, setState] = useState<OwnGames>({ status: 'idle' });
  const isStarted = useRef(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isWanted || isStarted.current) return;
    isStarted.current = true;
    setState({ status: 'loading' });
    void listGames().then((stored) => {
      if (!isMounted.current) return;
      setState({
        status: 'ready',
        games: stored.map((game) => ({
          id: game.id,
          moves: game.result.moves.map((move) => move.san),
          white: game.result.metadata.white,
          black: game.result.metadata.black,
          date: game.result.metadata.date,
        })),
      });
    });
  }, [isWanted]);

  return state;
}
