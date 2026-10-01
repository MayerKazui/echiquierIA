import React, { useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Filter,
  Lightbulb,
  Sparkles,
  Timer,
  XCircle,
  Zap,
} from 'lucide-react';
import { MoveAnalysis, MoveClassification } from '../../types/chess';
import { moveButtonLabel } from '../../utils/accessibility';
import { toFrenchSan } from '../../utils/chessNotation';
import { moveListScrollBehavior } from '../../utils/scrollBehavior';

interface MoveListProps {
  moves: MoveAnalysis[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  filterOnlyErrors: boolean;
  onToggleFilter: () => void;
  /** Auto-play is running: the list follows the current move without an animation. */
  isPlaying?: boolean;
}

export const MoveList: React.FC<MoveListProps> = ({
  moves,
  currentPly,
  onSelectPly,
  filterOnlyErrors,
  onToggleFilter,
  isPlaying = false,
}) => {
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // Read when the current move changes (not a reason to scroll by themselves)
  const previousPlyRef = useRef(currentPly);
  // The step on which auto-play stops (the last move, or a pause on an error) arrives in the same render as
  // the stop: it still counts as played, so `before` keeps the previous value for one render.
  const playingRef = useRef({ now: isPlaying, before: isPlaying });
  useLayoutEffect(() => {
    playingRef.current = { now: isPlaying, before: playingRef.current.now };
  });
  const [filterLongThinks, setFilterLongThinks] = useState(false);
  const [filterRushed, setFilterRushed] = useState(false);

  // Check if clock info exists in this game
  const hasClockData = useMemo(() => {
    return moves.some((m) => m.thinkTimeFormatted !== undefined || m.clock !== undefined);
  }, [moves]);

  const totalLongThinks = useMemo(() => {
    return moves.filter((m) => m.isLongThink).length;
  }, [moves]);

  const totalRushed = useMemo(() => {
    return moves.filter((m) => m.isRushed).length;
  }, [moves]);

  // Group into pairs: { moveNumber, white: MoveAnalysis, black?: MoveAnalysis }
  const movePairs = useMemo(() => {
    const pairs: Array<{
      moveNumber: number;
      white?: MoveAnalysis;
      black?: MoveAnalysis;
    }> = [];

    for (let i = 0; i < moves.length; i += 2) {
      pairs.push({
        moveNumber: Math.floor(i / 2) + 1,
        white: moves[i],
        black: moves[i + 1],
      });
    }

    let filtered = pairs;

    if (filterOnlyErrors) {
      filtered = filtered.filter(
        (p) =>
          (p.white && ['blunder', 'mistake', 'inaccuracy', 'missedWin'].includes(p.white.classification)) ||
          (p.black && ['blunder', 'mistake', 'inaccuracy', 'missedWin'].includes(p.black.classification))
      );
    }

    if (filterLongThinks) {
      filtered = filtered.filter((p) => (p.white && p.white.isLongThink) || (p.black && p.black.isLongThink));
    }

    if (filterRushed) {
      filtered = filtered.filter((p) => (p.white && p.white.isRushed) || (p.black && p.black.isRushed));
    }

    return filtered;
  }, [moves, filterOnlyErrors, filterLongThinks, filterRushed]);

  // Auto-scroll strictly inside the move list container (prevents the page/window from scrolling down)
  useEffect(() => {
    const container = scrollContainerRef.current;
    const scrollBehavior = moveListScrollBehavior({
      previousPly: previousPlyRef.current,
      currentPly,
      isPlaying: playingRef.current.now || playingRef.current.before,
      reducedMotion: Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches),
    });
    previousPlyRef.current = currentPly;
    const activeEl = activeRowRef.current;
    if (container && activeEl) {
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      const elemTop = activeEl.offsetTop;
      const elemBottom = elemTop + activeEl.offsetHeight;

      if (elemBottom > containerBottom) {
        container.scrollTo({
          top: elemBottom - container.clientHeight + 16,
          behavior: scrollBehavior,
        });
      } else if (elemTop < containerTop) {
        container.scrollTo({
          top: Math.max(0, elemTop - 16),
          behavior: scrollBehavior,
        });
      }
    }
  }, [currentPly]);

  const getMoveIcon = (classification: MoveClassification, move?: MoveAnalysis) => {
    switch (classification) {
      case 'blunder':
      case 'missedWin':
        return (
          <span title="Gaffe">
            <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          </span>
        );
      case 'mistake':
        return (
          <span title="Erreur">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          </span>
        );
      case 'inaccuracy':
        return (
          <span title="Imprécision">
            <Lightbulb className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
          </span>
        );
      case 'brilliant':
        return (
          <span title="Brillant">
            <Sparkles className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
          </span>
        );
      case 'book':
        return (
          <span
            title={
              move?.openingName
                ? `Coup théorique (Livre) : ${move.openingName}${move.eco ? ` [${move.eco}]` : ''}`
                : 'Coup théorique (Livre)'
            }
            className="flex items-center gap-0.5"
          >
            <BookOpen className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          </span>
        );
      case 'best':
        return (
          <span title="Meilleur coup">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          </span>
        );
      default:
        return null;
    }
  };

