import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, User } from 'lucide-react';

interface PseudoEditorProps {
  pseudo: string;
  onChange: (pseudo: string) => void;
}

const MAX_PSEUDO_LENGTH = 40;

/** The player's pseudo in the header; a click opens a small inline form (no blocking `window.prompt`). */
export const PseudoEditor: React.FC<PseudoEditorProps> = ({ pseudo, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(pseudo);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const open = () => {
    setDraft(pseudo);
    setIsOpen(true);
  };
  const close = (restoreFocus = true) => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isOpen]);

  // A click anywhere else closes the form, without saving
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onChange(draft.trim());
    close();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => (isOpen ? close(false) : open())}
        aria-expanded={isOpen}
        aria-label={`Pseudo du joueur : ${pseudo || 'non renseigné'}. Modifier`}
        className="flex items-center gap-1 p-1.5 sm:p-0 font-bold text-white hover:text-indigo-300 transition-colors cursor-pointer text-[11px]"
        title="Cliquer pour changer de pseudo"
      >
        <User className="w-4 h-4 sm:w-3 sm:h-3 text-indigo-400 shrink-0" />
        <span className="hidden sm:inline max-w-[110px] truncate">{pseudo || 'Pseudo'}</span>
      </button>

      {isOpen && (
        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
          aria-label="Modifier le pseudo"
          className="absolute right-0 top-full mt-3 z-50 w-64 max-w-[calc(100vw-1.5rem)] p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col gap-2"
        >
          <label htmlFor={inputId} className="text-[11px] font-semibold text-slate-300">
            Votre pseudo dans la partie
          </label>
          <input
            id={inputId}
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_PSEUDO_LENGTH}
            autoComplete="nickname"
            placeholder="Pseudo Chess.com / Lichess"
            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <p className="text-[11px] text-slate-400">Il sert à reconnaître votre couleur dans le PGN.</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => close()}
              className="px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Enregistrer
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
