import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FileText,
  Flame,
  FlaskConical,
  LayoutDashboard,
  Palette,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  Target,
  Undo2,
  Upload,
  User,
  Volume2,
  VolumeX,
  X,
  Boxes,
} from 'lucide-react';

import { MoveAnalysis, GameAnalysisResult, GameMetadata } from './types/chess';
import { stockfishService } from './services/stockfishEngine';
import { toFrenchSan } from './utils/chessNotation';
import { analyzeTacticalThreatsForMove } from './utils/tacticalThreats';
import { parsePgnHeaders } from './utils/pgnParser';
import { SAMPLE_GAMES } from './utils/sampleGames';
import { chessAudio } from './utils/chessAudio';
import { computeBoardMaterial } from './utils/chessMaterial';
import { computeBoardHeatmap } from './utils/chessHeatmap';

import { ChessBoard } from './components/ChessBoard/ChessBoard';
import { CapturedPieces } from './components/ChessBoard/CapturedPieces';
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
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState<'none' | 'both' | 'white' | 'black'>('none');
  const [threatsMode, setThreatsMode] = useState<'suggestion' | 'played'>('suggestion');
  const [isPreviewingAlternative, setIsPreviewingAlternative] = useState(false);
  const [filterOnlyErrors, setFilterOnlyErrors] = useState(false);
  const [boardTheme, setBoardTheme] = useState<'green' | 'wood' | 'blue'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chess_board_theme');
      if (saved === 'wood' || saved === 'blue' || saved === 'green') return saved;
    }
    return 'green';
  });

  const handleSelectBoardTheme = useCallback((theme: 'green' | 'wood' | 'blue') => {
    setBoardTheme(theme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_board_theme', theme);
    }
  }, []);

  // Board Size (Normal 500px, Grand 640px, XL 760px)
  const [boardSize, setBoardSize] = useState<'normal' | 'large' | 'xl'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chess_board_size');
      if (saved === 'normal' || saved === 'large' || saved === 'xl') return saved;
    }
    return 'normal';
  });

  const handleUpdateBoardSize = useCallback((size: 'normal' | 'large' | 'xl') => {
    setBoardSize(size);
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_board_size', size);
    }
  }, []);

  // Audio and Auto-play state
  const [isMuted, setIsMuted] = useState<boolean>(() => chessAudio.getIsMuted());
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2 | 4>(() => {
    if (typeof window !== 'undefined') {
      const saved = Number(localStorage.getItem('chess_playback_speed'));
      if (saved === 0.5 || saved === 1 || saved === 2 || saved === 4) return saved as 0.5 | 1 | 2 | 4;
    }
    return 1;
  });

  const handleUpdatePlaybackSpeed = useCallback((speed: 0.5 | 1 | 2 | 4) => {
    setPlaybackSpeed(speed);
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_playback_speed', String(speed));
    }
  }, []);

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

  // Auto-play timer with dynamic playbackSpeed
  useEffect(() => {
    let timer: any = null;
    if (isPlaying && analysisResult && analysisResult.moves.length > 0) {
      const intervalMs = Math.round(1100 / playbackSpeed);
      timer = setInterval(() => {
        setCurrentPly((prev) => {
          if (prev >= analysisResult.moves.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, analysisResult, playbackSpeed]);

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
    setCurrentPly(0);
    setIsPreviewingAlternative(false);
    setIsSandboxMode(false);
    setSandboxHistory([]);
    setSelectedSquare(null);

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

      // Always land on move 0 (the first move of the game) so the user starts at the beginning
      setCurrentPly(0);
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

  // Critical Moments (Moments Clés / Saut d'erreurs)
  const criticalPlies = useMemo(() => {
    if (!analysisResult?.moves) return [];
    const list: number[] = [];
    analysisResult.moves.forEach((m, idx) => {
      if (['inaccuracy', 'mistake', 'blunder', 'missedWin'].includes(m.classification)) {
        list.push(idx);
      }
    });
    return list;
  }, [analysisResult?.moves]);

  const prevErrorPly = useMemo(() => {
    for (let i = criticalPlies.length - 1; i >= 0; i--) {
      if (criticalPlies[i] < currentPly) return criticalPlies[i];
    }
    return null;
  }, [criticalPlies, currentPly]);

  const nextErrorPly = useMemo(() => {
    for (let i = 0; i < criticalPlies.length; i++) {
      if (criticalPlies[i] > currentPly) return criticalPlies[i];
    }
    return null;
  }, [criticalPlies, currentPly]);

  const currentErrorIndex = useMemo(() => {
    const idx = criticalPlies.indexOf(currentPly);
    return idx !== -1 ? idx + 1 : null;
  }, [criticalPlies, currentPly]);

  // Sandbox Exploration State ("Et si j'avais joué... ?")
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [isSandboxMode, setIsSandboxMode] = useState<boolean>(false);
  const [sandboxHistory, setSandboxHistory] = useState<
    Array<{ san: string; from: string; to: string; fen: string }>
  >([]);
  const [sandboxEval, setSandboxEval] = useState<{ cp: number; mate: number | null }>({ cp: 0, mate: null });

  const [copiedPgnToast, setCopiedPgnToast] = useState(false);
  const [isImportingLichess, setIsImportingLichess] = useState(false);

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

  // Tactical Threats (Stockfish suggestions vs Played move)
  const { suggestionThreats, playedThreats, activeThreats } = useMemo(() => {
    if (!activeMove) {
      return { suggestionThreats: [], playedThreats: [], activeThreats: [] };
    }

    const sThreats = activeMove.bestMoveUci
      ? analyzeTacticalThreatsForMove(activeMove.fenBefore, activeMove.bestMoveUci)
      : [];

    const pThreats = activeMove.uci
      ? analyzeTacticalThreatsForMove(activeMove.fenBefore, activeMove.uci)
      : [];

    const effectiveMode = isPreviewingAlternative ? 'suggestion' : threatsMode;
    const active = effectiveMode === 'suggestion' ? sThreats : pThreats;

    return {
      suggestionThreats: sThreats,
      playedThreats: pThreats,
      activeThreats: active,
    };
  }, [activeMove, threatsMode, isPreviewingAlternative]);

  // Active FEN on the board (sandbox vs alternative preview vs game position)
  const sandboxCurrentFen = useMemo(() => {
    if (!isSandboxMode || sandboxHistory.length === 0) return null;
    return sandboxHistory[sandboxHistory.length - 1].fen;
  }, [isSandboxMode, sandboxHistory]);

  const activeBoardFen = isSandboxMode && sandboxCurrentFen
    ? sandboxCurrentFen
    : isPreviewingAlternative && alternativeFen
    ? alternativeFen
    : currentFen;

  // Real-time material differential & captured pieces
  const boardMaterial = useMemo(() => {
    return computeBoardMaterial(activeBoardFen);
  }, [activeBoardFen]);

  // Real-time space control & heatmap calculation
  const boardHeatmapData = useMemo(() => {
    if (heatmapMode === 'none') return null;
    return computeBoardHeatmap(activeBoardFen);
  }, [heatmapMode, activeBoardFen]);

  // Real-time evaluation when in Sandbox mode
  useEffect(() => {
    if (!isSandboxMode || !sandboxCurrentFen) return;
    let isCancelled = false;
    stockfishService
      .evaluatePosition(sandboxCurrentFen, 10)
      .then((res) => {
        if (!isCancelled) {
          setSandboxEval({ cp: res.cp, mate: res.mate });
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [isSandboxMode, sandboxCurrentFen]);

  // Handle square clicks for piece selection and sandbox move execution
  const handleSquareClick = useCallback(
    (square: string) => {
      let chessInstance: Chess;
      try {
        chessInstance = new Chess(activeBoardFen);
      } catch {
        chessInstance = new Chess();
      }

      // If a piece is already selected, try to play the move
      if (selectedSquare) {
        try {
          const move = chessInstance.move({ from: selectedSquare, to: square, promotion: 'q' });
          if (move) {
            chessAudio.playForMove(move.san, move.san.includes('+') || move.san.includes('#'));
            setSelectedSquare(null);
            const nextFen = chessInstance.fen();
            setSandboxHistory((prev) => [
              ...prev,
              { san: move.san, from: move.from, to: move.to, fen: nextFen },
            ]);
            setIsSandboxMode(true);
            setIsPreviewingAlternative(false);
            return;
          }
        } catch {
          // Illegal destination
        }
      }

      // If clicking on a piece of the side whose turn it is, select it
      const piece = chessInstance.get(square as any);
      if (piece && piece.color === chessInstance.turn()) {
        setSelectedSquare(square);
      } else {
        setSelectedSquare(null);
      }
    },
    [activeBoardFen, selectedSquare]
  );

  const handlePieceMove = useCallback(
    (from: string, to: string) => {
      if (from === to) return;
      let chessInstance: Chess;
      try {
        chessInstance = new Chess(activeBoardFen);
      } catch {
        chessInstance = new Chess();
      }

      try {
        const move = chessInstance.move({ from, to, promotion: 'q' });
        if (move) {
          chessAudio.playForMove(move.san, move.san.includes('+') || move.san.includes('#'));
          setSelectedSquare(null);
          const nextFen = chessInstance.fen();
          setSandboxHistory((prev) => [
            ...prev,
            { san: move.san, from: move.from, to: move.to, fen: nextFen },
          ]);
          setIsSandboxMode(true);
          setIsPreviewingAlternative(false);
        }
      } catch {
        // Illegal move ignored
      }
    },
    [activeBoardFen]
  );

  const handleUndoSandboxMove = useCallback(() => {
    setSandboxHistory((prev) => {
      if (prev.length <= 1) {
        setIsSandboxMode(false);
        return [];
      }
      return prev.slice(0, prev.length - 1);
    });
    setSelectedSquare(null);
  }, []);

  const handleExitSandbox = useCallback(() => {
    setIsSandboxMode(false);
    setSandboxHistory([]);
    setSelectedSquare(null);
  }, []);

  const handleOpenLichessPgn = useCallback(async () => {
    if (!pgn || isImportingLichess) return;

    // 1. Pre-open blank tab synchronously on click to prevent popup blockers
    let newTab: Window | null = null;
    try {
      newTab = window.open('about:blank', '_blank');
    } catch {
      newTab = null;
    }

    // 2. Copy complete PGN text to clipboard
    try {
      navigator.clipboard.writeText(pgn);
    } catch {
      // Ignore
    }

    setIsImportingLichess(true);

    try {
      const response = await fetch('/api/lichess/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn }),
      });

      if (response.ok) {
        const res = await response.json();
        if (res.success && res.id) {
          const perspective = isFlipped ? '/black' : '/white';
          const targetUrl = `https://lichess.org/${res.id}${perspective}`;
          try {
            if (newTab) {
              newTab.location.href = targetUrl;
            } else {
              window.open(targetUrl, '_blank', 'noopener,noreferrer');
            }
          } catch {}
          setCopiedPgnToast(true);
          setTimeout(() => setCopiedPgnToast(false), 4500);
          return;
        }
      }
      throw new Error('Lichess import API failed');
    } catch (err) {
      console.warn('Direct Lichess import failed, opening manual import page:', err);
      try {
        if (newTab) {
          newTab.location.href = 'https://lichess.org/paste';
        } else {
          window.open('https://lichess.org/paste', '_blank', 'noopener,noreferrer');
        }
      } catch {}
      setCopiedPgnToast(true);
      setTimeout(() => setCopiedPgnToast(false), 4500);
    } finally {
      setIsImportingLichess(false);
    }
  }, [pgn, isFlipped, isImportingLichess]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing in inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (!analysisResult) return;
      const total = analysisResult.moves.length;

      // Shift + Arrows: Navigate between critical moments / errors
      if (e.shiftKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        if (prevErrorPly !== null) {
          setIsPlaying(false);
          setIsSandboxMode(false);
          setSandboxHistory([]);
          setSelectedSquare(null);
          setCurrentPly(prevErrorPly);
          setIsPreviewingAlternative(false);
        }
        return;
      } else if (e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault();
        if (nextErrorPly !== null) {
          setIsPlaying(false);
          setIsSandboxMode(false);
          setSandboxHistory([]);
          setSelectedSquare(null);
          setCurrentPly(nextErrorPly);
          setIsPreviewingAlternative(false);
        }
        return;
      } else if (e.key === 'Escape') {
        if (isSandboxMode) {
          e.preventDefault();
          setIsSandboxMode(false);
          setSandboxHistory([]);
          setSelectedSquare(null);
          return;
        }
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setIsSandboxMode(false);
        setSandboxHistory([]);
        setSelectedSquare(null);
        setCurrentPly((p) => Math.max(0, p - 1));
        setIsPreviewingAlternative(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setIsSandboxMode(false);
        setSandboxHistory([]);
        setSelectedSquare(null);
        setCurrentPly((p) => Math.min(total - 1, p + 1));
        setIsPreviewingAlternative(false);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIsPlaying(false);
        setIsSandboxMode(false);
        setSandboxHistory([]);
        setSelectedSquare(null);
        setCurrentPly(0);
        setIsPreviewingAlternative(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsPlaying(false);
        setIsSandboxMode(false);
        setSandboxHistory([]);
        setSelectedSquare(null);
        setCurrentPly(total - 1);
        setIsPreviewingAlternative(false);
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'Escape') {
        if (isSandboxMode) {
          e.preventDefault();
          handleExitSandbox();
        }
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsFlipped((f) => !f);
      } else if (e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setShowAnnotations((a) => !a);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        handleToggleSound();
      } else if (e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setIsPreviewingAlternative((prev) => !prev);
      } else if (e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setHeatmapMode((prev) => {
          if (prev === 'none') return 'both';
          if (prev === 'both') return 'white';
          if (prev === 'white') return 'black';
          return 'none';
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    analysisResult,
    prevErrorPly,
    nextErrorPly,
    isSandboxMode,
    handleToggleSound,
    handleExitSandbox,
  ]);

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
                  <span className="text-[9px] sm:text-[10px] text-emerald-400 font-mono font-semibold px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                    Stockfish 19
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

            {/* Action Button: Import PGN */}
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
      <main
        className={`flex-1 w-full mx-auto p-2.5 sm:p-4 lg:p-6 flex flex-col gap-4 sm:gap-6 overflow-x-hidden ${
          boardSize === 'xl' ? 'max-w-[1600px]' : boardSize === 'large' ? 'max-w-[1440px]' : 'max-w-7xl'
        }`}
      >
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
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start w-full max-w-full">
            {/* Left Column: Board + Eval Bar + Eval Chart (Dynamic width according to board size) */}
            <div
              className={`flex flex-col gap-3.5 lg:sticky lg:top-16 lg:self-start w-full max-w-full ${
                boardSize === 'xl'
                  ? 'lg:col-span-8 xl:col-span-9'
                  : boardSize === 'large'
                  ? 'lg:col-span-8'
                  : 'lg:col-span-7'
              }`}
            >
              {/* Opening & Player Perspective Strip */}
              {analysisResult?.metadata?.opening && (
                <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-900/90 border border-indigo-500/20 text-xs shadow-sm min-h-[36px]">
                  <div className="flex items-center gap-2 truncate min-w-0">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="font-semibold text-white truncate">
                      {analysisResult.metadata.eco ? `[${analysisResult.metadata.eco}] ` : ''}
                      {analysisResult.metadata.opening}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 text-[11px] ml-2">
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

              {/* Board Header / Player Bar (Top Player) - Fixed single-line stable height */}
              <div className="flex items-center justify-between px-1.5 sm:px-2 text-xs h-9 min-h-[36px] flex-nowrap">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-nowrap overflow-hidden">
                  <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border shrink-0 ${isFlipped ? 'bg-white border-slate-300 shadow-sm' : 'bg-slate-800 border-slate-600'}`} />
                  <span className="font-bold text-slate-200 truncate max-w-[120px] xs:max-w-[160px] sm:max-w-[220px]">
                    {isFlipped
                      ? analysisResult?.metadata?.white || 'Joueur Blancs'
                      : analysisResult?.metadata?.black || 'Joueur Noirs'}
                  </span>
                  {/* VOUS badge if top player is user */}
                  {((isFlipped && userColor === 'w') || (!isFlipped && userColor === 'b')) && (
                    <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold text-[9px] uppercase tracking-wider shrink-0">
                      VOUS
                    </span>
                  )}
                  {analysisResult?.metadata?.blackElo && (
                    <span className="text-slate-500 font-mono text-[10px] sm:text-xs shrink-0">
                      ({isFlipped ? analysisResult.metadata.whiteElo : analysisResult.metadata.blackElo})
                    </span>
                  )}

                  {/* Captured pieces & Material lead for Top Player */}
                  <div className="overflow-hidden flex items-center shrink-0">
                    <CapturedPieces
                      captured={isFlipped ? boardMaterial.whiteCaptured : boardMaterial.blackCaptured}
                      pieceColor={isFlipped ? 'b' : 'w'}
                      advantage={isFlipped ? boardMaterial.whiteAdvantage : boardMaterial.blackAdvantage}
                      className="ml-1"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => setIsFlipped((f) => !f)}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors cursor-pointer"
                    title="Inverser l'échiquier (Touche F)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Dedicated Board Controls Toolbar (Annotations, Contrôle de l'espace, Thèmes, Taille, Lichess) */}
              <div className="flex items-center justify-between gap-1.5 flex-wrap px-2 py-1.5 rounded-xl bg-slate-900/70 border border-slate-800/80 text-[11px]">
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    onClick={() => setShowAnnotations((a) => !a)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium border transition-colors cursor-pointer ${
                      showAnnotations
                        ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                    title="Afficher/masquer les flèches et les menaces tactiques (Touche E)"
                  >
                    <Target className="w-3 h-3 text-indigo-400" />
                    <span>Annotations</span>
                    {activeThreats.length > 0 && showAnnotations && (
                      <span className="ml-0.5 px-1 py-0.2 rounded-full bg-rose-600 text-white text-[9px] font-bold">
                        {activeThreats.length}
                      </span>
                    )}
                  </button>

                  {/* Space Control / Heatmap Multi-Selector */}
                  <div className="flex items-center rounded-lg bg-slate-950 border border-slate-800 p-0.5" title="Contrôle de l'espace / Rayon d'action (Touche H pour cycler)">
                    <button
                      onClick={() => setHeatmapMode((prev) => (prev === 'both' ? 'none' : 'both'))}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                        heatmapMode === 'both'
                          ? 'bg-blue-600/30 text-blue-300 font-bold border border-blue-500/50'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Contrôle de l'espace combiné (Différentiel Blancs vs Noirs)"
                    >
                      <Shield className="w-2.5 h-2.5 text-blue-400" />
                      <span>Les 2</span>
                    </button>
                    <button
                      onClick={() => setHeatmapMode((prev) => (prev === 'white' ? 'none' : 'white'))}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                        heatmapMode === 'white'
                          ? 'bg-indigo-600/30 text-indigo-300 font-bold border border-indigo-500/50'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Afficher uniquement les cases contrôlées par les Blancs"
                    >
                      <span>⚪ Blancs</span>
                    </button>
                    <button
                      onClick={() => setHeatmapMode((prev) => (prev === 'black' ? 'none' : 'black'))}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                        heatmapMode === 'black'
                          ? 'bg-rose-600/30 text-rose-300 font-bold border border-rose-500/50'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Afficher uniquement les cases contrôlées par les Noirs"
                    >
                      <span>⚫ Noirs</span>
                    </button>
                    {heatmapMode !== 'none' && (
                      <button
                        onClick={() => setHeatmapMode('none')}
                        className="px-1 py-0.5 rounded text-[10px] text-slate-500 hover:text-rose-400 cursor-pointer"
                        title="Désactiver l'affichage du contrôle"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Board Themes Selector */}
                  <div className="flex items-center rounded-lg bg-slate-950 border border-slate-800 p-0.5" title="Thème visuel de l'échiquier">
                    <button
                      onClick={() => handleSelectBoardTheme('green')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                        boardTheme === 'green'
                          ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Échiquier Vert Tournoi"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#779952]" />
                      <span className="hidden xs:inline">Vert</span>
                    </button>
                    <button
                      onClick={() => handleSelectBoardTheme('wood')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                        boardTheme === 'wood'
                          ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Échiquier Bois Chaleureux"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#b58863]" />
                      <span className="hidden xs:inline">Bois</span>
                    </button>
                    <button
                      onClick={() => handleSelectBoardTheme('blue')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                        boardTheme === 'blue'
                          ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Échiquier Bleu Océan"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#8ca2ad]" />
                      <span className="hidden xs:inline">Bleu</span>
                    </button>
                  </div>

                  {/* Board Size Selector (Agrandir l'échiquier) */}
                  <div className="flex items-center rounded-lg bg-slate-950 border border-slate-800 p-0.5" title="Ajuster la taille de l'échiquier (Normal 500px, Grand 640px, XL 760px)">
                    <button
                      onClick={() => handleUpdateBoardSize('normal')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                        boardSize === 'normal'
                          ? 'bg-indigo-600/30 text-indigo-300 font-bold border border-indigo-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Taille standard (500px)"
                    >
                      Normal
                    </button>
                    <button
                      onClick={() => handleUpdateBoardSize('large')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                        boardSize === 'large'
                          ? 'bg-indigo-600/30 text-indigo-300 font-bold border border-indigo-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Grand échiquier (640px)"
                    >
                      Grand
                    </button>
                    <button
                      onClick={() => handleUpdateBoardSize('xl')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                        boardSize === 'xl'
                          ? 'bg-indigo-600/30 text-indigo-300 font-bold border border-indigo-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Très grand échiquier (760px)"
                    >
                      XL
                    </button>
                  </div>
                </div>

                {/* Lichess Options */}
                <div className="flex items-center rounded-lg bg-slate-950 border border-slate-800 p-0.5 shrink-0 max-w-full">
                  <button
                    onClick={handleOpenLichessPgn}
                    disabled={isImportingLichess}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-indigo-300 hover:text-white hover:bg-indigo-600/30 transition-colors cursor-pointer disabled:opacity-60"
                    title="Importer automatiquement et ouvrir la partie complète sur Lichess.org"
                  >
                    {isImportingLichess ? (
                      <span className="flex items-center gap-1 text-amber-300">
                        <span className="w-2.5 h-2.5 border-2 border-amber-300/40 border-t-amber-300 rounded-full animate-spin" />
                        <span>Import...</span>
                      </span>
                    ) : copiedPgnToast ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Ouvert !</span>
                      </span>
                    ) : (
                      <span>Partie Lichess</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Space Control & Heatmap Summary Bar */}
              {heatmapMode !== 'none' && boardHeatmapData && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/90 border border-blue-500/30 text-xs shadow-md animate-in fade-in flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />

                    {heatmapMode === 'both' && (
                      <>
                        <span className="font-semibold text-slate-200">
                          Contrôle de l'espace (Différentiel) :
                        </span>
                        <span className="text-blue-300 font-bold font-mono">
                          ⚪ {boardHeatmapData.whitePercent}% ({boardHeatmapData.whiteControlledCount} cases)
                        </span>
                        <span className="text-slate-400">vs</span>
                        <span className="text-rose-400 font-bold font-mono">
                          ⚫ {boardHeatmapData.blackPercent}% ({boardHeatmapData.blackControlledCount} cases)
                        </span>
                        {boardHeatmapData.contestedCount > 0 && (
                          <span className="text-amber-300/90 text-[11px] hidden sm:inline">
                            · {boardHeatmapData.contestedCount} contestée(s)
                          </span>
                        )}
                      </>
                    )}

                    {heatmapMode === 'white' && (
                      <>
                        <span className="font-semibold text-indigo-300">
                          Rayon d'action des Blancs :
                        </span>
                        <span className="text-blue-300 font-bold font-mono">
                          ⚪ {boardHeatmapData.whiteTotalCovered} cases couvertes / 64 ({Math.round((boardHeatmapData.whiteTotalCovered / 64) * 100)}%)
                        </span>
                        <span className="text-slate-400 font-mono text-[11px] hidden sm:inline">
                          · {boardHeatmapData.whiteTotalAttacks} attaques / protections
                        </span>
                      </>
                    )}

                    {heatmapMode === 'black' && (
                      <>
                        <span className="font-semibold text-rose-300">
                          Rayon d'action des Noirs :
                        </span>
                        <span className="text-rose-300 font-bold font-mono">
                          ⚫ {boardHeatmapData.blackTotalCovered} cases couvertes / 64 ({Math.round((boardHeatmapData.blackTotalCovered / 64) * 100)}%)
                        </span>
                        <span className="text-slate-400 font-mono text-[11px] hidden sm:inline">
                          · {boardHeatmapData.blackTotalAttacks} attaques / protections
                        </span>
                      </>
                    )}
                  </div>

                  {/* Visual gauge bar & Quick switchers */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20 sm:w-28 bg-slate-800 rounded-full h-2 overflow-hidden flex border border-slate-700/80 shrink-0">
                      {heatmapMode === 'both' ? (
                        <>
                          <div
                            className="bg-blue-500 h-full transition-all duration-200"
                            style={{ width: `${boardHeatmapData.whitePercent}%` }}
                            title={`Blancs : ${boardHeatmapData.whitePercent}%`}
                          />
                          <div
                            className="bg-rose-500 h-full transition-all duration-200"
                            style={{ width: `${boardHeatmapData.blackPercent}%` }}
                            title={`Noirs : ${boardHeatmapData.blackPercent}%`}
                          />
                        </>
                      ) : heatmapMode === 'white' ? (
                        <div
                          className="bg-blue-500 h-full transition-all duration-200"
                          style={{ width: `${(boardHeatmapData.whiteTotalCovered / 64) * 100}%` }}
                          title={`Blancs : ${boardHeatmapData.whiteTotalCovered} cases`}
                        />
                      ) : (
                        <div
                          className="bg-rose-500 h-full transition-all duration-200"
                          style={{ width: `${(boardHeatmapData.blackTotalCovered / 64) * 100}%` }}
                          title={`Noirs : ${boardHeatmapData.blackTotalCovered} cases`}
                        />
                      )}
                    </div>

                    <div className="flex items-center rounded-md bg-slate-950 p-0.5 border border-slate-800 text-[10px]">
                      <button
                        onClick={() => setHeatmapMode('both')}
                        className={`px-1.5 py-0.5 rounded cursor-pointer ${
                          heatmapMode === 'both' ? 'bg-blue-600/40 text-blue-200 font-bold' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Les 2
                      </button>
                      <button
                        onClick={() => setHeatmapMode('white')}
                        className={`px-1.5 py-0.5 rounded cursor-pointer ${
                          heatmapMode === 'white' ? 'bg-indigo-600/40 text-indigo-200 font-bold' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Blancs
                      </button>
                      <button
                        onClick={() => setHeatmapMode('black')}
                        className={`px-1.5 py-0.5 rounded cursor-pointer ${
                          heatmapMode === 'black' ? 'bg-rose-600/40 text-rose-200 font-bold' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Noirs
                      </button>
                      <button
                        onClick={() => setHeatmapMode('none')}
                        className="px-1 py-0.5 text-slate-500 hover:text-rose-400 cursor-pointer ml-0.5"
                        title="Masquer le contrôle"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Lichess Import Guide Notification Banner */}
              {copiedPgnToast && (
                <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-200 text-xs shadow-lg animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>Partie ouverte sur Lichess !</strong> Votre partie a été importée automatiquement dans l'autre onglet avec l'analyse, le replay et les statistiques. Le texte PGN complet est également dans votre presse-papier.
                    </span>
                  </div>
                  <button
                    onClick={() => setCopiedPgnToast(false)}
                    className="p-1 hover:text-white text-indigo-400 text-xs ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Sandbox Exploration Mode Banner */}
              {isSandboxMode && (
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs shadow-lg animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-md bg-amber-500/25 flex items-center justify-center text-amber-300 shrink-0">
                      <FlaskConical className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-amber-300 flex items-center gap-1.5">
                        <span>Exploration libre</span>
                        <span className="text-[10px] font-normal text-amber-200/80 hidden sm:inline">(« Et si j'avais joué... ? »)</span>
                      </div>
                      <div className="font-mono text-slate-200 text-[11px] truncate">
                        {sandboxHistory.map((m, idx) => `${idx + 1}. ${m.san}`).join(' ')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      onClick={handleUndoSandboxMove}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
                      title="Annuler le dernier coup exploré"
                    >
                      <Undo2 className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline">Annuler</span>
                    </button>

                    <button
                      onClick={handleExitSandbox}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600/25 hover:bg-rose-600/35 text-rose-200 border border-rose-500/40 text-xs font-semibold transition-colors cursor-pointer"
                      title="Revenir à la position de la partie (Touche Échap)"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Quitter</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Chessboard + Evaluation Bar Container */}
              <div className="flex gap-2 sm:gap-3 justify-center items-stretch w-full max-w-full overflow-hidden">
                {/* Vertical Evaluation Bar */}
                <EvaluationBar
                  evalCp={isSandboxMode ? sandboxEval.cp : activeMove ? activeMove.evalAfter : 0}
                  mate={isSandboxMode ? sandboxEval.mate : activeMove ? activeMove.mateAfter : null}
                  isFlipped={isFlipped}
                />

                {/* Interactive Chess Board */}
                <div
                  className={`flex-1 min-w-0 flex items-center justify-center ${
                    boardSize === 'xl'
                      ? 'max-w-[760px]'
                      : boardSize === 'large'
                      ? 'max-w-[640px]'
                      : 'max-w-[500px]'
                  }`}
                >
                  <ChessBoard
                    fen={activeBoardFen}
                    isFlipped={isFlipped}
                    boardTheme={boardTheme}
                    lastMove={
                      isSandboxMode && sandboxHistory.length > 0
                        ? {
                            from: sandboxHistory[sandboxHistory.length - 1].from,
                            to: sandboxHistory[sandboxHistory.length - 1].to,
                          }
                        : boardArrows.lastMove
                    }
                    bestMove={isSandboxMode ? null : boardArrows.bestMove}
                    showArrows={!isSandboxMode && showAnnotations && !isPreviewingAlternative}
                    tacticalThreats={isSandboxMode ? [] : activeThreats}
                    showThreats={!isSandboxMode && showAnnotations}
                    heatmapMode={heatmapMode}
                    onSquareClick={handleSquareClick}
                    onPieceMove={handlePieceMove}
                    selectedSquare={selectedSquare}
                    maxWidthClass={
                      boardSize === 'xl'
                        ? 'max-w-[760px]'
                        : boardSize === 'large'
                        ? 'max-w-[640px]'
                        : 'max-w-[500px]'
                    }
                  />
                </div>
              </div>

              {/* Board Footer / Player Bar (Bottom Player) - Fixed single-line stable height */}
              <div className="flex items-center justify-between px-1.5 sm:px-2 gap-1.5 text-xs h-9 min-h-[36px] flex-nowrap overflow-hidden">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-nowrap overflow-hidden">
                  <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border shrink-0 ${isFlipped ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-300 shadow-sm'}`} />
                  <span className="font-bold text-slate-200 truncate max-w-[120px] xs:max-w-[160px] sm:max-w-[220px]">
                    {isFlipped
                      ? analysisResult?.metadata?.black || 'Joueur Noirs'
                      : analysisResult?.metadata?.white || 'Joueur Blancs'}
                  </span>
                  {/* VOUS badge if bottom player is user */}
                  {((!isFlipped && userColor === 'w') || (isFlipped && userColor === 'b')) && (
                    <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold text-[9px] uppercase tracking-wider shrink-0">
                      VOUS
                    </span>
                  )}
                  {analysisResult?.metadata?.whiteElo && (
                    <span className="text-slate-500 font-mono text-[10px] sm:text-xs shrink-0">
                      ({isFlipped ? analysisResult.metadata.blackElo : analysisResult.metadata.whiteElo})
                    </span>
                  )}

                  {/* Captured pieces & Material lead for Bottom Player */}
                  <div className="overflow-hidden flex items-center shrink-0">
                    <CapturedPieces
                      captured={!isFlipped ? boardMaterial.whiteCaptured : boardMaterial.blackCaptured}
                      pieceColor={!isFlipped ? 'b' : 'w'}
                      advantage={!isFlipped ? boardMaterial.whiteAdvantage : boardMaterial.blackAdvantage}
                      className="ml-1"
                    />
                  </div>
                </div>

                <div className="font-mono text-slate-400 text-[11px] flex items-center gap-1.5 shrink-0 ml-2">
                  {activeMove ? (
                    <>
                      <span className="text-slate-200 font-semibold truncate">
                        Coup {activeMove.moveNumber} · {toFrenchSan(activeMove.san)}
                      </span>
                      {activeMove.thinkTimeFormatted && (
                        <span className={`px-1 py-0.2 rounded text-[10px] shrink-0 ${activeMove.isLongThink ? 'text-amber-300 bg-amber-500/20 font-bold border border-amber-500/40' : 'text-slate-400 bg-slate-900 border border-slate-800'}`}>
                          ⏱️ {activeMove.thinkTimeFormatted}
                        </span>
                      )}
                      {activeMove.centipawnLoss > 20 && (
                        <span className="text-rose-400 font-medium shrink-0">(-{(activeMove.centipawnLoss / 100).toFixed(1)})</span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-500 text-[11px] italic">Position initiale</span>
                  )}
                </div>
              </div>

              {/* Ergonomic Mobile & Desktop Navigation & Playback Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-lg gap-2 sm:gap-2.5 max-w-full overflow-hidden">
                {/* Top/Left Row: Step Controls & Critical Error Jumpers */}
                <div className="flex items-center justify-between sm:justify-start gap-1 sm:gap-1.5 flex-wrap">
                  {/* Step controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setIsPlaying(false);
                        setCurrentPly(0);
                        setIsPreviewingAlternative(false);
                      }}
                      disabled={currentPly <= 0}
                      className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
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
                      className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
                      title="Coup précédent (Flèche Gauche)"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setIsPlaying((p) => !p)}
                      className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isPlaying
                          ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                      }`}
                      title={isPlaying ? 'Pause (Touche Espace)' : `Lecture automatique ${playbackSpeed}x (Touche Espace)`}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span className="text-[11px] hidden xs:inline">{isPlaying ? 'Pause' : 'Auto'}</span>
                    </button>

                    {/* Playback Speed Selector (0.5x, 1x, 2x, 4x) */}
                    <div className="flex items-center rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[10px]" title="Vitesse de lecture automatique">
                      {[0.5, 1, 2, 4].map((spd) => (
                        <button
                          key={spd}
                          onClick={() => handleUpdatePlaybackSpeed(spd as 0.5 | 1 | 2 | 4)}
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

                    <button
                      onClick={() => {
                        setIsPlaying(false);
                        setCurrentPly((p) => Math.min((analysisResult?.moves.length || 1) - 1, p + 1));
                        setIsPreviewingAlternative(false);
                      }}
                      disabled={!analysisResult || currentPly >= analysisResult.moves.length - 1}
                      className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
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
                      className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
                      title="Fin de la partie (Flèche Bas)"
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Critical Moments (Moments Clés / Saut d'erreurs) */}
                  <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-lg border border-slate-800">
                    <button
                      onClick={() => {
                        if (prevErrorPly !== null) {
                          setIsPlaying(false);
                          setIsSandboxMode(false);
                          setSandboxHistory([]);
                          setSelectedSquare(null);
                          setCurrentPly(prevErrorPly);
                          setIsPreviewingAlternative(false);
                        }
                      }}
                      disabled={prevErrorPly === null}
                      className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 disabled:opacity-25 disabled:pointer-events-none transition-colors text-xs font-medium cursor-pointer"
                      title="Moment clé / Erreur précédente (Shift + Flèche Gauche)"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[11px]">Préc.</span>
                    </button>

                    {criticalPlies.length > 0 && (
                      <span
                        className="px-1 text-[10px] font-mono text-slate-400 font-semibold"
                        title="Moments critiques détectés"
                      >
                        {currentErrorIndex ? `${currentErrorIndex}/${criticalPlies.length}` : `${criticalPlies.length} err.`}
                      </span>
                    )}

                    <button
                      onClick={() => {
                        if (nextErrorPly !== null) {
                          setIsPlaying(false);
                          setIsSandboxMode(false);
                          setSandboxHistory([]);
                          setSelectedSquare(null);
                          setCurrentPly(nextErrorPly);
                          setIsPreviewingAlternative(false);
                        }
                      }}
                      disabled={nextErrorPly === null}
                      className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 disabled:opacity-25 disabled:pointer-events-none transition-colors text-xs font-medium cursor-pointer"
                      title="Moment clé / Erreur suivante (Shift + Flèche Droite)"
                    >
                      <span className="text-[11px]">Suiv.</span>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    </button>
                  </div>
                </div>

                {/* Bottom Row on Mobile / Right Group on Desktop: Move counter + Quick tools */}
                <div className="flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
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

                  {/* Sound Toggle & Flip Board */}
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
              </div>

              {/* Full-width Real-Time Evaluation Chart */}
              <EvaluationChart
                moves={analysisResult?.moves || []}
                currentPly={currentPly}
                onSelectPly={(ply) => {
                  setIsSandboxMode(false);
                  setSandboxHistory([]);
                  setSelectedSquare(null);
                  setCurrentPly(ply);
                  setIsPreviewingAlternative(false);
                }}
              />
            </div>

            {/* Right Column: Move Comparison + Pedagogical AI Coach + Move List */}
            <div
              className={`flex flex-col gap-5 ${
                boardSize === 'xl'
                  ? 'lg:col-span-4 xl:col-span-3'
                  : boardSize === 'large'
                  ? 'lg:col-span-4'
                  : 'lg:col-span-5'
              }`}
            >
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
                tacticalThreatsSuggestion={suggestionThreats}
                tacticalThreatsPlayed={playedThreats}
                threatsMode={threatsMode}
                onSelectThreatsMode={setThreatsMode}
                showThreats={showAnnotations}
                onToggleShowThreats={() => setShowAnnotations((a) => !a)}
              />

              {/* Notation and Critical Faults Table */}
              <MoveList
                moves={analysisResult?.moves || []}
                currentPly={currentPly}
                onSelectPly={(ply) => {
                  setIsSandboxMode(false);
                  setSandboxHistory([]);
                  setSelectedSquare(null);
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
