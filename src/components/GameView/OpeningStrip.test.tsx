// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpeningStrip } from './OpeningStrip';

describe('OpeningStrip', () => {
  it('shows the opening in French, with its code', () => {
    const { container } = render(<OpeningStrip opening="Sicilian Defense: Najdorf Variation" eco="B90" />);
    expect(container.textContent).toBe('[B90] Défense sicilienne : variante Najdorf');
  });

  it('works without a code', () => {
    const { container } = render(<OpeningStrip opening="French Defense" />);
    expect(container.textContent).toBe('Défense française');
  });
});
