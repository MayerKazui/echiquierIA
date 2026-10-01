import React, { useState, useMemo } from 'react';
import { BookOpen, Check, Share2 } from 'lucide-react';
import { GameAnalysisResult } from '../../types/chess';
import { parseElo } from '../../utils/moveAnalysis';
import { computePhaseStats } from '../../utils/phaseStats';
import { buildGameSummary } from '../../utils/gameSummary';
import { PlayerRadarChart } from './PlayerRadarChart';
import { PlayerAccuracyCard } from './PlayerAccuracyCard';
import { PhaseBreakdown } from './PhaseBreakdown';
import { MoveBreakdown } from './MoveBreakdown';

interface DashboardProps {
  analysis: GameAnalysisResult;
  userPseudo?: string;
  userColor?: 'w' | 'b';
  onUpdateUserColor?: (color: 'w' | 'b') => void;
  onUpdatePseudo?: (pseudo: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ analysis, userPseudo = '', userColor = 'w' }) => {
  const { metadata, moves, statsWhite, statsBlack } = analysis;

  const [copiedSummary, setCopiedSummary] = useState(false);
  const phaseStats = useMemo(
    () => computePhaseStats(moves, { w: parseElo(metadata.whiteElo), b: parseElo(metadata.blackElo) }),
    [moves, metadata.whiteElo, metadata.blackElo]
  );

  const handleCopySummary = () => {
    navigator.clipboard.writeText(buildGameSummary(analysis, phaseStats));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {/* Top Action & Export Banner */}
      <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-900 border border-indigo-900/50 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full inline-block mb-1.5">
            Synthèse
          </span>
          <h2 className="text-base sm:text-lg font-bold text-white">Tableau de Bord & Synthèse de Progression</h2>
          <p className="text-xs text-slate-400 mt-0.5">Statistiques clés de la partie, à partager en un clic.</p>
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
            {copiedSummary ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Share2 className="w-4 h-4 text-indigo-400" />
            )}
            <span>{copiedSummary ? 'Bilan copié !' : 'Partager le Bilan'}</span>
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

      {/* Accuracy & Global Precision */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlayerAccuracyCard roleLabel="Joueur Blancs" name={metadata.white || 'Blancs'} stats={statsWhite} />
        <PlayerAccuracyCard roleLabel="Joueur Noirs" name={metadata.black || 'Noirs'} stats={statsBlack} />
      </div>

      <PhaseBreakdown phaseStats={phaseStats} />

      {/* Spider / Radar Chart (strengths & weaknesses on 5 dimensions) */}
      <PlayerRadarChart
        moves={moves}
        statsWhite={statsWhite}
        statsBlack={statsBlack}
        metadata={metadata}
        userColor={userColor}
        userPseudo={userPseudo}
        phaseStats={phaseStats}
      />

      <MoveBreakdown statsWhite={statsWhite} statsBlack={statsBlack} />
    </div>
  );
};
