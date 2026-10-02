import { useEffect, useState } from 'react';
import { listGames } from '../services/gameStore';
import { buildRepertoire, type Repertoire } from '../utils/openingRepertoire';

export type RepertoireState = { status: 'loading' } | { status: 'ready'; repertoire: Repertoire };

/** Lets the page paint between two slices of work. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The repertoire of the games kept in the browser (best effort: games that cannot be read count as none). */
export function useRepertoire(): RepertoireState {
  const [state, setState] = useState<RepertoireState>({ status: 'loading' });

  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      const games = await listGames().catch(() => []);
      const repertoire = await buildRepertoire(games, { yieldToUi });
      if (!isCancelled) setState({ status: 'ready', repertoire });
    })();
    return () => {
      isCancelled = true;
    };
  }, []);

  return state;
}
