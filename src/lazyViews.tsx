import { lazy } from 'react';

/**
 * The heavy views are separate chunks, downloaded on demand instead of being part of the first bundle:
 * the start screen only needs the PGN form. They are prefetched when the browser is idle and when an
 * analysis starts, so they are usually there before the analysis ends.
 */
const loaders = {
  board: () => import('./components/ChessBoard/ChessBoard'),
  chart: () => import('./components/EvaluationChart/EvaluationChart'),
  comparison: () => import('./components/MoveComparison/MoveComparison'),
  moveList: () => import('./components/MoveList/MoveList'),
  dashboard: () => import('./components/Dashboard/Dashboard'),
  profile: () => import('./components/Profile/WeaknessProfile'),
};

export const ChessBoard = lazy(() => loaders.board().then((m) => ({ default: m.ChessBoard })));
export const EvaluationChart = lazy(() => loaders.chart().then((m) => ({ default: m.EvaluationChart })));
export const MoveComparison = lazy(() => loaders.comparison().then((m) => ({ default: m.MoveComparison })));
export const MoveList = lazy(() => loaders.moveList().then((m) => ({ default: m.MoveList })));
export const Dashboard = lazy(() => loaders.dashboard().then((m) => ({ default: m.Dashboard })));
export const WeaknessProfile = lazy(() => loaders.profile().then((m) => ({ default: m.WeaknessProfile })));

/** Starts downloading every lazy view (the browser keeps them: a later render is instant). */
export function prefetchViews(): void {
  for (const load of Object.values(loaders)) {
    load().catch(() => {
      // Offline or a failed download: the view is requested again when it is actually rendered
    });
  }
}
