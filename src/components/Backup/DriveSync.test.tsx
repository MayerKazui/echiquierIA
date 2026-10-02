// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveSyncReport } from '../../services/driveSync';
import { DriveSync, describeSync } from './DriveSync';
import { DataBackup } from './DataBackup';

const restoreOf = (over: Partial<NonNullable<DriveSyncReport['restore']>> = {}) => ({
  games: { added: 0, replaced: 0, kept: 0, trimmed: 0 },
  cards: { added: 0, replaced: 0, kept: 0 },
  preferencesApplied: 0,
  ...over,
});

const report = (over: Partial<DriveSyncReport> = {}): DriveSyncReport => ({
  restore: restoreOf({ games: { added: 2, replaced: 0, kept: 0, trimmed: 0 } }),
  rejected: { games: 0, cards: 0 },
  sent: { games: 3, cards: 1, bytes: 20_480 },
  ...over,
});

function renderSync(props: Partial<React.ComponentProps<typeof DriveSync>> = {}) {
  const handlers = {
    onRestored: vi.fn(),
    reload: vi.fn(),
    loadScript: vi.fn(() => Promise.resolve()),
    sync: vi.fn(() => Promise.resolve(report())),
  };
  render(<DriveSync clientId="client-id" {...handlers} {...props} />);
  return handlers;
}

const syncButton = () => screen.findByRole('button', { name: 'Synchroniser avec Google Drive' });

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

  it('never shows a size of 0 Ko', () => {
    expect(describeSync(report({ sent: { games: 0, cards: 1, bytes: 100 } }))).toContain('(1 Ko)');
  });
});

