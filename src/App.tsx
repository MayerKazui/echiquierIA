import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { AppTab, BoardSize, BoardTheme, HeatmapMode, PlayerColor, ThreatsMode } from './types/ui';
import { toFrenchSan } from './utils/chessNotation';
import { HEATMAP_LABELS, describeMove } from './utils/accessibility';
import { computeBoardMaterial } from './utils/chessMaterial';
import { computeBoardHeatmap } from './utils/chessHeatmap';
import { BOARD_COLUMN_SPAN, BOARD_MAX_WIDTH, PAGE_MAX_WIDTH, SIDE_COLUMN_SPAN } from './utils/boardLayout';

import { oneOf, usePersistentState } from './hooks/usePersistentState';
import { useGameAnalysis } from './hooks/useGameAnalysis';
import { usePlayback } from './hooks/usePlayback';
import { useMoveSound } from './hooks/useMoveSound';
import { useGamePosition } from './hooks/useGamePosition';
import { useMoveAnnotations } from './hooks/useMoveAnnotations';
import { useCriticalMoments } from './hooks/useCriticalMoments';
import { useSandbox } from './hooks/useSandbox';
import { useLichessImport } from './hooks/useLichessImport';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useIdleWarmUp } from './hooks/useIdleWarmUp';
import { stockfishService } from './services/stockfishEngine';
import { ensureOpeningBookLoaded } from './services/openingBook';
import { ChessBoard, Dashboard, EvaluationChart, MoveComparison, MoveList, prefetchViews } from './lazyViews';
import { LiveRegion, useAnnouncer } from './components/a11y/LiveRegion';
import { Modal } from './components/a11y/Modal';

import { EvaluationBar } from './components/EvaluationBar/EvaluationBar';
import { PgnInput } from './components/PgnInput/PgnInput';
import { AppHeader } from './components/AppHeader/AppHeader';
import { AnalysisProgressBanner } from './components/AppHeader/AnalysisProgressBanner';
import { OpeningStrip } from './components/GameView/OpeningStrip';
import { PlayerBar } from './components/GameView/PlayerBar';
import { BoardToolbar } from './components/GameView/BoardToolbar';
import { HeatmapSummary } from './components/GameView/HeatmapSummary';
import { LichessNotice, SandboxBanner } from './components/GameView/BoardNotices';
import { PlaybackControls } from './components/GameView/PlaybackControls';
import { ViewFallback } from './components/GameView/ViewFallback';

