/**
 * The number on the icon of the installed app (the Badging API): the count of what is to be reviewed. It needs no
 * server. It only works where the browser has it and the app is installed (Chrome and Edge on a computer or on
 * Android, Safari on iOS and iPadOS for an app added to the Home Screen); anywhere else nothing happens. The number
 * is the one the app last computed: it changes when the app is open or comes back in front.
 */

interface BadgeNavigator {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

const defaultNavigator = (): BadgeNavigator | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as unknown as BadgeNavigator);

/** Whether this browser can put a number on the icon. */
export const isBadgeSupported = (nav: BadgeNavigator | undefined = defaultNavigator()): boolean =>
  typeof nav?.setAppBadge === 'function' && typeof nav.clearAppBadge === 'function';

/** Shows `count` on the icon, or takes the number off for 0. Resolves with false when it did not work. */
export async function updateAppBadge(
  count: number,
  nav: BadgeNavigator | undefined = defaultNavigator()
): Promise<boolean> {
  if (!nav || !isBadgeSupported(nav)) return false;
  try {
    if (count > 0) await nav.setAppBadge!(Math.min(count, 99_999));
    else await nav.clearAppBadge!();
    return true;
  } catch {
    // Not installed, or the permission was refused: the badge is a convenience
    return false;
  }
}
