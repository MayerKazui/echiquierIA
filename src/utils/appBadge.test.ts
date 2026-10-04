import { describe, expect, it, vi } from 'vitest';
import { isBadgeSupported, updateAppBadge } from './appBadge';

const badge = () => ({
  setAppBadge: vi.fn().mockResolvedValue(undefined),
  clearAppBadge: vi.fn().mockResolvedValue(undefined),
});

describe('isBadgeSupported', () => {
  it('needs both calls', () => {
    expect(isBadgeSupported(badge())).toBe(true);
    expect(isBadgeSupported({ setAppBadge: vi.fn() })).toBe(false);
    expect(isBadgeSupported({})).toBe(false);
    expect(isBadgeSupported(undefined)).toBe(false);
  });
});

describe('updateAppBadge', () => {
  it('shows the count on the icon', async () => {
    const nav = badge();
    expect(await updateAppBadge(12, nav)).toBe(true);
    expect(nav.setAppBadge).toHaveBeenCalledWith(12);
    expect(nav.clearAppBadge).not.toHaveBeenCalled();
  });

  it('takes the number off when there is nothing to review', async () => {
    const nav = badge();
    expect(await updateAppBadge(0, nav)).toBe(true);
    expect(nav.clearAppBadge).toHaveBeenCalledTimes(1);
    expect(nav.setAppBadge).not.toHaveBeenCalled();
  });

  it('does nothing where the browser cannot', async () => {
    expect(await updateAppBadge(3, {})).toBe(false);
  });

  it('does not fail when the browser refuses', async () => {
    const nav = { setAppBadge: vi.fn().mockRejectedValue(new Error('denied')), clearAppBadge: vi.fn() };
    expect(await updateAppBadge(3, nav)).toBe(false);
  });
});
