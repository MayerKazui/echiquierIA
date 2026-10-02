import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import type { TrainingFilter } from './utils/spacedRepetition';
import { AppTab, BoardTheme, HeatmapMode, PlayerColor, ThreatsMode } from './types/ui';
import { toFrenchSan } from './utils/chessNotation';
import { HEATMAP_LABELS, describeMove } from './utils/accessibility';
import { computeBoardMaterial } from './utils/chessMaterial';
import { computeBoardHeatmap } from './utils/chessHeatmap';
import { openingAtPly } from './utils/openingAtPly';

import { oneOf, usePersistentState } from './hooks/usePersistentState';
import { useGameAnalysis } from './hooks/useGameAnalysis';
import { useBatchAnalysis } from './hooks/useBatchAnalysis';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useServiceWorkerUpdate } from './hooks/useServiceWorkerUpdate';
import { usePlayback } from './hooks/usePlayback';
import { useMoveSound } from './hooks/useMoveSound';
import { useGamePosition } from './hooks/useGamePosition';
import { useMoveAnnotations } from './hooks/useMoveAnnotations';
import { isPauseWorthy, useCriticalMoments } from './hooks/useCriticalMoments';
import { useSandbox } from './hooks/useSandbox';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSwipe } from './hooks/useSwipe';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useIdleWarmUp } from './hooks/useIdleWarmUp';
import { stockfishService } from './services/stockfishEngine';
import { ensureOpeningBookLoaded } from './services/openingBook';
import {
  ChessBoard,
  Dashboard,
  EvaluationChart,
  MoveComparison,
  MoveList,
  Openings,
  Plan,
  Puzzles,
  Studies,
  Training,
  WeaknessProfile,
  prefetchViews,
} from './lazyViews';
import { LiveRegion, useAnnouncer } from './components/a11y/LiveRegion';
import { Modal } from './components/a11y/Modal';
import { GameHistory } from './components/GameHistory/GameHistory';

import { EvaluationBar } from './components/EvaluationBar/EvaluationBar';
import { PgnInput } from './components/PgnInput/PgnInput';
import type { ImportedGame } from './services/gameImport';
import { jobsFromGames } from './services/batchAnalysis';
import { AppHeader } from './components/AppHeader/AppHeader';
import { BottomNav } from './components/AppHeader/BottomNav';
import { AnalysisProgressBanner } from './components/AppHeader/AnalysisProgressBanner';
import { BatchAnalysisBanner } from './components/AppHeader/BatchAnalysisBanner';
import { PwaBanner } from './components/AppHeader/PwaBanner';
import { DriveSyncBanner } from './components/AppHeader/DriveSyncBanner';
import { useDriveSyncLifecycle } from './hooks/useDriveSync';
import { OpeningStrip } from './components/GameView/OpeningStrip';
import { PlayerBar } from './components/GameView/PlayerBar';
import { BoardToolbar } from './components/GameView/BoardToolbar';
import { HeatmapSummary } from './components/GameView/HeatmapSummary';
import { SandboxBanner } from './components/GameView/BoardNotices';
import { PlaybackControls } from './components/GameView/PlaybackControls';
import { SidePanel } from './components/GameView/SidePanel';
import { ViewFallback } from './components/GameView/ViewFallback';

const HEATMAP_CYCLE: HeatmapMode[] = ['none', 'both', 'white', 'black'];

