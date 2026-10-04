import React, { useEffect, useState } from 'react';
import type { PlayerColor } from '../../types/ui';
import { formatClock, remaining } from '../../utils/playClock';
import type { Timing } from '../../hooks/usePlayGame';

interface PlayClocksProps {
  timing: Timing;
  /** The side to move: the only clock that runs. */
  turn: PlayerColor;
  running: boolean;
  userColor: PlayerColor;
  isOver: boolean;
  /** The side whose time ran out, if any: its clock shows zero. */
  flagged: PlayerColor | null;
}

/** The time of the running clock is re-read often enough to show tenths of a second when it gets short. */
const TICK_MS = 100;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** The two clocks of a game: the engine's above, the player's below, the one that runs highlighted. */
export const PlayClocks: React.FC<PlayClocksProps> = ({ timing, turn, running, userColor, isOver, flagged }) => {
  const now = useNow(running);
  const sides: Array<{ color: PlayerColor; label: string }> = [
    { color: userColor === 'w' ? 'b' : 'w', label: 'Stockfish' },
    { color: userColor, label: 'Vous' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {sides.map(({ color, label }) => {
        const left =
          color === flagged ? 0 : remaining(timing.clock, color, turn, running ? now : (timing.clock.since ?? 0));
        const isRunning = running && color === turn;
        const isLow = left < 10_000 && !isOver;
        return (
          <div
            key={color}
            role="timer"
            aria-label={`Pendule de ${label === 'Vous' ? 'votre camp' : 'Stockfish'}`}
            className={`rounded-xl border px-3 py-2 flex items-baseline justify-between gap-2 ${
              isRunning
                ? isLow
                  ? 'border-rose-500/60 bg-rose-500/10'
                  : 'border-indigo-500/60 bg-indigo-500/10'
                : 'border-slate-800 bg-slate-950/60'
            }`}
          >
            <span className="text-xs text-slate-400">{label}</span>
            <span
              className={`font-mono text-lg tabular-nums ${isLow && isRunning ? 'text-rose-200' : 'text-slate-100'}`}
            >
              {formatClock(left)}
            </span>
          </div>
        );
      })}
    </div>
  );
};
