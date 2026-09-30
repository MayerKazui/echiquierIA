import { useCallback, useEffect, useRef, useState } from 'react';
import { MoveAnalysis } from '../types/chess';
import { chessAudio } from '../utils/chessAudio';

/** Mute state + a sound effect each time the current move changes. */
export function useMoveSound(moves: MoveAnalysis[] | undefined, currentPly: number) {
  const [isMuted, setIsMuted] = useState<boolean>(() => chessAudio.getIsMuted());
  const prevPlyRef = useRef<number>(currentPly);

  const toggleSound = useCallback(() => {
    setIsMuted(chessAudio.toggleMute());
  }, []);

  useEffect(() => {
    const move = moves?.[currentPly];
    if (currentPly !== prevPlyRef.current && currentPly >= 0 && move) {
      chessAudio.playForMove(move.san, move.san.includes('+') || move.san.includes('#'));
    }
    prevPlyRef.current = currentPly;
  }, [currentPly, moves]);

  return { isMuted, toggleSound };
}
