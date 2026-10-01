// @vitest-environment jsdom
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSwipe, type SwipeOptions } from './useSwipe';

function Zone(props: SwipeOptions) {
  const swipe = useSwipe(props);
  return (
    <div data-testid="zone" {...swipe}>
      <div role="grid" data-testid="board" />
      <div data-no-swipe data-testid="strip" />
      <input data-testid="field" />
      <p data-testid="text">text</p>
    </div>
  );
}

function setup(options: Partial<SwipeOptions> = {}) {
  const onSwipeLeft = vi.fn();
  const onSwipeRight = vi.fn();
  render(<Zone onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} {...options} />);
  return { onSwipeLeft, onSwipeRight };
}

interface Gesture {
  from?: [number, number];
  to: [number, number];
  /** Milliseconds between the finger going down and up. */
  duration?: number;
  pointerType?: string;
  target?: string;
}

/** A touch that goes down, then up `duration` milliseconds later (the browser clock is set on the events). */
function swipe({ from = [200, 300], to, duration = 150, pointerType = 'touch', target = 'text' }: Gesture) {
  const element = screen.getByTestId(target);
  const init = { pointerId: 1, pointerType, isPrimary: true };
  const down = createEvent.pointerDown(element, { ...init, clientX: from[0], clientY: from[1] });
  const up = createEvent.pointerUp(element, { ...init, clientX: to[0], clientY: to[1] });
  Object.defineProperty(down, 'timeStamp', { value: 1000 });
  Object.defineProperty(up, 'timeStamp', { value: 1000 + duration });
  fireEvent(element, down);
  fireEvent(element, up);
}

describe('useSwipe', () => {
  it('goes to the next item when the finger moves left, to the previous one when it moves right', () => {
    const { onSwipeLeft, onSwipeRight } = setup();
    swipe({ to: [100, 305] });
    expect(onSwipeLeft).toHaveBeenCalledOnce();
    expect(onSwipeRight).not.toHaveBeenCalled();

    swipe({ to: [300, 295] });
    expect(onSwipeRight).toHaveBeenCalledOnce();
    expect(onSwipeLeft).toHaveBeenCalledOnce();
  });

  it('ignores a movement that is too short', () => {
    const { onSwipeLeft, onSwipeRight } = setup();
    swipe({ to: [150, 300] }); // 50 px
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('honours a custom minimum distance', () => {
    const { onSwipeLeft } = setup({ minDistance: 30 });
    swipe({ to: [160, 300] });
    expect(onSwipeLeft).toHaveBeenCalledOnce();
  });

  it('ignores a slow movement: that is a drag, not a swipe', () => {
    const { onSwipeLeft } = setup();
    swipe({ to: [50, 300], duration: 900 });
    expect(onSwipeLeft).not.toHaveBeenCalled();

    swipe({ to: [50, 300], duration: 400 });
    expect(onSwipeLeft).toHaveBeenCalledOnce();
  });

  it('ignores a mostly vertical movement: the user is scrolling', () => {
    const { onSwipeLeft, onSwipeRight } = setup();
    swipe({ to: [120, 420] }); // 80 px across, 120 px down
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('ignores the mouse and the pen: only fingers swipe', () => {
    const { onSwipeLeft } = setup();
    swipe({ to: [50, 300], pointerType: 'mouse' });
    swipe({ to: [50, 300], pointerType: 'pen' });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const { onSwipeLeft } = setup({ enabled: false });
    swipe({ to: [50, 300] });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it.each(['board', 'strip', 'field'])('leaves the gestures of %s alone', (target) => {
    const { onSwipeLeft } = setup();
    swipe({ to: [50, 300], target });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('forgets a gesture that the browser took over (pointercancel)', () => {
    const { onSwipeLeft } = setup();
    const element = screen.getByTestId('text');
    const down = { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 200, clientY: 300 };
    fireEvent.pointerDown(element, down);
    fireEvent.pointerCancel(element, down);
    fireEvent.pointerUp(element, { ...down, clientX: 50 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('ignores a second finger', () => {
    const { onSwipeLeft } = setup();
    const element = screen.getByTestId('text');
    fireEvent.pointerDown(element, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 200, clientY: 300 });
    fireEvent.pointerUp(element, { pointerId: 2, pointerType: 'touch', isPrimary: false, clientX: 50, clientY: 300 });
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });
});
