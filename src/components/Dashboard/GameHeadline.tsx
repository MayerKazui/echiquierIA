import React, { useEffect, useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import type { GameAnalysisResult } from '../../types/chess';
import { gameId, listGames } from '../../services/gameStore';
import { buildGameHeadline } from '../../utils/gameHeadline';
import type { PhaseStats } from '../../utils/phaseStats';
import { meanAccuracyOfOthers, playerColorIn, type ProfileSource } from '../../utils/weaknessProfile';

interface GameHeadlineProps {
  analysis: GameAnalysisResult;
  /** PGN of the game, to leave it out of the average it is compared with. */
  pgn?: string;
  userPseudo: string;
  phaseStats: PhaseStats;
}

/** Three lines at the top of the summary: the decisive moment, the accuracy against one's average, the faults. */
export const GameHeadline: React.FC<GameHeadlineProps> = ({ analysis, pgn, userPseudo, phaseStats }) => {
  const [stored, setStored] = useState<ProfileSource[]>([]);
  useEffect(() => {
    let isCurrent = true;
    void listGames().then((games) => isCurrent && setStored(games));
    return () => {
      isCurrent = false;
    };
  }, []);

  const side = useMemo(() => playerColorIn({ ...analysis, userPseudo }), [analysis, userPseudo]);
  const lines = useMemo(() => {
    const average = side ? meanAccuracyOfOthers(stored, pgn ? gameId(pgn) : undefined) : null;
    return buildGameHeadline(analysis, side, average, phaseStats);
  }, [analysis, side, stored, pgn, phaseStats]);

  return (
    <section
      aria-label="Résumé de la partie"
      className="bg-slate-900/80 border border-rose-500/20 rounded-2xl p-4 sm:p-5 shadow-lg flex gap-3"
    >
      <Flame className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
      <ul className="flex flex-col gap-1.5 text-sm text-slate-200">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
};
