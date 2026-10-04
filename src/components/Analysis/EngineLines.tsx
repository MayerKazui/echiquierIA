import React, { useMemo } from 'react';
import { Pause, Play } from 'lucide-react';
import type { LiveStatus } from '../../hooks/useLiveAnalysis';
import type { LiveAnalysis } from '../../services/analysisEngine';
import { LINE_COLORS, describeScore, formatScore, lineMoves, type AnalysisLine } from '../../utils/positionAnalysis';
import { SECONDARY } from '../Openings/shared';

/** Moves of a line shown; the engine's lines run much longer than anyone reads. */
const SHOWN_MOVES = 10;
export const LINE_COUNTS = [1, 2, 3, 4, 5] as const;

interface EngineLinesProps {
  analysis: LiveAnalysis | null;
  /** The position the lines are for. */
  fen: string;
  status: LiveStatus;
  /** How many lines are searched (and shown). */
  lineCount: number;
  onLineCountChange: (count: number) => void;
  isRunning: boolean;
  onToggleRunning: () => void;
  onRetry: () => void;
  /** Plays the first moves of a line on the board (up to and including the one clicked). */
  onPlayLine: (uciMoves: string[]) => void;
}

const STATUS_TEXT: Record<LiveStatus, string> = {
  idle: 'En pause.',
  searching: 'Analyse en cours…',
  done: 'Analyse terminée.',
  unavailable: '',
};

const EngineLine: React.FC<{ fen: string; line: AnalysisLine; onPlay: (uciMoves: string[]) => void }> = ({
  fen,
  line,
  onPlay,
}) => {
  const moves = useMemo(() => lineMoves(fen, line.pv, SHOWN_MOVES), [fen, line.pv]);
  const color = LINE_COLORS[line.rank - 1] ?? LINE_COLORS[0];
  const favorsBlack = line.mate !== null ? line.mate < 0 : line.cp < 0;
  return (
    <li className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2">
      <span className="flex flex-col items-center gap-1 shrink-0 w-12">
        <span aria-hidden="true" className="w-3 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span
          aria-hidden="true"
          className={`font-mono tabular-nums text-xs font-bold rounded px-1.5 py-0.5 ${
            favorsBlack ? 'bg-slate-900 text-slate-100 border border-slate-700' : 'bg-slate-100 text-slate-900'
          }`}
        >
          {formatScore(line.cp, line.mate)}
        </span>
        <span className="sr-only">
          Ligne {line.rank}, {describeScore(line.cp, line.mate)}, profondeur {line.depth}.
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5 min-w-0 text-xs font-mono text-slate-200">
        {moves.map((move, index) => (
          <button
            key={`${index}-${move.uci}`}
            type="button"
            onClick={() => onPlay(moves.slice(0, index + 1).map((m) => m.uci))}
            aria-label={`Jouer la ligne jusqu’à ${move.label}`}
            className={`rounded px-0.5 py-0.5 cursor-pointer hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              index === 0 ? 'font-bold text-slate-50' : ''
            }`}
          >
            {index === 0 || move.color === 'w' ? move.label : move.san}
          </button>
        ))}
        {line.pv.length > SHOWN_MOVES && <span aria-hidden="true">…</span>}
      </span>
    </li>
  );
};

/** The engine's best lines for the position, as they come, with what controls the search. */
export const EngineLines: React.FC<EngineLinesProps> = ({
  analysis,
  fen,
  status,
  lineCount,
  onLineCountChange,
  isRunning,
  onToggleRunning,
  onRetry,
  onPlayLine,
}) => {
  const lines = (analysis?.lines ?? []).slice(0, lineCount);
  const speed = analysis?.nps ? `${Math.round(analysis.nps / 1000).toLocaleString('fr-FR')} kn/s` : null;

  return (
    <section aria-label="Analyse de Stockfish" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="font-semibold text-slate-200">Stockfish 19</span>
          {analysis && analysis.depth > 0 && (
            <span className="tabular-nums">
              profondeur {analysis.depth}
              {speed && ` · ${speed}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-300">
            Lignes
            <select
              value={lineCount}
              onChange={(e) => onLineCountChange(Number(e.target.value))}
              className="rounded-md bg-slate-900 border border-slate-700 px-1.5 py-1 text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {LINE_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={onToggleRunning} className={SECONDARY}>
            {isRunning ? (
              <Pause className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {isRunning ? 'Pause' : 'Reprendre'}
          </button>
        </div>
      </div>

      {/* Only the state of the search is announced: the lines change several times a second */}
      <p role="status" className="text-[11px] text-slate-400 min-h-4">
        {STATUS_TEXT[status]}
      </p>

      {status === 'unavailable' && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 flex flex-col gap-2"
        >
          <p>Le moteur n’est pas disponible. Vérifiez que votre navigateur le permet, puis réessayez.</p>
          <div>
            <button type="button" onClick={onRetry} className={SECONDARY}>
              Réessayer
            </button>
          </div>
        </div>
      )}

      {lines.length > 0 ? (
        <ol aria-label="Meilleures lignes" className="flex flex-col gap-2">
          {lines.map((line) => (
            <EngineLine key={line.rank} fen={fen} line={line} onPlay={onPlayLine} />
          ))}
        </ol>
      ) : (
        status === 'searching' && <p className="text-xs text-slate-400">Le moteur cherche…</p>
      )}
    </section>
  );
};
