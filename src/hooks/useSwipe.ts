import type React from 'react';
import { useRef } from 'react';

export interface SwipeOptions {
  /** The finger moved to the left (next in a list). */
  onSwipeLeft: () => void;
  /** The finger moved to the right (previous in a list). */
  onSwipeRight: () => void;
  enabled?: boolean;
  /** Horizontal distance, in pixels, from which a movement is a swipe. */
  minDistance?: number;
  /** A slower movement is a drag, not a swipe. */
  maxDurationMs?: number;
}

/**
 * Parts of a swipe zone that keep their own gestures: the chessboard (a touch drag there plays a piece),
 * anything marked `data-no-swipe` (horizontally scrollable strips), form fields and dialogs.
 */
const OWN_GESTURES = '[role="grid"], [data-no-swipe], input, textarea, select, [role="dialog"]';

/** How much more horizontal than vertical a movement must be: otherwise the user is scrolling the page. */
const HORIZONTAL_DOMINANCE = 1.5;

/**
 * Horizontal swipe detection with pointer events, for touch screens only (the mouse keeps its usual
 * behaviour). Spread the returned handlers on the swipe zone, and give it `touch-action: pan-y` so that the
 * browser keeps the vertical scroll and leaves the horizontal movement to the page.
 */
export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
  minDistance = 60,
  maxDurationMs = 600,
}: SwipeOptions) {
  const start = useRef<{ x: number; y: number; time: number; pointerId: number } | null>(null);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      start.current =
        enabled && e.pointerType === 'touch' && e.isPrimary && !target?.closest(OWN_GESTURES)
          ? { x: e.clientX, y: e.clientY, time: e.timeStamp, pointerId: e.pointerId }
          : null;
    },
    onPointerUp: (e: React.PointerEvent) => {
      const origin = start.current;
      start.current = null;
      if (!enabled || !origin || origin.pointerId !== e.pointerId) return;

      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      const isSwipe =
        Math.abs(dx) >= minDistance &&
        Math.abs(dx) > HORIZONTAL_DOMINANCE * Math.abs(dy) &&
        e.timeStamp - origin.time <= maxDurationMs;
      if (isSwipe) (dx < 0 ? onSwipeLeft : onSwipeRight)();
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}
