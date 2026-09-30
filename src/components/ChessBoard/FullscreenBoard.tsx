import React from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Target,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import { MoveAnalysis, GameMetadata } from '../../types/chess';
import { BoardTheme, HeatmapMode, ChessBoard } from './ChessBoard';
import { CapturedPieces } from './CapturedPieces';
import { EvaluationBar } from '../EvaluationBar/EvaluationBar';
import { TacticalThreat } from '../../utils/tacticalThreats';
import { toFrenchSan } from '../../utils/chessNotation';

interface FullscreenBoardProps {
  isOpen: boolean;
  onClose: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  fen: string;
  isFlipped: boolean;
  onToggleFlip: () => void;
  boardTheme: BoardTheme;
  onSelectBoardTheme: (theme: BoardTheme) => void;
  lastMove?: { from: string; to: string; classification?: string } | null;
  bestMove?: { from: string; to: string } | null;
  showArrows: boolean;
  onToggleArrows: () => void;
  tacticalThreats: TacticalThreat[];
  showThreats: boolean;
  onToggleThreats: () => void;
  heatmapMode: HeatmapMode;
  onSetHeatmapMode: (mode: HeatmapMode) => void;
  boardHeatmapData?: any;
  onSquareClick: (square: string) => void;
  onPieceMove: (from: string, to: string) => void;
  selectedSquare: string | null;
  evalCp: number;
  mate: number | null;
  activeMove: MoveAnalysis | null;
  currentPly: number;
  totalPlies: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playbackSpeed?: 0.5 | 1 | 2 | 4;
  onSelectPlaybackSpeed?: (speed: 0.5 | 1 | 2 | 4) => void;
  onFirstMove: () => void;
  onPrevMove: () => void;
  onNextMove: () => void;
  onLastMove: () => void;
  onPrevError: () => void;
  onNextError: () => void;
  hasPrevError: boolean;
  hasNextError: boolean;
  currentErrorIndex?: number | null;
  totalErrors?: number;
  isMuted: boolean;
  onToggleSound: () => void;
  metadata?: GameMetadata;
  userColor: 'w' | 'b';
  boardMaterial: {
    whiteAdvantage: number;
    blackAdvantage: number;
    whiteCaptured: Array<{ type: 'q' | 'r' | 'b' | 'n' | 'p'; count: number }>;
    blackCaptured: Array<{ type: 'q' | 'r' | 'b' | 'n' | 'p'; count: number }>;
  };
  isSandboxMode: boolean;
  sandboxHistory: Array<{ from: string; to: string; san: string }>;
  onUndoSandboxMove: () => void;
  onExitSandbox: () => void;
  onSelectPly: (ply: number) => void;
  enemyThreatMove?: { from: string; to: string; san?: string; isCapture?: boolean } | null;
  enemyThreatenedSquares?: string[];
  pawnStructureHighlights?: {
    passedSquares?: string[];
    weakSquares?: string[];
    outpostSquares?: string[];
    breakArrows?: Array<{ from: string; to: string }>;
  } | null;
}

