// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutHandlers, shouldIgnoreShortcut, useKeyboardShortcuts } from './useKeyboardShortcuts';

beforeEach(() => {
  document.body.innerHTML = '';
});

function element(html: string, selector: string): Element {
  document.body.innerHTML = html;
  return document.querySelector(selector)!;
}

describe('shouldIgnoreShortcut', () => {
  it('never ignores a key pressed outside of any control', () => {
    expect(shouldIgnoreShortcut(document.body, 'ArrowRight')).toBe(false);
    expect(shouldIgnoreShortcut(document.body, ' ')).toBe(false);
    expect(shouldIgnoreShortcut(null, ' ')).toBe(false);
  });

  it('leaves every key to form fields and dialogs', () => {
    for (const [html, selector] of [
      ['<input id="x">', '#x'],
      ['<textarea id="x"></textarea>', '#x'],
      ['<select id="x"></select>', '#x'],
      ['<div role="dialog"><button id="x">ok</button></div>', '#x'],
    ]) {
      const target = element(html, selector);
      expect(shouldIgnoreShortcut(target, 'f'), html).toBe(true);
      expect(shouldIgnoreShortcut(target, 'ArrowLeft'), html).toBe(true);
    }
  });

  it('leaves Space and Enter to a focused button or link, but keeps the other shortcuts', () => {
    const button = element('<button id="x"><svg></svg>Lecture</button>', '#x');
    expect(shouldIgnoreShortcut(button, ' ')).toBe(true);
    expect(shouldIgnoreShortcut(button, 'Enter')).toBe(true);
    expect(shouldIgnoreShortcut(button, 'ArrowRight')).toBe(false);
    expect(shouldIgnoreShortcut(button, 'f')).toBe(false);

    const link = element('<a id="x" href="#main">Aller</a>', '#x');
    expect(shouldIgnoreShortcut(link, ' ')).toBe(true);
  });

  it('leaves the arrows, Home/End, Enter and Space to the board grid', () => {
    const cell = element(
      '<div role="grid"><div role="row"><div role="gridcell" id="x" tabindex="0"></div></div></div>',
      '#x'
    );
    for (const key of ['ArrowUp', 'ArrowLeft', 'Home', 'End', 'Enter', ' ']) {
      expect(shouldIgnoreShortcut(cell, key), key).toBe(true);
    }
    // Shift + arrows (jump between errors) and letter shortcuts still work from the board
    expect(shouldIgnoreShortcut(cell, 'ArrowRight', true)).toBe(false);
    expect(shouldIgnoreShortcut(cell, 'f')).toBe(false);
    expect(shouldIgnoreShortcut(cell, 'Escape')).toBe(false);
  });
});

function handlers(): KeyboardShortcutHandlers {
  return {
    onStart: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onEnd: vi.fn(),
    onPrevError: vi.fn(),
    onNextError: vi.fn(),
    onTogglePlay: vi.fn(),
    onFlip: vi.fn(),
    onToggleAnnotations: vi.fn(),
    onToggleSound: vi.fn(),
    onToggleAlternative: vi.fn(),
    onCycleHeatmap: vi.fn(),
    onHelp: vi.fn(),
    onEscape: vi.fn(() => false),
  };
}

function Host({ enabled, h }: { enabled: boolean; h: KeyboardShortcutHandlers }) {
  useKeyboardShortcuts(enabled, h);
  return (
    <div>
      <button>Bouton</button>
      <div role="grid">
        <div role="row">
          <div role="gridcell" tabIndex={0} aria-label="e4">
            case
          </div>
        </div>
      </div>
    </div>
  );
}

describe('useKeyboardShortcuts', () => {
  it('runs the shortcuts from anywhere on the page', () => {
    const h = handlers();
    render(<Host enabled h={h} />);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: 'f' });
    expect(h.onNext).toHaveBeenCalledOnce();
    expect(h.onTogglePlay).toHaveBeenCalledOnce();
    expect(h.onFlip).toHaveBeenCalledOnce();
  });

  it('opens the shortcut help with ?', () => {
    const h = handlers();
    render(<Host enabled h={h} />);
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
    expect(h.onHelp).toHaveBeenCalledOnce();
  });

  it('does not toggle auto-play when Space is pressed on a focused button', () => {
    const h = handlers();
    const { getByRole } = render(<Host enabled h={h} />);
    const prevented = !fireEvent.keyDown(getByRole('button'), { key: ' ' });
    expect(h.onTogglePlay).not.toHaveBeenCalled();
    expect(prevented).toBe(false); // the browser can still activate the button
  });

  it('does not navigate the game with the arrows while a board square has the focus', () => {
    const h = handlers();
    const { getByRole } = render(<Host enabled h={h} />);
    fireEvent.keyDown(getByRole('gridcell'), { key: 'ArrowRight' });
    expect(h.onNext).not.toHaveBeenCalled();
    fireEvent.keyDown(getByRole('gridcell'), { key: 'ArrowRight', shiftKey: true });
    expect(h.onNextError).toHaveBeenCalledOnce();
  });

  it('keeps browser shortcuts (Ctrl+F) and does nothing when disabled', () => {
    const h = handlers();
    const { rerender } = render(<Host enabled h={h} />);
    const prevented = !fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true });
    expect(prevented).toBe(false);
    expect(h.onFlip).not.toHaveBeenCalled();

    rerender(<Host enabled={false} h={h} />);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(h.onNext).not.toHaveBeenCalled();
  });

  it('closes the exploration with Escape only when there is one', () => {
    const h = handlers();
    (h.onEscape as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    render(<Host enabled h={h} />);
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(false); // handled: default prevented
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true);
    expect(h.onEscape).toHaveBeenCalledTimes(2);
  });
});
