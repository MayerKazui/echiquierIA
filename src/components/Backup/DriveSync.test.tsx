// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveSyncReport } from '../../services/driveSync';
import { AuthError, type TokenProvider } from '../../services/googleAuth';
import { AUTO_SYNC_KEY, createDriveSyncManager, type DriveSyncManagerDeps } from '../../services/driveSyncManager';
import { DataBackup } from './DataBackup';
import { DriveSync, describeAutoSync, describeSync } from './DriveSync';

const restoreOf = (over: Partial<NonNullable<DriveSyncReport['restore']>> = {}) => ({
  games: { added: 0, replaced: 0, kept: 0, trimmed: 0, deleted: 0 },
  cards: { added: 0, replaced: 0, kept: 0 },
  studies: { added: 0, replaced: 0, kept: 0, deleted: 0 },
  preferencesApplied: 0,
  ...over,
});

const report = (over: Partial<DriveSyncReport> = {}): DriveSyncReport => ({
  restore: restoreOf({ games: { added: 2, replaced: 0, kept: 0, trimmed: 0, deleted: 0 } }),
  rejected: { games: 0, cards: 0, studies: 0 },
  sent: { games: 3, cards: 1, studies: 0, bytes: 20_480 },
  ...over,
});

function makeManager(over: Partial<DriveSyncManagerDeps> = {}) {
  const changes = new Set<() => void>();
  const run = vi.fn<DriveSyncManagerDeps['run']>(() => Promise.resolve(report()));
  const manager = createDriveSyncManager({
    clientId: 'client-id',
    tokens: () => ({}) as TokenProvider,
    run,
    onChange: (listener) => {
      changes.add(listener);
      return () => void changes.delete(listener);
    },
    loadScript: () => Promise.resolve(),
    storage: window.localStorage,
    ...over,
  });
  return { manager, run, changeGames: () => changes.forEach((listener) => listener()) };
}

function renderSync(
  managerOver: Partial<DriveSyncManagerDeps> = {},
  props: Partial<React.ComponentProps<typeof DriveSync>> = {}
) {
  const made = makeManager(managerOver);
  const handlers = { onRestored: vi.fn(), reload: vi.fn() };
  render(<DriveSync manager={made.manager} {...handlers} {...props} />);
  return { ...made, ...handlers };
}

const syncButton = () => screen.findByRole('button', { name: 'Synchroniser avec Google Drive' });
const autoBox = () => screen.getByRole('checkbox', { name: /Synchroniser automatiquement/ }) as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
});

describe('describeSync', () => {
  it('says what came from Drive and what was sent', () => {
    const text = describeSync(report());
    expect(text).toContain('Depuis Drive : Parties : 2 parties ajoutées.');
    expect(text).toContain("Copie envoyée : 3 parties, 1 position d'entraînement (20 Ko).");
  });

  it('says when Drive had no copy and when there was nothing to send', () => {
    expect(describeSync(report({ restore: null }))).toContain('Drive ne contenait pas encore de copie.');
    expect(describeSync(report({ sent: null }))).toContain("Rien à envoyer : ce navigateur n'a encore aucune donnée.");
  });

  it('counts the studies sent, and only when there are some', () => {
    expect(describeSync(report({ sent: { games: 3, cards: 1, studies: 2, bytes: 20_480 } }))).toContain(
      "Copie envoyée : 3 parties, 1 position d'entraînement, 2 études (20 Ko)."
    );
    expect(describeSync(report({ sent: { games: 0, cards: 0, studies: 1, bytes: 20_480 } }))).toContain(
      "0 partie, 0 position d'entraînement, 1 étude (20 Ko)."
    );
  });

  it('says what came from Drive for the studies', () => {
    const studies = { added: 2, replaced: 0, kept: 0, deleted: 1 };
    const text = describeSync(report({ restore: restoreOf({ studies }) }));
    expect(text).toContain('Études : 2 études restaurées.');
    expect(text).toContain('1 étude supprimée (supprimée sur un autre appareil)');
  });

  it('never shows a size of 0 Ko', () => {
    expect(describeSync(report({ sent: { games: 0, cards: 1, studies: 0, bytes: 100 } }))).toContain('(1 Ko)');
  });

  it('says what was deleted elsewhere', () => {
    const games = { added: 0, replaced: 0, kept: 1, trimmed: 0, deleted: 2 };
    expect(describeSync(report({ restore: restoreOf({ games }) }))).toContain(
      '2 parties supprimées (supprimées sur un autre appareil)'
    );
  });
});

describe('describeAutoSync', () => {
  const status = (phase: string, message: string | null = null) =>
    ({ phase, message, enabled: true, lastSync: 1, script: 'ready' }) as Parameters<typeof describeAutoSync>[0];

  it('says each state', () => {
    expect(describeAutoSync(status('idle'))).toBe('À jour.');
    expect(describeAutoSync(status('waiting'))).toBe('Changement détecté : synchronisation dans un instant.');
    expect(describeAutoSync(status('syncing'))).toBe('Synchronisation en cours…');
    expect(describeAutoSync(status('off'))).toBe('');
  });

  it('gives the reason of a sign-in or an error, with a default', () => {
    expect(describeAutoSync(status('needs-signin', 'Reconnectez-vous.'))).toBe('Reconnectez-vous.');
    expect(describeAutoSync(status('needs-signin'))).toBe('Google demande de vous reconnecter.');
    expect(describeAutoSync(status('error', 'Drive est plein.'))).toBe('Drive est plein.');
    expect(describeAutoSync(status('error'))).toBe('La synchronisation avec Google Drive a échoué.');
  });
});

