import React, { useId, useMemo, useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import {
  annotatedPgnFileName,
  availableAnnotations,
  gameToAnnotatedPgn,
  type AnnotatedPgnOptions,
  type AnnotatedPgnSource,
} from '../../utils/annotatedPgn';
import { downloadTextFile } from '../../utils/download';

interface ExportPgnProps {
  game: AnnotatedPgnSource;
  onClose: () => void;
  /** Saves the file (the browser's download unless a test gives its own). */
  download?: typeof downloadTextFile;
  /** Puts the text in the clipboard; rejects when the browser refuses. */
  copy?: (text: string) => Promise<void>;
}

const CHOICES: ReadonlyArray<{ key: keyof AnnotatedPgnOptions; label: string; hint: string; missing: string }> = [
  {
    key: 'evals',
    label: 'Évaluations',
    hint: 'Le score du moteur après chaque coup, [%eval 0.34] ou [%eval #3] pour un mat.',
    missing: 'Aucune évaluation dans cette partie.',
  },
  {
    key: 'clocks',
    label: 'Pendules',
    hint: 'Le temps restant après chaque coup, [%clk 0:09:58].',
    missing: "Cette partie n'a pas de pendules.",
  },
  {
    key: 'glyphs',
    label: 'Symboles des coups',
    hint: 'Les marques !!, !, ?!, ? et ?? après les coups concernés.',
    missing: 'Aucun coup à marquer dans cette partie.',
  },
  {
    key: 'comments',
    label: 'Commentaires du coach',
    hint: 'Le verdict, le meilleur coup et, quand elle existe, l’explication.',
    missing: 'Aucun commentaire à écrire dans cette partie.',
  },
];

const BUTTON =
  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

const copyToClipboard = (text: string): Promise<void> =>
  navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('Clipboard unavailable'));

/**
 * Exports the analysed game as a PGN that carries the analysis (see `annotatedPgn`): saved as a file or copied, with
 * the kinds of annotation the player wants. Everything happens in the browser.
 */
export const ExportPgn: React.FC<ExportPgnProps> = ({
  game,
  onClose,
  download = downloadTextFile,
  copy = copyToClipboard,
}) => {
  const available = useMemo(() => availableAnnotations(game.result), [game.result]);
  const [options, setOptions] = useState<AnnotatedPgnOptions>(available);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const titleId = useId();

  const toggle = (key: keyof AnnotatedPgnOptions) => {
    setNotice(null);
    setOptions((current) => ({ ...current, [key]: !current[key] }));
  };
  const text = () => gameToAnnotatedPgn(game, options);

  const save = () => {
    download(annotatedPgnFileName(game.result), text(), 'application/x-chess-pgn');
    setNotice({ kind: 'success', text: 'Fichier PGN enregistré.' });
  };
  const copyText = () => {
    void copy(text()).then(
      () => setNotice({ kind: 'success', text: 'PGN copié dans le presse-papiers.' }),
      () =>
        setNotice({ kind: 'error', text: "Le navigateur a refusé la copie : utilisez l'enregistrement du fichier." })
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 max-w-lg w-full mx-auto">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <h2 id={titleId} className="text-base font-bold text-slate-100">
            Exporter la partie en PGN annoté
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Un fichier que l&apos;on peut rouvrir dans n&apos;importe quel logiciel d&apos;échecs. Tout se passe dans ce
            navigateur : rien n&apos;est envoyé nulle part.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="text-xs font-semibold text-slate-300 mb-1">Ce que le fichier contient</legend>
        {CHOICES.map(({ key, label, hint, missing }) => {
          const id = `${titleId}-${key}`;
          return (
            <div key={key} className="flex items-start gap-2.5">
              <input
                id={id}
                type="checkbox"
                checked={available[key] && options[key]}
                disabled={!available[key]}
                onChange={() => toggle(key)}
                aria-describedby={`${id}-hint`}
                className="mt-0.5 w-4 h-4 accent-indigo-500 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="flex flex-col gap-0.5">
                <label
                  htmlFor={id}
                  className={`text-sm font-medium cursor-pointer ${available[key] ? 'text-slate-100' : 'text-slate-500'}`}
                >
                  {label}
                </label>
                <span id={`${id}-hint`} className="text-[11px] text-slate-400">
                  {available[key] ? hint : missing}
                </span>
              </div>
            </div>
          );
        })}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} className={`${BUTTON} bg-indigo-600 hover:bg-indigo-500 text-white`}>
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Enregistrer le .pgn
        </button>
        <button
          type="button"
          onClick={copyText}
          className={`${BUTTON} bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200`}
        >
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          Copier le texte
        </button>
      </div>

      <p
        role="status"
        className={`min-h-4 flex items-center gap-1.5 text-xs ${
          notice?.kind === 'error' ? 'text-rose-300' : 'text-emerald-300'
        }`}
      >
        {notice?.kind === 'success' && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
        {notice?.text}
      </p>
    </div>
  );
};
