import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { useRepertoire } from '../../hooks/useRepertoire';
import { toFrenchOpeningName } from '../../utils/openingNames';
import type { Family, RecurringExit } from '../../utils/openingRepertoire';
import {
  BOOK_PLIES,
  COSTLY_EXIT,
  MIN_ACCURACY_GAMES,
  MIN_RECURRENCE,
  accuracyExtremes,
} from '../../utils/openingRepertoire';
import { SECONDARY, TallyBar, numberedAt } from './shared';

interface OpeningRepertoireProps {
  /** Shows the position before a way out of the book in the explorer. */
  onShowLine: (line: string[]) => void;
  /** Opens the import of online games (offered while there is nothing to count). */
  onImport: () => void;
}

type Color = 'w' | 'b';

const COLORS: Array<{ value: Color; label: string }> = [
  { value: 'w', label: 'Avec les Blancs' },
  { value: 'b', label: 'Avec les Noirs' },
];

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
/** "0,5 point", "6 points": the French singular goes up to 2. */
const points = (n: number) => `${decimal.format(n)} point${n >= 2 ? 's' : ''}`;
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
/** "78 %" for an accuracy given on 100. */
const accuracyText = (accuracy: number) => percent.format(accuracy / 100);

/** Said once the family is known: "Sans ouverture reconnue" for the games that never reached a named line. */
const labelOf = (name: string) => (name ? toFrenchOpeningName(name) : 'Sans ouverture reconnue');

/** How the accuracy of an opening compares with the player's own average (said once there are enough games). */
function compareText(accuracy: number, baseline: number): { text: string; tone: string } {
  const gap = Math.round(accuracy) - Math.round(baseline);
  if (gap === 0) return { text: `comme votre moyenne (${accuracyText(baseline)})`, tone: 'text-slate-400' };
  return {
    text: `${points(Math.abs(gap))} de ${gap > 0 ? 'plus' : 'moins'} que votre moyenne (${accuracyText(baseline)})`,
    tone: gap > 0 ? 'text-emerald-300' : 'text-rose-300',
  };
}

function AccuracySummary({ family, baseline }: { family: Family; baseline: number | null }) {
  if (family.accuracy === null) return null;
  const compared =
    baseline !== null && family.tally.games >= MIN_ACCURACY_GAMES ? compareText(family.accuracy, baseline) : null;
  return (
    <p className="text-[11px] text-slate-400">
      Précision <span className="font-semibold text-slate-200">{accuracyText(family.accuracy)}</span>
      {compared && (
        <>
          {' : '}
          <span className={compared.tone}>{compared.text}</span>
        </>
      )}
      .
    </p>
  );
}

function ExitSummary({ family }: { family: Family }) {
  const { player, opponent, none } = family.exits;
  return (
    <p className="text-[11px] text-slate-400">
      Vous quittez la théorie en premier dans {plural(player, 'partie', 'parties')}, l&apos;adversaire dans {opponent}
      {none > 0 &&
        ` ; ${plural(none, 'partie reste', 'parties restent')} dans le livre jusqu'au demi-coup ${BOOK_PLIES}`}
      .
    </p>
  );
}

function Recurring({ exit, color, onShow }: { exit: RecurringExit; color: Color; onShow: () => void }) {
  const move = numberedAt(exit.moveNumber, color === 'w', exit.san);
  return (
    <li
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 text-xs ${
        exit.isCostly ? 'border-amber-500/30 bg-amber-500/10' : 'border-slate-800 bg-slate-950/60'
      }`}
    >
      <span className="text-slate-300">
        {exit.count} fois, vous sortez de la théorie avec{' '}
        <span className="font-mono font-semibold text-slate-100">{move}</span>
        {' : '}
        {exit.isCostly ? (
          <span className="text-amber-300">ce coup coûte en moyenne {points(exit.loss)} de chances de gain</span>
        ) : (
          <span className="text-slate-400">il tient la position ({points(exit.loss)} de perte en moyenne)</span>
        )}
      </span>
      <button
        type="button"
        onClick={onShow}
        aria-label={`Voir dans l'explorateur la position avant ${move}`}
        className={`${SECONDARY} ml-auto px-2 py-1`}
      >
        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
        Voir la position
      </button>
    </li>
  );
}

