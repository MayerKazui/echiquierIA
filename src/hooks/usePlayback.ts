import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PlaybackSpeed } from '../types/ui';
import { oneOf, usePersistentState } from './usePersistentState';

const SPEEDS: readonly PlaybackSpeed[] = [0.5, 1, 2, 4];

export interface PlaybackOptions {
  /** Auto-play stops on arriving at a ply for which this returns true (a blunder, say). */
  pauseAt?: (ply: number) => boolean;
  /** Called when auto-play stopped on such a ply. */
  onPaused?: (ply: number) => void;
}

/**
 * Current move index + auto-play timer (interval scaled by the persisted playback speed).
 * Auto-play stops by itself on the last move, and on the plies `pauseAt` picks (checked on arrival: it can
 * be started from one of them and goes on).
 */
export function usePlayback(totalMoves: number, { pauseAt, onPaused }: PlaybackOptions = {}) {
  const [currentPly, setCurrentPly] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = usePersistentState<PlaybackSpeed>('chess_playback_speed', 1, (raw) =>
    oneOf(SPEEDS)(String(Number(raw)))
  );

  // The timer reads the latest ply and options from here: it is not restarted when they change
  const latest = useRef({ currentPly, pauseAt, onPaused });
  useLayoutEffect(() => {
    latest.current = { currentPly, pauseAt, onPaused };
  });

  useEffect(() => {
    if (!isPlaying || totalMoves === 0) return;
    const timer = setInterval(
      () => {
        const next = latest.current.currentPly + 1;
        if (next > totalMoves - 1) {
          setIsPlaying(false);
          return;
        }
        latest.current.currentPly = next; // before the next render: two ticks never repeat a ply
        setCurrentPly(next);

        if (latest.current.pauseAt?.(next)) {
          setIsPlaying(false);
          latest.current.onPaused?.(next);
        } else if (next >= totalMoves - 1) {
          setIsPlaying(false); // the end of the game: no need to wait for one more tick
        }
      },
      Math.round(1100 / playbackSpeed)
    );
    return () => clearInterval(timer);
  }, [isPlaying, totalMoves, playbackSpeed]);

  return { currentPly, setCurrentPly, isPlaying, setIsPlaying, playbackSpeed, setPlaybackSpeed };
}
