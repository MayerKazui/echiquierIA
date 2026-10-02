import { useEffect, useState } from 'react';
import { listGames, type StoredGame } from '../services/gameStore';
import { median } from '../utils/puzzleRun';
import { parseElo, playerColorIn } from '../utils/weaknessProfile';

/** Games looked at: the latest ones say best where the player stands now. */
const RECENT_GAMES = 30;

/** The player's rating in one game (from the headers of the PGN), null when they are not named in it or it has none. */
export function playerEloIn(game: StoredGame): number | null {
  const color = playerColorIn(game.result);
  if (color === null) return null;
  const { metadata } = game.result;
  return parseElo(color === 'w' ? metadata.whiteElo : metadata.blackElo);
}

/** The middle rating of the player over their latest games, null when the games give none. */
export function estimateElo(games: readonly StoredGame[]): number | null {
  const latest = [...games].sort((a, b) => b.savedAt - a.savedAt).slice(0, RECENT_GAMES);
  const elo = median(latest.map(playerEloIn).filter((value): value is number => value !== null));
  return elo === null ? null : Math.round(elo);
}

/** The player's rating in games, read once from the games kept in the browser (null while unknown). */
export function usePlayerElo(): number | null {
  const [elo, setElo] = useState<number | null>(null);
  useEffect(() => {
    let isCurrent = true;
    void listGames().then((games) => {
      if (isCurrent) setElo(estimateElo(games));
    });
    return () => {
      isCurrent = false;
    };
  }, []);
  return elo;
}
