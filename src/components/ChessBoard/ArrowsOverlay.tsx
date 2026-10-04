import React from 'react';
import { TacticalThreat } from '../../utils/tacticalThreats';
import { UserArrow } from './useBoardDrawing';

interface Point {
  x: number;
  y: number;
}

interface ArrowsOverlayProps {
  /** Converts a square name ("e4") to 0..100 SVG coordinates (depends on the board orientation). */
  toPoint: (square: string) => Point;
  lastMove: { from: string; to: string } | null;
  bestMove: { from: string; to: string } | null;
  showArrows: boolean;
  playedArrowColor: string;
  bestArrowColor: string;
  tacticalThreats: TacticalThreat[];
  showThreats: boolean;
  userArrows: UserArrow[];
  draftArrow: UserArrow | null;
}

const ARROW_HEAD = 'M 0 1.5 L 9 5 L 0 8.5 z';

/**
 * Where the line of an arrow ends in its head (in the units of the head's 10x10 box, from its base): near the
 * base, where the head is wide. Further in, the head is narrower than the line, which would stick out at its sides.
 */
const LINE_END_IN_HEAD = 1;

interface MarkerSpec {
  id: string;
  /** Where the line used to end in the head: the tip stays where it was, the line is shortened to `LINE_END_IN_HEAD`. */
  refX: number;
  size: number;
  path: string;
  fill: string;
}

// Arrow heads that do not depend on the props
const STATIC_MARKERS: MarkerSpec[] = [
  { id: 'threatArrowRed', refX: 6, size: 3.6, path: ARROW_HEAD, fill: '#ef4444' },
  { id: 'threatArrowAmber', refX: 6, size: 3.6, path: ARROW_HEAD, fill: '#f59e0b' },
  { id: 'pinArrowPurple', refX: 6, size: 3.4, path: 'M 0 2 L 8 5 L 0 8 z', fill: '#c084fc' },
  { id: 'userArrowGreen', refX: 6.5, size: 4, path: ARROW_HEAD, fill: '#10b981' },
  { id: 'userArrowAmber', refX: 6.5, size: 4, path: ARROW_HEAD, fill: '#f59e0b' },
  { id: 'userArrowCyan', refX: 6.5, size: 4, path: ARROW_HEAD, fill: '#06b6d4' },
  { id: 'userArrowRed', refX: 6.5, size: 4, path: ARROW_HEAD, fill: '#ef4444' },
];

const USER_MARKER_BY_COLOR: Record<string, string> = {
  '#f59e0b': 'url(#userArrowAmber)',
  '#06b6d4': 'url(#userArrowCyan)',
  '#ef4444': 'url(#userArrowRed)',
};
const userMarker = (color: string) => USER_MARKER_BY_COLOR[color] ?? 'url(#userArrowGreen)';

/** Heads that do not depend on the props, by id (`refX`, `size`), to know how far each line is shortened. */
const HEADS = new Map<string, Pick<MarkerSpec, 'refX' | 'size'>>([
  ['playedArrow', { refX: 6, size: 4 }],
  ['bestArrow', { refX: 6, size: 4.2 }],
  ...STATIC_MARKERS.map((m): [string, Pick<MarkerSpec, 'refX' | 'size'>] => [m.id, { refX: m.refX, size: m.size }]),
]);

const Marker: React.FC<Omit<MarkerSpec, 'refX'>> = ({ id, size, path, fill }) => (
  <marker
    id={id}
    viewBox="0 0 10 10"
    refX={LINE_END_IN_HEAD}
    refY="5"
    markerWidth={size}
    markerHeight={size}
    orient="auto-start-reverse"
  >
    <path d={path} fill={fill} />
  </marker>
);

