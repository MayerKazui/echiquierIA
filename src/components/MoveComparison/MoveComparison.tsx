import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Eye,
  Lightbulb,
  Sparkles,
  Target,
  TrendingDown,
  XCircle,
} from 'lucide-react';
import { MoveAnalysis } from '../../types/chess';
import { formatPvToFrench, toFrenchSan } from '../../utils/chessNotation';
import { TacticalThreat } from '../../utils/tacticalThreats';

/**
 * Splits and formats raw plan text into clean individual actionable steps.
 * Handles glued numbers (e.g. "roi à l'abri2. développer"), newlines, or inline sequences,
 * while safely ignoring chess square notation (e.g. e4, d5, c3).
 */
function formatPlanSteps(planText: string): string[] {
  if (!planText) return [];
  const normalized = planText
    .replace(/([^a-hA-H\d\s]|\b[a-zA-ZÀ-ÿ]+(?<![a-hA-H]))\s*([1-9])[.)]\s+/g, '$1\n$2. ')
    .replace(/([a-zA-ZÀ-ÿ]+(?<![a-hA-H]))([1-9])[.)]\s*/g, '$1\n$2. ');

  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const steps: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[1-9][.)]\s*/, '').trim();
    if (cleaned) steps.push(cleaned);
  }
  return steps.length > 0 ? steps : [planText];
}

interface MoveComparisonProps {
  currentMove: MoveAnalysis | null;
  previousMove: MoveAnalysis | null;
  isPreviewingAlternative: boolean;
  onTogglePreviewAlternative: () => void;
  onUpdateAiExplanation: (ply: number, explanation: NonNullable<MoveAnalysis['aiExplanation']>) => void;
  sanHistory: string[];
  userColor?: 'w' | 'b';
  openingName?: string;
  eco?: string;
  tacticalThreatsSuggestion?: TacticalThreat[];
  tacticalThreatsPlayed?: TacticalThreat[];
  threatsMode?: 'suggestion' | 'played';
  onSelectThreatsMode?: (mode: 'suggestion' | 'played') => void;
  showThreats?: boolean;
  onToggleShowThreats?: () => void;
}

