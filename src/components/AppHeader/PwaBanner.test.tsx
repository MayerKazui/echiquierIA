// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PwaBanner } from './PwaBanner';

describe('PwaBanner', () => {
  it('shows nothing when online and up to date', () => {
    const { container } = render(<PwaBanner isOnline updateReady={false} onUpdate={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('says what still works offline, and what does not', () => {
    render(<PwaBanner isOnline={false} updateReady={false} onUpdate={() => {}} />);
    const notice = screen.getByRole('status').textContent;
    expect(notice).toContain('Hors ligne');
    expect(notice).toContain("l'analyse, vos parties et l'entraînement fonctionnent");
    expect(notice).toContain("L'import de parties demande une connexion");
  });

  it('offers the new version, which is applied on request', async () => {
    const onUpdate = vi.fn();
    render(<PwaBanner isOnline updateReady onUpdate={onUpdate} />);
    expect(screen.getByRole('status').textContent).toContain('nouvelle version');
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('can show both notices', () => {
    render(<PwaBanner isOnline={false} updateReady onUpdate={() => {}} />);
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('does not offer the update while there is none', () => {
    render(<PwaBanner isOnline={false} updateReady={false} onUpdate={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Actualiser' })).toBeNull();
  });
});
