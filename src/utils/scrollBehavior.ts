/** Largest move, in plies, that is still scrolled to with an animation. */
const MAX_SMOOTH_STEP = 2;

/**
 * How the move list follows the current move. An animation is nice for a single step the user takes, but
 * it is wrong in two cases: during auto-play, each step restarts the animation before the previous one has
 * ended, so the list is always catching up; and on a jump (start, end, error, click on the chart), where it
 * takes a long time to cross the whole list. Both scroll at once. Reduced motion never animates.
 */
export function moveListScrollBehavior({
  previousPly,
  currentPly,
  isPlaying,
  reducedMotion,
}: {
  previousPly: number;
  currentPly: number;
  isPlaying: boolean;
  reducedMotion: boolean;
}): ScrollBehavior {
  if (reducedMotion || isPlaying) return 'auto';
  return Math.abs(currentPly - previousPly) <= MAX_SMOOTH_STEP ? 'smooth' : 'auto';
}