export const MoveComparison: React.FC<MoveComparisonProps> = ({
  currentMove,
  isPreviewingAlternative,
  onTogglePreviewAlternative,
  onUpdateAiExplanation,
  sanHistory,
  userColor,
  openingName,
  tacticalThreatsSuggestion = [],
  tacticalThreatsPlayed = [],
  threatsMode = 'suggestion',
  onSelectThreatsMode,
  showThreats = true,
  onToggleShowThreats,
}) => {
  const [loadingAi, setLoadingAi] = useState(false);

  if (!currentMove) {
    return (
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 min-h-[280px] flex flex-col items-center justify-center text-center text-slate-400">
        <BrainCircuit className="w-10 h-10 text-slate-600 mb-3" />
        <p className="font-medium text-slate-300">Aucun coup sélectionné</p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Avancez dans la partie ou cliquez sur un moment critique dans la liste des coups pour comparer les choix.
        </p>
      </div>
    );
  }

  const isWhite = currentMove.color === 'w';
  const playerLabel = isWhite ? 'Blancs' : 'Noirs';

  // Classification styling
  const getClassificationBadge = () => {
    switch (currentMove.classification) {
      case 'blunder':
        return {
          label: 'Gaffe critique',
          icon: <XCircle className="w-4 h-4 text-rose-400" />,
          color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
        };
      case 'missedWin':
        return {
          label: 'Occasion manquée',
          icon: <AlertTriangle className="w-4 h-4 text-rose-400" />,
          color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
        };
      case 'mistake':
        return {
          label: 'Erreur',
          icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
          color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
        };
      case 'inaccuracy':
        return {
          label: 'Imprécision',
          icon: <Lightbulb className="w-4 h-4 text-yellow-300" />,
          color: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30',
        };
      case 'brilliant':
        return {
          label: 'Coup brillant',
          icon: <Sparkles className="w-4 h-4 text-cyan-300" />,
          color: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
        };
      case 'book':
        return {
          label: currentMove.openingName || openingName
            ? `Coup théorique (${currentMove.openingName || openingName})`
            : 'Coup théorique (Livre)',
          icon: <BookOpen className="w-4 h-4 text-violet-300" />,
          color: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
        };
      case 'best':
        return {
          label: 'Meilleur coup',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        };
      default:
        return {
          label: 'Bon coup',
          icon: <CheckCircle2 className="w-4 h-4 text-sky-400" />,
          color: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
        };
    }
  };

  const badge = getClassificationBadge();

  const formatEval = (cp: number, mate: number | null) => {
    if (mate !== null) return `M${Math.abs(mate)}`;
    const pawns = (cp / 100).toFixed(1);
    return cp > 0 ? `+${pawns}` : pawns;
  };

  // Client-side fallback explanation generator if backend or network fails
  const generateLocalMoveExplanation = (
    move: MoveAnalysis,
    badgeLabel: string,
    isWhiteMove: boolean
  ) => {
    const isGood = ['best', 'brilliant', 'great', 'excellent', 'good', 'book'].includes(
      move.classification
    );
    const targetMove = isGood ? move.san : move.bestMoveSan || move.san;
    const isCapture = targetMove.includes('x');
    const isCheck = targetMove.includes('+');

    let pieceName = 'le pion';
    if (targetMove.startsWith('N')) pieceName = 'le Cavalier';
    else if (targetMove.startsWith('B')) pieceName = 'le Fou';
    else if (targetMove.startsWith('R')) pieceName = 'la Tour';
    else if (targetMove.startsWith('Q')) pieceName = 'la Dame';
    else if (targetMove.startsWith('K')) pieceName = 'le Roi';
    else if (targetMove.includes('O-O')) pieceName = 'le Roi et la Tour (Roque)';

    const concept = isCapture
      ? 'Prise & Simplification active'
      : isCheck
      ? 'Attaque directe & Initiative'
      : 'Harmonie & Développement';

    const whyPlayedIsBad = isGood
      ? ''
      : `En jouant ${move.san}, les ${
          isWhiteMove ? 'Blancs' : 'Noirs'
        } concèdent un temps précieux ou concèdent un désavantage tactique que l'adversaire peut exploiter.`;

    const whyBestIsBetter = isGood
      ? `Le coup joué ${move.san} (${badgeLabel}) est optimal : il coordonne parfaitement les pièces et maintient l'initiative dans cette position.`
      : `Le coup recommandé ${move.bestMoveSan || 'alternatif'} active directement ${pieceName} pour maintenir la pression tactique et le contrôle des cases centrales.`;

    const plan = `1. Continuer le développement actif de ${pieceName}.\n2. Sécuriser les pièces maîtresses et contester les colonnes ouvertes.\n3. Augmenter la pression sur les points faibles du camp adverse.`;

    return { concept, whyPlayedIsBad, whyBestIsBetter, plan };
  };

  // Request pedagogical commentary from Gemini 3.8 Flash (with resilient fallback)
  const handleFetchAiExplanation = async () => {
    setLoadingAi(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch('/api/coach/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            fen: currentMove.fenBefore,
            movePlayed: { san: currentMove.san, uci: currentMove.uci },
            moveBest: { san: currentMove.bestMoveSan, uci: currentMove.bestMoveUci },
            evalPlayed: formatEval(currentMove.evalAfter, currentMove.mateAfter),
            evalBest: formatEval(currentMove.evalBefore, currentMove.mateBefore),
            classificationKey: currentMove.classification,
            classification: badge.label,
            pv: currentMove.pv.slice(0, 5).join(' '),
            playerColor: isWhite ? 'white' : 'black',
            moveNumber: currentMove.moveNumber,
            sanHistory: sanHistory.slice(0, currentMove.ply + 1),
          }),
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const res = await response.json();
          if (res.success && res.data) {
            onUpdateAiExplanation(currentMove.ply, res.data);
            return;
          }
        }
      } catch (networkErr) {
        console.warn('Backend call to /api/coach/explain failed or timed out, using local fallback:', networkErr);
      }

      // Local fallback explanation
      const fallback = generateLocalMoveExplanation(currentMove, badge.label, isWhite);
      onUpdateAiExplanation(currentMove.ply, fallback);
    } catch (err) {
      console.error('Failed to get AI coach explanation:', err);
    } finally {
      setLoadingAi(false);
    }
  };

  const isAlternativeAvailable = Boolean(
    currentMove.bestMoveSan &&
      currentMove.bestMoveSan !== currentMove.san &&
      currentMove.centipawnLoss > 20
  );

  const isPositiveMove =
    !isAlternativeAvailable ||
    ['brilliant', 'great', 'best', 'excellent', 'good', 'book'].includes(currentMove.classification) ||
    currentMove.centipawnLoss <= 25;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-5">
      {/* Header with Move Number, Player Attribution & Classification */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs uppercase tracking-wider font-semibold text-slate-300">
            Coup {currentMove.moveNumber} {isWhite ? 'Blancs' : 'Noirs'}
            {userColor && (
              <span
                className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  currentMove.color === userColor
                    ? 'bg-indigo-600/40 text-indigo-300 border border-indigo-500/40'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {currentMove.color === userColor ? 'Votre coup' : 'Adversaire'}
              </span>
            )}
          </span>
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-xs font-medium ${badge.color}`}
          >
            {badge.icon}
            <span>{badge.label}</span>
          </div>
        </div>

        {/* Quick toggle to view alternative on board */}
        {isAlternativeAvailable && (
          <button
            onClick={onTogglePreviewAlternative}
            className={`inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              isPreviewingAlternative
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isPreviewingAlternative ? (
                <>
                  <span className="hidden sm:inline">Mode : Alternative affichée</span>
                  <span className="sm:hidden">Alternative active</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Voir alternative sur l’échiquier</span>
                  <span className="sm:hidden">Voir alternative</span>
                </>
              )}
            </span>
          </button>
        )}
      </div>

      {/* Side-by-Side Comparison: Played Move vs Stockfish Best Move */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Played Move Card */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            currentMove.classification === 'book'
              ? 'bg-slate-950/70 border-violet-500/40 ring-1 ring-violet-500/20'
              : isPositiveMove
              ? 'bg-slate-950/70 border-emerald-500/40 ring-1 ring-emerald-500/20'
              : !isPreviewingAlternative
              ? 'bg-slate-950/70 border-slate-700/80 ring-1 ring-slate-700/50'
              : 'bg-slate-950/30 border-slate-800/50 opacity-70'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
              Coup joué par les {playerLabel}
            </span>
            <span className="text-xs font-mono font-bold text-slate-300">
              {formatEval(currentMove.evalAfter, currentMove.mateAfter)}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mb-2">
            <span
              className={`text-2xl font-bold font-mono ${
                currentMove.classification === 'book'
                  ? 'text-violet-300'
                  : isPositiveMove
                  ? 'text-emerald-300'
                  : 'text-slate-100'
              }`}
            >
              {toFrenchSan(currentMove.san)}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              ({currentMove.from} ➔ {currentMove.to})
            </span>
          </div>

          {/* Think time if available */}
          {currentMove.thinkTimeFormatted && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-mono ${
                  currentMove.isLongThink
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'bg-slate-900 text-slate-300 border border-slate-800'
                }`}
              >
                <Clock className={`w-3 h-3 ${currentMove.isLongThink ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Réflexion : {currentMove.thinkTimeFormatted}</span>
                {currentMove.isLongThink && (
                  <span className="text-[10px] text-amber-400 font-sans font-semibold">
                    ({currentMove.thinkRatioToAverage}x moy.)
                  </span>
                )}
              </span>
              {currentMove.clock && (
                <span className="text-[11px] text-slate-500 font-mono">
                  Horloge : {currentMove.clock}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-slate-400 mt-2 pt-2 border-t border-slate-800/60">
            {currentMove.centipawnLoss > 20 ? (
              <span className="text-rose-400 flex items-center gap-1 font-mono">
                <TrendingDown className="w-3.5 h-3.5" />
                Perte : -{(currentMove.centipawnLoss / 100).toFixed(1)} pions (-{currentMove.winPercentLoss}% gain)
              </span>
            ) : currentMove.classification === 'book' ? (
              <span className="text-violet-300 flex items-center gap-1 font-mono">
                <BookOpen className="w-3.5 h-3.5 text-violet-400" />
                Coup théorique officiel {currentMove.eco ? `[${currentMove.eco}]` : ''}
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Coup précis (perte négligeable)
              </span>
            )}
          </div>
        </div>

        {/* Stockfish Card: Alternative if error, or Confirmation if move was best/good */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isAlternativeAvailable
              ? isPreviewingAlternative
                ? 'bg-emerald-950/20 border-emerald-500/60 ring-1 ring-emerald-500/40'
                : 'bg-slate-950/70 border-slate-700/80'
              : currentMove.classification === 'book'
              ? 'bg-slate-950/70 border-violet-500/30'
              : 'bg-slate-950/70 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-emerald-400">
              {currentMove.classification === 'book' ? (
                <>
                  <BookOpen className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-violet-400">Validation Théorique (Livre)</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isAlternativeAvailable ? 'Alternative Stockfish' : 'Validation Stockfish'}</span>
                </>
              )}
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {formatEval(currentMove.evalBefore, currentMove.mateBefore)}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mb-2">
            <span
              className={`text-2xl font-bold font-mono ${
                currentMove.classification === 'book' ? 'text-violet-300' : 'text-emerald-300'
              }`}
            >
              {isAlternativeAvailable
                ? toFrenchSan(currentMove.bestMoveSan || currentMove.bestMoveUci)
                : toFrenchSan(currentMove.san)}
            </span>
            <span
              className={`text-xs font-mono ${
                currentMove.classification === 'book' ? 'text-violet-400/80' : 'text-emerald-500/80'
              }`}
            >
              {isAlternativeAvailable
                ? currentMove.bestMoveFrom && `(${currentMove.bestMoveFrom} ➔ ${currentMove.bestMoveTo})`
                : currentMove.classification === 'book'
                ? '(Ligne théorique validée)'
                : currentMove.bestMoveFrom &&
                  (currentMove.bestMoveFrom !== currentMove.from || currentMove.bestMoveTo !== currentMove.to)
                ? `(Choix optimal validé · variante ${toFrenchSan(currentMove.bestMoveSan || currentMove.bestMoveUci)})`
                : '(Choix optimal validé)'}
            </span>
          </div>

          <div className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-800/60 min-w-0">
            {currentMove.pv.length > 0 ? (
              <div className="flex items-center gap-1 min-w-0 overflow-hidden text-slate-300 font-mono text-[11px]">
                <span className="text-slate-500 shrink-0">Suite :</span>
                <span className="text-slate-300 truncate font-mono min-w-0">
                  {formatPvToFrench(currentMove.fenBefore, currentMove.pv, 7, true)}
                </span>
              </div>
            ) : (
              <span className="text-emerald-400/90 font-medium">
                {isAlternativeAvailable
                  ? 'Variante principale évaluée par l\'ordinateur'
                  : 'Vous avez trouvé le meilleur coup de la position !'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tactical Threats Breakdown Section (Based on Stockfish engine suggestions & played move) */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-rose-500/20 flex items-center justify-center text-rose-400">
              <Target className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-200">
                Menaces tactiques & Cibles (Moteur)
              </span>
            </div>
          </div>

          {/* Threats Source Toggle: Engine Suggestion vs Played Move */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => onSelectThreatsMode?.('suggestion')}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  threatsMode === 'suggestion'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Menaces tactiques créées par la suggestion du moteur"
              >
                <span>Stockfish</span>
                <span className="hidden xs:inline">({toFrenchSan(currentMove.bestMoveSan || currentMove.bestMoveUci)})</span>
                {tacticalThreatsSuggestion.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                      threatsMode === 'suggestion' ? 'bg-white text-rose-600' : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {tacticalThreatsSuggestion.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => onSelectThreatsMode?.('played')}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  threatsMode === 'played'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Menaces tactiques créées par votre coup joué"
              >
                <span>Coup joué</span>
                <span className="hidden xs:inline">({toFrenchSan(currentMove.san)})</span>
                {tacticalThreatsPlayed.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                      threatsMode === 'played' ? 'bg-white text-rose-600' : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {tacticalThreatsPlayed.length}
                  </span>
                )}
              </button>
            </div>

            {/* Quick Toggle On/Off for Board Annotations */}
            <button
              onClick={onToggleShowThreats}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                showThreats
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 hover:bg-rose-500/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title={showThreats ? 'Masquer les menaces sur l’échiquier' : 'Afficher les menaces sur l’échiquier'}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Threats List */}
        {(() => {
          const currentThreats = threatsMode === 'suggestion' ? tacticalThreatsSuggestion : tacticalThreatsPlayed;
          if (currentThreats.length === 0) {
            return (
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                <span className="text-slate-500 text-base">🛡️</span>
                <span>
                  Aucune menace directe immédiate créée par ce coup (manœuvre de consolidation ou coup positionnel).
                </span>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {currentThreats.map((threat) => (
                <div
                  key={threat.id}
                  className={`p-2.5 rounded-lg border flex flex-col gap-1 transition-all ${
                    threat.severity === 'high'
                      ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50'
                      : 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">
                        {threat.type === 'check'
                          ? '⚡'
                          : threat.type === 'hanging'
                          ? '🛡️'
                          : threat.type === 'pin'
                          ? '🧷'
                          : threat.type === 'fork'
                          ? '🔱'
                          : '⚔️'}
                      </span>
                      <span className="font-semibold text-xs text-slate-200">
                        {threat.label}
                      </span>
                    </div>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                        threat.severity === 'high'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {threat.severity === 'high' ? 'Critique' : 'Pression'}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-snug">
                    {threat.description}
                  </p>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Pedagogical AI Coach Section */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
              <BrainCircuit className="w-4 h-4" />
            </div>
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-200">
              Entraîneur Pédagogique IA
            </span>
          </div>

          {!currentMove.aiExplanation && (
            <button
              onClick={handleFetchAiExplanation}
              disabled={loadingAi}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer w-full sm:w-auto"
            >
              {loadingAi ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Analyse du plan en cours...</span>
                </>
              ) : (
                <>
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Expliquer le plan tactique</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* AI Pedagogical Feedback Display */}
        {currentMove.aiExplanation ? (
          <div className="flex flex-col gap-3 text-xs leading-relaxed mt-1 animate-fadeIn">
            {/* Concept Kicker */}
            <div className="flex items-center gap-2 text-indigo-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              <span>Concept clé : {currentMove.aiExplanation.concept}</span>
            </div>

            {/* If NOT a positive move: show why played move is bad in red */}
            {!isPositiveMove && currentMove.aiExplanation.whyPlayedIsBad && (
              <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-lg text-slate-300 break-words">
                <span className="font-semibold text-rose-300 block mb-1">
                  Pourquoi {currentMove.san} est une {badge.label.toLowerCase()} :
                </span>
                <p className="break-words">{currentMove.aiExplanation.whyPlayedIsBad}</p>
              </div>
            )}

            {/* Why best move / played move is strong (Emerald box) */}
            <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-slate-300 break-words">
              <span className="font-semibold text-emerald-300 block mb-1 flex items-center gap-1.5">
                {isPositiveMove ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Pourquoi {currentMove.san} est le coup optimal :
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                    L'idée directrice de {currentMove.bestMoveSan || 'l’alternative recommandée'} :
                  </>
                )}
              </span>
              <p className="break-words">{currentMove.aiExplanation.whyBestIsBetter || currentMove.aiExplanation.whyPlayedIsBad}</p>
            </div>

            {/* Strategic Plan */}
            {currentMove.aiExplanation.plan && (
              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg text-slate-300 break-words">
                <span className="font-semibold text-slate-200 block mb-2 flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                  {isPositiveMove
                    ? 'Plan suggéré pour exploiter la position :'
                    : 'Plan de redressement recommandé :'}
                </span>
                <div className="flex flex-col gap-2">
                  {formatPlanSteps(currentMove.aiExplanation.plan).map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg text-slate-200 min-w-0"
                    >
                      <span className="w-5 h-5 rounded-md bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-bold font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        {idx + 1}
                      </span>
                      <p className="text-xs leading-relaxed text-slate-200 break-words min-w-0">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          !loadingAi && (
            <div className="text-xs text-slate-400 bg-slate-900/40 p-3 rounded-lg border border-slate-800/60">
              Cliquez sur <strong className="text-slate-200">« Expliquer le plan tactique »</strong> pour comprendre en français les motifs tactiques, les faiblesses créées et le plan stratégique suggéré par l'IA.
            </div>
          )
        )}
      </div>
    </div>
  );
};