describe('DriveSync', () => {
  it('is not offered without a client ID', () => {
    const { loadScript } = renderSync({ clientId: undefined });
    expect(screen.queryByRole('button')).toBeNull();
    expect(loadScript).not.toHaveBeenCalled();
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
    const { sync, onRestored } = renderSync();
    await userEvent.click(await syncButton());
    expect(await screen.findByText(/2 parties ajoutées/)).toBeTruthy();
    expect(screen.getByText(/Copie envoyée : 3 parties/)).toBeTruthy();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it('reuses the same sign-in for the next sync', async () => {
    const sync = vi.fn((tokens: unknown) => {
      void tokens;
      return Promise.resolve(report());
    });
    renderSync({ sync });
    await userEvent.click(await syncButton());
    await screen.findByText(/Copie envoyée/);
    await userEvent.click(await syncButton());
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
    expect(sync.mock.calls[1][0]).toBe(sync.mock.calls[0][0]);
  });

  it('does not refresh the history when Drive had no copy', async () => {
    const { onRestored } = renderSync({ sync: vi.fn(() => Promise.resolve(report({ restore: null }))) });
    await userEvent.click(await syncButton());
    await screen.findByText(/pas encore de copie/);
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('is disabled while it runs, and says so', async () => {
    let finish: (value: DriveSyncReport) => void = () => {};
    renderSync({ sync: vi.fn(() => new Promise<DriveSyncReport>((resolve) => (finish = resolve))) });
    await userEvent.click(await syncButton());
    expect(await screen.findByText('Synchronisation avec Google Drive…')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Synchroniser avec Google Drive' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    finish(report());
    await screen.findByText(/Copie envoyée/);
    expect((screen.getByRole('button', { name: 'Synchroniser avec Google Drive' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('remembers the date of the last sync', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 2, 12, 0));
    renderSync();
    expect(screen.queryByText(/Dernière synchronisation/)).toBeNull();
    await userEvent.click(await syncButton());
    expect(await screen.findByText(/Dernière synchronisation : 2 octobre 2026/)).toBeTruthy();
    expect(localStorage.getItem('chess_drive_last_sync')).toBe(String(Date.UTC(2026, 9, 2, 12, 0)));
    vi.restoreAllMocks();
  });

  it('shows the date of an earlier sync at once', () => {
    localStorage.setItem('chess_drive_last_sync', String(Date.UTC(2026, 0, 15, 9, 30)));
    renderSync();
    expect(screen.getByText(/Dernière synchronisation : 15 janvier 2026/)).toBeTruthy();
  });

  it('ignores a date that is not one', () => {
    localStorage.setItem('chess_drive_last_sync', 'abc');
    renderSync();
    expect(screen.queryByText(/Dernière synchronisation/)).toBeNull();
  });

  it('shows the failure and leaves the date and the history alone', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { onRestored } = renderSync({ sync: vi.fn(() => Promise.reject(new Error('boom'))) });
    await userEvent.click(await syncButton());
    expect((await screen.findByRole('alert')).textContent).toContain('La synchronisation avec Google Drive a échoué.');
    expect(onRestored).not.toHaveBeenCalled();
    expect(localStorage.getItem('chess_drive_last_sync')).toBeNull();
    error.mockRestore();
  });

  it('is an error when the browser could not store what Drive brought', async () => {
    const lost = restoreOf({ games: null as never, cards: null as never });
    renderSync({ sync: vi.fn(() => Promise.resolve(report({ restore: lost }))) });
    await userEvent.click(await syncButton());
    expect((await screen.findByRole('alert')).textContent).toContain("n'ont pas pu être écrites");
  });

  it('is not an error when only the training progress could not be stored', async () => {
    const half = restoreOf({ cards: null as never });
    renderSync({ sync: vi.fn(() => Promise.resolve(report({ restore: half }))) });
    await userEvent.click(await syncButton());
    await screen.findByText(/progression d'entraînement n'a pas pu être écrite/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers to reload when settings were restored', async () => {
    const { reload } = renderSync({
      sync: vi.fn(() => Promise.resolve(report({ restore: restoreOf({ preferencesApplied: 2 }) }))),
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
    const { sync } = renderSync({ loadScript });
    await userEvent.click(await screen.findByRole('button', { name: 'Réessayer de charger Google' }));
    expect(await screen.findByText(/Google est prêt/)).toBeTruthy();
    expect(sync).not.toHaveBeenCalled();
    await userEvent.click(await syncButton());
    await screen.findByText(/Copie envoyée/);
    expect(loadScript).toHaveBeenCalledTimes(2);
  });

  it('says so when the script still does not load', async () => {
    const loadScript = vi.fn().mockRejectedValue(new Error('blocked'));
    renderSync({ loadScript });
    await userEvent.click(await screen.findByRole('button', { name: 'Réessayer de charger Google' }));
    expect((await screen.findByRole('alert')).textContent).toContain('La synchronisation avec Google Drive a échoué.');
    expect((screen.getByRole('button', { name: 'Réessayer de charger Google' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('links to the privacy policy, in another tab', () => {
    renderSync();
    const link = screen.getByRole('link', { name: 'Règles de confidentialité' });
    expect(link.getAttribute('href')).toMatch(/\/confidentialite\.html$/);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('says what the copy is: private, not encrypted, deletions not synced', () => {
    renderSync();
    expect(screen.getByText(/non chiffré/)).toBeTruthy();
    expect(screen.getByText(/suppressions ne sont pas synchronisées/)).toBeTruthy();
  });
});

describe('DataBackup with Google Drive', () => {
  it('shows the Drive part next to the file export, and refreshes the history after a sync', async () => {
    const onRestored = vi.fn();
    const sync = vi.fn(() => Promise.resolve(report()));
    render(
      <DataBackup onRestored={onRestored} drive={{ clientId: 'id', loadScript: () => Promise.resolve(), sync }} />
    );
    expect(screen.getByRole('button', { name: 'Exporter mes données' })).toBeTruthy();
    await userEvent.click(await syncButton());
    await screen.findByText(/Copie envoyée/);
    expect(onRestored).toHaveBeenCalledTimes(1);
  });
});
