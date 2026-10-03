import React from 'react';
import type { NavSection } from './navigation';

interface AppSidebarProps {
  sections: NavSection[];
}

/**
 * The side panel of the large screens: the whole tree of the app, always open, so that no view is behind a click
 * to open a menu, a window or a tab. (Below that size the same tree is in the burger menu of the header.)
 */
export const AppSidebar: React.FC<AppSidebarProps> = ({ sections }) => (
  <nav
    aria-label="Navigation principale"
    className="hidden xl:flex flex-col gap-4 w-56 shrink-0 sticky top-[3.75rem] h-[calc(100dvh-3.75rem)] self-start overflow-y-auto overscroll-contain border-r border-slate-800/80 bg-slate-900/40 px-3 py-4"
  >
    {sections.map((section) => (
      <section key={section.id} aria-labelledby={`sidebar-${section.id}`} className="flex flex-col gap-0.5">
        <h2
          id={`sidebar-${section.id}`}
          className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400"
        >
          {section.label}
        </h2>
        <ul className="flex flex-col gap-0.5">
          {section.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role={item.checked === undefined ? undefined : 'switch'}
                aria-checked={item.checked}
                title={item.hint}
                onClick={item.onSelect}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left cursor-pointer text-slate-200 hover:bg-slate-800 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                <span className="shrink-0 text-indigo-400" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 text-xs font-medium">{item.label}</span>
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
            </li>
          ))}
        </ul>
      </section>
    ))}
  </nav>
);
