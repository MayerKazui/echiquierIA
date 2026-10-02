import React from 'react';
import { numberedFrenchMove, toFrenchSan } from '../../utils/chessNotation';
import { scoreOf, type Tally } from '../../utils/openingExplorer';

const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

export const BUTTON =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed';
export const SECONDARY = `${BUTTON} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200`;

/** "1.e4", "1…e5": the move with its number, from the position it is played in. */
export function numbered(fen: string, san: string): string {
  const [, turn, , , , fullmove] = fen.split(' ');
  return `${fullmove}${turn === 'w' ? '.' : '…'}${toFrenchSan(san)}`;
}

/** How the player's games went after a move, in words (for a screen reader, and as the tooltip of the bar). */
export function describeTally({ games, wins, draws, losses }: Tally): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  return `${plural(games, 'partie', 'parties')} : ${plural(wins, 'gagnée', 'gagnées')}, ${plural(draws, 'nulle', 'nulles')}, ${plural(losses, 'perdue', 'perdues')}`;
}

export const TallyBar: React.FC<{ tally: Tally }> = ({ tally }) => {
  const decided = tally.wins + tally.draws + tally.losses;
  const score = scoreOf(tally);
  return (
    <div className="flex items-center gap-2 min-w-0" title={describeTally(tally)}>
      <span className="sr-only">{describeTally(tally)}</span>
      <span aria-hidden="true" className="tabular-nums text-xs text-slate-200 w-6 text-right shrink-0">
        {tally.games}
      </span>
      {decided > 0 ? (
        <>
          <span aria-hidden="true" className="flex h-2 w-16 sm:w-24 rounded-full overflow-hidden bg-slate-800 shrink-0">
            <span className="bg-emerald-500" style={{ width: `${(tally.wins / decided) * 100}%` }} />
            <span className="bg-slate-400" style={{ width: `${(tally.draws / decided) * 100}%` }} />
            <span className="bg-rose-500" style={{ width: `${(tally.losses / decided) * 100}%` }} />
          </span>
          <span aria-hidden="true" className="tabular-nums text-[11px] text-slate-400 w-9 shrink-0">
            {score === null ? '' : percent.format(score)}
          </span>
        </>
      ) : (
        <span aria-hidden="true" className="text-[11px] text-slate-500">
          sans résultat
        </span>
      )}
    </div>
  );
};

/** "8.h3", "8…h6": a move given by its number and its side, when the position is not at hand. */
export const numberedAt = numberedFrenchMove;
