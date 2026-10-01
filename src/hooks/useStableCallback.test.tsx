// @vitest-environment jsdom
import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useStableCallback } from './useStableCallback';

function Probe({ value, seen }: { value: number; seen: Array<(factor: number) => number> }) {
  const multiply = useStableCallback((factor: number) => value * factor);
  seen.push(multiply);
  return null;
}

describe('useStableCallback', () => {
  it('keeps the same function between renders', () => {
    const seen: Array<(factor: number) => number> = [];
    const { rerender } = render(<Probe value={1} seen={seen} />);
    rerender(<Probe value={2} seen={seen} />);
    rerender(<Probe value={3} seen={seen} />);
    expect(new Set(seen).size).toBe(1);
  });

  it('calls the latest callback, with its arguments and its result', () => {
    const seen: Array<(factor: number) => number> = [];
    const { rerender } = render(<Probe value={2} seen={seen} />);
    expect(seen[0](10)).toBe(20);
    rerender(<Probe value={5} seen={seen} />);
    expect(seen[0](10)).toBe(50); // the same function, now working with the new value
  });

  it('does not call the callback by itself', () => {
    const callback = vi.fn();
    function Quiet() {
      useStableCallback(callback);
      return null;
    }
    render(<Quiet />);
    expect(callback).not.toHaveBeenCalled();
  });
});
