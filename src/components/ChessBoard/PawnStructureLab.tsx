import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  GitFork,
  HelpCircle,
  Layers,
  MapPin,
  Shield,
  Sparkles,
  Swords,
  Target,
  X,
  Zap,
} from 'lucide-react';
import { PawnStructureAnalysis } from '../../utils/pawnStructure';

interface PawnStructureLabProps {
  structure: PawnStructureAnalysis;
  isOpen: boolean;
  onClose: () => void;
  showBoardOverlay: boolean;
  onToggleBoardOverlay: () => void;
}

export const PawnStructureLab: React.FC<PawnStructureLabProps> = ({
  structure,
  isOpen,
  onClose,
  showBoardOverlay,
  onToggleBoardOverlay,
}) => {
  const [activeTab, setActiveTab] = useState<'plans' | 'outposts' | 'weaknesses'>('plans');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 font-bold">
              ♟
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-white truncate">
                  {structure.name}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-[10px] font-semibold">
                  {structure.category}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                {structure.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {/* Board overlay toggle button */}
            <button
              onClick={onToggleBoardOverlay}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                showBoardOverlay
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title="Afficher/masquer les avant-postes et leviers directement sur l'échiquier"
            >
              {showBoardOverlay ? <Eye className="w-3.5 h-3.5 text-amber-400" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span className="hidden xs:inline">Surbrillances plateau :</span>
              <span>{showBoardOverlay ? 'Activées' : 'Désactivées'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Metric Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 sm:p-4 bg-slate-950/40 border-b border-slate-800/80 text-xs">
          {/* Tension */}
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Tension centrale
            </span>
            <span className="font-bold text-white flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  structure.centerTension === 'locked'
                    ? 'bg-rose-500'
                    : structure.centerTension === 'open'
                    ? 'bg-emerald-400'
                    : 'bg-amber-400'
                }`}
              />
              <span className="capitalize">
                {structure.centerTension === 'locked'
                  ? 'Verrouillé'
                  : structure.centerTension === 'open'
                  ? 'Ouvert'
                  : structure.centerTension === 'semi-open'
                  ? 'Semi-ouvert'
                  : 'Fluide'}
              </span>
            </span>
          </div>

          {/* Islands */}
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Îlots de pions
            </span>
            <div className="font-mono font-bold text-white flex items-center gap-2">
              <span className="text-slate-300">⚪ {structure.whiteIslands}</span>
              <span className="text-slate-500">vs</span>
              <span className="text-slate-300">⚫ {structure.blackIslands}</span>
            </div>
          </div>

          {/* Passed Pawns */}
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Pions passés
            </span>
            <div className="font-mono font-bold text-white flex items-center gap-2">
              <span className="text-emerald-400 font-bold">⚪ {structure.whitePassedCount}</span>
              <span className="text-slate-500">vs</span>
              <span className="text-emerald-400 font-bold">⚫ {structure.blackPassedCount}</span>
            </div>
          </div>

          {/* Outposts */}
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Avant-postes détectés
            </span>
            <span className="font-mono font-bold text-amber-300">
              {structure.outposts.length} case(s) clé(s)
            </span>
          </div>
        </div>

        {/* Majority Advantage Banner */}
        {structure.majorityAdvantage.wing !== 'none' && (
          <div className="px-4 py-2 bg-indigo-950/30 border-b border-indigo-900/40 text-xs flex items-center gap-2 text-indigo-200">
            <Award className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-medium">{structure.majorityAdvantage.description}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-4 pt-2 gap-1 bg-slate-950/20 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('plans')}
            className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'plans'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Swords className="w-3.5 h-3.5" />
            <span>Plans stratégiques</span>
          </button>
          <button
            onClick={() => setActiveTab('outposts')}
            className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'outposts'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Avant-postes & Ruptures ({structure.outposts.length + structure.breaks.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('weaknesses')}
            className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'weaknesses'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Bilan des faiblesses</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs leading-relaxed">
          {activeTab === 'plans' && (
            <div className="space-y-3.5">
              {/* White Plan */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 font-bold text-white">
                  <div className="w-2.5 h-2.5 rounded-full bg-white border border-slate-300" />
                  <span className="text-sm">Plan stratégique recommandé pour les Blancs</span>
                </div>
                <p className="text-slate-300 leading-normal mt-1">{structure.whitePlan}</p>
              </div>

              {/* Black Plan */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 font-bold text-white">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-600" />
                  <span className="text-sm">Plan stratégique recommandé pour les Noirs</span>
                </div>
                <p className="text-slate-300 leading-normal mt-1">{structure.blackPlan}</p>
              </div>
            </div>
          )}

          {activeTab === 'outposts' && (
            <div className="space-y-4">
              {/* Outposts section */}
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-amber-400" />
                  <span>Cases fortes & Avant-postes (Inattaquables par les pions adverses)</span>
                </h4>
                {structure.outposts.length === 0 ? (
                  <p className="p-3 bg-slate-950/60 rounded-xl text-slate-400 border border-slate-800">
                    Aucun avant-poste avancé permanent n'est stabilisé dans cette position.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {structure.outposts.map((o) => (
                      <div
                        key={o.square}
                        className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-2.5"
                      >
                        <span className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 font-mono font-bold text-xs flex items-center justify-center shrink-0 uppercase">
                          {o.square}
                        </span>
                        <div>
                          <div className="font-bold text-white flex items-center gap-1">
                            <span>Avant-poste pour {o.color === 'w' ? '⚪ Blancs' : '⚫ Noirs'}</span>
                            {o.isProtectedByPawn && (
                              <span className="text-[10px] text-emerald-400 font-normal">(soutenu par pion)</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Idéal pour y installer un Cavalier ou un Fou dominateur.
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pawn breaks section */}
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <GitFork className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Leviers & Ruptures de pions possibles</span>
                </h4>
                {structure.breaks.length === 0 ? (
                  <p className="p-3 bg-slate-950/60 rounded-xl text-slate-400 border border-slate-800">
                    Aucune rupture de pion immédiate n'est disponible. Préparez vos poussées de pions.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {structure.breaks.map((b) => (
                      <div
                        key={`${b.fromSquare}-${b.toSquare}`}
                        className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-2.5"
                      >
                        <span className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                          {b.san}
                        </span>
                        <div>
                          <div className="font-bold text-white">
                            Levier de {b.color === 'w' ? 'Blancs' : 'Noirs'}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{b.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'weaknesses' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {/* White Weaknesses */}
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-2">
                  <span className="font-bold text-white flex items-center gap-1.5 border-b border-slate-800 pb-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-400" />
                    <span>Pions Blancs</span>
                  </span>
                  <div className="space-y-1.5 text-slate-300 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pions passés :</span>
                      <span className="font-mono font-bold text-emerald-400">{structure.whitePassedCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pions isolés :</span>
                      <span className="font-mono font-bold text-amber-400">{structure.whiteIsolatedCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pions doublés :</span>
                      <span className="font-mono font-bold text-rose-400">{structure.whiteDoubledCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pions arriérés :</span>
                      <span className="font-mono font-bold text-amber-400">{structure.whiteBackwardCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Îlots de pions :</span>
                      <span className="font-mono font-bold text-slate-200">{structure.whiteIslands}</span>
                    </div>
                  </div>
                </div>

                {/* Black Weaknesses */}
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-2">
                  <span className="font-bold text-white flex items-center gap-1.5 border-b border-slate-800 pb-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-600" />
                    <span>Pions Noirs</span>
                  </span>
                  <div className="space-y-1.5 text-slate-300 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pions passés :</span>
                      <span className="font-mono font-bold text-emerald-400">{structure.blackPassedCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pions isolés :</span>
                      <span className="font-mono font-bold text-amber-400">{structure.blackIsolatedCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pions doublés :</span>
                      <span className="font-mono font-bold text-rose-400">{structure.blackDoubledCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Pions arriérés :</span>
                      <span className="font-mono font-bold text-amber-400">{structure.blackBackwardCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Îlots de pions :</span>
                      <span className="font-mono font-bold text-slate-200">{structure.blackIslands}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
