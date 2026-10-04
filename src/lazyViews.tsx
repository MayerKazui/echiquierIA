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
  training: () => import('./components/Training/Training'),
  openings: () => import('./components/Openings/Openings'),
  endgames: () => import('./components/Endgames/Endgames'),
  vision: () => import('./components/Vision/Vision'),
  plan: () => import('./components/Plan/Plan'),
  studies: () => import('./components/Studies/Studies'),
  puzzles: () => import('./components/Puzzles/Puzzles'),
  play: () => import('./components/Play/PlayStockfish'),
};

export const ChessBoard = lazy(() => loaders.board().then((m) => ({ default: m.ChessBoard })));
export const EvaluationChart = lazy(() => loaders.chart().then((m) => ({ default: m.EvaluationChart })));
export const MoveComparison = lazy(() => loaders.comparison().then((m) => ({ default: m.MoveComparison })));
export const MoveList = lazy(() => loaders.moveList().then((m) => ({ default: m.MoveList })));
export const Dashboard = lazy(() => loaders.dashboard().then((m) => ({ default: m.Dashboard })));
export const WeaknessProfile = lazy(() => loaders.profile().then((m) => ({ default: m.WeaknessProfile })));
export const Training = lazy(() => loaders.training().then((m) => ({ default: m.Training })));
export const Openings = lazy(() => loaders.openings().then((m) => ({ default: m.Openings })));
export const Endgames = lazy(() => loaders.endgames().then((m) => ({ default: m.Endgames })));
export const Vision = lazy(() => loaders.vision().then((m) => ({ default: m.Vision })));
export const Plan = lazy(() => loaders.plan().then((m) => ({ default: m.Plan })));
export const Studies = lazy(() => loaders.studies().then((m) => ({ default: m.Studies })));
export const Puzzles = lazy(() => loaders.puzzles().then((m) => ({ default: m.Puzzles })));
export const PlayStockfish = lazy(() => loaders.play().then((m) => ({ default: m.PlayStockfish })));

/** Starts downloading every lazy view (the browser keeps them: a later render is instant). */
export function prefetchViews(): void {
  for (const load of Object.values(loaders)) {
    load().catch(() => {
      // Offline or a failed download: the view is requested again when it is actually rendered
    });
  }
}