function FamilyRow({
  family,
  color,
  baseline,
  onShowLine,
}: {
  family: Family;
  color: Color;
  baseline: number | null;
  onShowLine: (l: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const label = labelOf(family.name);
  const hasVariations = family.variations.length > 1 || (family.variations[0]?.name ?? '') !== family.name;
  return (
    <li className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">
            {family.eco && <span className="text-indigo-300 mr-1.5 text-xs">[{family.eco}]</span>}
            {label}
          </p>
        </div>
        <TallyBar tally={family.tally} />
      </div>

      <AccuracySummary family={family} baseline={baseline} />

      {family.tally.games > 0 && <ExitSummary family={family} />}

      {family.recurring.length > 0 && (
        <ul aria-label={`Sorties de la théorie récurrentes : ${label}`} className="flex flex-col gap-1.5">
          {family.recurring.map((exit) => (
            <Recurring
              key={`${exit.moveNumber}${exit.san}`}
              exit={exit}
              color={color}
              onShow={() => onShowLine(exit.line)}
            />
          ))}
        </ul>
      )}

      {hasVariations && (
        <>
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
            className="self-start inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-300 hover:text-indigo-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
          >
            {isOpen ? (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {isOpen ? 'Masquer' : 'Voir'} les variantes ({family.variations.length})
          </button>
          {isOpen && (
            <ul aria-label={`Variantes : ${label}`} className="flex flex-col gap-1">
              {family.variations.map((variation) => (
                <li
                  key={variation.name}
                  className="flex items-center justify-between gap-3 flex-wrap border-t border-slate-800/80 pt-1.5 text-xs"
                >
                  <span className="text-slate-300 min-w-0">
                    {variation.eco && <span className="text-indigo-300 mr-1">[{variation.eco}]</span>}
                    {labelOf(variation.name)}
                    {variation.accuracy !== null && (
                      <span className="ml-1.5 text-slate-400">précision {accuracyText(variation.accuracy)}</span>
                    )}
                  </span>
                  <TallyBar tally={variation.tally} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

/** "Mes ouvertures": the openings the player's games went through, how they ended and where the theory is left. */
export const OpeningRepertoire: React.FC<OpeningRepertoireProps> = ({ onShowLine, onImport }) => {
  const state = useRepertoire();
  const [chosen, setChosen] = useState<Color | null>(null);

  if (state.status === 'loading') {
    return (
      <p role="status" className="text-sm text-slate-400 py-8 text-center">
        Recherche de vos ouvertures…
      </p>
    );
  }

  const { repertoire } = state;
  if (repertoire.counted === 0) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-8 px-2">
        <p className="text-sm font-semibold text-slate-200">Aucune partie à compter</p>
        <p className="text-xs text-slate-400 max-w-md">
          Les ouvertures se lisent dans vos parties analysées où votre pseudo figure. Renseignez-le en haut de
          l&apos;écran, puis importez vos dernières parties : elles s&apos;analysent en arrière-plan.
          {repertoire.ignored > 0 &&
            ` (${plural(repertoire.ignored, 'partie enregistrée ne compte', 'parties enregistrées ne comptent')} pas : pseudo absent ou partie trop courte.)`}
        </p>
        <button type="button" onClick={onImport} className={SECONDARY}>
          Importer mes parties
        </button>
      </div>
    );
  }

  // The colour with the most games, until the player picks one
  const color: Color =
    chosen ??
    (repertoire.colors.w.reduce((n, f) => n + f.tally.games, 0) >=
    repertoire.colors.b.reduce((n, f) => n + f.tally.games, 0)
      ? 'w'
      : 'b');
  const families = repertoire.colors[color];
  const extremes = accuracyExtremes(families);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="group" aria-label="Couleur" className="flex flex-wrap items-center gap-1.5">
          {COLORS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={color === value}
              onClick={() => setChosen(value)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                color === value
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 ml-1">
          {plural(repertoire.counted, 'partie comptée', 'parties comptées')}
          {repertoire.ignored > 0 && ` · ${repertoire.ignored} laissée${repertoire.ignored > 1 ? 's' : ''} de côté`}
        </p>
      </div>

      {extremes && (
        <p className="text-xs text-slate-300">
          Ouverture la plus solide : <span className="font-semibold text-slate-100">{labelOf(extremes.best.name)}</span>{' '}
          ({accuracyText(extremes.best.accuracy!)}) ; la plus fragile :{' '}
          <span className="font-semibold text-slate-100">{labelOf(extremes.worst.name)}</span> (
          {accuracyText(extremes.worst.accuracy!)}).
        </p>
      )}

      {families.length === 0 ? (
        <p className="text-xs text-slate-400">Aucune partie avec cette couleur.</p>
      ) : (
        <ul aria-label="Mes ouvertures" className="flex flex-col gap-2">
          {families.map((family) => (
            <FamilyRow
              key={family.name}
              family={family}
              color={color}
              baseline={repertoire.accuracy}
              onShowLine={onShowLine}
            />
          ))}
        </ul>
      )}

      <p className="text-[11px] text-slate-500">
        Une partie compte pour l&apos;ouverture nommée par la base lichess au dernier coup de théorie reconnu. « Quitter
        la théorie », c&apos;est jouer le premier coup que la base ne connaît pas (dans les {BOOK_PLIES} premiers
        demi-coups). Une sortie est dite récurrente quand elle revient dans au moins {MIN_RECURRENCE} parties de la même
        ouverture ; son coût est la moyenne des points de chances de gain que ce coup a fait perdre, selon
        l&apos;analyse, et elle est mise en avant à partir de {COSTLY_EXIT} points. La précision est celle de vos coups
        hors théorie, comme dans « Mon profil » (les coups du livre, toujours parfaits, sont laissés de côté) ; elle
        n&apos;est comparée à votre moyenne qu&apos;à partir de {MIN_ACCURACY_GAMES} parties de la même ouverture.
      </p>
    </div>
  );
};
