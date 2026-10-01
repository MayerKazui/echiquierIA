import React from 'react';
import { X } from 'lucide-react';
import { Modal } from './Modal';

interface Shortcut {
  keys: string[];
  action: string;
}

export const SHORTCUT_GROUPS: Array<{ title: string; shortcuts: Shortcut[] }> = [
  {
    title: 'Naviguer dans la partie',
    shortcuts: [
      { keys: ['←', '→'], action: 'Coup précédent / suivant' },
      { keys: ['↑', '↓'], action: 'Début / fin de la partie' },
      { keys: ['Maj', '←'], action: "Erreur précédente (et Maj + → pour l'erreur suivante)" },
      { keys: ['Espace'], action: 'Lecture automatique / pause' },
    ],
  },
  {
    title: 'Affichage',
    shortcuts: [
      { keys: ['F'], action: "Retourner l'échiquier" },
      { keys: ['E'], action: 'Afficher / masquer les annotations' },
      { keys: ['H'], action: "Contrôle de l'espace (les deux camps, Blancs, Noirs, désactivé)" },
      { keys: ['A'], action: 'Aperçu du meilleur coup' },
      { keys: ['M'], action: 'Son des coups' },
    ],
  },
  {
    title: "Sur l'échiquier (une case a le focus)",
    shortcuts: [
      { keys: ['←', '↑', '→', '↓'], action: 'Se déplacer de case en case' },
      { keys: ['Début', 'Fin'], action: 'Première / dernière case de la rangée' },
      {
        keys: ['Entrée', 'Espace'],
        action: 'Sélectionner une pièce, puis jouer sur la case voulue (exploration libre)',
      },
      { keys: ['Échap'], action: "Quitter l'exploration libre" },
      { keys: ['Tab'], action: "Sortir de l'échiquier" },
    ],
  },
  {
    title: 'Aide',
    shortcuts: [{ keys: ['?'], action: 'Afficher cette aide' }],
  },
];

/** Dialog listing every keyboard shortcut. */
export const KeyboardHelp: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Modal title="Raccourcis clavier" onClose={onClose} className="w-full max-w-xl">
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
        <h2 className="text-base font-bold text-white">Raccourcis clavier</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer l'aide"
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-5">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`shortcuts-${group.title}`}>
            <h3
              id={`shortcuts-${group.title}`}
              className="text-xs font-bold uppercase tracking-wider text-indigo-300 mb-2"
            >
              {group.title}
            </h3>
            <dl className="flex flex-col gap-1.5">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.action} className="flex items-start justify-between gap-3 text-xs">
                  <dd className="text-slate-300 order-1 flex-1">{shortcut.action}</dd>
                  <dt className="order-2 flex items-center gap-1 shrink-0">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="px-1.5 py-0.5 rounded border border-slate-600 bg-slate-950 text-slate-200 font-mono text-[11px]"
                      >
                        {key}
                      </kbd>
                    ))}
                  </dt>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  </Modal>
);
