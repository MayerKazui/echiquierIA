// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardHelp, SHORTCUT_GROUPS } from './KeyboardHelp';
import { LiveRegion, useAnnouncer } from './LiveRegion';
import { Modal } from './Modal';

function ModalPage({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <div id="root-content">
        <button onClick={() => setOpen(true)}>Ouvrir</button>
        <a href="#x">Lien</a>
      </div>
      {open && (
        <Modal
          title="Ma fenêtre"
          onClose={() => {
            setOpen(false);
            onClose();
          }}
        >
          <button>Premier</button>
          <input aria-label="Champ" />
          <button>Dernier</button>
        </Modal>
      )}
    </div>
  );
}

describe('Modal', () => {
  it('is a named modal dialog and moves the focus inside', async () => {
    const user = userEvent.setup();
    render(<ModalPage />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const dialog = screen.getByRole('dialog', { name: 'Ma fenêtre' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Premier' }));
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<ModalPage />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const first = screen.getByRole('button', { name: 'Premier' });
    const last = screen.getByRole('button', { name: 'Dernier' });

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Champ' }));
    await user.tab();
    expect(document.activeElement).toBe(last);
    await user.tab(); // wraps to the first control
    expect(document.activeElement).toBe(first);
    await user.tab({ shift: true }); // and back to the last one
    expect(document.activeElement).toBe(last);
  });

  it('closes with Escape and gives the focus back to the opener', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ModalPage onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('hides the page behind it from assistive technology, then restores it', async () => {
    const user = userEvent.setup();
    render(<ModalPage />);
    const behind = document.getElementById('root-content')!;
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(behind.getAttribute('aria-hidden')).toBe('true');
    expect(behind.inert).toBe(true);
    await user.keyboard('{Escape}');
    expect(behind.hasAttribute('aria-hidden')).toBe(false);
    expect(behind.inert).toBe(false);
  });
});

describe('LiveRegion', () => {
  function Announcer() {
    const { announcement, announce } = useAnnouncer();
    return (
      <>
        <button onClick={() => announce('Coup 1, Blancs : e4')}>Annoncer</button>
        <LiveRegion announcement={announcement} />
      </>
    );
  }

  it('is a polite, atomic status region that starts empty', () => {
    render(<Announcer />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.textContent).toBe('');
  });

  it('shows the announcement, and changes the content when the same sentence is announced twice', async () => {
    const user = userEvent.setup();
    render(<Announcer />);
    const region = screen.getByRole('status');
    await user.click(screen.getByRole('button'));
    const first = region.textContent;
    expect(first).toContain('Coup 1, Blancs : e4');
    await user.click(screen.getByRole('button'));
    expect(region.textContent).toContain('Coup 1, Blancs : e4');
    expect(region.textContent).not.toBe(first); // screen readers re-read it
  });

  it('does not announce anything by itself when re-rendered', () => {
    const { rerender } = render(<Announcer />);
    act(() => rerender(<Announcer />));
    expect(screen.getByRole('status').textContent).toBe('');
  });
});

describe('KeyboardHelp', () => {
  it('lists every group of shortcuts in a dialog that Escape closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<KeyboardHelp onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Raccourcis clavier' })).toBeTruthy();
    for (const group of SHORTCUT_GROUPS) {
      expect(screen.getByRole('heading', { name: group.title })).toBeTruthy();
    }
    expect(screen.getAllByText('Espace').length).toBeGreaterThan(0);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('documents the board keys and the help key', () => {
    const actions = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts.map((s) => s.action)).join(' | ');
    expect(actions).toContain('case en case');
    expect(actions).toContain('Afficher cette aide');
  });

  it('closes with its close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<KeyboardHelp onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: "Fermer l'aide" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
