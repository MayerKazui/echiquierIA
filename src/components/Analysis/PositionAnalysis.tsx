import React, { useCallback, useMemo, useState } from 'react';
import { Check, Copy, FlipVertical2, Microscope, Pencil, ScanSearch, Undo2, X } from 'lucide-react';
import { useAnswerBoard, type Answer } from '../../hooks/useAnswerBoard';
import { useLiveAnalysis } from '../../hooks/useLiveAnalysis';
import { oneOf, usePersistentState } from '../../hooks/usePersistentState';
import type { BoardTheme } from '../../types/ui';
import { STANDARD_START_FEN } from '../../utils/playGame';
import { LINE_COLORS, arrowOf, lineMoves, type LineMove } from '../../utils/positionAnalysis';
import {
  PROBLEM_TEXT,
  STANDARD_POSITION,
  checkPosition,
  formatFen,
  parseFen,
  placePiece,
  positionEnd,
  withPiece,
  type EditorPosition,
} from '../../utils/positionEditor';
import { ChessBoard } from '../ChessBoard/ChessBoard';
import type { BoardShape } from '../ChessBoard/useBoardDrawing';
import { EvaluationBar } from '../EvaluationBar/EvaluationBar';
import { PRIMARY, SECONDARY } from '../Openings/shared';
import { EngineLines, LINE_COUNTS } from './EngineLines';
import { PositionEditor, type EditorTool } from './PositionEditor';

interface PositionAnalysisProps {
  /** The position to open on (a FEN): the player's board, say. Without it, the usual start. */
  start?: string;
  boardTheme?: BoardTheme;
  onClose: () => void;
}

type Mode = 'analyse' | 'edit';

const END_TEXT = {
  checkmate: (winner: 'w' | 'b') => `Échec et mat : les ${winner === 'w' ? 'Blancs' : 'Noirs'} ont gagné.`,
  stalemate: 'Pat : la partie est nulle.',
  material: 'Matériel insuffisant pour mater : la partie est nulle.',
};

/** "1.e4 e5 2.Cf3": the moves played on the board, numbered from the position they started from. */
const movesText = (moves: LineMove[]) =>
  moves.map((move, index) => (index === 0 || move.color === 'w' ? move.label : move.san)).join(' ');

/** The FEN of the position, to read, copy or replace by another one. */
const FenField: React.FC<{ fen: string; onLoad: (text: string) => string | null }> = ({ fen, onLoad }) => {
  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = () => {
    if (typed === null) return;
    const problem = onLoad(typed);
    setError(problem);
    if (!problem) setTyped(null);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fen);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard (insecure page, refused): the field is there to be selected
    }
  };

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="analysis-fen" className="text-xs font-semibold text-slate-200">
        Position (FEN)
      </label>
      <div className="flex gap-2">
        <input
          id="analysis-fen"
          type="text"
          value={typed ?? fen}
          onChange={(e) => {
            setTyped(e.target.value);
            setError(null);
          }}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby={error ? 'analysis-fen-error' : undefined}
          placeholder="Collez une FEN, par exemple celle d’une partie de l’adversaire"
          className="flex-1 min-w-0 rounded-md bg-slate-900 border border-slate-700 px-2 py-1.5 font-mono text-[11px] text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        />
        <button type="submit" disabled={typed === null || typed.trim() === fen} className={SECONDARY}>
          Charger
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={copied ? 'FEN copiée' : 'Copier la FEN'}
          title="Copier la FEN"
          className={SECONDARY}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
      {error && (
        <p id="analysis-fen-error" role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
    </form>
  );
};

/**
 * "Analyser une position": any position, on the board or set up with the editor or a FEN, with the engine's best
 * lines as it finds them. The board can be played to follow a line, and a click on a move of a line plays it.
 */