describe('DriveSync', () => {
  it('is not offered without a client ID', () => {
    renderSync({ clientId: undefined });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('loads the Google script when it appears, and enables the button once it is there', async () => {
    let ready: () => void = () => {};
    const loadScript = vi.fn(() => new Promise<void>((resolve) => (ready = resolve)));
    renderSync({ loadScript });
    const button = screen.getByRole('button', { name: 'Synchroniser avec Google Drive' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    ready();
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(loadScript).toHaveBeenCalledTimes(1);
  });

  it('syncs, shows the result and refreshes the history', async () => {
    const { run, onRestored } = renderSync();
    await waitFor(async () => expect(((await syncButton()) as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(await syncButton());
    expect(await screen.findByText(/2 parties ajoutées/)).toBeTruthy();
    expect(screen.getByText(/Copie envoyée : 3 parties/)).toBeTruthy();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toBe(true);
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it('reuses the same sign-in for the next sync', async () => {
    const tokens = {} as TokenProvider;
    const { run } = renderSync({ tokens: () => tokens });
    await userEvent.click(await syncButton());
    await screen.findByText(/Copie envoyée/);
    await userEvent.click(await syncButton());
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(run.mock.calls[1][0]).toBe(run.mock.calls[0][0]);
  });

  it('does not refresh the history when Drive had no copy', async () => {
    const { onRestored } = renderSync({ run: vi.fn(() => Promise.resolve(report({ restore: null }))) });
    await userEvent.click(await syncButton());
    await screen.findByText(/pas encore de copie/);
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('refreshes the history when the automatic sync brought something, even with the button idle', async () => {
    const { manager, onRestored } = renderSync();
    await act(async () => {
      await manager.syncNow();
    });
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it('is disabled while it runs, and says so', async () => {
    let finish: (value: DriveSyncReport) => void = () => {};
    renderSync({ run: vi.fn(() => new Promise<DriveSyncReport>((resolve) => (finish = resolve))) });
    await userEvent.click(await syncButton());
    expect(await screen.findByText('Synchronisation avec Google Drive…')).toBeTruthy();
    expect(((await syncButton()) as HTMLButtonElement).disabled).toBe(true);
    finish(report());
    await screen.findByText(/Copie envoyée/);
    expect(((await syncButton()) as HTMLButtonElement).disabled).toBe(false);
  });

  it('remembers the date of the last sync', async () => {
    const now = Date.UTC(2026, 9, 2, 12, 0);
    renderSync({ now: () => now });
    expect(screen.queryByText(/Dernière synchronisation/)).toBeNull();
    await userEvent.click(await syncButton());
    expect(await screen.findByText(/Dernière synchronisation : 2 octobre 2026/)).toBeTruthy();
    expect(localStorage.getItem('chess_drive_last_sync')).toBe(String(now));
  });

  it('shows the date of an earlier sync at once', () => {
    localStorage.setItem('chess_drive_last_sync', String(Date.UTC(2026, 0, 15, 9, 30)));
    renderSync();
    expect(screen.getByText(/Dernière synchronisation : 15 janvier 2026/)).toBeTruthy();
  });

  it('shows the failure and leaves the date alone', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { onRestored } = renderSync({ run: vi.fn(() => Promise.reject(new Error('boom'))) });
    await userEvent.click(await syncButton());
    expect((await screen.findByRole('alert')).textContent).toContain('La synchronisation avec Google Drive a échoué.');
    expect(onRestored).not.toHaveBeenCalled();
    expect(localStorage.getItem('chess_drive_last_sync')).toBeNull();
    error.mockRestore();
  });

  it('is an error when the browser could not store what Drive brought', async () => {
    const lost = restoreOf({ games: null as never, cards: null as never, studies: null as never });
    renderSync({ run: vi.fn(() => Promise.resolve(report({ restore: lost }))) });
    await userEvent.click(await syncButton());
    expect((await screen.findByRole('alert')).textContent).toContain("n'ont pas pu être écrites");
  });

  it('is not an error when only the training progress could not be stored', async () => {
    const half = restoreOf({ cards: null as never });
    renderSync({ run: vi.fn(() => Promise.resolve(report({ restore: half }))) });
    await userEvent.click(await syncButton());
    await screen.findByText(/progression d'entraînement n'a pas pu être écrite/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers to reload when settings were restored', async () => {
    const { reload } = renderSync({
      run: vi.fn(() => Promise.resolve(report({ restore: restoreOf({ preferencesApplied: 2 }) }))),
    });
    await userEvent.click(await syncButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Recharger' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not offer to reload otherwise', async () => {
    renderSync();
    await userEvent.click(await syncButton());
    await screen.findByText(/Copie envoyée/);
    expect(screen.queryByRole('button', { name: 'Recharger' })).toBeNull();
  });

  it('offers to try again when the Google script did not load', async () => {
    const loadScript = vi.fn().mockRejectedValueOnce(new Error('blocked')).mockResolvedValue(undefined);
    const { run } = renderSync({ loadScript });
    await userEvent.click(await screen.findByRole('button', { name: 'Réessayer de charger Google' }));
    expect(await screen.findByText(/Google est prêt/)).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
    await userEvent.click(await syncButton());
    await screen.findByText(/Copie envoyée/);
    expect(loadScript).toHaveBeenCalledTimes(2);
  });

  it('says so when the script still does not load', async () => {
    renderSync({ loadScript: vi.fn().mockRejectedValue(new Error('blocked')) });
    await userEvent.click(await screen.findByRole('button', { name: 'Réessayer de charger Google' }));
    expect((await screen.findByRole('alert')).textContent).toContain('La synchronisation avec Google Drive a échoué.');
    expect(
      ((await screen.findByRole('button', { name: 'Réessayer de charger Google' })) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('links to the privacy policy, in another tab', () => {
    renderSync();
    const link = screen.getByRole('link', { name: 'Règles de confidentialité' });
    expect(link.getAttribute('href')).toMatch(/\/confidentialite\.html$/);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('says what the copy is: private, not encrypted', () => {
    renderSync();
    expect(screen.getByText(/non chiffré/)).toBeTruthy();
  });
});

describe('DriveSync, automatic sync', () => {
  it('offers the setting only once a first sync worked', async () => {
    renderSync();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(await syncButton());
    await screen.findByText(/Copie envoyée/);
    expect(autoBox().checked).toBe(false);
  });

  it('is offered at once to someone who synced before', () => {
    localStorage.setItem('chess_drive_last_sync', '1000');
    renderSync();
    expect(autoBox().checked).toBe(false);
  });

  it('turning it on is remembered and syncs soon; turning it off stops it', async () => {
    localStorage.setItem('chess_drive_last_sync', '1000');
    const { manager } = renderSync();
    await userEvent.click(autoBox());
    expect(manager.getStatus().enabled).toBe(true);
    expect(localStorage.getItem(AUTO_SYNC_KEY)).toBe('1');
    expect(autoBox().checked).toBe(true);
    expect(screen.getByText('Changement détecté : synchronisation dans un instant.')).toBeTruthy();
    await userEvent.click(autoBox());
    expect(manager.getStatus().enabled).toBe(false);
    expect(localStorage.getItem(AUTO_SYNC_KEY)).toBeNull();
    expect(screen.queryByText(/synchronisation dans un instant/)).toBeNull();
  });

  it('shows no state line while it is off', () => {
    localStorage.setItem('chess_drive_last_sync', '1000');
    renderSync();
    expect(screen.queryByText('À jour.')).toBeNull();
  });

  it('says what it does: opening, after each game, deletions included', () => {
    localStorage.setItem('chess_drive_last_sync', '1000');
    renderSync();
    expect(
      screen.getByText(/À l'ouverture de l'application, puis après chaque partie ajoutée ou supprimée/)
    ).toBeTruthy();
    expect(screen.getByText(/Les suppressions sont synchronisées aussi/)).toBeTruthy();
  });

  it('asks to sign in again, and a click does it', async () => {
    localStorage.setItem('chess_drive_last_sync', '1000');
    localStorage.setItem(AUTO_SYNC_KEY, '1');
    const run = vi
      .fn<DriveSyncManagerDeps['run']>()
      .mockRejectedValueOnce(new AuthError('interaction', 'x'))
      .mockResolvedValue(report());
    const { manager } = renderSync({ run });
    await act(async () => {
      await manager.syncNow().catch(() => {});
    });
    expect(screen.getByText('Google demande de vous reconnecter.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Se reconnecter' }));
    await waitFor(() => expect(screen.getByText('À jour.')).toBeTruthy());
    expect(run.mock.calls[1][1]).toBe(true);
  });

  it('shows an error with a way to try again', async () => {
    localStorage.setItem('chess_drive_last_sync', '1000');
    localStorage.setItem(AUTO_SYNC_KEY, '1');
    const run = vi
      .fn<DriveSyncManagerDeps['run']>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(report());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { manager } = renderSync({ run });
    await act(async () => {
      await manager.syncNow().catch(() => {});
    });
    expect(screen.getAllByRole('alert').some((el) => /a échoué/.test(el.textContent ?? ''))).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByText('À jour.')).toBeTruthy());
  });
});

describe('DataBackup with Google Drive', () => {
  it('shows the Drive part next to the file export, and refreshes the history after a sync', async () => {
    const onRestored = vi.fn();
    const { manager } = makeManager();
    render(<DataBackup onRestored={onRestored} drive={{ manager }} />);
    expect(screen.getByRole('button', { name: 'Exporter mes données' })).toBeTruthy();
    await userEvent.click(await syncButton());
    await screen.findByText(/Copie envoyée/);
    expect(onRestored).toHaveBeenCalledTimes(1);
  });
});
