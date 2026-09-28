import React, { useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileDown,
  Flame,
  GraduationCap,
  Lightbulb,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  User,
  XCircle,
} from 'lucide-react';
import { GameAnalysisResult, MoveAnalysis } from '../../types/chess';
import { generateChessAnalysisPdf } from '../../utils/pdfExport';

interface DashboardProps {
  analysis: GameAnalysisResult;
  onSelectPly: (ply: number) => void;
  onUpdateAiSummary: (summary: NonNullable<GameAnalysisResult['aiSummary']>) => void;
  userPseudo?: string;
  userColor?: 'w' | 'b';
  onUpdateUserColor?: (color: 'w' | 'b') => void;
  onUpdatePseudo?: (pseudo: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  analysis,
  onSelectPly,
  onUpdateAiSummary,
  userPseudo = '',
  userColor = 'w',
  onUpdateUserColor,
  onUpdatePseudo,
}) => {
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [selectedPerspective, setSelectedPerspective] = useState<'user' | 'white' | 'black'>('user');
  const { metadata, moves, statsWhite, statsBlack, aiSummary } = analysis;

  // Filter critical moves for quick jump
  const criticalMoves = moves.filter(
    (m) => m.classification === 'blunder' || m.classification === 'mistake' || m.classification === 'missedWin'
  );

  // Generate full game report from Gemini
  const handleGenerateSummary = async () => {
    setLoadingSummary(true);
    try {
      const isUserWhite = userColor === 'w';
      const userBlunders = moves
        .filter(
          (m) =>
            m.color === userColor &&
            (m.classification === 'blunder' ||
              m.classification === 'missedWin' ||
              m.classification === 'mistake')
        )
        .map((m) => ({
          moveNumber: m.moveNumber,
          color: m.color,
          san: m.san,
          best: m.bestMoveSan,
          loss: m.centipawnLoss,
        }));

      const userBestMoves = moves
        .filter(
          (m) =>
            m.color === userColor &&
            (m.classification === 'best' || m.classification === 'brilliant')
        )
        .map((m) => ({
          moveNumber: m.moveNumber,
          color: m.color,
          san: m.san,
        }));

      const response = await fetch('/api/coach/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPseudo,
          userColor,
          whiteName: metadata.white,
          blackName: metadata.black,
          result: metadata.result,
          opening: metadata.opening,
          eco: metadata.eco,
          accuracyWhite: statsWhite.accuracy,
          accuracyBlack: statsBlack.accuracy,
          statsWhite,
          statsBlack,
          userBlunders,
          userBestMoves,
          criticalMoments: criticalMoves.slice(0, 8).map((m) => ({
            ply: m.ply,
            moveNumber: m.moveNumber,
            color: m.color,
            san: m.san,
            best: m.bestMoveSan,
            classification: m.classification,
            loss: m.centipawnLoss,
          })),
        }),
      });

      const res = await response.json();
      if (res.success && res.data) {
        onUpdateAiSummary(res.data);
      }
    } catch (err) {
      console.error('Failed to generate full AI coaching summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {/* Top Action & Export Banner */}
      <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-900 border border-indigo-900/50 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full inline-block mb-1.5">
            Exportation & Archivage
          </span>
          <h2 className="text-base sm:text-lg font-bold text-white">
            Tableau de Bord & Synthèse de Progression
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Téléchargez le rapport complet au format PDF comprenant les statistiques clés, le graphique d'évaluation et les moments décisifs.
          </p>
        </div>

        <button
          onClick={() => generateChessAnalysisPdf(analysis)}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
        >
          <FileDown className="w-4 h-4" />
          <span>Télécharger le Rapport PDF</span>
        </button>
      </div>

      {/* Recognized Lichess Opening Banner */}
      {metadata.opening && (
        <div className="flex items-center gap-3 p-3.5 bg-gradient-to-r from-indigo-950/50 via-slate-900/80 to-slate-900/80 border border-indigo-500/30 rounded-2xl shadow-md">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-slate-400 font-medium">Ouverture identifiée :</span>
            {metadata.eco && (
              <span className="px-2 py-0.5 rounded-md bg-indigo-600/30 border border-indigo-400/30 font-mono font-bold text-indigo-300 text-[11px]">
                {metadata.eco}
              </span>
            )}
            <span className="text-white font-semibold text-sm">{metadata.opening}</span>
          </div>
        </div>
      )}

      {/* Accuracy & Global Precision Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* White Accuracy */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
                Joueur Blancs
              </span>
              <h3 className="text-base font-bold text-slate-100 truncate">
                {metadata.white || 'Blancs'}
              </h3>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black font-mono text-slate-100">
                {statsWhite.accuracy}%
              </span>
              <span className="text-[10px] text-slate-400 block">Précision globale</span>
            </div>
          </div>

          {/* Precision Bar */}
          <div className="w-full bg-slate-800 rounded-full h-2 mb-4 overflow-hidden">
            <div
              className="bg-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${statsWhite.accuracy}%` }}
            />
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/60">
              <span className="text-slate-400 block text-[10px]">Gaffes</span>
              <span className="font-mono font-bold text-rose-400 text-sm">
                {statsWhite.blunders + statsWhite.missedWins}
              </span>
            </div>
            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/60">
              <span className="text-slate-400 block text-[10px]">Erreurs</span>
              <span className="font-mono font-bold text-amber-400 text-sm">
                {statsWhite.mistakes}
              </span>
            </div>
            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/60">
              <span className="text-slate-400 block text-[10px]">Meilleurs</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {statsWhite.best + statsWhite.brilliant}
              </span>
            </div>
          </div>

          {/* Time Management Metrics */}
          {statsWhite.avgThinkTimeSeconds !== undefined && (
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Gestion du temps :</span>
              </span>
              <span className="font-mono font-bold text-slate-200">
                ~{statsWhite.avgThinkTimeSeconds}s / coup
                {statsWhite.longThinksCount ? ` · ${statsWhite.longThinksCount} longue(s)` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Black Accuracy */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
                Joueur Noirs
              </span>
              <h3 className="text-base font-bold text-slate-100 truncate">
                {metadata.black || 'Noirs'}
              </h3>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black font-mono text-slate-100">
                {statsBlack.accuracy}%
              </span>
              <span className="text-[10px] text-slate-400 block">Précision globale</span>
            </div>
          </div>

          {/* Precision Bar */}
          <div className="w-full bg-slate-800 rounded-full h-2 mb-4 overflow-hidden">
            <div
              className="bg-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${statsBlack.accuracy}%` }}
            />
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/60">
              <span className="text-slate-400 block text-[10px]">Gaffes</span>
              <span className="font-mono font-bold text-rose-400 text-sm">
                {statsBlack.blunders + statsBlack.missedWins}
              </span>
            </div>
            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/60">
              <span className="text-slate-400 block text-[10px]">Erreurs</span>
              <span className="font-mono font-bold text-amber-400 text-sm">
                {statsBlack.mistakes}
              </span>
            </div>
            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/60">
              <span className="text-slate-400 block text-[10px]">Meilleurs</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {statsBlack.best + statsBlack.brilliant}
              </span>
            </div>
          </div>

          {/* Time Management Metrics */}
          {statsBlack.avgThinkTimeSeconds !== undefined && (
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Gestion du temps :</span>
              </span>
              <span className="font-mono font-bold text-slate-200">
                ~{statsBlack.avgThinkTimeSeconds}s / coup
                {statsBlack.longThinksCount ? ` · ${statsBlack.longThinksCount} longue(s)` : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Move Breakdown Matrix */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Target className="w-4 h-4 text-indigo-400" />
          Répartition Détaillée des Coups
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Brillants</span>
            </div>
            <div className="flex justify-between items-baseline font-mono font-bold">
              <span className="text-slate-200">{statsWhite.brilliant}</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">{statsBlack.brilliant}</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1">Blancs | Noirs</span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-2">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Meilleurs</span>
            </div>
            <div className="flex justify-between items-baseline font-mono font-bold">
              <span className="text-slate-200">{statsWhite.best}</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">{statsBlack.best}</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1">Blancs | Noirs</span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-sky-400 font-semibold mb-2">
              <Award className="w-3.5 h-3.5" />
              <span>Excellents</span>
            </div>
            <div className="flex justify-between items-baseline font-mono font-bold">
              <span className="text-slate-200">{statsWhite.excellent + statsWhite.good}</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">{statsBlack.excellent + statsBlack.good}</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1">Blancs | Noirs</span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-yellow-300 font-semibold mb-2">
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Imprécisions</span>
            </div>
            <div className="flex justify-between items-baseline font-mono font-bold">
              <span className="text-slate-200">{statsWhite.inaccuracies}</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">{statsBlack.inaccuracies}</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1">Blancs | Noirs</span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Erreurs</span>
            </div>
            <div className="flex justify-between items-baseline font-mono font-bold">
              <span className="text-slate-200">{statsWhite.mistakes}</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">{statsBlack.mistakes}</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1">Blancs | Noirs</span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-rose-400 font-semibold mb-2">
              <XCircle className="w-3.5 h-3.5" />
              <span>Gaffes</span>
            </div>
            <div className="flex justify-between items-baseline font-mono font-bold">
              <span className="text-rose-400">{statsWhite.blunders + statsWhite.missedWins}</span>
              <span className="text-slate-500">|</span>
              <span className="text-rose-400">{statsBlack.blunders + statsBlack.missedWins}</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1">Blancs | Noirs</span>
          </div>
        </div>
      </div>

      {/* Critical Moments Quick Selector */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Flame className="w-4 h-4 text-rose-400" />
            Moments Décisifs ({criticalMoves.length} gaffes & erreurs)
          </h3>
          <span className="text-xs text-slate-400">Cliquez pour analyser le moment</span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {criticalMoves.map((m) => {
            const isWhite = m.color === 'w';
            const isBlunder = m.classification === 'blunder' || m.classification === 'missedWin';

            return (
              <button
                key={m.ply}
                onClick={() => onSelectPly(m.ply)}
                className="shrink-0 p-3 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 transition-all text-left flex flex-col justify-between min-w-[140px] group"
              >
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-slate-400">
                    Coup {m.moveNumber} {isWhite ? 'B' : 'N'}
                  </span>
                  <span
                    className={`font-bold ${
                      isBlunder ? 'text-rose-400' : 'text-amber-400'
                    }`}
                  >
                    {isBlunder ? 'Gaffe' : 'Erreur'}
                  </span>
                </div>

                <div className="font-mono font-bold text-slate-200 text-sm my-1 group-hover:text-indigo-300">
                  {m.san}
                </div>

                <div className="text-[10px] text-slate-500 flex items-center justify-between font-mono">
                  <span>Mieux : {m.bestMoveSan}</span>
                  <span className="text-rose-400">-{(m.centipawnLoss / 100).toFixed(1)}</span>
                </div>
              </button>
            );
          })}

          {criticalMoves.length === 0 && (
            <div className="text-xs text-slate-400 py-3">
              Aucune gaffe majeure dans cette partie. Félicitations pour la précision !
            </div>
          )}
        </div>
      </div>

      {/* AI Pedagogical Grandmaster Report */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Bilan Pédagogique du Grand Maître IA
              </h3>
              <p className="text-[11px] text-slate-400">
                Points forts, faiblesses récurrentes et exercices prioritaires pour progresser
              </p>
            </div>
          </div>

          {!aiSummary && (
            <button
              onClick={handleGenerateSummary}
              disabled={loadingSummary}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-all"
            >
              {loadingSummary ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Rédaction du bilan...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Générer le Bilan Complet</span>
                </>
              )}
            </button>
          )}
        </div>

        {aiSummary ? (
          <div className="flex flex-col gap-5 text-xs text-slate-300 leading-relaxed animate-fadeIn">
            {/* Title & Narrative */}
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
              <h4 className="text-sm font-bold text-indigo-300 mb-1">{aiSummary.title}</h4>
              <p className="text-slate-300">{aiSummary.narrative}</p>
            </div>

            {/* Target Player Perspective Switcher */}
            {(() => {
              const isUserWhite = userColor === 'w';
              const userName = userPseudo || (isUserWhite ? metadata.white || 'Blancs' : metadata.black || 'Noirs');
              let targetName = userName;
              let targetColorLabel = isUserWhite ? 'Blancs' : 'Noirs';
              let activeStrengths = aiSummary.strengthsUser || (isUserWhite ? aiSummary.strengthsWhite : aiSummary.strengthsBlack) || [];
              let activeWeaknesses = aiSummary.weaknessesUser || (isUserWhite ? aiSummary.weaknessesWhite : aiSummary.weaknessesBlack) || [];

              if (selectedPerspective === 'white') {
                targetName = metadata.white || 'Blancs';
                targetColorLabel = 'Blancs';
                activeStrengths = aiSummary.strengthsWhite || [];
                activeWeaknesses = aiSummary.weaknessesWhite || [];
              } else if (selectedPerspective === 'black') {
                targetName = metadata.black || 'Noirs';
                targetColorLabel = 'Noirs';
                activeStrengths = aiSummary.strengthsBlack || [];
                activeWeaknesses = aiSummary.weaknessesBlack || [];
              }

              return (
                <>
                  <div className="flex items-center justify-between bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs text-slate-400">
                        Bilan affiché pour :
                      </span>
                      <span className="font-bold text-white text-xs bg-indigo-600/30 border border-indigo-500/30 px-2 py-0.5 rounded-md">
                        {targetName} ({targetColorLabel})
                      </span>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setSelectedPerspective('user')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                          selectedPerspective === 'user'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        👤 Mon profil ({isUserWhite ? 'Blancs' : 'Noirs'})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPerspective('white')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                          selectedPerspective === 'white'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        ⚪ Blancs ({metadata.white || 'Blancs'})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPerspective('black')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                          selectedPerspective === 'black'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        ⚫ Noirs ({metadata.black || 'Noirs'})
                      </button>
                    </div>
                  </div>

                  {/* Strengths & Weaknesses Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Strengths */}
                    <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Points Forts — {targetName} ({targetColorLabel})
                      </span>
                      <ul className="space-y-2 text-slate-300">
                        {activeStrengths.map((s, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✔</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Weaknesses */}
                    <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-xl">
                      <span className="text-xs font-bold text-rose-400 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        Axes d'Amélioration & Fautes Clés — {targetName} ({targetColorLabel})
                      </span>
                      <ul className="space-y-2 text-slate-300">
                        {activeWeaknesses.map((w, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-rose-400 font-bold shrink-0 mt-0.5">⚠</span>
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Training Advice */}
                  {aiSummary.trainingAdvice && (
                    <div className="p-4 bg-indigo-950/20 border border-indigo-900/40 rounded-xl">
                      <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                        <GraduationCap className="w-4 h-4" />
                        Programme d'Entraînement Personnalisé pour {targetName}
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {aiSummary.trainingAdvice.map((advice, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg text-slate-200"
                          >
                            <span className="text-[11px] font-bold text-indigo-400 block mb-1">
                              Conseil #{idx + 1}
                            </span>
                            <p>{advice}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        ) : (
          !loadingSummary && (
            <div className="p-5 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
              <p>
                Obtenez une synthèse complète rédigée par l'intelligence artificielle pédagogique pour identifier vos points forts, vos angles morts tactiques et les exercices recommandés.
              </p>
              <button
                onClick={handleGenerateSummary}
                className="mt-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
              >
                Lancer la synthèse Grand Maître
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
};