const HEATMAP_CYCLE: HeatmapMode[] = ['none', 'both', 'white', 'black'];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('board');
  const [isPgnModalOpen, setIsPgnModalOpen] = useState(false);
  const { announcement, announce } = useAnnouncer();

  // While the user reads the start screen: download the engine, the openings database and the game views
  useIdleWarmUp([() => stockfishService.warmUp(), () => void ensureOpeningBookLoaded(), prefetchViews]);

  // Preferences (persisted in localStorage)
  const [userPseudo, setUserPseudo] = usePersistentState<string>('chess_coach_user_pseudo', '', (raw) => raw);
  const [boardTheme, setBoardTheme] = usePersistentState<BoardTheme>(
    'chess_board_theme',
    'green',
    oneOf(['green', 'wood', 'blue'])
  );
  // Normal 500px, Grand 640px, XL 760px
  const [boardSize, setBoardSize] = usePersistentState<BoardSize>(
    'chess_board_size',
    'normal',
    oneOf(['normal', 'large', 'xl'])
  );

  // Board view state
  const [userColor, setUserColor] = useState<PlayerColor>('w');
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>('none');
  const [threatsMode, setThreatsMode] = useState<ThreatsMode>('suggestion');
  const [isPreviewingAlternative, setIsPreviewingAlternative] = useState(false);
  const [filterOnlyErrors, setFilterOnlyErrors] = useState(false);

  // Game analysis and navigation
  const {
    pgn,
    isAnalyzing,
    isRestoring,
    progress,
    result: analysis,
    analyze,
    restoreLast,
    updateAiExplanation,
    updateUserColor: updateResultUserColor,
  } = useGameAnalysis(userPseudo, userColor);
  const moves = analysis?.moves;
  const totalMoves = moves?.length ?? 0;
  const lastPly = Math.max(0, totalMoves - 1);

  const { currentPly, setCurrentPly, isPlaying, setIsPlaying, playbackSpeed, setPlaybackSpeed } =
    usePlayback(totalMoves);
  const { isMuted, toggleSound } = useMoveSound(moves, currentPly);
  const { activeMove, previousMove, currentFen, alternativeFen } = useGamePosition(analysis, currentPly);
  const { criticalPlies, prevErrorPly, nextErrorPly, currentErrorIndex } = useCriticalMoments(moves, currentPly);
  const { arrows, suggestionThreats, playedThreats, activeThreats } = useMoveAnnotations(
    activeMove,
    threatsMode,
    isPreviewingAlternative
  );

  // Free exploration on top of the displayed position
  const stopPreviewingAlternative = useCallback(() => setIsPreviewingAlternative(false), []);
  const announceSandboxMove = useCallback((san: string) => announce(`Exploration : ${toFrenchSan(san)}`), [announce]);
  const sandbox = useSandbox(isPreviewingAlternative && alternativeFen ? alternativeFen : currentFen, {
    onEnter: stopPreviewingAlternative,
    onMove: announceSandboxMove,
  });
  const { exit: exitSandbox, undo: undoSandboxMove } = sandbox;
  const activeBoardFen = sandbox.activeFen;

  const boardMaterial = useMemo(() => computeBoardMaterial(activeBoardFen), [activeBoardFen]);
  const boardHeatmapData = useMemo(
    () => (heatmapMode === 'none' ? null : computeBoardHeatmap(activeBoardFen)),
    [heatmapMode, activeBoardFen]
  );

  const lichess = useLichessImport(pgn, isFlipped);

  const handleUpdateUserColor = useCallback(
    (color: PlayerColor) => {
      setUserColor(color);
      setIsFlipped(color === 'b');
      updateResultUserColor(color);
    },
    [updateResultUserColor]
  );

  // Any manual navigation leaves the exploration / alternative preview and stops auto-play
  const goToPly = useCallback(
    (ply: number | ((prev: number) => number)) => {
      const target = typeof ply === 'function' ? ply(currentPly) : ply;
      setIsPlaying(false);
      exitSandbox();
      setCurrentPly(target);
      setIsPreviewingAlternative(false);
      announce(describeMove(moves?.[target] ?? null, totalMoves));
    },
    [currentPly, moves, totalMoves, announce, setIsPlaying, exitSandbox, setCurrentPly]
  );

  // View toggles, shared by the keyboard shortcuts and the buttons; each one is announced
  const flipBoard = () => {
    announce(isFlipped ? 'Échiquier normal, Blancs en bas' : 'Échiquier retourné, Noirs en bas');
    setIsFlipped((f) => !f);
  };
  const toggleAnnotations = () => {
    announce(`Annotations ${showAnnotations ? 'masquées' : 'affichées'}`);
    setShowAnnotations((a) => !a);
  };
  const changeHeatmapMode = (mode: HeatmapMode) => {
    announce(`Contrôle de l'espace : ${HEATMAP_LABELS[mode]}`);
    setHeatmapMode(mode);
  };
  const cycleHeatmapMode = () =>
    changeHeatmapMode(HEATMAP_CYCLE[(HEATMAP_CYCLE.indexOf(heatmapMode) + 1) % HEATMAP_CYCLE.length]);
  const toggleAlternative = () => {
    announce(isPreviewingAlternative ? 'Aperçu du meilleur coup désactivé' : 'Aperçu du meilleur coup activé');
    setIsPreviewingAlternative((prev) => !prev);
  };
  const toggleSoundAnnounced = () => {
    announce(isMuted ? 'Son activé' : 'Son coupé');
    toggleSound();
  };
  const togglePlay = () => {
    announce(isPlaying ? `Pause, ${describeMove(activeMove, totalMoves)}` : 'Lecture automatique');
    setIsPlaying((p) => !p);
  };
  const leaveSandbox = () => {
    exitSandbox();
    announce('Exploration terminée, retour à la partie');
  };
  const undoSandbox = () => {
    undoSandboxMove();
    announce('Dernier coup annulé');
  };

  const runAnalysis = useCallback(
    async (pgnToAnalyze: string, depth = 12) => {
      setCurrentPly(0);
      setIsPreviewingAlternative(false);
      exitSandbox();
      announce('Analyse en cours');
      prefetchViews();

      const result = await analyze(pgnToAnalyze, depth);
      if (!result) {
        announce("L'analyse a échoué");
        return;
      }

      handleUpdateUserColor(result.userColor ?? userColor);
      // Always land on the first move so the user starts at the beginning
      setCurrentPly(0);
      setIsPreviewingAlternative(false);
      announce(
        `Analyse terminée, ${result.moves.length} demi-coups. ${describeMove(result.moves[0] ?? null, result.moves.length)}`
      );
    },
    [analyze, announce, exitSandbox, handleUpdateUserColor, setCurrentPly, userColor]
  );

  // Reopen the last analysed game (kept in the browser) instead of the start screen, at its first move
  useEffect(() => {
    void restoreLast().then((restored) => {
      if (!restored) return;
      handleUpdateUserColor(restored.userColor ?? 'w');
      setCurrentPly(0);
      prefetchViews();
      announce('Dernière partie analysée rouverte');
    });
  }, [restoreLast, handleUpdateUserColor, setCurrentPly, announce]);

  useKeyboardShortcuts(Boolean(analysis), {
    onStart: () => goToPly(0),
    onPrev: () => goToPly((p) => Math.max(0, p - 1)),
    onNext: () => goToPly((p) => Math.min(lastPly, p + 1)),
    onEnd: () => goToPly(lastPly),
    onPrevError: () => prevErrorPly !== null && goToPly(prevErrorPly),
    onNextError: () => nextErrorPly !== null && goToPly(nextErrorPly),
    onTogglePlay: togglePlay,
    onFlip: flipBoard,
    onToggleAnnotations: toggleAnnotations,
    onToggleSound: toggleSoundAnnounced,
    onToggleAlternative: toggleAlternative,
    onCycleHeatmap: cycleHeatmapMode,
    onEscape: () => {
      if (!sandbox.isSandboxMode) return false;
      leaveSandbox();
      return true;
    },
  });

  const metadata = analysis?.metadata;
  const boardMaxWidth = BOARD_MAX_WIDTH[boardSize];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white font-sans antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-indigo-600 focus:text-white focus:text-sm focus:font-semibold"
      >
        Aller au contenu principal
      </a>
      <LiveRegion announcement={announcement} />
      <AppHeader
        metadata={metadata}
        hasAnalysis={Boolean(analysis)}
        activeTab={activeTab}
        userPseudo={userPseudo}
        userColor={userColor}
        isMuted={isMuted}
        onChangeTab={setActiveTab}
        onUpdatePseudo={setUserPseudo}
        onUpdateUserColor={handleUpdateUserColor}
        onToggleSound={toggleSoundAnnounced}
        onOpenPgnModal={() => setIsPgnModalOpen(true)}
      />

      {isAnalyzing && progress && <AnalysisProgressBanner progress={progress} />}

      <main
        id="main-content"
        tabIndex={-1}
        className={`flex-1 w-full mx-auto p-2.5 sm:p-4 lg:p-6 flex flex-col gap-4 sm:gap-6 overflow-x-hidden ${PAGE_MAX_WIDTH[boardSize]}`}
      >
        <Suspense fallback={<ViewFallback />}>
          {isRestoring ? (
            <ViewFallback />
          ) : !analysis && !isAnalyzing ? (
            <div className="flex flex-col items-center justify-center my-auto py-8">
              <div className="max-w-2xl w-full">
                <PgnInput
                  currentPgn={pgn}
                  userPseudo={userPseudo}
                  onUpdatePseudo={setUserPseudo}
                  onAnalyze={runAnalysis}
                  isAnalyzing={isAnalyzing}
                />
              </div>
            </div>
          ) : activeTab === 'dashboard' && analysis ? (
            <Dashboard
              analysis={analysis}
              userPseudo={userPseudo}
              userColor={userColor}
              onUpdateUserColor={handleUpdateUserColor}
              onUpdatePseudo={setUserPseudo}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start w-full max-w-full">
              {/* Left Column: Board + Eval Bar + Eval Chart (width depends on the board size) */}
              <div
                className={`flex flex-col gap-3.5 lg:sticky lg:top-16 lg:self-start w-full max-w-full ${BOARD_COLUMN_SPAN[boardSize]}`}
              >
                {metadata?.opening && (
                  <OpeningStrip
                    opening={metadata.opening}
                    eco={metadata.eco}
                    userColor={userColor}
                    onUpdateUserColor={handleUpdateUserColor}
                  />
                )}

                {/* Top player (Black, or White when the board is flipped) */}
                <PlayerBar
                  color={isFlipped ? 'w' : 'b'}
                  metadata={metadata}
                  userColor={userColor}
                  material={boardMaterial}
                >
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      onClick={flipBoard}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors cursor-pointer"
                      title="Inverser l'échiquier (Touche F)"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </PlayerBar>

                <BoardToolbar
                  showAnnotations={showAnnotations}
                  threatCount={activeThreats.length}
                  onToggleAnnotations={toggleAnnotations}
                  heatmapMode={heatmapMode}
                  onHeatmapModeChange={changeHeatmapMode}
                  boardTheme={boardTheme}
                  onBoardThemeChange={setBoardTheme}
                  boardSize={boardSize}
                  onBoardSizeChange={setBoardSize}
                  isImportingLichess={lichess.isImporting}
                  lichessOpened={lichess.showNotice}
                  onOpenLichess={lichess.openOnLichess}
                />

                {heatmapMode !== 'none' && boardHeatmapData && (
                  <HeatmapSummary mode={heatmapMode} data={boardHeatmapData} onModeChange={changeHeatmapMode} />
                )}

                {lichess.showNotice && <LichessNotice onDismiss={lichess.dismissNotice} />}

                {sandbox.isSandboxMode && (
                  <SandboxBanner moves={sandbox.history} onUndo={undoSandbox} onExit={leaveSandbox} />
                )}

                {/* Chessboard + Evaluation Bar */}
                <div className="flex gap-2 sm:gap-3 justify-center items-stretch w-full max-w-full overflow-hidden">
                  <EvaluationBar
                    evalCp={sandbox.isSandboxMode ? sandbox.evaluation.cp : activeMove ? activeMove.evalAfter : 0}
                    mate={sandbox.isSandboxMode ? sandbox.evaluation.mate : activeMove ? activeMove.mateAfter : null}
                    isFlipped={isFlipped}
                  />

                  <div className={`flex-1 min-w-0 flex items-center justify-center ${boardMaxWidth}`}>
                    <ChessBoard
                      fen={activeBoardFen}
                      isFlipped={isFlipped}
                      boardTheme={boardTheme}
                      lastMove={
                        sandbox.isSandboxMode && sandbox.lastMove
                          ? { from: sandbox.lastMove.from, to: sandbox.lastMove.to }
                          : arrows.lastMove
                      }
                      bestMove={sandbox.isSandboxMode ? null : arrows.bestMove}
                      showArrows={!sandbox.isSandboxMode && showAnnotations && !isPreviewingAlternative}
                      tacticalThreats={sandbox.isSandboxMode ? [] : activeThreats}
                      showThreats={!sandbox.isSandboxMode && showAnnotations}
                      heatmapMode={heatmapMode}
                      onSquareClick={sandbox.handleSquareClick}
                      onPieceMove={sandbox.handlePieceMove}
                      selectedSquare={sandbox.selectedSquare}
                      maxWidthClass={boardMaxWidth}
                    />
                  </div>
                </div>

                {/* Bottom player + current move summary */}
                <PlayerBar
                  color={isFlipped ? 'b' : 'w'}
                  metadata={metadata}
                  userColor={userColor}
                  material={boardMaterial}
                  className="gap-1.5 overflow-hidden"
                >
                  <div className="font-mono text-slate-400 text-[11px] flex items-center gap-1.5 shrink-0 ml-2">
                    {activeMove ? (
                      <>
                        <span className="text-slate-200 font-semibold truncate">
                          Coup {activeMove.moveNumber} · {toFrenchSan(activeMove.san)}
                        </span>
                        {activeMove.thinkTimeFormatted && (
                          <span
                            className={`px-1 py-0.2 rounded text-[10px] shrink-0 ${
                              activeMove.isLongThink
                                ? 'text-amber-300 bg-amber-500/20 font-bold border border-amber-500/40'
                                : 'text-slate-400 bg-slate-900 border border-slate-800'
                            }`}
                          >
                            ⏱️ {activeMove.thinkTimeFormatted}
                          </span>
                        )}
                        {activeMove.centipawnLoss > 20 && (
                          <span className="text-rose-400 font-medium shrink-0">
                            (-{(activeMove.centipawnLoss / 100).toFixed(1)})
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400 text-[11px] italic">Position initiale</span>
                    )}
                  </div>
                </PlayerBar>

                <PlaybackControls
                  currentPly={currentPly}
                  totalMoves={totalMoves}
                  activeMove={activeMove}
                  isPlaying={isPlaying}
                  playbackSpeed={playbackSpeed}
                  isMuted={isMuted}
                  criticalCount={criticalPlies.length}
                  currentErrorIndex={currentErrorIndex}
                  hasPrevError={prevErrorPly !== null}
                  hasNextError={nextErrorPly !== null}
                  onStart={() => goToPly(0)}
                  onPrev={() => goToPly((p) => Math.max(0, p - 1))}
                  onNext={() => goToPly((p) => Math.min(lastPly, p + 1))}
                  onEnd={() => goToPly(lastPly)}
                  onTogglePlay={togglePlay}
                  onChangeSpeed={setPlaybackSpeed}
                  onPrevError={() => prevErrorPly !== null && goToPly(prevErrorPly)}
                  onNextError={() => nextErrorPly !== null && goToPly(nextErrorPly)}
                  onToggleSound={toggleSoundAnnounced}
                  onFlip={flipBoard}
                />

                <EvaluationChart moves={moves || []} currentPly={currentPly} onSelectPly={goToPly} />
              </div>

              {/* Right Column: Move Comparison + Pedagogical AI Coach + Move List */}
              <div className={`flex flex-col gap-5 ${SIDE_COLUMN_SPAN[boardSize]}`}>
                <MoveComparison
                  currentMove={activeMove}
                  previousMove={previousMove}
                  isPreviewingAlternative={isPreviewingAlternative}
                  onTogglePreviewAlternative={toggleAlternative}
                  onUpdateAiExplanation={updateAiExplanation}
                  sanHistory={moves?.map((m) => m.san) || []}
                  userColor={userColor}
                  openingName={metadata?.opening}
                  eco={metadata?.eco}
                  tacticalThreatsSuggestion={suggestionThreats}
                  tacticalThreatsPlayed={playedThreats}
                  threatsMode={threatsMode}
                  onSelectThreatsMode={setThreatsMode}
                  showThreats={showAnnotations}
                  onToggleShowThreats={toggleAnnotations}
                />

                <MoveList
                  moves={moves || []}
                  currentPly={currentPly}
                  onSelectPly={goToPly}
                  filterOnlyErrors={filterOnlyErrors}
                  onToggleFilter={() => setFilterOnlyErrors((f) => !f)}
                />
              </div>
            </div>
          )}
        </Suspense>
      </main>

      {isPgnModalOpen && (
        <Modal title="Charger une autre partie" onClose={() => setIsPgnModalOpen(false)} className="w-full max-w-2xl">
          <PgnInput
            currentPgn={pgn}
            userPseudo={userPseudo}
            onUpdatePseudo={setUserPseudo}
            onAnalyze={(newPgn, depth) => {
              setIsPgnModalOpen(false);
              runAnalysis(newPgn, depth);
            }}
            isAnalyzing={isAnalyzing}
            onClose={() => setIsPgnModalOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}