export const PositionAnalysis: React.FC<PositionAnalysisProps> = ({ start, boardTheme, onClose }) => {
  // The position the dialog opens on is read once
  const [opening] = useState(() => {
    const parsed = start ? parseFen(start) : null;
    const check = parsed ? checkPosition(parsed) : null;
    return { parsed, fen: check?.ok ? check.fen : null };
  });

  // A position that is given but is not playable (a king missing…) opens in the editor, to be fixed
  const [mode, setMode] = useState<Mode>(opening.parsed && !opening.fen ? 'edit' : 'analyse');
  const [base, setBase] = useState(opening.fen ?? STANDARD_START_FEN);
  /** The moves played on the board from `base`. */
  const [trail, setTrail] = useState<LineMove[]>([]);
  const [draft, setDraft] = useState<EditorPosition>(opening.parsed ?? STANDARD_POSITION);
  const [tool, setTool] = useState<EditorTool>({ type: 'p', color: 'w' });
  const [isFlipped, setIsFlipped] = useState(false);
  const [isRunning, setIsRunning] = useState(true);
  const [lineCount, setLineCount] = usePersistentState<number>(
    'chess_analysis_lines',
    3,
    (raw) => oneOf(LINE_COUNTS)(raw) as number | undefined
  );

  const fen = trail.length > 0 ? trail[trail.length - 1].fen : base;
  const end = useMemo(() => positionEnd(fen), [fen]);
  const draftFen = formatFen(draft);
  const draftCheck = useMemo(() => checkPosition(draft), [draft]);

  const live = useLiveAnalysis({
    fen: mode === 'analyse' && !end ? fen : null,
    lines: lineCount,
    isRunning,
  });
  const best = live.analysis?.lines[0];

  // --- Playing on the board
  const play = useCallback(
    (uciMoves: string[]) => {
      const moves = lineMoves(fen, uciMoves, uciMoves.length);
      if (moves.length > 0) setTrail((t) => [...t, ...moves]);
    },
    [fen]
  );
  const onAnswer = useCallback((answer: Answer) => play([answer.uci]), [play]);
  const answerBoard = useAnswerBoard(fen, mode === 'analyse' && !end, onAnswer);

  // --- Loading a position
  const loadFen = (text: string): string | null => {
    const parsed = parseFen(text);
    if (!parsed)
      return 'Cette position n’est pas lisible : une FEN donne les pièces rangée par rangée, de la huitième à la première.';
    if (mode === 'edit') {
      setDraft(parsed);
      return null;
    }
    const check = checkPosition(parsed);
    if (!check.ok) return PROBLEM_TEXT[check.problem];
    setBase(check.fen);
    setTrail([]);
    return null;
  };

  const startEditing = () => {
    const parsed = parseFen(fen);
    if (parsed) setDraft(parsed);
    setMode('edit');
  };
  const finishEditing = () => {
    if (!draftCheck.ok) return;
    setBase(draftCheck.fen);
    setTrail([]);
    setIsRunning(true);
    setMode('analyse');
  };

  const onEditSquare = (square: string) =>
    setDraft((position) => (tool === 'erase' ? withPiece(position, square, null) : placePiece(position, square, tool)));

  // --- What the board shows
  const shapes = useMemo<BoardShape[]>(() => {
    const result: BoardShape[] = [];
    for (const line of live.analysis?.lines.slice(0, lineCount) ?? []) {
      const arrow = arrowOf(line);
      if (arrow) result.push({ ...arrow, color: LINE_COLORS[line.rank - 1] ?? LINE_COLORS[0] });
    }
    return result;
  }, [live.analysis, lineCount]);
  const last = trail[trail.length - 1];

  const board =
    mode === 'edit' ? (
      <ChessBoard
        fen={draftFen}
        isFlipped={isFlipped}
        boardTheme={boardTheme}
        showArrows={false}
        showThreats={false}
        isDragDisabled
        onSquareClick={onEditSquare}
      />
    ) : (
      <div className="flex gap-2 items-stretch">
        <EvaluationBar evalCp={best?.cp ?? 0} mate={best?.mate ?? null} isFlipped={isFlipped} />
        <div className="flex-1 min-w-0 flex items-center">
          <ChessBoard
            fen={fen}
            isFlipped={isFlipped}
            boardTheme={boardTheme}
            lastMove={last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null}
            showArrows={false}
            showThreats={false}
            shapes={shapes}
            selectedSquare={answerBoard.selectedSquare}
            onSquareClick={answerBoard.handleSquareClick}
            onPieceMove={answerBoard.handlePieceMove}
            promotion={answerBoard.pendingPromotion}
            onPromote={answerBoard.choosePromotion}
            onCancelPromotion={answerBoard.cancelPromotion}
          />
        </div>
      </div>
    );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 w-full mx-auto max-w-[min(96vw,84rem)] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Microscope className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Analyser une position</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Les meilleures lignes de Stockfish en direct, sur n’importe quelle position : celle d’un adversaire, une
              FEN, ou une position que vous posez vous-même.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        role="region"
        aria-label="Contenu de l’analyse"
        tabIndex={0}
        className="overflow-y-auto min-h-0 pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
      >
        <div className="grid md:grid-cols-[var(--modal-board)_minmax(0,1fr)] gap-4 items-start">
          <div className="flex flex-col gap-2 w-full max-w-md mx-auto md:max-w-none md:mx-0">
            {board}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setIsFlipped((f) => !f)} className={SECONDARY}>
                <FlipVertical2 className="w-3.5 h-3.5" aria-hidden="true" />
                Retourner
              </button>
              {mode === 'analyse' && (
                <>
                  <button
                    type="button"
                    onClick={() => setTrail((t) => t.slice(0, -1))}
                    disabled={trail.length === 0}
                    className={SECONDARY}
                  >
                    <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Annuler le coup
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrail([])}
                    disabled={trail.length === 0}
                    className={SECONDARY}
                  >
                    Revenir au début
                  </button>
                </>
              )}
            </div>

            {mode === 'analyse' && trail.length > 0 && (
              <p className="text-xs text-slate-300 break-words">
                <span className="text-slate-400">Coups joués :</span>{' '}
                <span className="font-mono">{movesText(trail)}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4 min-w-0">
            <div
              role="group"
              aria-label="Mode"
              className="grid grid-cols-2 gap-1 rounded-xl bg-slate-950 border border-slate-800 p-1"
            >
              <button
                type="button"
                aria-pressed={mode === 'analyse'}
                onClick={() => (mode === 'analyse' ? undefined : finishEditing())}
                disabled={mode === 'edit' && !draftCheck.ok}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  mode === 'analyse' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <ScanSearch className="w-3.5 h-3.5" aria-hidden="true" />
                Analyse
              </button>
              <button
                type="button"
                aria-pressed={mode === 'edit'}
                onClick={() => (mode === 'edit' ? undefined : startEditing())}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  mode === 'edit' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                Éditer la position
              </button>
            </div>

            {mode === 'analyse' ? (
              end ? (
                <p
                  role="status"
                  className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-100"
                >
                  {end.kind === 'checkmate' ? END_TEXT.checkmate(end.winner) : END_TEXT[end.reason]} Il n’y a rien à
                  analyser ici ; annulez le dernier coup ou changez de position.
                </p>
              ) : (
                <EngineLines
                  analysis={live.analysis}
                  fen={fen}
                  status={live.status}
                  lineCount={lineCount}
                  onLineCountChange={setLineCount}
                  isRunning={isRunning}
                  onToggleRunning={() => setIsRunning((running) => !running)}
                  onRetry={live.retry}
                  onPlayLine={play}
                />
              )
            ) : (
              <>
                <PositionEditor position={draft} tool={tool} onToolChange={setTool} onChange={setDraft} />
                <div role="status" className="flex flex-col gap-2">
                  {draftCheck.ok ? (
                    <p className="text-xs text-emerald-300">La position est valide.</p>
                  ) : (
                    <p className="text-xs text-amber-300">{PROBLEM_TEXT[draftCheck.problem]}</p>
                  )}
                </div>
                <div>
                  <button type="button" onClick={finishEditing} disabled={!draftCheck.ok} className={PRIMARY}>
                    Analyser cette position
                  </button>
                </div>
              </>
            )}

            <FenField
              key={`${mode}:${mode === 'edit' ? draftFen : fen}`}
              fen={mode === 'edit' ? draftFen : fen}
              onLoad={loadFen}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
