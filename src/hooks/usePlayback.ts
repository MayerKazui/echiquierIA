import { useEffect, useState } from 'react';
import { PlaybackSpeed } from '../types/ui';
import { oneOf, usePersistentState } from './usePersistentState';

const SPEEDS: readonly PlaybackSpeed[] = [0.5, 1, 2, 4];

/** Current move index + auto-play timer (interval scaled by the persisted playback speed). */
export function usePlayback(totalMoves: number) {
  const [currentPly, setCurrentPly] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = usePersistentState<PlaybackSpeed>(
    'chess_playback_speed',
    1,
    (raw) => oneOf(SPEEDS)(String(Number(raw)))
  );

  useEffect(() => {
    if (!isPlaying || totalMoves === 0) return;
    const timer = setInterval(() => {
      setCurrentPly((prev) => {
        if (prev >= totalMoves - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, Math.round(1100 / playbackSpeed));
    return () => clearInterval(timer);
  }, [isPlaying, totalMoves, playbackSpeed]);

  return { currentPly, setCurrentPly, isPlaying, setIsPlaying, playbackSpeed, setPlaybackSpeed };
}
