// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleWarmUp } from './useIdleWarmUp';

function Host({ tasks }: { tasks: Array<() => void> }) {
  useIdleWarmUp(tasks);
  return null;
}

type IdleWindow = Window & { requestIdleCallback?: unknown; cancelIdleCallback?: unknown };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'requestIdleCallback');
  Reflect.deleteProperty(window, 'cancelIdleCallback');
});

describe('useIdleWarmUp', () => {
  it('runs every task once when the browser reports it is idle, not during the render', () => {
    let idle: (() => void) | undefined;
    (window as IdleWindow).requestIdleCallback = vi.fn((cb: () => void) => {
      idle = cb;
      return 7;
    });
    const a = vi.fn();
    const b = vi.fn();
    const { rerender } = render(<Host tasks={[a, b]} />);
    expect(a).not.toHaveBeenCalled();

    idle!();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();

    rerender(<Host tasks={[a, b]} />); // a re-render does not schedule it again
    expect((window as IdleWindow).requestIdleCallback).toHaveBeenCalledTimes(1);
  });

  it('falls back to a timer where requestIdleCallback does not exist', () => {
    const task = vi.fn();
    render(<Host tasks={[task]} />);
    vi.advanceTimersByTime(1499);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledOnce();
  });

  it('cancels the pending warm-up when the component unmounts', () => {
    const cancel = vi.fn();
    (window as IdleWindow).requestIdleCallback = vi.fn(() => 42);
    (window as IdleWindow).cancelIdleCallback = cancel;
    const { unmount } = render(<Host tasks={[vi.fn()]} />);
    unmount();
    expect(cancel).toHaveBeenCalledWith(42);

    Reflect.deleteProperty(window, 'requestIdleCallback');
    const task = vi.fn();
    const second = render(<Host tasks={[task]} />);
    second.unmount();
    vi.advanceTimersByTime(5000);
    expect(task).not.toHaveBeenCalled();
  });

  it('keeps going when a task throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const after = vi.fn();
    render(
      <Host
        tasks={[
          () => {
            throw new Error('boom');
          },
          after,
        ]}
      />
    );
    vi.advanceTimersByTime(1500);
    expect(after).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
