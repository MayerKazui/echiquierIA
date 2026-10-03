import { useEffect, useState } from 'react';
import { listGames } from '../services/gameStore';
import { loadPuzzleHistory } from '../services/puzzleHistoryStore';
import { loadCards } from '../services/trainingStore';
import { buildRepertoire } from '../utils/openingRepertoire';
import { buildPlan, type Plan } from '../utils/trainingPlan';
import { collectPositions } from '../utils/trainingPositions';
import { buildProfile } from '../utils/weaknessProfile';

export type PlanState =
  | { status: 'loading' }
  /** Nothing is stored at all. */
  | { status: 'empty' }
  | { status: 'ready'; plan: Plan };

/** Lets the page paint between two slices of work. */
const yieldToUi = (isCancelled: () => boolean) => () =>
  new Promise<void>((resolve, reject) =>
    setTimeout(() => (isCancelled() ? reject(new Error('cancelled')) : resolve()), 0)
  );

/** The plan of the week, worked out once from the games kept in the browser and the training progress. */
export function usePlan(now: () => number = Date.now): PlanState {
  const [state, setState] = useState<PlanState>({ status: 'loading' });

  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      try {
        const [games, cards, puzzles] = await Promise.all([listGames(), loadCards(), loadPuzzleHistory()]);
        if (games.length === 0) {
          if (!isCancelled) setState({ status: 'empty' });
          return;
        }
        const options = { yieldToUi: yieldToUi(() => isCancelled) };
        const [profile, repertoire, positions] = await Promise.all([
          buildProfile(games, undefined, options),
          buildRepertoire(games),
          collectPositions(games, options),
        ]);
        if (isCancelled) return;
        setState({
          status: 'ready',
          plan: buildPlan({ profile, repertoire, positions, cards, puzzleLog: puzzles.log, now: now() }),
        });
      } catch {
        // cancelled
      }
    })();
    return () => {
      isCancelled = true;
    };
    // `now` is read once, when the plan is worked out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
