import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  HelpCircle,
  Lightbulb,
  MessageSquare,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { MoveAnalysis } from '../../types/chess';

/**
 * Splits and formats raw plan text into clean individual actionable steps.
 * Handles glued numbers (e.g. "roi à l'abri2. développer"), newlines, or inline sequences,
 * while safely ignoring chess square notation (e.g. e4, d5, c3).
 */
function formatPlanSteps(planText: string): string[] {
  if (!planText) return [];
  const normalized = planText
    .replace(/([^a-hA-H\d\s]|\b[a-zA-ZÀ-ÿ]+(?<![a-hA-H]))\s*([1-9])[\.)]\s+/g, '$1\n$2. ')
    .replace(/([a-zA-ZÀ-ÿ]+(?<![a-hA-H]))([1-9])[\.)]\s*/g, '$1\n$2. ');

  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const steps: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[1-9][\.)]\s*/, '').trim();
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
}

export const MoveComparison: React.FC<MoveComparisonProps> = ({
  currentMove,
  isPreviewingAlternative,
  onTogglePreviewAlternative,
  onUpdateAiExplanation,
  sanHistory,
  userColor,
  openingName,
  eco,
}) => {
  const [loadingAi, setLoadingAi] = useState(false);
  const [userQuestion, setUserQuestion] = useState('');
  const [customAnswer, setCustomAnswer] = useState<string | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(false);

  if (!currentMove) {
    return (
      <div className="h-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col items-center justify-center text-center text-slate-400">
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
          label: 'Coup théorique (Livre)',
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

  // Request pedagogical commentary from Gemini 3.8 Flash
  const handleFetchAiExplanation = async () => {
    setLoadingAi(true);
    try {
      const response = await fetch('/api/coach/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fen: currentMove.fenBefore,
          movePlayed: { san: currentMove.san, uci: currentMove.uci },
          moveBest: { san: currentMove.bestMoveSan, uci: currentMove.bestMoveUci },
          evalPlayed: formatEval(currentMove.evalAfter, currentMove.mateAfter),
          evalBest: formatEval(currentMove.evalBefore, currentMove.mateBefore),
          classification: badge.label,
          pv: currentMove.pv.slice(0, 5).join(' '),
          playerColor: isWhite ? 'white' : 'black',
          moveNumber: currentMove.moveNumber,
          sanHistory: sanHistory.slice(0, currentMove.ply + 1),
        }),
      });

      const res = await response.json();
      if (res.success && res.data) {
        onUpdateAiExplanation(currentMove.ply, res.data);
      }
    } catch (err) {
      console.error('Failed to get AI coach explanation:', err);
    } finally {
      setLoadingAi(false);
    }
  };

  // Ask coach a custom question about this specific position
  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userQuestion.trim()) return;

    setLoadingQuestion(true);
    try {
      const response = await fetch('/api/coach/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fen: currentMove.fenBefore,
          movePlayed: { san: currentMove.san, uci: currentMove.uci },
          moveBest: { san: currentMove.bestMoveSan, uci: currentMove.bestMoveUci },
          evalPlayed: formatEval(currentMove.evalAfter, currentMove.mateAfter),
          evalBest: formatEval(currentMove.evalBefore, currentMove.mateBefore),
          classification: `${badge.label} - Question de l'élève: "${userQuestion}"`,
          pv: currentMove.pv.slice(0, 5).join(' '),
          playerColor: isWhite ? 'white' : 'black',
          moveNumber: currentMove.moveNumber,
          sanHistory: sanHistory.slice(0, currentMove.ply + 1),
        }),
      });

      const res = await response.json();
      if (res.success && res.data) {
        const planFormatted = res.data.plan
          ? `\n\nPlan suggéré :\n${formatPlanSteps(res.data.plan)
              .map((s, idx) => `${idx + 1}. ${s}`)
              .join('\n')}`
          : '';
        setCustomAnswer(
          `${res.data.whyBestIsBetter || res.data.whyPlayedIsBad}${planFormatted}`
        );
      }
    } catch (err) {
      console.error('Failed to answer custom question:', err);
      setCustomAnswer("Désolé, impossible d'obtenir la réponse de l'entraîneur.");
    } finally {
      setLoadingQuestion(false);
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
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isPreviewingAlternative
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>
              {isPreviewingAlternative ? 'Mode : Alternative affichée' : 'Voir alternative sur l’échiquier'}
            </span>
          </button>
        )}
      </div>

      {/* Side-by-Side Comparison: Played Move vs Stockfish Best Move */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Played Move Card */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isPositiveMove
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
            <span className={`text-2xl font-bold font-mono ${isPositiveMove ? 'text-emerald-300' : 'text-slate-100'}`}>
              {currentMove.san}
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
              : 'bg-slate-950/70 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAlternativeAvailable ? 'Alternative Stockfish' : 'Validation Stockfish'}</span>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {formatEval(currentMove.evalBefore, currentMove.mateBefore)}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold font-mono text-emerald-300">
              {isAlternativeAvailable
                ? currentMove.bestMoveSan || currentMove.bestMoveUci
                : currentMove.san}
            </span>
            <span className="text-xs text-emerald-500/80 font-mono">
              {isAlternativeAvailable
                ? currentMove.bestMoveFrom && `(${currentMove.bestMoveFrom} ➔ ${currentMove.bestMoveTo})`
                : '(Choix optimal validé)'}
            </span>
          </div>

          <div className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-800/60">
            {currentMove.pv.length > 0 ? (
              <div className="flex items-center gap-1 truncate text-slate-300 font-mono text-[11px]">
                <span className="text-slate-500">Suite :</span>
                <span className="text-slate-300 truncate">
                  {currentMove.pv.slice(0, 6).join(' ')}
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

      {/* Pedagogical AI Coach Section */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center text-indigo-400">
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer"
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
              <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-lg text-slate-300">
                <span className="font-semibold text-rose-300 block mb-1">
                  Pourquoi {currentMove.san} est une {badge.label.toLowerCase()} :
                </span>
                <p>{currentMove.aiExplanation.whyPlayedIsBad}</p>
              </div>
            )}

            {/* Why best move / played move is strong (Emerald box) */}
            <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-slate-300">
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
              <p>{currentMove.aiExplanation.whyBestIsBetter || currentMove.aiExplanation.whyPlayedIsBad}</p>
            </div>

            {/* Strategic Plan */}
            {currentMove.aiExplanation.plan && (
              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg text-slate-300">
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
                      className="flex items-start gap-2.5 p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg text-slate-200"
                    >
                      <span className="w-5 h-5 rounded-md bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-bold font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        {idx + 1}
                      </span>
                      <p className="text-xs leading-relaxed text-slate-200">{step}</p>
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

        {/* Ask Coach Follow-Up */}
        <form onSubmit={handleAskQuestion} className="mt-2 pt-3 border-t border-slate-800/80 flex gap-2">
          <input
            type="text"
            value={userQuestion}
            onChange={(e) => setUserQuestion(e.target.value)}
            placeholder="Posez une question au coach (ex: Pourquoi pas Dd8 ? Quelle était la menace ?)..."
            className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={loadingQuestion || !userQuestion.trim()}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            {loadingQuestion ? (
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <MessageSquare className="w-3.5 h-3.5" />
            )}
            <span>Demander</span>
          </button>
        </form>

        {customAnswer && (
          <div className="p-3 bg-slate-900/90 border border-indigo-500/30 rounded-lg text-xs text-slate-200 whitespace-pre-line mt-2">
            <span className="font-semibold text-indigo-400 block mb-1">Réponse de l'entraîneur :</span>
            {customAnswer}
          </div>
        )}
      </div>
    </div>
  );
};
