import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Menu as MenuIcon } from 'lucide-react';
import type { NavItem, NavSection } from './navigation';

interface AppMenuProps {
  /** The tree of the app: every group is shown open, so a view is one tap away. */
  sections: NavSection[];
  /** Accessible name of the button. */
  label?: string;
}

/**
 * The burger menu, for the screens too small for the side panel: one button that opens the whole tree of the app
 * (the groups are headings, never something to open). It follows the menu button pattern: the first entry takes
 * the focus when it opens, the arrows, Home and End move between the entries, Escape closes it and gives the focus
 * back to the button, and so does a click outside or Tab.
 */
export const AppMenu: React.FC<AppMenuProps> = ({ sections, label = 'Menu' }) => {
  const items = sections.flatMap((section) => section.items);
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const entryRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    entryRefs.current[0]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  const focusEntry = (index: number) => {
    const count = items.length;
    entryRefs.current[((index % count) + count) % count]?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const current = entryRefs.current.findIndex((el) => el === document.activeElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusEntry(current + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusEntry(current - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusEntry(0);
        break;
      case 'End':
        e.preventDefault();
        focusEntry(items.length - 1);
        break;
      case 'Escape':
        // The dialogs and the board also listen to Escape: this one is the menu's
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  const select = (item: NavItem) => {
    if (item.checked !== undefined) {
      item.onSelect();
      return;
    }
    // The focus goes back to the button first: a dialog opened by the entry returns the focus to it when it closes
    close(true);
    item.onSelect();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !isOpen) {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={label}
        title="Mes parties, puzzles, ouvertures, finales, études…"
        className={`p-2 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
          isOpen
            ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200'
            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
        }`}
      >
        <MenuIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-indigo-400" aria-hidden="true" />
        <span className="hidden sm:inline ml-1">{label}</span>
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full mt-2 z-50 w-72 max-w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/40 p-1.5 flex flex-col"
        >
          {sections.map((section, sectionIndex) => (
            <div
              key={section.id}
              role="group"
              aria-labelledby={`${menuId}-${section.id}`}
              className={sectionIndex > 0 ? 'mt-1 pt-1 border-t border-slate-800' : undefined}
            >
              <div
                id={`${menuId}-${section.id}`}
                className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400"
              >
                {section.label}
              </div>
              {section.items.map((item) => {
                const index = items.indexOf(item);
                return (
                  <button
                    key={item.id}
                    ref={(el) => {
                      entryRefs.current[index] = el;
                    }}
                    type="button"
                    role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                    aria-checked={item.checked}
                    tabIndex={-1}
                    title={item.hint}
                    onClick={() => select(item)}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left cursor-pointer hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    <span className="shrink-0 text-indigo-400" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 text-xs font-semibold text-slate-100">{item.label}</span>
                    {item.checked !== undefined && (
                      <span
                        aria-hidden="true"
                        className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          item.checked ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {item.checked ? 'Oui' : 'Non'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