export default function App() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [activeTab, setActiveTab] = useState<AppTab>('board');
  const [isPgnModalOpen, setIsPgnModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  const [isOpeningsOpen, setIsOpeningsOpen] = useState(false);
  const [isStudiesOpen, setIsStudiesOpen] = useState(false);
  const [isPuzzlesOpen, setIsPuzzlesOpen] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  // Where the plan sends the player: the themes of the training, a position of the opening explorer
  const [trainingFilter, setTrainingFilter] = useState<TrainingFilter | undefined>();
  const [openingsStart, setOpeningsStart] = useState<{ view: 'explorer'; sans: string[] } | undefined>();
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
    result: finalResult,
    partial,
    analyze,
    cancel: cancelAnalysis,
    restoreLast,
    updateAiExplanation,
    updateUserColor: updateResultUserColor,
  } = useGameAnalysis(userPseudo, userColor);
  // Several games analysed in the background; it steps aside while the user analyses a game by hand
  const batch = useBatchAnalysis(isAnalyzing);
  const isOnline = useOnlineStatus();
  useDriveSyncLifecycle();
  const { updateReady, applyUpdate } = useServiceWorkerUpdate();
  const { canInstall, install } = useInstallPrompt();
  const startBatch = batch.start;
  // The game on screen: the moves analysed so far while an analysis runs, otherwise the finished analysis
  const analysis = partial ?? finalResult;
  const moves = analysis?.moves;
  const totalMoves = moves?.length ?? 0;
  const lastPly = Math.max(0, totalMoves - 1);

  // Auto-play stops on the mistakes and blunders (a setting, on by default)
  const [pauseOnErrors, setPauseOnErrors] = usePersistentState<boolean>('chess_pause_on_errors', true, (raw) =>
    raw === 'true' ? true : raw === 'false' ? false : undefined
  );
  const { currentPly, setCurrentPly, isPlaying, setIsPlaying, playbackSpeed, setPlaybackSpeed } = usePlayback(
    totalMoves,
    {
      pauseAt: pauseOnErrors ? (ply) => isPauseWorthy(moves?.[ply]) : undefined,
      onPaused: (ply) => announce(`Lecture en pause. ${describeMove(moves?.[ply] ?? null, totalMoves)}`),
    }
  );
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
  const togglePauseOnErrors = () => {
    announce(
      pauseOnErrors
        ? 'La lecture automatique ne s’arrête plus sur les erreurs'
        : 'La lecture automatique s’arrête sur les erreurs'
    );
    setPauseOnErrors(!pauseOnErrors);
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
      setActiveTab('board');
      announce('Analyse en cours');
      prefetchViews();

      const outcome = await analyze(pgnToAnalyze, depth, {
        // The game is shown from the first moves on: take the user's side right away
        onFirstMoves: (firstMoves) => {
          handleUpdateUserColor(firstMoves.userColor ?? userColor);
          announce('Les premiers coups sont prêts, l’analyse continue.');
        },
      });
      if (outcome.status === 'cancelled') {
        announce('Analyse annulée');
        return;
      }
      if (outcome.status === 'failed') {
        announce("L'analyse a échoué");
        return;
      }

      const { result } = outcome;
      setIsPgnModalOpen(false);
      handleUpdateUserColor(result.userColor ?? userColor);
      announce(
        `Analyse terminée, ${result.moves.length} demi-coups. ${describeMove(result.moves[0] ?? null, result.moves.length)}`
      );
    },
    [analyze, announce, exitSandbox, handleUpdateUserColor, setCurrentPly, userColor]
  );

  // The form (start screen or dialog) stays open with the progress until the first moves can be shown
  /** Analyses the latest games of the online list in the background, the oldest first. */
  const runBatch = useCallback(
    (games: ImportedGame[], username: string, depth: number) => {
      const jobs = jobsFromGames(games);
      if (startBatch(jobs, depth, username)) setIsPgnModalOpen(false);
    },
    [startBatch]
  );

  const isPgnModalVisible = isPgnModalOpen && !partial;
  const cancelFromBanner = () => {
    cancelAnalysis();
    setIsPgnModalOpen(false);
  };
  // The summary needs the finished analysis
  const visibleTab = isAnalyzing ? 'board' : activeTab;

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

  // Swipe on a phone: left for the next move, right for the previous one (see useSwipe for where it applies)
  const swipe = useSwipe({
    enabled: Boolean(analysis) && visibleTab === 'board' && !sandbox.isSandboxMode,
    onSwipeLeft: () => goToPly((p) => Math.min(lastPly, p + 1)),
    onSwipeRight: () => goToPly((p) => Math.max(0, p - 1)),
  });

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
  // The opening reached at this move, so the name does not give away the rest of the game
  const currentOpening = openingAtPly(moves, currentPly);

  // The pieces of the game view. A phone stacks them (see `gameView`); from `lg` up the board and the players
  // are on the left, the opening, tools, evaluation chart and move panel on the right (the panel takes the height
  // that is left, so the chart does not end up alone at the bottom of the window).
  const openingStrip = currentOpening && <OpeningStrip opening={currentOpening.name} eco={currentOpening.eco} />;

  const topPlayer = (
    <PlayerBar color={isFlipped ? 'w' : 'b'} metadata={metadata} userColor={userColor} material={boardMaterial} />
  );

  const toolbar = (
    <>
      <BoardToolbar
        showAnnotations={showAnnotations}
        threatCount={activeThreats.length}
        onToggleAnnotations={toggleAnnotations}
        heatmapMode={heatmapMode}
        onHeatmapModeChange={changeHeatmapMode}
        boardTheme={boardTheme}
        onBoardThemeChange={setBoardTheme}
      />

      {heatmapMode !== 'none' && boardHeatmapData && (
        <HeatmapSummary mode={heatmapMode} data={boardHeatmapData} onModeChange={changeHeatmapMode} />
      )}

      {sandbox.isSandboxMode && <SandboxBanner moves={sandbox.history} onUndo={undoSandbox} onExit={leaveSandbox} />}
    </>
  );

  const board = (
    <div className="flex gap-2 sm:gap-3 justify-center items-stretch w-full max-w-full overflow-hidden">
      <EvaluationBar
        evalCp={sandbox.isSandboxMode ? sandbox.evaluation.cp : activeMove ? activeMove.evalAfter : 0}
        mate={sandbox.isSandboxMode ? sandbox.evaluation.mate : activeMove ? activeMove.mateAfter : null}
        isFlipped={isFlipped}
      />

      <div className="flex-1 min-w-0 flex items-center justify-center">
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
          promotion={sandbox.pendingPromotion}
          onPromote={sandbox.choosePromotion}
          onCancelPromotion={sandbox.cancelPromotion}
        />
      </div>
    </div>
  );

  // Bottom player + current move summary
  const bottomPlayer = (
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
  );

  const controls = (
    <PlaybackControls
      currentPly={currentPly}
      totalMoves={totalMoves}
      isPlaying={isPlaying}
      playbackSpeed={playbackSpeed}
      criticalCount={criticalPlies.length}
      currentErrorIndex={currentErrorIndex}
      hasPrevError={prevErrorPly !== null}
      hasNextError={nextErrorPly !== null}
      pauseOnErrors={pauseOnErrors}
      onStart={() => goToPly(0)}
      onPrev={() => goToPly((p) => Math.max(0, p - 1))}
      onNext={() => goToPly((p) => Math.min(lastPly, p + 1))}
      onEnd={() => goToPly(lastPly)}
      onTogglePlay={togglePlay}
      onChangeSpeed={setPlaybackSpeed}
      onPrevError={() => prevErrorPly !== null && goToPly(prevErrorPly)}
      onNextError={() => nextErrorPly !== null && goToPly(nextErrorPly)}
      onTogglePauseOnErrors={togglePauseOnErrors}
      onFlip={flipBoard}
    />
  );

  const panel = (
    <SidePanel
      moveCount={totalMoves}
      className={isDesktop ? 'flex-1' : ''}
      move={
        <MoveComparison
          currentMove={activeMove}
          previousMove={previousMove}
          isPreviewingAlternative={isPreviewingAlternative}
          onTogglePreviewAlternative={toggleAlternative}
          onUpdateAiExplanation={updateAiExplanation}
          sanHistory={moves?.map((m) => m.san) || []}
          userColor={userColor}
          openingName={currentOpening?.name}
          eco={currentOpening?.eco}
          tacticalThreatsSuggestion={suggestionThreats}
          tacticalThreatsPlayed={playedThreats}
          threatsMode={threatsMode}
          onSelectThreatsMode={setThreatsMode}
          showThreats={showAnnotations}
          onToggleShowThreats={toggleAnnotations}
          isAiDisabled={isAnalyzing}
        />
      }
      list={
        <MoveList
          moves={moves || []}
          currentPly={currentPly}
          onSelectPly={goToPly}
          filterOnlyErrors={filterOnlyErrors}
          onToggleFilter={() => setFilterOnlyErrors((f) => !f)}
          isPlaying={isPlaying}
        />
      }
    />
  );

  const chart = <EvaluationChart moves={moves || []} currentPly={currentPly} onSelectPly={goToPly} />;

  const gameView = isDesktop ? (
    <div {...swipe} className="game-view grid grid-cols-[auto_minmax(0,1fr)] gap-6 items-start w-full">
      {/* Players, board and playback controls: sized from the height of the window */}
      <div className="flex flex-col gap-2 w-[calc(var(--board)+2.75rem)]">
        {topPlayer}
        {board}
        {bottomPlayer}
        {controls}
      </div>
      <div className="flex flex-col gap-3 min-w-0 h-[calc(100dvh-6.5rem)] min-h-[28rem]">
        {openingStrip}
        {toolbar}
        {chart}
        {panel}
      </div>
    </div>
  ) : (
    <div {...swipe} className="touch-pan-y flex flex-col gap-3.5 w-full max-w-full">
      {openingStrip}
      {topPlayer}
      {toolbar}
      {board}
      {bottomPlayer}
      {controls}
      {panel}
      {chart}
    </div>
  );

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
        isAnalyzing={isAnalyzing}
        activeTab={visibleTab}
        userPseudo={userPseudo}
        userColor={userColor}
        isMuted={isMuted}
        onChangeTab={setActiveTab}
        onUpdatePseudo={setUserPseudo}
        onUpdateUserColor={handleUpdateUserColor}
        onToggleSound={toggleSoundAnnounced}
        onOpenPgnModal={() => setIsPgnModalOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenTraining={() => {
          setTrainingFilter(undefined);
          setIsTrainingOpen(true);
        }}
        onOpenOpenings={() => {
          setOpeningsStart(undefined);
          setIsOpeningsOpen(true);
        }}
        onOpenPuzzles={() => setIsPuzzlesOpen(true)}
        onOpenStudies={() => setIsStudiesOpen(true)}
        onOpenPlan={() => setIsPlanOpen(true)}
        onInstall={canInstall ? () => void install() : undefined}
      />

      <PwaBanner isOnline={isOnline} updateReady={updateReady} onUpdate={applyUpdate} />

      <DriveSyncBanner />

      <BatchAnalysisBanner batch={batch} onResume={batch.resume} onCancel={batch.cancel} onDismiss={batch.dismiss} />

      {isAnalyzing && progress && analysis && !isPgnModalVisible && (
        <AnalysisProgressBanner progress={progress} onCancel={cancelFromBanner} />
      )}

      <main
        id="main-content"
        tabIndex={-1}
        className={`flex-1 w-full mx-auto max-w-[1600px] p-2.5 sm:p-4 lg:px-6 lg:py-4 flex flex-col gap-4 sm:gap-6 overflow-x-hidden ${
          analysis ? 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-4 lg:pb-4' : ''
        }`}
      >
        <Suspense fallback={<ViewFallback />}>
          {isRestoring ? (
            <ViewFallback />
          ) : !analysis ? (
            <div className="flex flex-col items-center justify-center my-auto py-8">
              <div className="max-w-2xl w-full">
                <PgnInput
                  currentPgn={pgn}
                  userPseudo={userPseudo}
                  onUpdatePseudo={setUserPseudo}
                  onAnalyze={runAnalysis}
                  isAnalyzing={isAnalyzing}
                  progress={progress}
                  onCancel={cancelAnalysis}
                  onAnalyzeBatch={runBatch}
                  isBatchBusy={batch.status === 'running' || batch.status === 'paused'}
                  analyzedRevision={batch.done}
                />
              </div>
            </div>
          ) : visibleTab === 'dashboard' && analysis ? (
            <Dashboard
              analysis={analysis}
              userPseudo={userPseudo}
              userColor={userColor}
              onUpdateUserColor={handleUpdateUserColor}
              onUpdatePseudo={setUserPseudo}
            />
          ) : (
            gameView
          )}
        </Suspense>
      </main>

      {analysis && <BottomNav activeTab={visibleTab} isAnalyzing={isAnalyzing} onChangeTab={setActiveTab} />}

      {isHistoryOpen && (
        <Modal title="Mes parties" onClose={() => setIsHistoryOpen(false)} className="w-full max-w-2xl">
          <GameHistory
            currentPgn={pgn}
            onClose={() => setIsHistoryOpen(false)}
            onOpen={(game) => {
              setIsHistoryOpen(false);
              void runAnalysis(game.pgn, game.depth);
            }}
          />
        </Modal>
      )}

      {isProfileOpen && (
        <Modal title="Mon profil" onClose={() => setIsProfileOpen(false)} className="w-full max-w-3xl">
          <Suspense fallback={null}>
            <WeaknessProfile
              onClose={() => setIsProfileOpen(false)}
              onTrain={() => {
                setIsProfileOpen(false);
                setTrainingFilter(undefined);
                setIsTrainingOpen(true);
              }}
              onImport={() => {
                setIsProfileOpen(false);
                // Without a game on screen the start screen already shows the import form
                if (analysis) setIsPgnModalOpen(true);
              }}
            />
          </Suspense>
        </Modal>
      )}

      {isTrainingOpen && (
        <Modal
          title="S'entraîner sur mes erreurs"
          onClose={() => setIsTrainingOpen(false)}
          className="w-full max-w-[min(96vw,84rem)]"
        >
          <Suspense fallback={null}>
            <Training
              boardTheme={boardTheme}
              initialFilter={trainingFilter}
              onClose={() => setIsTrainingOpen(false)}
              onImport={() => {
                setIsTrainingOpen(false);
                // Without a game on screen the start screen already shows the import form
                if (analysis) setIsPgnModalOpen(true);
              }}
            />
          </Suspense>
        </Modal>
      )}

      {isPlanOpen && (
        <Modal title="Mon plan" onClose={() => setIsPlanOpen(false)} className="w-full max-w-2xl">
          <Suspense fallback={null}>
            <Plan
              onClose={() => setIsPlanOpen(false)}
              onTrain={(filter) => {
                setIsPlanOpen(false);
                setTrainingFilter(filter);
                setIsTrainingOpen(true);
              }}
              onShowLine={(sans) => {
                setIsPlanOpen(false);
                setOpeningsStart({ view: 'explorer', sans });
                setIsOpeningsOpen(true);
              }}
              onImport={() => {
                setIsPlanOpen(false);
                // Without a game on screen the start screen already shows the import form
                if (analysis) setIsPgnModalOpen(true);
              }}
            />
          </Suspense>
        </Modal>
      )}

      {isPuzzlesOpen && (
        <Modal title="Puzzles" onClose={() => setIsPuzzlesOpen(false)} className="w-full max-w-[min(96vw,84rem)]">
          <Suspense fallback={null}>
            <Puzzles boardTheme={boardTheme} onClose={() => setIsPuzzlesOpen(false)} />
          </Suspense>
        </Modal>
      )}

      {isStudiesOpen && (
        <Modal title="Études" onClose={() => setIsStudiesOpen(false)} className="w-full max-w-[min(96vw,84rem)]">
          <Suspense fallback={null}>
            <Studies boardTheme={boardTheme} onClose={() => setIsStudiesOpen(false)} />
          </Suspense>
        </Modal>
      )}

      {isOpeningsOpen && (
        <Modal title="Ouvertures" onClose={() => setIsOpeningsOpen(false)} className="w-full max-w-[min(96vw,84rem)]">
          <Suspense fallback={null}>
            <Openings
              boardTheme={boardTheme}
              start={openingsStart}
              onClose={() => setIsOpeningsOpen(false)}
              onImport={() => {
                setIsOpeningsOpen(false);
                // Without a game on screen the start screen already shows the import form
                if (analysis) setIsPgnModalOpen(true);
              }}
            />
          </Suspense>
        </Modal>
      )}

      {isPgnModalVisible && (
        <Modal title="Charger une autre partie" onClose={() => setIsPgnModalOpen(false)} className="w-full max-w-2xl">
          <PgnInput
            currentPgn={pgn}
            userPseudo={userPseudo}
            onUpdatePseudo={setUserPseudo}
            onAnalyze={runAnalysis}
            isAnalyzing={isAnalyzing}
            progress={progress}
            onCancel={cancelAnalysis}
            onAnalyzeBatch={runBatch}
            isBatchBusy={batch.status === 'running' || batch.status === 'paused'}
            analyzedRevision={batch.done}
            onClose={() => setIsPgnModalOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}
