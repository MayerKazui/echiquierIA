// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInstallPrompt } from './useInstallPrompt';

function offer() {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  return event;
}

describe('useInstallPrompt', () => {
  it('cannot install before the browser makes its offer', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  it('keeps the offer for the button, and hides the banner of the browser', () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = offer();
    act(() => void window.dispatchEvent(event));
    expect(result.current.canInstall).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('shows the offer of the browser when asked to install, and uses it once', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = offer();
    act(() => void window.dispatchEvent(event));
    await act(async () => {
      await result.current.install();
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.canInstall).toBe(false);
  });

  it('does nothing when there is no offer', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.canInstall).toBe(false);
  });

  it('forgets the offer once the app is installed', () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => void window.dispatchEvent(offer()));
    act(() => void window.dispatchEvent(new Event('appinstalled')));
    expect(result.current.canInstall).toBe(false);
  });

  it('stops listening when unmounted', () => {
    const { result, unmount } = renderHook(() => useInstallPrompt());
    unmount();
    act(() => void window.dispatchEvent(offer()));
    expect(result.current.canInstall).toBe(false);
  });
});
