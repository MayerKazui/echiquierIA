import type { BoardShape } from '../components/ChessBoard/useBoardDrawing';
import type { StudyShape } from '../types/study';

/** The board's colors of the Lichess brushes (the right-click colors: plain green, Shift yellow, Alt blue, Ctrl red). */
const BRUSH_COLORS: Record<StudyShape['brush'], string> = {
  G: '#10b981',
  R: '#ef4444',
  Y: '#f59e0b',
  B: '#06b6d4',
};

const BRUSH_OF_COLOR = new Map(
  Object.entries(BRUSH_COLORS).map(([brush, color]) => [color, brush as StudyShape['brush']])
);

export function toBoardShapes(shapes: readonly StudyShape[] | undefined): BoardShape[] {
  return (shapes ?? []).map((s) => ({ from: s.from, to: s.to, color: BRUSH_COLORS[s.brush] }));
}

/** The shapes of a node from what was drawn on the board (a color that is not a brush counts as green). */
export function fromBoardShapes(shapes: readonly BoardShape[]): StudyShape[] {
  return shapes.map((s) => ({ brush: BRUSH_OF_COLOR.get(s.color) ?? 'G', from: s.from, to: s.to }));
}
