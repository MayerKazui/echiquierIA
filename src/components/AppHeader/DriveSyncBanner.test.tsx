// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveSyncReport } from '../../services/driveSync';
import { AuthError, type TokenProvider } from '../../services/googleAuth';
import { AUTO_SYNC_KEY, createDriveSyncManager, type DriveSyncManagerDeps } from '../../services/driveSyncManager';
import { DriveSyncBanner } from './DriveSyncBanner';

const ok: DriveSyncReport = { restore: null, rejected: { games: 0, cards: 0 }, sent: null };

function setup(run: DriveSyncManagerDeps['run'], enabled = true) {
  if (enabled) localStorage.setItem(AUTO_SYNC_KEY, '1');
  const manager = createDriveSyncManager({
    clientId: 'c',
    tokens: () => ({}) as TokenProvider,
    run,
    onChange: () => () => {},
    loadScript: () => Promise.resolve(),
    storage: window.localStorage,
  });
  render(<DriveSyncBanner manager={manager} />);
  return manager;
}

const fail = async (manager: ReturnType<typeof setup>) => {
  await act(async () => {
    await manager.syncNow().catch(() => {});
  });
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('DriveSyncBanner', () => {
  it('shows nothing when all is well', () => {
    setup(vi.fn(() => Promise.resolve(ok)));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks to sign in again, and a click syncs', async () => {
    const run = vi
      .fn<DriveSyncManagerDeps['run']>()
      .mockRejectedValueOnce(new AuthError('interaction', 'x'))
      .mockResolvedValue(ok);
    const manager = setup(run);
    await fail(manager);
    expect(screen.getByRole('status').textContent).toContain('reconnexion nécessaire');
    await userEvent.click(screen.getByRole('button', { name: 'Se reconnecter' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(run.mock.calls[1][1]).toBe(true);
  });

  it('shows an error with the reason, and a click tries again', async () => {
    const run = vi.fn<DriveSyncManagerDeps['run']>().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(ok);
    const manager = setup(run);
    await fail(manager);
    expect(screen.getByRole('alert').textContent).toContain(
      'Google Drive : La synchronisation avec Google Drive a échoué.'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('stays quiet when the automatic sync is off, whatever happened', async () => {
    const manager = setup(
      vi.fn(() => Promise.reject(new AuthError('interaction', 'x'))),
      false
    );
    await fail(manager);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('survives a click that fails again', async () => {
    const run = vi.fn<DriveSyncManagerDeps['run']>(() => Promise.reject(new AuthError('cancelled', 'x')));
    const manager = setup(run);
    await fail(manager);
    await userEvent.click(screen.getByRole('button', { name: 'Se reconnecter' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