/** SVG layer drawn over the board: played/best move arrows, threat rays and user-drawn arrows. */
export const ArrowsOverlay: React.FC<ArrowsOverlayProps> = ({
  toPoint,
  lastMove,
  bestMove,
  showArrows,
  playedArrowColor,
  bestArrowColor,
  tacticalThreats,
  showThreats,
  userArrows,
  draftArrow,
}) => {
  const line = (key: string | undefined, from: string, to: string, props: React.SVGProps<SVGLineElement>) => {
    const start = toPoint(from);
    const target = toPoint(to);
    // The line stops in the base of its head (the head is as big as the stroke is wide), not at the tip
    const head = HEADS.get(/#([^)]+)/.exec(props.markerEnd ?? '')?.[1] ?? '');
    const length = Math.hypot(target.x - start.x, target.y - start.y);
    const back = head ? ((head.refX - LINE_END_IN_HEAD) * head.size * Number(props.strokeWidth ?? 1)) / 10 : 0;
    const ratio = length > back ? (length - back) / length : 1;
    const end = { x: start.x + (target.x - start.x) * ratio, y: start.y + (target.y - start.y) * ratio };
    return <line key={key} x1={start.x} y1={start.y} x2={end.x} y2={end.y} strokeLinecap="round" {...props} />;
  };

  const showBestArrow =
    showArrows &&
    bestMove?.from &&
    bestMove.to &&
    (!lastMove || lastMove.from !== bestMove.from || lastMove.to !== bestMove.to);

  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none z-20">
      <defs>
        <Marker id="playedArrow" size={4} path="M 0 1 L 10 5 L 0 9 z" fill={playedArrowColor} />
        <Marker id="bestArrow" size={4.2} path={ARROW_HEAD} fill={bestArrowColor} />
        {STATIC_MARKERS.map((marker) => (
          <Marker key={marker.id} {...marker} />
        ))}
      </defs>

      {/* Tactical threat laser rays */}
      {showThreats &&
        tacticalThreats.map((threat) =>
          threat.targetSquare.split(',').map((targetSq) => {
            const isHigh = threat.severity === 'high';
            return (
              <React.Fragment key={`${threat.id}-${targetSq}`}>
                {line(undefined, threat.sourceSquare, targetSq, {
                  stroke: isHigh ? '#ef4444' : '#f59e0b',
                  strokeWidth: '1.9',
                  strokeOpacity: '0.88',
                  strokeDasharray: '2.5 2.5',
                  markerEnd: isHigh ? 'url(#threatArrowRed)' : 'url(#threatArrowAmber)',
                })}
                {threat.pinThroughSquare &&
                  line(undefined, targetSq, threat.pinThroughSquare, {
                    stroke: '#c084fc',
                    strokeWidth: '1.6',
                    strokeOpacity: '0.8',
                    strokeDasharray: '1.5 2',
                    markerEnd: 'url(#pinArrowPurple)',
                  })}
              </React.Fragment>
            );
          })
        )}

      {/* Played move arrow (solid line) */}
      {showArrows &&
        lastMove?.from &&
        lastMove.to &&
        line(undefined, lastMove.from, lastMove.to, {
          stroke: playedArrowColor,
          strokeWidth: '2.3',
          strokeOpacity: '0.85',
          markerEnd: 'url(#playedArrow)',
        })}

      {/* Stockfish best/alternative move arrow (dashed) */}
      {showBestArrow &&
        line(undefined, bestMove!.from, bestMove!.to, {
          stroke: bestArrowColor,
          strokeWidth: '2.2',
          strokeOpacity: '0.95',
          strokeDasharray: '1.5 5.5',
          markerEnd: 'url(#bestArrow)',
        })}

      {/* User drawn arrows */}
      {userArrows.map((arrow, idx) =>
        line(`user-arrow-${idx}-${arrow.from}-${arrow.to}`, arrow.from, arrow.to, {
          stroke: arrow.color,
          strokeWidth: '2.4',
          strokeOpacity: '0.9',
          markerEnd: userMarker(arrow.color),
        })
      )}

      {/* Live draft arrow (while right-click dragging) */}
      {draftArrow &&
        line(undefined, draftArrow.from, draftArrow.to, {
          stroke: draftArrow.color,
          strokeWidth: '2.4',
          strokeOpacity: '0.65',
          strokeDasharray: '2 2',
          markerEnd: userMarker(draftArrow.color),
        })}
    </svg>
  );
};