export const FullscreenBoard: React.FC<FullscreenBoardProps> = ({
  isOpen,
  onClose,
  containerRef,
  fen,
  isFlipped,
  onToggleFlip,
  boardTheme,
  onSelectBoardTheme,
  lastMove,
  bestMove,
  showArrows,
  onToggleArrows,
  tacticalThreats,
  showThreats,
  onToggleThreats,
  heatmapMode,
  onSetHeatmapMode,
  boardHeatmapData,
  onSquareClick,
  onPieceMove,
  selectedSquare,
  evalCp,
  mate,
  activeMove,
  currentPly,
  totalPlies,
  isPlaying,
  onTogglePlay,
  playbackSpeed = 1,
  onSelectPlaybackSpeed,
  onFirstMove,
  onPrevMove,
  onNextMove,
  onLastMove,
  onPrevError,
  onNextError,
  hasPrevError,
  hasNextError,
  currentErrorIndex,
  totalErrors = 0,
  isMuted,
  onToggleSound,
  metadata,
  userColor,
  boardMaterial,
  isSandboxMode,
  sandboxHistory,
  onUndoSandboxMove,
  onExitSandbox,
  onSelectPly,
  enemyThreatMove = null,
  enemyThreatenedSquares = [],
  pawnStructureHighlights = null,
}) => {
  // Classification badge color & style
  const getBadgeStyle = (classification?: string) => {
    switch (classification) {
      case 'brilliant':
        return 'bg-teal-500/20 text-teal-300 border-teal-500/40 ring-1 ring-teal-400/50';
      case 'great':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'best':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'excellent':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'good':
        return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
      case 'inaccuracy':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'mistake':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      case 'blunder':
        return 'bg-rose-500/25 text-rose-300 border-rose-500/50 ring-1 ring-rose-500/40 font-bold';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getBadgeLabel = (classification?: string) => {
    switch (classification) {
      case 'brilliant':
        return '✨ Brillant';
      case 'great':
        return '🎯 Excellent coup';
      case 'best':
        return '⭐ Meilleur';
      case 'excellent':
        return '✓ Bon coup';
      case 'good':
        return 'Coup jouable';
      case 'inaccuracy':
        return '⚠️ Imprécision';
      case 'mistake':
        return '⚡ Erreur';
      case 'blunder':
        return '❌ Gaffe';
      default:
        return classification || '';
    }
  };

  // Evaluation display
  const evalLabel =
    mate !== null
      ? `M${Math.abs(mate)}`
      : evalCp > 0
      ? `+${(evalCp / 100).toFixed(1)}`
      : evalCp < 0
      ? `${(evalCp / 100).toFixed(1)}`
      : '0.0';

  return (
    <div
      ref={containerRef}
      className={
        isOpen
          ? 'fixed inset-0 z-50 bg-slate-950/98 backdrop-blur-2xl flex flex-col justify-between p-2 sm:p-4 text-slate-100 select-none overflow-hidden transition-all duration-300'
          : 'hidden'
      }
      tabIndex={-1}
    >
      {/* Top Header Bar in Fullscreen Mode */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 shrink-0 text-xs">
        {/* Game and Move Summary Info */}
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          {metadata?.opening && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-200 font-medium truncate max-w-[260px] sm:max-w-none">
              <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">
                {metadata.eco ? `[${metadata.eco}] ` : ''}
                {metadata.opening}
              </span>
            </div>
          )}

          {activeMove && (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="font-bold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                {activeMove.moveNumber}. {toFrenchSan(activeMove.san)}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getBadgeStyle(
                  activeMove.classification
                )}`}
              >
                {getBadgeLabel(activeMove.classification)}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded font-bold text-[11px] ${
                  evalCp > 0 ? 'text-blue-400 bg-blue-500/10' : evalCp < 0 ? 'text-rose-400 bg-rose-500/10' : 'text-slate-300 bg-slate-800'
                }`}
              >
                {evalLabel}
              </span>
            </div>
          )}
        </div>

        {/* Toolbar Controls in Fullscreen */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {/* Tactical Threats Toggle */}
          <button
            onClick={onToggleThreats}
            className={`px-2 py-1 rounded-md font-medium text-[11px] border transition-colors cursor-pointer flex items-center gap-1 ${
              showThreats
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Afficher/masquer les menaces tactiques (Touche T)"
          >
            <Target className="w-3 h-3 text-rose-400" />
            <span className="hidden sm:inline">Menaces</span>
            {tacticalThreats.length > 0 && showThreats && (
              <span className="px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold">
                {tacticalThreats.length}
              </span>
            )}
          </button>

          {/* Space Control / Heatmap Multi-Selector */}
          <div className="flex items-center rounded-lg bg-slate-950 border border-slate-800 p-0.5 text-[10px]">
            <button
              onClick={() => onSetHeatmapMode(heatmapMode === 'both' ? 'none' : 'both')}
              className={`px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                heatmapMode === 'both'
                  ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Contrôle combiné de l'espace (Touche H)"
            >
              <Shield className="w-2.5 h-2.5 text-blue-400" />
              <span>Les 2</span>
            </button>
            <button
              onClick={() => onSetHeatmapMode(heatmapMode === 'white' ? 'none' : 'white')}
              className={`px-1.5 py-0.5 rounded font-semibold cursor-pointer transition-all ${
                heatmapMode === 'white'
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Rayon d'action Blancs"
            >
              ⚪
            </button>
            <button
              onClick={() => onSetHeatmapMode(heatmapMode === 'black' ? 'none' : 'black')}
              className={`px-1.5 py-0.5 rounded font-semibold cursor-pointer transition-all ${
                heatmapMode === 'black'
                  ? 'bg-rose-600/30 text-rose-300 border border-rose-500/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Rayon d'action Noirs"
            >
              ⚫
            </button>
          </div>

          {/* Board Themes */}
          <div className="hidden sm:flex items-center rounded-lg bg-slate-950 border border-slate-800 p-0.5 text-[10px]">
            <button
              onClick={() => onSelectBoardTheme('green')}
              className={`px-1.5 py-0.5 rounded font-medium flex items-center gap-1 cursor-pointer ${
                boardTheme === 'green' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[#779952]" />
              <span>Vert</span>
            </button>
            <button
              onClick={() => onSelectBoardTheme('wood')}
              className={`px-1.5 py-0.5 rounded font-medium flex items-center gap-1 cursor-pointer ${
                boardTheme === 'wood' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[#b58863]" />
              <span>Bois</span>
            </button>
            <button
              onClick={() => onSelectBoardTheme('blue')}
              className={`px-1.5 py-0.5 rounded font-medium flex items-center gap-1 cursor-pointer ${
                boardTheme === 'blue' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[#8ca2ad]" />
              <span>Bleu</span>
            </button>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              !isMuted
                ? 'bg-slate-800 text-indigo-300 border-indigo-500/30'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title="Activer/désactiver les sons (Touche M)"
          >
            {!isMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {/* Flip Board Button */}
          <button
            onClick={onToggleFlip}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
            title="Inverser l'échiquier (Touche F)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Exit Fullscreen Button */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 hover:text-white border border-rose-500/40 transition-colors font-semibold cursor-pointer shadow-sm ml-1"
            title="Quitter le mode plein écran (Touche Échap ou Maj + F)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Quitter</span>
            <span className="text-[10px] text-rose-400/80 font-normal hidden sm:inline">(Échap)</span>
          </button>
        </div>
      </div>

      {/* Main Board Arena in Fullscreen */}
      <div className="flex-1 flex flex-col items-center justify-center p-1 sm:p-2 min-h-0 w-full overflow-hidden">
        <div className="flex flex-col items-center justify-center w-full max-h-full">
          {/* Top Player Strip */}
          <div className="w-full max-w-[min(74vh,74vw,850px)] flex items-center justify-between px-2 py-1 text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <div
                className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border shrink-0 ${
                  isFlipped ? 'bg-white border-slate-300 shadow-sm' : 'bg-slate-800 border-slate-600'
                }`}
              />
              <span className="font-bold text-slate-200 truncate">
                {isFlipped ? metadata?.white || 'Joueur Blancs' : metadata?.black || 'Joueur Noirs'}
              </span>
              {((isFlipped && userColor === 'w') || (!isFlipped && userColor === 'b')) && (
                <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold text-[9px] uppercase tracking-wider shrink-0">
                  VOUS
                </span>
              )}
              {metadata?.blackElo && (
                <span className="text-slate-500 font-mono text-[11px] shrink-0">
                  ({isFlipped ? metadata.whiteElo : metadata.blackElo})
                </span>
              )}
              <CapturedPieces
                captured={isFlipped ? boardMaterial.whiteCaptured : boardMaterial.blackCaptured}
                pieceColor={isFlipped ? 'b' : 'w'}
                advantage={isFlipped ? boardMaterial.whiteAdvantage : boardMaterial.blackAdvantage}
                className="ml-1"
              />
            </div>

            {/* Heatmap differential in header if active */}
            {heatmapMode !== 'none' && boardHeatmapData && (
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                <Shield className="w-3 h-3 text-blue-400" />
                <span>Contrôle : ⚪ {boardHeatmapData.whitePercent}% vs ⚫ {boardHeatmapData.blackPercent}%</span>
              </div>
            )}
          </div>

          {/* Board + Vertical Evaluation Bar */}
          <div className="flex items-stretch justify-center gap-2 sm:gap-3.5 w-full max-h-[min(72vh,72vw,800px)] h-[min(72vh,72vw,800px)]">
            <EvaluationBar evalCp={evalCp} mate={mate} isFlipped={isFlipped} />
            <div className="relative aspect-square h-full max-h-full">
              <ChessBoard
                fen={fen}
                isFlipped={isFlipped}
                boardTheme={boardTheme}
                lastMove={lastMove}
                bestMove={bestMove}
                showArrows={showArrows}
                tacticalThreats={tacticalThreats}
                showThreats={showThreats}
                heatmapMode={heatmapMode}
                onSquareClick={onSquareClick}
                onPieceMove={onPieceMove}
                selectedSquare={selectedSquare}
                maxWidthClass="max-w-[min(72vh,72vw,800px)]"
                className="h-full w-full"
                enemyThreatMove={enemyThreatMove}
                enemyThreatenedSquares={enemyThreatenedSquares}
                pawnStructureHighlights={pawnStructureHighlights}
              />
            </div>
          </div>

          {/* Bottom Player Strip */}
          <div className="w-full max-w-[min(74vh,74vw,850px)] flex items-center justify-between px-2 py-1 text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <div
                className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border shrink-0 ${
                  !isFlipped ? 'bg-white border-slate-300 shadow-sm' : 'bg-slate-800 border-slate-600'
                }`}
              />
              <span className="font-bold text-slate-200 truncate">
                {!isFlipped ? metadata?.white || 'Joueur Blancs' : metadata?.black || 'Joueur Noirs'}
              </span>
              {((!isFlipped && userColor === 'w') || (isFlipped && userColor === 'b')) && (
                <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold text-[9px] uppercase tracking-wider shrink-0">
                  VOUS
                </span>
              )}
              {metadata?.whiteElo && (
                <span className="text-slate-500 font-mono text-[11px] shrink-0">
                  ({!isFlipped ? metadata.whiteElo : metadata.blackElo})
                </span>
              )}
              <CapturedPieces
                captured={!isFlipped ? boardMaterial.whiteCaptured : boardMaterial.blackCaptured}
                pieceColor={!isFlipped ? 'b' : 'w'}
                advantage={!isFlipped ? boardMaterial.whiteAdvantage : boardMaterial.blackAdvantage}
                className="ml-1"
              />
            </div>

            {activeMove?.thinkTimeFormatted && (
              <span className="text-slate-400 font-mono text-[10px] hidden sm:inline">
                ⏱️ Temps : {activeMove.thinkTimeFormatted}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Control & Replay Navigation Bar */}
      <div className="flex flex-col gap-1.5 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 shrink-0 shadow-2xl">
        {/* Sandbox Notice Banner if free exploration is active */}
        {isSandboxMode && (
          <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <FlaskConical className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-bold text-amber-300">Exploration libre :</span>
              <span className="font-mono text-slate-200 truncate text-[11px]">
                {sandboxHistory.map((m, idx) => `${idx + 1}. ${m.san}`).join(' ')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <button
                onClick={onUndoSandboxMove}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px] font-medium hover:bg-slate-700 cursor-pointer"
              >
                <Undo2 className="w-3 h-3 text-amber-400" />
                <span>Annuler</span>
              </button>
              <button
                onClick={onExitSandbox}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600/30 text-rose-200 text-[11px] font-semibold hover:bg-rose-600/50 cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Quitter</span>
              </button>
            </div>
          </div>
        )}

        {/* Moves Timeline Slider */}
        <div className="flex items-center gap-2 w-full px-1">
          <span className="text-[10px] font-mono text-slate-500 w-7 text-right">0</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, totalPlies)}
            value={currentPly}
            onChange={(e) => onSelectPly(Number(e.target.value))}
            className="flex-1 accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
            title={`Coup ${currentPly} / ${totalPlies}`}
          />
          <span className="text-[10px] font-mono text-slate-400 w-8">
            {currentPly}/{totalPlies}
          </span>
        </div>

        {/* Action Controls & Navigation Buttons */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Replay Stepper buttons */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={onFirstMove}
              disabled={currentPly <= 0}
              className="p-1.5 sm:px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
              title="Début de la partie (Flèche Haut)"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onPrevMove}
              disabled={currentPly <= 0}
              className="p-1.5 sm:px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
              title="Coup précédent (Flèche Gauche)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onTogglePlay}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors flex items-center gap-1.5 text-xs shadow-md shadow-indigo-600/30 cursor-pointer"
              title={isPlaying ? 'Pause (Touche Espace)' : `Lecture automatique ${playbackSpeed}x (Touche Espace)`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Lecture'}</span>
            </button>

            {/* Playback Speed Selector (0.5x, 1x, 2x, 4x) */}
            {onSelectPlaybackSpeed && (
              <div className="flex items-center rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[10px]" title="Vitesse de lecture automatique">
                {[0.5, 1, 2, 4].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => onSelectPlaybackSpeed(spd as 0.5 | 1 | 2 | 4)}
                    className={`px-1.5 py-0.5 rounded font-mono font-bold transition-all cursor-pointer ${
                      playbackSpeed === spd
                        ? 'bg-indigo-600/40 text-indigo-300 border border-indigo-500/50'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title={`Vitesse ${spd}x (${spd === 0.5 ? '2.2s' : spd === 1 ? '1.1s' : spd === 2 ? '0.55s' : '0.28s'}/coup)`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={onNextMove}
              disabled={currentPly >= totalPlies}
              className="p-1.5 sm:px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
              title="Coup suivant (Flèche Droite)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onLastMove}
              disabled={currentPly >= totalPlies}
              className="p-1.5 sm:px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
              title="Fin de la partie (Flèche Bas)"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>

          {/* Jump to Critical Faults */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={onPrevError}
              disabled={!hasPrevError}
              className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 disabled:opacity-25 disabled:pointer-events-none transition-colors text-xs font-medium cursor-pointer"
              title="Erreur précédente (Shift + Flèche Gauche)"
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span className="text-[11px]">Préc.</span>
            </button>
            {totalErrors > 0 && (
              <span className="px-1 text-[10px] font-mono text-slate-400 font-semibold">
                {currentErrorIndex ? `${currentErrorIndex}/${totalErrors}` : `${totalErrors} err.`}
              </span>
            )}
            <button
              onClick={onNextError}
              disabled={!hasNextError}
              className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 disabled:opacity-25 disabled:pointer-events-none transition-colors text-xs font-medium cursor-pointer"
              title="Erreur suivante (Shift + Flèche Droite)"
            >
              <span className="text-[11px]">Suiv.</span>
              <AlertTriangle className="w-3 h-3 text-amber-400" />
            </button>
          </div>

          {/* Keyboard Reminder Hint */}
          <div className="text-[11px] text-slate-400 hidden lg:flex items-center gap-2">
            <span>Raccourcis : <strong className="text-slate-300">← / →</strong> coups</span>
            <span>· <strong className="text-slate-300">Espace</strong> lecture</span>
            <span>· <strong className="text-slate-300">F</strong> inverser</span>
            <span>· <strong className="text-slate-300">Échap</strong> quitter</span>
          </div>
        </div>
      </div>
    </div>
  );
};
