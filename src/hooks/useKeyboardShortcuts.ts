import { useEffect, useRef } from 'react';

export interface KeyboardShortcutHandlers {
  onStart: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEnd: () => void;
  onPrevError: () => void;
  onNextError: () => void;
  onTogglePlay: () => void;
  onFlip: () => void;
  onToggleAnnotations: () => void;
  onToggleSound: () => void;
  onToggleAlternative: () => void;
  onCycleHeatmap: () => void;
  /** `?`: show the list of shortcuts. */
  onHelp: () => void;
  /** Escape: return true when something was closed (prevents the default action). */
  onEscape: () => boolean;
}

const GRID_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ', 'Spacebar'];
const ACTIVATION_KEYS = ['Enter', ' ', 'Spacebar'];

/**
 * Whether a key press belongs to the focused element rather than to the global shortcuts:
 * - form fields and dialogs keep all their keys;
 * - buttons, links and other controls keep Space and Enter (pressing Space on a focused button must
 *   activate it, not toggle auto-play);
 * - the board grid keeps the arrows, Home/End, Enter and Space to move between squares and play.
 */
export function shouldIgnoreShortcut(target: EventTarget | null, key: string, shiftKey = false): boolean {
  if (!(target instanceof Element)) return false;

  if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return true;

  if (ACTIVATION_KEYS.includes(key) && target.closest('button, a[href], summary, [role="button"], [role="tab"]')) {
    return true;
  }

  return !shiftKey && GRID_KEYS.includes(key) && target.closest('[role="grid"]') !== null;
}

/**
 * Global keyboard navigation. Disabled while typing in a field or when `enabled` is false.
 * Handlers are read through a ref so the listener is only registered once.
 */
export function useKeyboardShortcuts(enabled: boolean, handlers: KeyboardShortcutHandlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e.target, e.key, e.shiftKey)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // Keep browser shortcuts (Ctrl+F…)

      const h = handlersRef.current;
      const run = (action: () => void) => {
        e.preventDefault();
        action();
      };

      if (e.shiftKey && e.key === 'ArrowLeft') return run(h.onPrevError);
      if (e.shiftKey && e.key === 'ArrowRight') return run(h.onNextError);

      switch (e.key) {
        case 'Escape':
          if (h.onEscape()) e.preventDefault();
          return;
        case 'ArrowLeft':
          return run(h.onPrev);
        case 'ArrowRight':
          return run(h.onNext);
        case 'ArrowUp':
          return run(h.onStart);
        case 'ArrowDown':
          return run(h.onEnd);
        case ' ':
        case 'Spacebar':
          return run(h.onTogglePlay);
      }

      switch (e.key.toLowerCase()) {
        case 'f':
          return run(h.onFlip);
        case 'e':
          return run(h.onToggleAnnotations);
        case 'm':
          return run(h.onToggleSound);
        case 'a':
          return run(h.onToggleAlternative);
        case 'h':
          return run(h.onCycleHeatmap);
        case '?':
          return run(h.onHelp);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
