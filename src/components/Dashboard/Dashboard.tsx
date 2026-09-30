import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  FileDown,
  Flame,
  GraduationCap,
  Lightbulb,
  Share2,
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
import { PlayerRadarChart } from './PlayerRadarChart';

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

  const [copiedSummary, setCopiedSummary] = useState(false);

  // Phase breakdown calculation (Opening: 1-12, Middlegame: 13-30, Endgame: 31+)
  const phaseStats = useMemo(() => {
    const calcPhase = (startMove: number, endMove: number) => {
      const phaseMoves = moves.filter((m) => m.moveNumber >= startMove && m.moveNumber <= endMove);
      const whiteMoves = phaseMoves.filter((m) => m.color === 'w');
      const blackMoves = phaseMoves.filter((m) => m.color === 'b');

      const calcAccuracy = (mList: MoveAnalysis[]) => {
        if (mList.length === 0) return null;
        const totalCp = mList.reduce((acc, curr) => acc + curr.centipawnLoss, 0);
        const avgLoss = totalCp / mList.length;
        return Math.min(99.4, Math.max(25.0, Math.round(100 * Math.exp(-0.0038 * avgLoss) * 10) / 10));
      };

      const countBlunders = (mList: MoveAnalysis[]) =>
        mList.filter((m) => ['blunder', 'missedWin'].includes(m.classification)).length;

      const countMistakes = (mList: MoveAnalysis[]) =>
        mList.filter((m) => m.classification === 'mistake').length;

      const countInaccuracies = (mList: MoveAnalysis[]) =>
        mList.filter((m) => m.classification === 'inaccuracy').length;

      return {
        totalMoves: phaseMoves.length,
        whiteCount: whiteMoves.length,
        blackCount: blackMoves.length,
        whiteAccuracy: calcAccuracy(whiteMoves),
        blackAccuracy: calcAccuracy(blackMoves),
        whiteBlunders: countBlunders(whiteMoves),
        blackBlunders: countBlunders(blackMoves),
        whiteMistakes: countMistakes(whiteMoves),
        blackMistakes: countMistakes(blackMoves),
        whiteInaccuracies: countInaccuracies(whiteMoves),
        blackInaccuracies: countInaccuracies(blackMoves),
      };
    };

    return {
      opening: calcPhase(1, 12),
      middlegame: calcPhase(13, 30),
      endgame: calcPhase(31, 999),
    };
  }, [moves]);

  // Quick summary share generator
  const handleCopySummary = () => {
    const whiteName = metadata.white || 'Blancs';
    const blackName = metadata.black || 'Noirs';
    const resultStr = metadata.result && metadata.result !== '*' ? `🏆 Résultat : ${metadata.result}\n` : '';
    const openingStr = metadata.opening ? `📖 Ouverture : ${metadata.opening}${metadata.eco ? ` [${metadata.eco}]` : ''}\n` : '';

    const text = `♟️ Échiquier IA — Bilan de la partie
${whiteName} (${statsWhite.accuracy}%) vs ${blackName} (${statsBlack.accuracy}%)
${resultStr}${openingStr}⏱️ Durée : ${Math.ceil(moves.length / 2)} coups
⚪ Blancs : ${statsWhite.best + statsWhite.brilliant} meilleurs coups · ${statsWhite.inaccuracies} imprécision(s) · ${statsWhite.mistakes} erreur(s) · ${statsWhite.blunders + statsWhite.missedWins} gaffe(s)
⚫ Noirs : ${statsBlack.best + statsBlack.brilliant} meilleurs coups · ${statsBlack.inaccuracies} imprécision(s) · ${statsBlack.mistakes} erreur(s) · ${statsBlack.blunders + statsBlack.missedWins} gaffe(s)
${phaseStats.opening.whiteAccuracy !== null ? `\n📊 Précision par phase :
• Ouverture (coups 1-12) : Blancs ${phaseStats.opening.whiteAccuracy ?? '-'}% | Noirs ${phaseStats.opening.blackAccuracy ?? '-'}%
• Milieu de jeu (coups 13-30) : Blancs ${phaseStats.middlegame.whiteAccuracy ?? '-'}% | Noirs ${phaseStats.middlegame.blackAccuracy ?? '-'}%
• Finale (coups 31+) : ${phaseStats.endgame.totalMoves > 0 ? `Blancs ${phaseStats.endgame.whiteAccuracy ?? '-'}% | Noirs ${phaseStats.endgame.blackAccuracy ?? '-'}%` : 'Non atteinte'}` : ''}

Analysé avec Échiquier IA & Stockfish 19`;

    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  // Client-side fallback generator if network or backend fails
  const generateSituationalSummaryClient = (params: {
    userName: string;
    userColor: 'w' | 'b';
    isUserWhite: boolean;
    opponentName: string;
    result?: string;
    opening?: string;
    eco?: string;
    userAccuracy: number;
    oppAccuracy: number;
    userStats: any;
    userBlunders: Array<{ moveNumber: number; color: string; san: string; best?: string; loss: number }>;
    userBestMoves: Array<{ moveNumber: number; color: string; san: string }>;
    criticalMoments: any[];
  }) => {
    const {
      userName,
      userColor,
      isUserWhite,
      opponentName,
      result = '*',
      opening = '',
      eco = '',
      userAccuracy,
      userStats,
      userBlunders,
      userBestMoves,
      criticalMoments,
    } = params;

    const biggestBlunder = userBlunders[0];
    const secondFault = userBlunders[1] || criticalMoments[0];
    const openingLabel = opening ? `${opening} (${eco || 'Standard'})` : "l'ouverture";

    const strengths: string[] = [];
    if (userBestMoves.length > 0) {
      const bm = userBestMoves[0];
      strengths.push(
        `Excellente inspiration au coup ${bm.moveNumber} (${bm.san}), démontrant une juste appréciation tactique de la position.`
      );
    }
    strengths.push(
      `Comportement solide dans ${openingLabel} avec une entrée en matière cohérente et un respect des principes fondamentaux.`
    );
    if (userAccuracy >= 70) {
      strengths.push(
        `Précision globale appréciable (${userAccuracy}%) témoignant d'une bonne vigilance sur les phases régulières.`
      );
    }

    const weaknesses: string[] = [];
    if (biggestBlunder) {
      weaknesses.push(
        `Coup critique au tour ${biggestBlunder.moveNumber} (${biggestBlunder.san}) : concède un avantage de ${((biggestBlunder.loss || 0) / 100).toFixed(1)} pions. Le coup recommandé était ${biggestBlunder.best || 'une alternative plus solide'}.`
      );
    }
    if (secondFault) {
      weaknesses.push(
        `Tournant tactique au coup ${secondFault.moveNumber} (${secondFault.san}) : manque l'option la plus percutante ${secondFault.best || 'de consolidation'}.`
      );
    }
    if (userStats?.middlegameBlunders > 0) {
      weaknesses.push(
        `Flottement en milieu de jeu (${userStats.middlegameBlunders} moment(s) de pression mal négociés).`
      );
    }

    const advice: string[] = [];
    if (biggestBlunder) {
      advice.push(
        `Rejouer la position du coup ${biggestBlunder.moveNumber} en recherchant en priorité le coup candidat ${biggestBlunder.best || 'le plus actif'}.`
      );
    }
    if (opening) {
      advice.push(
        `Approfondir les 3 premiers coups théoriques de ${opening} pour accélérer la prise d'initiative et sécuriser le Roi.`
      );
    } else {
      advice.push('Résoudre quotidiennement des exercices tactiques sur les pièces non protégées.');
    }
    advice.push(
      'Prendre 15 à 30 secondes supplémentaires sur les coups candidats avant de valider un échange de pièces complexe.'
    );

    return {
      title: `${userName} dans ${opening || 'Partie Tactique'} (${result || '*'})`,
      narrative: `Dans cette confrontation sur ${openingLabel}, ${userName} (${isUserWhite ? 'Blancs' : 'Noirs'}) a développé des idées actives avec ${userAccuracy}% de précision face à ${opponentName}. Le sort de la partie a basculé lors des choix tactiques cruciaux du milieu de jeu.`,
      targetPlayer: {
        name: userName,
        color: userColor,
        accuracy: userAccuracy,
      },
      strengthsUser: strengths,
      weaknessesUser: weaknesses,
      strengthsWhite: isUserWhite ? strengths : ['Initiative au centre'],
      weaknessesWhite: isUserWhite ? weaknesses : ['Surveillance des diagonales'],
      strengthsBlack: !isUserWhite ? strengths : ['Résilience défensive'],
      weaknessesBlack: !isUserWhite ? weaknesses : ['Sécurité du roi'],
      trainingAdvice: advice,
    };
  };

  // Generate full game report from Gemini (with fail-safe fallback)
  const handleGenerateSummary = async () => {
    setLoadingSummary(true);
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

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      try {
        const response = await fetch('/api/coach/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
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

        clearTimeout(timeoutId);

        if (response.ok) {
          const res = await response.json();
          if (res.success && res.data) {
            onUpdateAiSummary(res.data);
            return;
          }
        }
      } catch (networkErr) {
        console.warn('Backend call to /api/coach/summary failed or timed out, generating local fallback:', networkErr);
      }

      // If backend network failed or returned error, generate situational summary immediately
      const fallbackSummary = generateSituationalSummaryClient({
        userName: isUserWhite ? metadata.white || 'Blancs' : metadata.black || 'Noirs',
        userColor,
        isUserWhite,
        opponentName: isUserWhite ? metadata.black || 'Noirs' : metadata.white || 'Blancs',
        result: metadata.result,
        opening: metadata.opening,
        eco: metadata.eco,
        userAccuracy: isUserWhite ? statsWhite.accuracy : statsBlack.accuracy,
        oppAccuracy: isUserWhite ? statsBlack.accuracy : statsWhite.accuracy,
        userStats: isUserWhite ? statsWhite : statsBlack,
        userBlunders,
        userBestMoves,
        criticalMoments: criticalMoves,
      });

      onUpdateAiSummary(fallbackSummary);
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

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={handleCopySummary}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-md ${
              copiedSummary
                ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                : 'bg-slate-800/90 hover:bg-slate-750 border-slate-700 hover:border-slate-600 text-slate-200 active:scale-98'
            }`}
            title="Copier un résumé formaté prêt à coller sur Discord, WhatsApp ou X"
          >
            {copiedSummary ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-indigo-400" />}
            <span>{copiedSummary ? 'Bilan copié !' : 'Partager le Bilan'}</span>
          </button>

          <button
            onClick={() => generateChessAnalysisPdf(analysis)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            <span>Télécharger PDF</span>
          </button>
        </div>
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
                {statsWhite.rushedMovesCount ? (
                  <span className="text-rose-400 font-semibold"> · {statsWhite.rushedMovesCount} précipité(s) ⚡</span>
                ) : ''}
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
                {statsBlack.rushedMovesCount ? (
                  <span className="text-rose-400 font-semibold"> · {statsBlack.rushedMovesCount} précipité(s) ⚡</span>
                ) : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Phase-by-Phase Breakdown (Ouverture, Milieu de jeu, Finale) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Analyse par Phase de Jeu
          </h3>
          <span className="text-xs text-slate-400">
            Précision & fautes réparties par étape
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
          {/* 1. Ouverture */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-200 text-sm">Ouverture</span>
                <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full font-mono">
                  Coups 1 à 12
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Développement des pièces, contrôle du centre et roque.
              </p>
            </div>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between items-center text-[11px] mb-1">
                  <span className="text-slate-300 font-medium">Blancs</span>
                  <span className="font-mono font-bold text-slate-100">
                    {phaseStats.opening.whiteAccuracy !== null ? `${phaseStats.opening.whiteAccuracy}%` : '-'}
                  </span>
                </div>
                <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-indigo-400 h-full rounded-full"
                    style={{ width: `${phaseStats.opening.whiteAccuracy || 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-[11px] mb-1">
                  <span className="text-slate-300 font-medium">Noirs</span>
                  <span className="font-mono font-bold text-slate-100">
                    {phaseStats.opening.blackAccuracy !== null ? `${phaseStats.opening.blackAccuracy}%` : '-'}
                  </span>
                </div>
                <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-400 h-full rounded-full"
                    style={{ width: `${phaseStats.opening.blackAccuracy || 0}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
              <span>Gaffes / Fautes :</span>
              <span className="font-mono font-bold text-slate-300">
                {phaseStats.opening.whiteBlunders + phaseStats.opening.whiteMistakes} (B) / {phaseStats.opening.blackBlunders + phaseStats.opening.blackMistakes} (N)
              </span>
            </div>
          </div>

          {/* 2. Milieu de jeu */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-200 text-sm">Milieu de Jeu</span>
                <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full font-mono">
                  Coups 13 à 30
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Calculs tactiques, plans stratégiques et attaques de roque.
              </p>
            </div>

            {phaseStats.middlegame.totalMoves > 0 ? (
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between items-center text-[11px] mb-1">
                    <span className="text-slate-300 font-medium">Blancs</span>
                    <span className="font-mono font-bold text-slate-100">
                      {phaseStats.middlegame.whiteAccuracy !== null ? `${phaseStats.middlegame.whiteAccuracy}%` : '-'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-400 h-full rounded-full"
                      style={{ width: `${phaseStats.middlegame.whiteAccuracy || 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-[11px] mb-1">
                    <span className="text-slate-300 font-medium">Noirs</span>
                    <span className="font-mono font-bold text-slate-100">
                      {phaseStats.middlegame.blackAccuracy !== null ? `${phaseStats.middlegame.blackAccuracy}%` : '-'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full rounded-full"
                      style={{ width: `${phaseStats.middlegame.blackAccuracy || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-slate-500 text-[11px] italic">
                Partie conclue avant le milieu de jeu
              </div>
            )}

            <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
              <span>Gaffes / Fautes :</span>
              <span className="font-mono font-bold text-slate-300">
                {phaseStats.middlegame.whiteBlunders + phaseStats.middlegame.whiteMistakes} (B) / {phaseStats.middlegame.blackBlunders + phaseStats.middlegame.blackMistakes} (N)
              </span>
            </div>
          </div>

          {/* 3. Finale */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-200 text-sm">Finale</span>
                <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full font-mono">
                  Coups 31+
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Promotion de pions, technique de roi actif et conversion.
              </p>
            </div>

            {phaseStats.endgame.totalMoves > 0 ? (
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between items-center text-[11px] mb-1">
                    <span className="text-slate-300 font-medium">Blancs</span>
                    <span className="font-mono font-bold text-slate-100">
                      {phaseStats.endgame.whiteAccuracy !== null ? `${phaseStats.endgame.whiteAccuracy}%` : '-'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-400 h-full rounded-full"
                      style={{ width: `${phaseStats.endgame.whiteAccuracy || 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-[11px] mb-1">
                    <span className="text-slate-300 font-medium">Noirs</span>
                    <span className="font-mono font-bold text-slate-100">
                      {phaseStats.endgame.blackAccuracy !== null ? `${phaseStats.endgame.blackAccuracy}%` : '-'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full rounded-full"
                      style={{ width: `${phaseStats.endgame.blackAccuracy || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-slate-500 text-[11px] italic">
                Finale non atteinte dans cette partie
              </div>
            )}

            <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
              <span>Gaffes / Fautes :</span>
              <span className="font-mono font-bold text-slate-300">
                {phaseStats.endgame.totalMoves > 0
                  ? `${phaseStats.endgame.whiteBlunders + phaseStats.endgame.whiteMistakes} (B) / ${phaseStats.endgame.blackBlunders + phaseStats.endgame.blackMistakes} (N)`
                  : '-'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Spider / Radar Chart (Forces & Faiblesses sur 5 Dimensions) */}
      <PlayerRadarChart
        moves={moves}
        statsWhite={statsWhite}
        statsBlack={statsBlack}
        metadata={metadata}
        userColor={userColor}
        userPseudo={userPseudo}
        phaseStats={phaseStats}
      />

      {/* Move Breakdown Matrix */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Target className="w-4 h-4 text-indigo-400" />
          Répartition Détaillée des Coups
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-violet-400 font-semibold mb-2">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Théorie</span>
            </div>
            <div className="flex justify-between items-baseline font-mono font-bold">
              <span className="text-slate-200">{statsWhite.book ?? 0}</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">{statsBlack.book ?? 0}</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1">Blancs | Noirs</span>
          </div>

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
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
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
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-all w-full sm:w-auto cursor-pointer"
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 gap-2.5">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span className="text-xs text-slate-400">
                        Bilan pour :
                      </span>
                      <span className="font-bold text-white text-xs bg-indigo-600/30 border border-indigo-500/30 px-2 py-0.5 rounded-md truncate max-w-[200px]">
                        {targetName} ({targetColorLabel})
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 w-full sm:w-auto text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedPerspective('user')}
                        className={`px-2 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer truncate ${
                          selectedPerspective === 'user'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title={`Mon profil (${isUserWhite ? 'Blancs' : 'Noirs'})`}
                      >
                        👤 Profil
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPerspective('white')}
                        className={`px-2 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer truncate ${
                          selectedPerspective === 'white'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title={`Blancs (${metadata.white || 'Blancs'})`}
                      >
                        ⚪ Blancs
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPerspective('black')}
                        className={`px-2 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer truncate ${
                          selectedPerspective === 'black'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title={`Noirs (${metadata.black || 'Noirs'})`}
                      >
                        ⚫ Noirs
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
