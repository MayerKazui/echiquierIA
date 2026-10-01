import { useEffect, useState } from 'react';
import { listGames, type StoredGame } from '../services/gameStore';
import { buildProfile, type Profile } from '../utils/weaknessProfile';

export type ProfileState =
  | { status: 'loading' }
  /** Nothing is stored at all. */
  | { status: 'empty' }
  | { status: 'ready'; profile: Profile; /** Games stored, counted or not. */ stored: number };

/** Lets the page paint between two slices of work. */
const yieldToUi = (isCancelled: () => boolean) => () =>
  new Promise<void>((resolve, reject) =>
    setTimeout(() => (isCancelled() ? reject(new Error('cancelled')) : resolve()), 0)
  );

/**
 * The weakness profile of the games kept in the browser: they are read once, and the profile is worked out again
 * (without blocking the page) when `latest`, the number of latest games to use, changes.
 */
export function useWeaknessProfile(latest: number | undefined): ProfileState {
  const [games, setGames] = useState<StoredGame[] | null>(null);
  /** The profile with what it was worked out from: it only counts while that is still what is asked for. */
  const [computed, setComputed] = useState<{
    games: StoredGame[];
    latest: number | undefined;
    profile: Profile;
  } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void listGames().then((list) => isCurrent && setGames(list));
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (games === null || games.length === 0) return;
    let isCancelled = false;
    buildProfile(games, latest, { yieldToUi: yieldToUi(() => isCancelled) }).then(
      (profile) => {
        if (!isCancelled) setComputed({ games, latest, profile });
      },
      () => {} // cancelled
    );
    return () => {
      isCancelled = true;
    };
  }, [games, latest]);

  if (games === null) return { status: 'loading' };
  if (games.length === 0) return { status: 'empty' };
  if (computed && computed.games === games && computed.latest === latest) {
    return { status: 'ready', profile: computed.profile, stored: games.length };
  }
  return { status: 'loading' };
}