  const formatLoss = (loss: number) => {
    if (loss < 30) return null;
    return `-${(loss / 100).toFixed(1)}`;
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col h-full shadow-xl overflow-hidden">
      {/* Top Filter & Header */}
      <div className="p-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider font-semibold text-slate-300">
            Notation des Coups ({moves.length} demi-coups)
          </span>
          {hasClockData && (
            <span className="text-[10px] text-amber-400/90 font-medium px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              <span>Horloge</span>
            </span>
          )}
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5">
          {hasClockData && totalRushed > 0 && (
            <button
              onClick={() => setFilterRushed((prev) => !prev)}
              aria-pressed={filterRushed}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                filterRushed
                  ? 'bg-rose-500/25 text-rose-300 border border-rose-500/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
              }`}
              title="Afficher uniquement les erreurs commises en moins de 3 secondes (précipitation)"
            >
              <Zap className="w-3 h-3 text-rose-400" />
              <span>Précipités ({totalRushed})</span>
            </button>
          )}

          {hasClockData && totalLongThinks > 0 && (
            <button
              onClick={() => setFilterLongThinks((prev) => !prev)}
              aria-pressed={filterLongThinks}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                filterLongThinks
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
              }`}
              title="Afficher uniquement les coups avec temps de réflexion anormalement long"
            >
              <Timer className="w-3 h-3 text-amber-400" />
              <span>Longs ({totalLongThinks})</span>
            </button>
          )}

          <button
            onClick={onToggleFilter}
            aria-pressed={filterOnlyErrors}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              filterOnlyErrors
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
            }`}
            title="Afficher uniquement les moments critiques"
          >
            <Filter className="w-3 h-3" />
            <span>Fautes seules</span>
          </button>
        </div>
      </div>

      {/* Move List Body */}
      <div
        ref={scrollContainerRef}
        role="list"
        aria-label="Notation des coups"
        className="flex-1 overflow-y-auto p-2 divide-y divide-slate-800/40 font-mono text-xs"
      >
        {movePairs.map((pair) => {
          const isWhiteActive = pair.white?.ply === currentPly;
          const isBlackActive = pair.black?.ply === currentPly;

          return (
            <div
              key={pair.moveNumber}
              role="listitem"
              ref={isWhiteActive || isBlackActive ? activeRowRef : null}
              className="grid grid-cols-[28px_1fr_1fr] sm:grid-cols-[36px_1fr_1fr] items-center py-1 px-0.5 sm:px-1 hover:bg-slate-800/40 rounded transition-colors"
            >
              <span className="text-slate-400 font-semibold select-none text-center text-[11px] sm:text-xs">
                {pair.moveNumber}.
              </span>

              {/* White Move */}
              {pair.white ? (
                <button
                  onClick={() => onSelectPly(pair.white!.ply)}
                  aria-label={moveButtonLabel(pair.white)}
                  aria-current={isWhiteActive ? 'true' : undefined}
                  className={`flex items-center justify-between px-1.5 sm:px-2 py-1.5 rounded text-left transition-all min-w-0 ${
                    isWhiteActive
                      ? 'bg-indigo-600 text-white font-bold shadow'
                      : pair.white.isLongThink
                        ? 'bg-amber-950/20 hover:bg-amber-950/40 text-slate-200 border border-amber-500/30'
                        : pair.white.classification === 'book'
                          ? 'text-violet-200 hover:bg-violet-950/25 border border-violet-500/20'
                          : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate min-w-0">{toFrenchSan(pair.white.san)}</span>
                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-1">
                    {/* Think time badge */}
                    {pair.white.thinkTimeFormatted && (
                      <span
                        className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] sm:text-[10px] font-mono tracking-tight ${
                          pair.white.isRushed
                            ? 'bg-rose-500/25 text-rose-300 border border-rose-500/50 font-bold shadow-sm'
                            : pair.white.isLongThink
                              ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50 font-bold shadow-sm'
                              : isWhiteActive
                                ? 'text-indigo-200 bg-indigo-700/50'
                                : 'text-slate-400 bg-slate-800/80'
                        }`}
                        title={
                          pair.white.isRushed
                            ? `⚡ Coup précipité (${pair.white.thinkTimeFormatted}) ayant conduit à une faute ! Prenez plus de temps pour calculer.`
                            : pair.white.isLongThink
                              ? `⚠️ Réflexion anormalement longue : ${pair.white.thinkTimeFormatted} (${pair.white.thinkRatioToAverage}x la moyenne)${pair.white.clock ? ` · Horloge: ${pair.white.clock}` : ''}`
                              : `Temps de réflexion : ${pair.white.thinkTimeFormatted}${pair.white.clock ? ` · Horloge: ${pair.white.clock}` : ''}`
                        }
                      >
                        {pair.white.isRushed ? (
                          <span className="text-[10px] leading-none text-rose-300">⚡</span>
                        ) : (
                          <Clock
                            className={`w-2.5 h-2.5 ${pair.white.isLongThink ? 'text-amber-300' : 'opacity-70'}`}
                          />
                        )}
                        <span className="hidden xs:inline">{pair.white.thinkTimeFormatted}</span>
                      </span>
                    )}

                    {formatLoss(pair.white.centipawnLoss) && (
                      <span className="text-[10px] text-slate-400 opacity-80 hidden xs:inline">
                        {formatLoss(pair.white.centipawnLoss)}
                      </span>
                    )}
                    {getMoveIcon(pair.white.classification, pair.white)}
                  </div>
                </button>
              ) : (
                <div />
              )}

              {/* Black Move */}
              {pair.black ? (
                <button
                  onClick={() => onSelectPly(pair.black!.ply)}
                  aria-label={moveButtonLabel(pair.black)}
                  aria-current={isBlackActive ? 'true' : undefined}
                  className={`flex items-center justify-between px-1.5 sm:px-2 py-1.5 rounded text-left transition-all ml-0.5 sm:ml-1 min-w-0 ${
                    isBlackActive
                      ? 'bg-indigo-600 text-white font-bold shadow'
                      : pair.black.isLongThink
                        ? 'bg-amber-950/20 hover:bg-amber-950/40 text-slate-300 border border-amber-500/30'
                        : pair.black.classification === 'book'
                          ? 'text-violet-200 hover:bg-violet-950/25 border border-violet-500/20'
                          : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate min-w-0">{toFrenchSan(pair.black.san)}</span>
                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-1">
                    {/* Think time badge */}
                    {pair.black.thinkTimeFormatted && (
                      <span
                        className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] sm:text-[10px] font-mono tracking-tight ${
                          pair.black.isRushed
                            ? 'bg-rose-500/25 text-rose-300 border border-rose-500/50 font-bold shadow-sm'
                            : pair.black.isLongThink
                              ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50 font-bold shadow-sm'
                              : isBlackActive
                                ? 'text-indigo-200 bg-indigo-700/50'
                                : 'text-slate-400 bg-slate-800/80'
                        }`}
                        title={
                          pair.black.isRushed
                            ? `⚡ Coup précipité (${pair.black.thinkTimeFormatted}) ayant conduit à une faute ! Prenez plus de temps pour calculer.`
                            : pair.black.isLongThink
                              ? `⚠️ Réflexion anormalement longue : ${pair.black.thinkTimeFormatted} (${pair.black.thinkRatioToAverage}x la moyenne)${pair.black.clock ? ` · Horloge: ${pair.black.clock}` : ''}`
                              : `Temps de réflexion : ${pair.black.thinkTimeFormatted}${pair.black.clock ? ` · Horloge: ${pair.black.clock}` : ''}`
                        }
                      >
                        {pair.black.isRushed ? (
                          <span className="text-[10px] leading-none text-rose-300">⚡</span>
                        ) : (
                          <Clock
                            className={`w-2.5 h-2.5 ${pair.black.isLongThink ? 'text-amber-300' : 'opacity-70'}`}
                          />
                        )}
                        <span className="hidden xs:inline">{pair.black.thinkTimeFormatted}</span>
                      </span>
                    )}

                    {formatLoss(pair.black.centipawnLoss) && (
                      <span className="text-[10px] text-slate-400 opacity-80 hidden xs:inline">
                        {formatLoss(pair.black.centipawnLoss)}
                      </span>
                    )}
                    {getMoveIcon(pair.black.classification, pair.black)}
                  </div>
                </button>
              ) : (
                <div />
              )}
            </div>
          );
        })}

        {movePairs.length === 0 && (
          <div className="h-full flex items-center justify-center text-slate-400 text-xs py-8 text-center">
            {filterLongThinks
              ? 'Aucune longue réflexion identifiée avec ce filtre.'
              : 'Aucune faute détectée avec ce filtre.'}
          </div>
        )}
      </div>

      {/* Playback Controls */}
      <div className="p-2 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-center gap-1">
        <button
          onClick={() => onSelectPly(0)}
          disabled={currentPly <= 0}
          className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition-colors"
          aria-label="Début de la partie"
          title="Début de la partie (Touche Flèche Haut)"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onSelectPly(Math.max(0, currentPly - 1))}
          disabled={currentPly <= 0}
          className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition-colors"
          aria-label="Coup précédent"
          title="Coup précédent (Flèche Gauche)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="text-xs font-mono text-slate-400 px-3 select-none">
          {currentPly >= 0 ? `${currentPly + 1} / ${moves.length}` : `0 / ${moves.length}`}
        </span>

        <button
          onClick={() => onSelectPly(Math.min(moves.length - 1, currentPly + 1))}
          disabled={currentPly >= moves.length - 1}
          className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition-colors"
          aria-label="Coup suivant"
          title="Coup suivant (Flèche Droite)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => onSelectPly(moves.length - 1)}
          disabled={currentPly >= moves.length - 1}
          className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition-colors"
          aria-label="Fin de la partie"
          title="Fin de la partie (Flèche Bas)"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
