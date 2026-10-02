import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { ArrowLeft, FlipVertical2, RotateCcw } from 'lucide-react';
import { useOpeningExplorerData } from '../../hooks/useOpeningExplorerData';
import { getOpeningPosition } from '../../services/openingBook';
import { toFrenchSan } from '../../utils/chessNotation';
import { continuationsOf, walkLine, type Continuation } from '../../utils/openingExplorer';
import { INDEX_PLIES, gamesIn, talliesAt } from '../../utils/openingIndex';
import { toFrenchOpeningName } from '../../utils/openingNames';
import type { BoardTheme } from '../../types/ui';
import { ChessBoard } from '../ChessBoard/ChessBoard';
import { SECONDARY, TallyBar, numbered } from './shared';

interface OpeningExplorerProps {
  /** The line on the board (English SAN): kept by the parent, so that another view can send the player to a position. */
  sans: string[];
  onSansChange: (sans: string[]) => void;
  /** Opens the import of online games (offered while there is no game of the player to count). */
  onImport: () => void;
  boardTheme?: BoardTheme;
}

type Side = 'all' | 'w' | 'b';

const SIDES: Array<{ value: Side; label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'w', label: 'Avec les Blancs' },
  { value: 'b', label: 'Avec les Noirs' },
];

/** Walk the tree of the openings, move by move, next to how the player's own games went. */
export const OpeningExplorer: React.FC<OpeningExplorerProps> = ({ sans, onSansChange, onImport, boardTheme }) => {
  const { data, retry } = useOpeningExplorerData();
  const [side, setSide] = useState<Side>('all');
  const [isFlipped, setIsFlipped] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const isReady = data.status === 'ready';
  const walk = useMemo(() => walkLine(isReady ? sans : [], getOpeningPosition), [isReady, sans]);
  const continuations = useMemo<Continuation[]>(() => {
    if (data.status !== 'ready') return [];
    return continuationsOf(walk.fen, getOpeningPosition, talliesAt(data.index, walk.fen, side));
  }, [data, walk.fen, side]);

  const playerGames = data.status === 'ready' ? gamesIn(data.index) : 0;
  const last = walk.steps.length > 0 ? walk.steps[walk.steps.length - 1] : null;
  const isOutOfBook = isReady && sans.length > 0 && getOpeningPosition(walk.fen) === null;

  const go = (next: string[]) => {
    onSansChange(next);
    setSelected(null);
    setNotice('');
  };
  const play = (san: string) => go([...walk.steps.map((s) => s.san), san]);
  const chooseSide = (value: Side) => {
    setSide(value);
    if (value !== 'all') setIsFlipped(value === 'b');
  };

  /** A move made on the board: it is followed when the explorer offers it, and refused otherwise. */
  const tryMove = (from: string, to: string): boolean => {
    setSelected(null);
    let san: string;
    try {
      san = new Chess(walk.fen).move({ from, to, promotion: 'q' }).san;
    } catch {
      return false;
    }
    if (continuations.some((c) => c.san === san)) {
      play(san);
      return true;
    }
    setNotice(`${toFrenchSan(san)} ne figure pas dans les coups proposés : choisissez-en un dans la liste.`);
    return false;
  };

  const onSquareClick = (square: string) => {
    if (selected && selected !== square) {
      if (tryMove(selected, square)) return;
    }
    const piece = new Chess(walk.fen).get(square as Parameters<Chess['get']>[0]);
    setSelected(piece && piece.color === walk.fen.split(' ')[1] && selected !== square ? square : null);
  };

  const title = walk.name ? toFrenchOpeningName(walk.name) : '';

  return (
    <>
      {data.status === 'loading' && (
        <p role="status" className="text-sm text-slate-400 py-8 text-center">
          Chargement des ouvertures…
        </p>
      )}

      {data.status === 'unavailable' && (
        <div className="flex flex-col items-center gap-3 text-center py-8 px-2">
          <p className="text-sm font-semibold text-slate-200">Les ouvertures ne sont pas disponibles</p>
          <p className="text-xs text-slate-400 max-w-md">
            La base des ouvertures n&apos;a pas pu être téléchargée. Vérifiez la connexion, puis réessayez : une fois
            chargée, elle reste disponible hors ligne.
          </p>
          <button type="button" onClick={retry} className={SECONDARY}>
            Réessayer
          </button>
        </div>
      )}

      {data.status === 'ready' && (
        <div className="grid md:grid-cols-[var(--modal-board)_minmax(0,1fr)] gap-4 items-start">
          <div className="w-full max-w-md mx-auto md:max-w-none md:mx-0 flex flex-col gap-2">
            <ChessBoard
              fen={walk.fen}
              isFlipped={isFlipped}
              boardTheme={boardTheme}
              lastMove={last ? { from: last.from, to: last.to } : null}
              showArrows
              showThreats={false}
              selectedSquare={selected}
              onSquareClick={onSquareClick}
              onPieceMove={tryMove}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={SECONDARY}
                disabled={sans.length === 0}
                onClick={() => go(walk.steps.slice(0, -1).map((s) => s.san))}
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Coup précédent
              </button>
              <button type="button" className={SECONDARY} disabled={sans.length === 0} onClick={() => go([])}>
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Début
              </button>
              <button type="button" className={SECONDARY} onClick={() => setIsFlipped((f) => !f)}>
                <FlipVertical2 className="w-3.5 h-3.5" aria-hidden="true" />
                Retourner
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 min-w-0">
            <div role="status" aria-live="polite">
              <p className="text-sm font-semibold text-slate-100">
                {title ? (
                  <>
                    {walk.eco && <span className="text-indigo-300 mr-1.5">[{walk.eco}]</span>}
                    {title}
                  </>
                ) : (
                  'Position initiale'
                )}
              </p>
              {isOutOfBook && (
                <p className="text-xs text-amber-300 mt-1">
                  Hors du livre : cette position n&apos;est dans aucune des lignes connues.
                </p>
              )}
              {notice && <p className="text-xs text-amber-300 mt-1">{notice}</p>}
            </div>

            {walk.steps.length > 0 && (
              <ol aria-label="Coups joués" className="flex flex-wrap gap-x-1 gap-y-1 text-xs">
                {walk.steps.map((step, i) => {
                  const isLast = i === walk.steps.length - 1;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        aria-current={isLast ? 'step' : undefined}
                        onClick={() => go(walk.steps.slice(0, i + 1).map((s) => s.san))}
                        className={`px-1.5 py-0.5 rounded-md cursor-pointer font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                          isLast ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {numbered(step.before, step.san)}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="flex flex-col gap-1.5">
              <div role="group" aria-label="Parties prises en compte" className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 mr-1">Mes parties :</span>
                {SIDES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={side === value}
                    onClick={() => chooseSide(value)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                      side === value
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {playerGames === 0 && (
                <p className="text-[11px] text-slate-400">
                  Aucune de vos parties n&apos;est comptée pour l&apos;instant : renseignez votre pseudo et{' '}
                  <button type="button" onClick={onImport} className="underline text-indigo-300 cursor-pointer">
                    importez vos parties
                  </button>{' '}
                  pour voir vos résultats ici.
                </p>
              )}
            </div>

            {continuations.length === 0 ? (
              <p className="text-xs text-slate-400">
                {isOutOfBook
                  ? 'Aucun coup proposé : la position sort de la théorie.'
                  : 'Fin de la ligne : aucun coup connu à partir d’ici.'}
              </p>
            ) : (
              <table className="w-full text-xs">
                <caption className="sr-only">Coups possibles depuis cette position, avec vos parties jouées</caption>
                <thead>
                  <tr className="text-left text-[11px] text-slate-400">
                    <th scope="col" className="font-medium pb-1 pr-2">
                      Coup
                    </th>
                    <th scope="col" className="font-medium pb-1 pr-2">
                      Ouverture
                    </th>
                    <th scope="col" className="font-medium pb-1">
                      Mes parties
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {continuations.map((c) => (
                    <tr key={c.san} className="border-t border-slate-800/80">
                      <td className="py-1 pr-2 align-top">
                        <button
                          type="button"
                          onClick={() => play(c.san)}
                          className="px-1.5 py-0.5 rounded-md font-mono font-semibold text-slate-100 bg-slate-800 hover:bg-indigo-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                        >
                          {numbered(walk.fen, c.san)}
                        </button>
                      </td>
                      <td className="py-1 pr-2 align-top text-slate-300 min-w-0">
                        {c.name ? (
                          <>
                            {c.eco && <span className="text-indigo-300 mr-1">[{c.eco}]</span>}
                            {toFrenchOpeningName(c.name)}
                          </>
                        ) : c.leadsTo ? (
                          <span className="text-slate-400">mène à {toFrenchOpeningName(c.leadsTo)}</span>
                        ) : !c.inBook ? (
                          <span className="text-amber-300">hors du livre</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                        {c.name && !c.inBook && <span className="text-amber-300 ml-1">hors du livre</span>}
                      </td>
                      <td className="py-1 align-top">
                        {c.mine ? <TallyBar tally={c.mine} /> : <span className="text-slate-500">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p className="text-[11px] text-slate-500">
              Les coups du livre sont classés selon le nombre de variantes connues qui les suivent. Source : base
              d&apos;ouvertures de Lichess. Les résultats sont ceux de vos parties enregistrées (les {INDEX_PLIES}{' '}
              premiers demi-coups), du point de vue du joueur renseigné.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
