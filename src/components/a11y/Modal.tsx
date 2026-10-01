import React, { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  /** Accessible name of the dialog. */
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Classes of the dialog panel. */
  className?: string;
}

/**
 * Modal dialog: announced as a dialog, the focus moves into it and stays there (Tab cycles), Escape closes
 * it, and the focus goes back to the element that opened it. The page behind is hidden from assistive
 * technology while it is open.
 */
export const Modal: React.FC<ModalProps> = ({ title, onClose, children, className }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const opener = document.activeElement as HTMLElement | null;

    // Initial focus: the first control, or the panel itself
    (panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();

    // Hide the rest of the page while the dialog is open
    const hidden: Array<[HTMLElement, string | null]> = [];
    for (const sibling of Array.from(panel.parentElement?.parentElement?.children ?? [])) {
      if (sibling !== panel.parentElement && sibling instanceof HTMLElement) {
        hidden.push([sibling, sibling.getAttribute('aria-hidden')]);
        sibling.setAttribute('aria-hidden', 'true');
        sibling.inert = true;
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      for (const [element, previous] of hidden) {
        if (previous === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', previous);
        element.inert = false;
      }
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={className}>
        {children}
      </div>
    </div>
  );
};
