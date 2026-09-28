import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import {
  BarChart3,
  BookOpen,
  Brain,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FileDown,
  FileText,
  Flame,
  LayoutDashboard,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Swords,
  Upload,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { MoveAnalysis, GameAnalysisResult, GameMetadata } from './types/chess';
import { stockfishService } from './services/stockfishEngine';
import { parsePgnHeaders } from './utils/pgnParser';
import { SAMPLE_GAMES } from './utils/sampleGames';
import { generateChessAnalysisPdf } from './utils/pdfExport';
import { chessAudio } from './utils/chessAudio';

import { ChessBoard } from './components/ChessBoard/ChessBoard';
import { EvaluationBar } from './components/EvaluationBar/EvaluationBar';
import { EvaluationChart } from './components/EvaluationChart/EvaluationChart';
import { MoveComparison } from './components/MoveComparison/MoveComparison';
import { MoveList } from './components/MoveList/MoveList';
import { Dashboard } from './components/Dashboard/Dashboard';
import { PgnInput } from './components/PgnInput/PgnInput';

export default function App() {
  const [activeTab, setActiveTab] = useState<'board' | 'dashboard'>('board');
  const [isPgnModalOpen, setIsPgnModalOpen] = useState(false);

  // User Profile state (persisted across sessions in localStorage)
  const [userPseudo, setUserPseudo] = useState<string>(
    () => (typeof window !== 'undefined' ? localStorage.getItem('chess_coach_user_pseudo') || '' : '')
  );
  const [userColor, setUserColor] = useState<'w' | 'b'>('w');

  const handleUpdatePseudo = useCallback((pseudo: string) => {
    setUserPseudo(pseudo);
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_coach_user_pseudo', pseudo);
    }
  }, []);

  const handleUpdateUserColor = useCallback((color: 'w' | 'b') => {
    setUserColor(color);
    setIsFlipped(color === 'b');
  }, []);

  // Analysis state
  const [pgn, setPgn] = useState<string>(SAMPLE_GAMES[1].pgn);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number } | null>(null);
  const [analysisResult, setAnalysisResult] = useState<GameAnalysisResult | null>(null);

  // Board navigation state
  const [currentPly, setCurrentPly] = useState<number>(-1);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showArrows, setShowArrows] = useState(true);
  const [isPreviewingAlternative, setIsPreviewingAlternative] = useState(false);
  const [filterOnlyErrors, setFilterOnlyErrors] = useState(false);

  // Audio and Auto-play state
  const [isMuted, setIsMuted] = useState<boolean>(() => chessAudio.getIsMuted());
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const prevPlyRef = useRef<number>(currentPly);

  const handleToggleSound = useCallback(() => {
    const muted = chessAudio.toggleMute();
    setIsMuted(muted);
  }, []);

  // Trigger sound effect on move change
  useEffect(() => {
    if (
      currentPly !== prevPlyRef.current &&
      currentPly >= 0 &&
      analysisResult?.moves &&
      analysisResult.moves[currentPly]
    ) {
      const move = analysisResult.moves[currentPly];
      chessAudio.playForMove(move.san, move.san.includes('+') || move.san.includes('#'));
    }
    prevPlyRef.current = currentPly;
  }, [currentPly, analysisResult]);

  // Auto-play timer
  useEffect(() => {
    let timer: any = null;
    if (isPlaying && analysisResult && analysisResult.moves.length > 0) {
      timer = setInterval(() => {
        setCurrentPly((prev) => {
          if (prev >= analysisResult.moves.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1100);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, analysisResult]);

  // Replay moves to calculate current FEN
  const { currentFen, alternativeFen } = useMemo(() => {
    if (!analysisResult || analysisResult.moves.length === 0 || currentPly < 0) {
      return {
        currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        alternativeFen: null,
      };
    }

    const move = analysisResult.moves[currentPly];
    const normalFen = move.fenAfter;

    // Compute what the board would look like if the best move was played instead
    let altFen: string | null = null;
    if (move.bestMoveUci && move.bestMoveUci.length >= 4) {
      try {
        const altChess = new Chess(move.fenBefore);
        altChess.move({
          from: move.bestMoveUci.substring(0, 2),
          to: move.bestMoveUci.substring(2, 4),
          promotion: move.bestMoveUci.length > 4 ? move.bestMoveUci[4] : undefined,
        });
        altFen = altChess.fen();
      } catch {
        altFen = null;
      }
    }

    return {
      currentFen: normalFen,
      alternativeFen: altFen,
    };
  }, [analysisResult, currentPly]);

  const activeMove = useMemo(() => {
    if (!analysisResult || currentPly < 0) return null;
    return analysisResult.moves[currentPly] || null;
  }, [analysisResult, currentPly]);

  const previousMove = useMemo(() => {
    if (!analysisResult || currentPly <= 0) return null;
    return analysisResult.moves[currentPly - 1] || null;
  }, [analysisResult, currentPly]);

  // Run full game analysis
  const runAnalysis = useCallback(async (pgnToAnalyze: string, depth = 12) => {
    setIsAnalyzing(true);
    setAnalysisProgress({ current: 0, total: 1 });

    try {
      const headers = parsePgnHeaders(pgnToAnalyze);
      const { moves, statsWhite, statsBlack, detectedOpening } = await stockfishService.analyzeFullGame(
        pgnToAnalyze,
        depth,
        (current, total) => {
          setAnalysisProgress({ current, total });
        }
      );

      // Auto-populate opening from Lichess database if missing in PGN headers
      if (detectedOpening) {
        if (!headers.opening) headers.opening = detectedOpening.name;
        if (!headers.eco) headers.eco = detectedOpening.eco;
      }

      // Auto-detect player color from user pseudo
      let detectedColor: 'w' | 'b' = userColor;
      if (userPseudo) {
        const white = (headers.white || '').toLowerCase();
        const black = (headers.black || '').toLowerCase();
        const pseudo = userPseudo.toLowerCase();

        if (black.includes(pseudo) && !white.includes(pseudo)) {
          detectedColor = 'b';
        } else if (white.includes(pseudo)) {
          detectedColor = 'w';
        }
      }
      setUserColor(detectedColor);
      setIsFlipped(detectedColor === 'b');

      const result: GameAnalysisResult = {
        metadata: headers,
        moves,
        statsWhite,
        statsBlack,
        userColor: detectedColor,
        userPseudo,
      };

      setAnalysisResult(result);
      setPgn(pgnToAnalyze);

      // Jump to the first blunder or mistake, or move 0
      const firstFaultIndex = moves.findIndex(
        (m) => m.classification === 'blunder' || m.classification === 'mistake'
      );
      setCurrentPly(firstFaultIndex !== -1 ? firstFaultIndex : Math.min(0, moves.length - 1));
      setIsPreviewingAlternative(false);
    } catch (err) {
      console.error('Analysis error:', err);
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(null);
    }
  }, []);

  // Do not run analysis on startup automatically
  // User will click "Lancer une analyse" or select an example/PGN when ready

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing in inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (!analysisResult) return;
      const total = analysisResult.moves.length;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentPly((p) => Math.max(0, p - 1));
        setIsPreviewingAlternative(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentPly((p) => Math.min(total - 1, p + 1));
        setIsPreviewingAlternative(false);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentPly(0);
        setIsPreviewingAlternative(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentPly(total - 1);
        setIsPreviewingAlternative(false);
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        setIsPreviewingAlternative((prev) => !prev);
      } else if (e.key.toLowerCase() === 'f') {
        setIsFlipped((f) => !f);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [analysisResult]);

  // Update AI explanation on move object
  const handleUpdateAiExplanation = (
    ply: number,
    explanation: NonNullable<MoveAnalysis['aiExplanation']>
  ) => {
    if (!analysisResult) return;
    setAnalysisResult((prev) => {
      if (!prev) return null;
      const updatedMoves = [...prev.moves];
      if (updatedMoves[ply]) {
        updatedMoves[ply] = {
          ...updatedMoves[ply],
          aiExplanation: explanation,
        };
      }
      return { ...prev, moves: updatedMoves };
    });
  };

  // Update AI summary on analysis object
  const handleUpdateAiSummary = (summary: NonNullable<GameAnalysisResult['aiSummary']>) => {
    if (!analysisResult) return;
    setAnalysisResult((prev) => (prev ? { ...prev, aiSummary: summary } : null));
  };

  // Played vs Best arrows for board
  const boardArrows = useMemo(() => {
    if (!activeMove) return { lastMove: null, bestMove: null };

    const lastMove = {
      from: activeMove.from,
      to: activeMove.to,
      classification: activeMove.classification,
    };

    const bestMove =
      activeMove.bestMoveFrom && activeMove.bestMoveTo
        ? { from: activeMove.bestMoveFrom, to: activeMove.bestMoveTo }
        : null;

    return { lastMove, bestMove };
  }, [activeMove]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white font-sans antialiased">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-3 sm:px-4 lg:px-8 py-2.5 sm:py-3 w-full max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full">
          {/* Top row on mobile / Left column on desktop: Brand and Match meta */}
          <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 font-bold shrink-0 text-sm sm:text-base">
                ♟
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1.5 truncate">
                  <span>Échiquier IA</span>
                  <span className="text-[9px] sm:text-[10px] text-indigo-400 font-mono font-semibold px-1.5 py-0.2 rounded bg-indigo-500/10 border border-indigo-500/20 shrink-0">
                    Stockfish
                  </span>
                </h1>
                <p className="text-[10px] sm:text-[11px] text-slate-400 truncate max-w-[190px] xs:max-w-xs sm:max-w-sm">
                  {analysisResult?.metadata?.white || 'Blancs'} vs{' '}
                  {analysisResult?.metadata?.black || 'Noirs'}{' '}
                  {analysisResult?.metadata?.result ? `(${analysisResult.metadata.result})` : ''}
                </p>
              </div>
            </div>

            {/* Quick sound toggle on mobile */}
            <div className="flex items-center gap-1.5 sm:hidden shrink-0">
              <button
                onClick={handleToggleSound}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  !isMuted
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
                title={isMuted ? 'Activer le son' : 'Couper le son'}
              >
                {!isMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Bottom row on mobile / Right column on desktop: Actions and Switchers */}
          <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2.5 flex-wrap w-full sm:w-auto">
            {/* User Profile / Pseudo Quick Pill */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
              <User className="w-3 h-3 text-indigo-400 shrink-0" />
              <button
                onClick={() => {
                  const next = window.prompt('Entrez votre pseudo de joueur :', userPseudo);
                  if (next !== null) handleUpdatePseudo(next.trim());
                }}
                className="font-bold text-white hover:text-indigo-300 transition-colors cursor-pointer max-w-[70px] sm:max-w-[110px] truncate text-[11px]"
                title="Cliquer pour changer de pseudo"
              >
                {userPseudo || 'Pseudo'}
              </button>
              <div className="h-3 w-px bg-slate-800 mx-0.5" />
              <button
                onClick={() => {
                  const nextColor = userColor === 'w' ? 'b' : 'w';
                  handleUpdateUserColor(nextColor);
                }}
                className="px-1.5 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-indigo-300 font-semibold text-[10px] sm:text-[11px] transition-all cursor-pointer"
                title="Basculer la couleur de votre perspective"
              >
                {userColor === 'w' ? '⚪ Blancs' : '⚫ Noirs'}
              </button>
            </div>

            {/* Sound Mute/Unmute Button (Desktop) */}
            <button
              onClick={handleToggleSound}
              className={`hidden sm:flex p-2 rounded-xl border transition-colors cursor-pointer ${
                !isMuted
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-600/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title={isMuted ? 'Activer le son des coups' : 'Couper le son des coups'}
            >
              {!isMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            {/* Segmented Tab Controls (when game is analyzed) */}
            {analysisResult && (
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveTab('board')}
                  className={`flex items-center gap-1 px-2 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'board'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Swords className="w-3 h-3 shrink-0" />
                  <span>Échiquier</span>
                </button>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`flex items-center gap-1 px-2 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'dashboard'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LayoutDashboard className="w-3 h-3 shrink-0" />
                  <span>Bilan</span>
                </button>
              </div>
            )}

            {/* Action Buttons: Import PGN & Export PDF */}
            {analysisResult && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsPgnModalOpen(true)}
                  className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                  title="Charger un autre PGN"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden md:inline ml-1">Autre PGN</span>
                </button>
                <button
                  onClick={() => generateChessAnalysisPdf(analysisResult)}
                  className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm border border-indigo-500/40 transition-all cursor-pointer"
                  title="Télécharger le rapport PDF"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span className="hidden md:inline ml-1">PDF</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Analysis Progress Banner */}
      {isAnalyzing && analysisProgress && (
        <div className="bg-indigo-950/60 border-b border-indigo-900/60 px-4 py-2.5 flex items-center justify-between text-xs animate-pulse">
          <div className="flex items-center gap-2 text-indigo-200 font-medium">
            <span className="w-3.5 h-3.5 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
            <span>
              Analyse Stockfish en profondeur... Coup {analysisProgress.current} sur{' '}
              {analysisProgress.total} ({Math.round((analysisProgress.current / Math.max(1, analysisProgress.total)) * 100)}%)
            </span>
          </div>
          <div className="w-48 bg-slate-900 rounded-full h-2 overflow-hidden border border-indigo-800/40">
            <div
              className="bg-indigo-500 h-full rounded-full transition-all duration-150"
              style={{
                width: `${(analysisProgress.current / Math.max(1, analysisProgress.total)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2.5 sm:p-4 lg:p-6 flex flex-col gap-4 sm:gap-6 overflow-x-hidden">
        {!analysisResult && !isAnalyzing ? (
          <div className="flex flex-col items-center justify-center my-auto py-8">
            <div className="max-w-2xl w-full">
              <PgnInput
                currentPgn={pgn}
                userPseudo={userPseudo}
                onUpdatePseudo={handleUpdatePseudo}
                onAnalyze={runAnalysis}
                isAnalyzing={isAnalyzing}
              />
            </div>
          </div>
        ) : activeTab === 'dashboard' && analysisResult ? (
          <Dashboard
            analysis={analysisResult}
            userPseudo={userPseudo}
            userColor={userColor}
            onUpdateUserColor={handleUpdateUserColor}
            onUpdatePseudo={handleUpdatePseudo}
            onSelectPly={(ply) => {
              setCurrentPly(ply);
              setActiveTab('board');
              setIsPreviewingAlternative(false);
            }}
            onUpdateAiSummary={handleUpdateAiSummary}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start w-full max-w-full">
            {/* Left Column: Board + Eval Bar + Eval Chart (lg:col-span-7) */}
            <div className="lg:col-span-7 flex flex-col gap-3.5 lg:sticky lg:top-18 self-start w-full max-w-full">
              {/* Opening & Player Perspective Strip */}
              {analysisResult?.metadata?.opening && (
                <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-900/90 border border-indigo-500/20 text-xs shadow-sm">
                  <div className="flex items-center gap-2 truncate">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="font-semibold text-white truncate">
                      {analysisResult.metadata.eco ? `[${analysisResult.metadata.eco}] ` : ''}
                      {analysisResult.metadata.opening}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                    <span className="text-slate-400 hidden sm:inline">Perspective :</span>
                    <button
                      onClick={() => handleUpdateUserColor(userColor === 'w' ? 'b' : 'w')}
                      className="px-2 py-0.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-semibold cursor-pointer transition-colors"
                      title="Changer votre perspective de jeu"
                    >
                      {userColor === 'w' ? '⚪ Blancs' : '⚫ Noirs'}
                    </button>
                  </div>
                </div>
              )}

              {/* Board Header / Player Bar (Top Player) */}
              <div className="flex items-center justify-between px-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full border ${isFlipped ? 'bg-white border-slate-300 shadow-sm' : 'bg-slate-800 border-slate-600'}`} />
                  <span className="font-bold text-slate-200">
                    {isFlipped
                      ? analysisResult?.metadata?.white || 'Joueur Blancs'
                      : analysisResult?.metadata?.black || 'Joueur Noirs'}
                  </span>
                  {/* VOUS badge if top player is user */}
                  {((isFlipped && userColor === 'w') || (!isFlipped && userColor === 'b')) && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold text-[9px] uppercase tracking-wider">
                      VOUS
                    </span>
                  )}
                  {analysisResult?.metadata?.blackElo && (
                    <span className="text-slate-500 font-mono">
                      ({isFlipped ? analysisResult.metadata.whiteElo : analysisResult.metadata.blackElo})
                    </span>
                  )}
                </div>

                {/* Flip & Arrow Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsFlipped((f) => !f)}
                    className="p-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                    title="Inverser l'échiquier (Touche F)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowArrows((a) => !a)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors ${
                      showArrows
                        ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                    title="Afficher/masquer les flèches tactiques"
                  >
                    Flèches
                  </button>
                </div>
              </div>

              {/* Chessboard + Evaluation Bar Container */}
              <div className="flex gap-2 sm:gap-3 justify-center items-stretch w-full max-w-full overflow-hidden">
                {/* Vertical Evaluation Bar */}
                <EvaluationBar
                  evalCp={activeMove ? activeMove.evalAfter : 0}
                  mate={activeMove ? activeMove.mateAfter : null}
                  isFlipped={isFlipped}
                />

                {/* Interactive Chess Board */}
                <div className="flex-1 max-w-[500px] min-w-0 flex items-center justify-center">
                  <ChessBoard
                    fen={isPreviewingAlternative && alternativeFen ? alternativeFen : currentFen}
                    isFlipped={isFlipped}
                    lastMove={boardArrows.lastMove}
                    bestMove={boardArrows.bestMove}
                    showArrows={showArrows && !isPreviewingAlternative}
                  />
                </div>
              </div>

              {/* Board Footer / Player Bar (Bottom Player) */}
              <div className="flex items-center justify-between px-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full border ${isFlipped ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-300 shadow-sm'}`} />
                  <span className="font-bold text-slate-200">
                    {isFlipped
                      ? analysisResult?.metadata?.black || 'Joueur Noirs'
                      : analysisResult?.metadata?.white || 'Joueur Blancs'}
                  </span>
                  {/* VOUS badge if bottom player is user */}
                  {((!isFlipped && userColor === 'w') || (isFlipped && userColor === 'b')) && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold text-[9px] uppercase tracking-wider">
                      VOUS
                    </span>
                  )}
                  {analysisResult?.metadata?.whiteElo && (
                    <span className="text-slate-500 font-mono">
                      ({isFlipped ? analysisResult.metadata.blackElo : analysisResult.metadata.whiteElo})
                    </span>
                  )}
                </div>

                {activeMove && (
                  <span className="font-mono text-slate-400 text-[11px] flex items-center gap-1.5 flex-wrap">
                    <span>Coup {activeMove.moveNumber} · {activeMove.san}</span>
                    {activeMove.thinkTimeFormatted && (
                      <span className={`px-1 py-0.5 rounded text-[10px] ${activeMove.isLongThink ? 'text-amber-300 bg-amber-500/20 font-bold border border-amber-500/40' : 'text-slate-400 bg-slate-900 border border-slate-800'}`}>
                        ⏱️ {activeMove.thinkTimeFormatted}
                      </span>
                    )}
                    <span>(Perte: -{(activeMove.centipawnLoss / 100).toFixed(1)})</span>
                  </span>
                )}
              </div>

              {/* Ergonomic Mobile & Desktop Navigation & Playback Bar */}
              <div className="flex items-center justify-between p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-lg flex-wrap gap-2">
                {/* Step Controls */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentPly(0);
                      setIsPreviewingAlternative(false);
                    }}
                    disabled={currentPly <= 0}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
                    title="Début de la partie (Flèche Haut)"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentPly((p) => Math.max(0, p - 1));
                      setIsPreviewingAlternative(false);
                    }}
                    disabled={currentPly <= 0}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
                    title="Coup précédent (Flèche Gauche)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setIsPlaying((p) => !p)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      isPlaying
                        ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                    }`}
                    title={isPlaying ? 'Pause' : 'Lecture automatique'}
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span className="text-[11px] hidden xs:inline">{isPlaying ? 'Pause' : 'Auto'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentPly((p) => Math.min((analysisResult?.moves.length || 1) - 1, p + 1));
                      setIsPreviewingAlternative(false);
                    }}
                    disabled={!analysisResult || currentPly >= analysisResult.moves.length - 1}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
                    title="Coup suivant (Flèche Droite)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentPly((analysisResult?.moves.length || 1) - 1);
                      setIsPreviewingAlternative(false);
                    }}
                    disabled={!analysisResult || currentPly >= analysisResult.moves.length - 1}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
                    title="Fin de la partie (Flèche Bas)"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Current Move Indicator */}
                <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-300">
                  <span className="text-slate-400 text-[11px]">
                    {currentPly >= 0
                      ? `${currentPly + 1} / ${analysisResult?.moves.length}`
                      : `0 / ${analysisResult?.moves.length || 0}`}
                  </span>
                  {activeMove && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-white font-bold text-xs">
                      {activeMove.moveNumber}{activeMove.color === 'w' ? '.' : '...'} {activeMove.san}
                    </span>
                  )}
                </div>

                {/* Quick Tools: Sound Toggle & Flip Board */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleToggleSound}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      !isMuted
                        ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-600/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                    title={isMuted ? 'Activer le son' : 'Couper le son'}
                  >
                    {!isMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => setIsFlipped((f) => !f)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Inverser l'échiquier"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Full-width Real-Time Evaluation Chart */}
              <EvaluationChart
                moves={analysisResult?.moves || []}
                currentPly={currentPly}
                onSelectPly={(ply) => {
                  setCurrentPly(ply);
                  setIsPreviewingAlternative(false);
                }}
              />
            </div>

            {/* Right Column: Move Comparison + Pedagogical AI Coach + Move List (lg:col-span-5) */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              {/* Tactical Comparison Card */}
              <MoveComparison
                currentMove={activeMove}
                previousMove={previousMove}
                isPreviewingAlternative={isPreviewingAlternative}
                onTogglePreviewAlternative={() => setIsPreviewingAlternative((prev) => !prev)}
                onUpdateAiExplanation={handleUpdateAiExplanation}
                sanHistory={analysisResult?.moves.map((m) => m.san) || []}
                userColor={userColor}
                openingName={analysisResult?.metadata?.opening}
                eco={analysisResult?.metadata?.eco}
              />

              {/* Notation and Critical Faults Table */}
              <MoveList
                moves={analysisResult?.moves || []}
                currentPly={currentPly}
                onSelectPly={(ply) => {
                  setCurrentPly(ply);
                  setIsPreviewingAlternative(false);
                }}
                filterOnlyErrors={filterOnlyErrors}
                onToggleFilter={() => setFilterOnlyErrors((f) => !f)}
              />
            </div>
          </div>
        )}
      </main>

      {/* PGN Import Modal */}
      {isPgnModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <PgnInput
            currentPgn={pgn}
            userPseudo={userPseudo}
            onUpdatePseudo={handleUpdatePseudo}
            onAnalyze={(newPgn, depth) => {
              setIsPgnModalOpen(false);
              runAnalysis(newPgn, depth);
            }}
            isAnalyzing={isAnalyzing}
            onClose={() => setIsPgnModalOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
