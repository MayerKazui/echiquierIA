import { useEffect, useState } from 'react';
import { ensureOpeningBookLoaded, getOpeningPosition, isOpeningDatasetLoaded } from '../services/openingBook';
import { listGames } from '../services/gameStore';
import { loadPuzzleHistory } from '../services/puzzleHistoryStore';
import { loadCards } from '../services/trainingStore';
import { collectDrillPositions, drillPositionsOf } from '../utils/openingDrill';
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

/** The exits from the theory the training replays, or undefined when the openings database cannot be loaded (offline). */
async function exitsToReplay(
  games: Awaited<ReturnType<typeof listGames>>,
  options: { yieldToUi: () => Promise<void> }
) {
  try {
    await ensureOpeningBookLoaded();
    if (!isOpeningDatasetLoaded()) return undefined;
    return drillPositionsOf(await collectDrillPositions(games, getOpeningPosition, options), null, 'exit');
  } catch (error) {
    if (error instanceof Error && error.message === 'cancelled') throw error;
    return undefined;
  }
}

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
          collectPositions(games, { ...options, cards }),
        ]);
        if (isCancelled) return;
        const exits = await exitsToReplay(games, options);
        if (isCancelled) return;
        setState({
          status: 'ready',
          plan: buildPlan({ profile, repertoire, positions, exits, cards, puzzleLog: puzzles.log, now: now() }),
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
