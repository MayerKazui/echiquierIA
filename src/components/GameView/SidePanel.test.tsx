// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { SidePanel } from './SidePanel';

function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>Compteur {n}</button>;
}

describe('SidePanel', () => {
  const panel = <SidePanel moveCount={33} move={<p>Analyse du coup</p>} list={<Counter />} />;

  it('shows the move analysis first and the number of moves on the list tab', () => {
    render(panel);
    expect(screen.getByRole('button', { name: /^Coup/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Liste (33)' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Analyse du coup').closest('[hidden]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Compteur 0' })).toBeNull(); // hidden: not exposed
  });

  it('switches to the list and back', async () => {
    render(panel);
    await userEvent.click(screen.getByRole('button', { name: 'Liste (33)' }));
    expect(screen.getByRole('button', { name: 'Compteur 0' })).toBeTruthy();
    expect(screen.queryByText('Analyse du coup', { selector: 'p' })?.closest('[hidden]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Coup/ }));
    expect(screen.getByText('Analyse du coup').closest('[hidden]')).toBeNull();
  });

  it('keeps the state of a hidden tab (filters of the list survive a change of tab)', async () => {
    render(panel);
    await userEvent.click(screen.getByRole('button', { name: 'Liste (33)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Compteur 0' }));
    await userEvent.click(screen.getByRole('button', { name: /^Coup/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Liste (33)' }));
    expect(screen.getByRole('button', { name: 'Compteur 1' })).toBeTruthy();
  });
});
