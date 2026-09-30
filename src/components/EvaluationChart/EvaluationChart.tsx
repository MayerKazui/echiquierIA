import React, { useMemo, useState } from 'react';
import { Activity, TrendingUp, Zap } from 'lucide-react';
import { MoveAnalysis } from '../../types/chess';

export type ChartMode = 'eval' | 'momentum' | 'accuracy';

interface EvaluationChartProps {
  moves: MoveAnalysis[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
}

export const EvaluationChart: React.FC<EvaluationChartProps> = ({ moves, currentPly, onSelectPly }) => {
  const [chartMode, setChartMode] = useState<ChartMode>('eval');
  const [hoveredPly, setHoveredPly] = useState<number | null>(null);

  const MAX_CP = 600;
  const width = 800;
  const height = 124;
  const paddingX = 16;
  const paddingY = 12;

  // 1. Classical Evaluation Points
  const evalPoints = useMemo(() => {
    if (moves.length === 0) return [];

    const effectiveWidth = width - paddingX * 2;
    const effectiveHeight = height - paddingY * 2;
    const zeroY = paddingY + effectiveHeight / 2;

    return moves.map((m, index) => {
      const x = paddingX + (index / Math.max(1, moves.length - 1)) * effectiveWidth;
      const clampedEval = Math.max(-MAX_CP, Math.min(MAX_CP, m.evalAfter));
      const y = zeroY - (clampedEval / MAX_CP) * (effectiveHeight / 2);

      return {
        x,
        y,
        ply: m.ply,
        moveNumber: m.moveNumber,
        color: m.color,
        san: m.san,
        evalAfter: m.evalAfter,
        mateAfter: m.mateAfter,
        classification: m.classification,
        centipawnLoss: m.centipawnLoss,
      };
    });
  }, [moves]);

  // 2. Momentum & Swing Calculations (Initiative Shift)
  const { momentumBars, turningPoints } = useMemo(() => {
    if (moves.length === 0) {
      return { momentumBars: [], turningPoints: [] };
    }

    const effectiveWidth = width - paddingX * 2;
    const effectiveHeight = height - paddingY * 2;
    const zeroY = paddingY + effectiveHeight / 2;

    let peakSwing = 150;
    const swings = moves.map((m, index) => {
      const prevEval = index > 0 ? moves[index - 1].evalAfter : 0;
      // White perspective swing: positive if White gained ground, negative if Black gained ground
      const swing = m.evalAfter - prevEval;
      if (Math.abs(swing) > peakSwing) {
        peakSwing = Math.abs(swing);
      }
      return { m, swing, index };
    });

    const clampSwing = Math.min(600, Math.max(250, peakSwing));

    const tPoints: Array<{
      ply: number;
      moveNumber: number;
      color: string;
      san: string;
      swing: number;
      x: number;
      y: number;
    }> = [];

    const bars = swings.map(({ m, swing, index }) => {
      const x = paddingX + (index / Math.max(1, moves.length - 1)) * effectiveWidth;
      const clamped = Math.max(-clampSwing, Math.min(clampSwing, swing));
      // Swing > 0 is White advantage (drawn upwards), swing < 0 is Black advantage (drawn downwards)
      const barHeight = (Math.abs(clamped) / clampSwing) * (effectiveHeight / 2);
      const y = swing >= 0 ? zeroY - barHeight : zeroY;

      // Turning point condition: swing >= 180 centipawns or lead change
      const prevEval = index > 0 ? moves[index - 1].evalAfter : 0;
      const isLeadReversal = (prevEval > 70 && m.evalAfter < -70) || (prevEval < -70 && m.evalAfter > 70);
      const isMajorSwing = Math.abs(swing) >= 180 || isLeadReversal;

      if (isMajorSwing) {
        tPoints.push({
          ply: m.ply,
          moveNumber: m.moveNumber,
          color: m.color,
          san: m.san,
          swing,
          x,
          y: swing >= 0 ? y : y + barHeight,
        });
      }

      return {
        x,
        y,
        width: Math.max(2.5, effectiveWidth / moves.length - 1.5),
        barHeight: Math.max(2, barHeight),
        swing,
        ply: m.ply,
        moveNumber: m.moveNumber,
        color: m.color,
        san: m.san,
        isMajorSwing,
      };
    });

    return { momentumBars: bars, turningPoints: tPoints };
  }, [moves]);

  // 3. Cumulative Running Accuracy Points
  const accuracyPoints = useMemo(() => {
    if (moves.length === 0) return { whitePoints: [], blackPoints: [], pathWhite: '', pathBlack: '' };

    const effectiveWidth = width - paddingX * 2;
    const effectiveHeight = height - paddingY * 2;

    let whiteLossSum = 0;
    let whiteMoveCount = 0;
    let blackLossSum = 0;
    let blackMoveCount = 0;

    const wPts: Array<{ x: number; y: number; acc: number; ply: number }> = [];
    const bPts: Array<{ x: number; y: number; acc: number; ply: number }> = [];

    // Map accuracy from [40% .. 100%] to Y-axis
    const accToY = (acc: number) => {
      const clamped = Math.max(40, Math.min(100, acc));
      const ratio = (clamped - 40) / 60; // 0 for 40%, 1 for 100%
      return paddingY + effectiveHeight - ratio * effectiveHeight;
    };

    moves.forEach((m, index) => {
      const x = paddingX + (index / Math.max(1, moves.length - 1)) * effectiveWidth;

      if (m.color === 'w') {
        whiteLossSum += m.centipawnLoss;
        whiteMoveCount++;
      } else {
        blackLossSum += m.centipawnLoss;
        blackMoveCount++;
      }

      const avgLossW = whiteMoveCount > 0 ? whiteLossSum / whiteMoveCount : 0;
      const accW = Math.min(99.4, Math.max(30, Math.round(100 * Math.exp(-0.0038 * avgLossW) * 10) / 10));

      const avgLossB = blackMoveCount > 0 ? blackLossSum / blackMoveCount : 0;
      const accB = Math.min(99.4, Math.max(30, Math.round(100 * Math.exp(-0.0038 * avgLossB) * 10) / 10));

      wPts.push({ x, y: accToY(accW), acc: accW, ply: m.ply });
      bPts.push({ x, y: accToY(accB), acc: accB, ply: m.ply });
    });

    let pW = `M ${wPts[0].x} ${wPts[0].y}`;
    for (let i = 1; i < wPts.length; i++) pW += ` L ${wPts[i].x} ${wPts[i].y}`;

    let pB = `M ${bPts[0].x} ${bPts[0].y}`;
    for (let i = 1; i < bPts.length; i++) pB += ` L ${bPts[i].x} ${bPts[i].y}`;

    return {
      whitePoints: wPts,
      blackPoints: bPts,
      pathWhite: pW,
      pathBlack: pB,
    };
  }, [moves]);

  // Construct SVG paths for area above zero (White) and area below zero (Black)
  const { pathD, whiteAreaD, blackAreaD, zeroY } = useMemo(() => {
    if (evalPoints.length === 0) {
      return { pathD: '', whiteAreaD: '', blackAreaD: '', zeroY: height / 2 };
    }

    const effectiveHeight = height - paddingY * 2;
    const zY = paddingY + effectiveHeight / 2;

    let pD = `M ${evalPoints[0].x} ${evalPoints[0].y}`;
    for (let i = 1; i < evalPoints.length; i++) {
      pD += ` L ${evalPoints[i].x} ${evalPoints[i].y}`;
    }

    const whiteArea = `${pD} L ${evalPoints[evalPoints.length - 1].x} ${zY} L ${evalPoints[0].x} ${zY} Z`;

    return { pathD: pD, whiteAreaD: whiteArea, blackAreaD: whiteArea, zeroY: zY };
  }, [evalPoints]);

  if (moves.length === 0) {
    return (
      <div className="h-28 w-full flex items-center justify-center text-slate-400 text-xs bg-slate-900/40 rounded-xl border border-slate-800">
        Chargement de l'analyse Stockfish...
      </div>
    );
  }

  const activeIdx = hoveredPly !== null ? hoveredPly : currentPly;
  const activePoint = evalPoints.find((p) => p.ply === activeIdx);
  const activeMomentum = momentumBars.find((b) => b.ply === activeIdx);
  const activeAccW = accuracyPoints.whitePoints.find((p) => p.ply === activeIdx);
  const activeAccB = accuracyPoints.blackPoints.find((p) => p.ply === activeIdx);

  const formatEval = (cp: number, mate: number | null) => {
    if (mate !== null) return `M${Math.abs(mate)} (${mate > 0 ? 'Blancs' : 'Noirs'})`;
    const val = (cp / 100).toFixed(1);
    return cp > 0 ? `+${val}` : val;
  };

  // Text alternative of the graph: the same information is available move by move in the move list
  const chartDescription = {
    eval: `Courbe d'évaluation de la partie sur ${moves.length} demi-coups. Utilisez la liste des coups pour lire chaque évaluation.`,
    momentum: `Graphique des impulsions de la partie, ${turningPoints.length} tournant${turningPoints.length > 1 ? 's' : ''} clé${turningPoints.length > 1 ? 's' : ''}.`,
    accuracy: 'Précision cumulée des Blancs et des Noirs au fil de la partie.',
  }[chartMode];

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 shadow-lg flex flex-col gap-2.5">
      {/* Top Header: Tab Mode Switcher + Live Information + Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs px-1 gap-2.5">
        {/* Mode Switcher Tabs */}
        <div
          role="group"
          aria-label="Type de graphique"
          className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800/80 shrink-0"
        >
          <button
            onClick={() => setChartMode('eval')}
            aria-pressed={chartMode === 'eval'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
              chartMode === 'eval' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Courbe continue de l'évaluation Stockfish"
          >
            <Activity className="w-3 h-3" />
            <span>Évaluation</span>
          </button>

          <button
            onClick={() => setChartMode('momentum')}
            aria-pressed={chartMode === 'momentum'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
              chartMode === 'momentum' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Impulsions et tournants majeurs du match"
          >
            <Zap className="w-3 h-3 text-amber-300" />
            <span>Momentum</span>
            {turningPoints.length > 0 && (
              <span className="px-1 py-0.2 rounded-full bg-amber-500/30 text-amber-200 text-[9px] font-bold">
                {turningPoints.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setChartMode('accuracy')}
            aria-pressed={chartMode === 'accuracy'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
              chartMode === 'accuracy' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Précision cumulative tour par tour des Blancs vs Noirs"
          >
            <TrendingUp className="w-3 h-3 text-emerald-300" />
            <span>Précision</span>
          </button>
        </div>

        {/* Dynamic Move Summary Indicator */}
        <div className="flex items-center gap-2 text-slate-300 font-mono text-[11px] truncate min-w-0">
          {activePoint && (
            <span className="text-slate-200 truncate">
              <strong>
                {activePoint.moveNumber}
                {activePoint.color === 'w' ? '.' : '...'} {activePoint.san}
              </strong>
              {chartMode === 'eval' && (
                <span className="text-indigo-300 ml-1.5 font-bold">
                  Score : {formatEval(activePoint.evalAfter, activePoint.mateAfter)}
                </span>
              )}
              {chartMode === 'momentum' && activeMomentum && (
                <span className={`ml-1.5 font-bold ${activeMomentum.swing >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                  {activeMomentum.swing >= 0
                    ? `+${(activeMomentum.swing / 100).toFixed(1)} Blancs`
                    : `${(activeMomentum.swing / 100).toFixed(1)} Noirs`}
                </span>
              )}
              {chartMode === 'accuracy' && activeAccW && activeAccB && (
                <span className="ml-1.5 text-slate-300">
                  <span className="text-indigo-400 font-bold">⚪ {activeAccW.acc}%</span> vs{' '}
                  <span className="text-emerald-400 font-bold">⚫ {activeAccB.acc}%</span>
                </span>
              )}
            </span>
          )}
        </div>

        {/* Mode Legend */}
        {chartMode === 'eval' && (
          <div className="flex items-center gap-2 sm:gap-2.5 text-[10px] sm:text-[11px] text-slate-400 select-none shrink-0 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              Gaffe
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              Erreur
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
              Imprécision
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Meilleur
            </span>
          </div>
        )}

        {chartMode === 'momentum' && (
          <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-slate-400 select-none shrink-0">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-blue-500 rounded-sm inline-block" />
              Gain Blancs
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-sm inline-block" />
              Gain Noirs
            </span>
            <span className="flex items-center gap-1 text-amber-300 font-bold">
              <span>⚡</span>
              Tournant majeur
            </span>
          </div>
        )}

        {chartMode === 'accuracy' && (
          <div className="flex items-center gap-2.5 text-[10px] sm:text-[11px] text-slate-400 select-none shrink-0">
            <span className="flex items-center gap-1">
              <span className="w-3 h-1 bg-indigo-400 rounded-full inline-block" />
              Blancs
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-1 bg-emerald-400 rounded-full inline-block" />
              Noirs
            </span>
          </div>
        )}
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full h-28 overflow-hidden rounded-lg bg-slate-950/80 border border-slate-800/60 select-none">
        <svg
          role="img"
          aria-label={chartDescription}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full cursor-pointer"
          preserveAspectRatio="none"
          onMouseLeave={() => setHoveredPly(null)}
        >
          <defs>
            <linearGradient id="whiteAdvantageGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="blackAdvantageGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#0f172a" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#1e293b" stopOpacity="0.1" />
            </linearGradient>
            <clipPath id="aboveZeroClip">
              <rect x="0" y="0" width={width} height={zeroY} />
            </clipPath>
            <clipPath id="belowZeroClip">
              <rect x="0" y={zeroY} width={width} height={height - zeroY} />
            </clipPath>
          </defs>

          {/* 1. VIEW: EVALUATION CONTINUOUS CURVE */}
          {chartMode === 'eval' && (
            <>
              {/* Zero line */}
              <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="#475569" strokeDasharray="3 3" strokeWidth="1" />
              <text x={8} y={zeroY - 4} fill="#64748b" fontSize="9" fontFamily="monospace">
                0.0
              </text>
              <text x={8} y={paddingY + 8} fill="#94a3b8" fontSize="9" fontFamily="monospace">
                +6.0 Blancs
              </text>
              <text x={8} y={height - paddingY} fill="#64748b" fontSize="9" fontFamily="monospace">
                -6.0 Noirs
              </text>

              {/* Area fill for White advantage */}
              <path d={whiteAreaD} fill="url(#whiteAdvantageGrad)" clipPath="url(#aboveZeroClip)" />

              {/* Area fill for Black advantage */}
              <path d={blackAreaD} fill="url(#blackAdvantageGrad)" clipPath="url(#belowZeroClip)" />

              {/* Main evaluation curve line */}
              <path
                d={pathD}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Critical Move Markers */}
              {evalPoints.map((p) => {
                const isBlunder = p.classification === 'blunder' || p.classification === 'missedWin';
                const isMistake = p.classification === 'mistake';
                const isInaccuracy = p.classification === 'inaccuracy';
                const isBrilliant = p.classification === 'brilliant' || p.classification === 'best';

                let color = '';
                let radius = 2.5;

                if (isBlunder) {
                  color = '#f43f5e';
                  radius = 4.5;
                } else if (isMistake) {
                  color = '#f97316';
                  radius = 3.5;
                } else if (isInaccuracy) {
                  color = '#eab308';
                  radius = 3;
                } else if (isBrilliant) {
                  color = '#10b981';
                  radius = 2.5;
                }

                if (!color) return null;

                return (
                  <circle
                    key={p.ply}
                    cx={p.x}
                    cy={p.y}
                    r={radius}
                    fill={color}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                    className="transition-transform hover:scale-150 cursor-pointer"
                    onClick={() => onSelectPly(p.ply)}
                    onMouseEnter={() => setHoveredPly(p.ply)}
                  />
                );
              })}
            </>
          )}

          {/* 2. VIEW: MOMENTUM & SWINGS */}
          {chartMode === 'momentum' && (
            <>
              {/* Zero line */}
              <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="#475569" strokeDasharray="2 2" strokeWidth="1" />
              <text x={8} y={zeroY - 4} fill="#64748b" fontSize="9" fontFamily="monospace">
                0.0
              </text>
              <text x={8} y={paddingY + 8} fill="#60a5fa" fontSize="9" fontFamily="monospace">
                Gain Blancs
              </text>
              <text x={8} y={height - paddingY} fill="#f43f5e" fontSize="9" fontFamily="monospace">
                Gain Noirs
              </text>

              {/* Momentum Impulse Bars */}
              {momentumBars.map((b) => {
                const isWhite = b.swing >= 0;
                const fillColor = isWhite
                  ? b.isMajorSwing
                    ? '#3b82f6'
                    : '#60a5fa'
                  : b.isMajorSwing
                    ? '#e11d48'
                    : '#f43f5e';

                return (
                  <rect
                    key={`bar-${b.ply}`}
                    x={b.x - b.width / 2}
                    y={b.y}
                    width={b.width}
                    height={b.barHeight}
                    fill={fillColor}
                    opacity={b.isMajorSwing ? 0.95 : 0.65}
                    rx="1"
                    className="transition-all hover:opacity-100"
                    onClick={() => onSelectPly(b.ply)}
                    onMouseEnter={() => setHoveredPly(b.ply)}
                  />
                );
              })}

              {/* Major Turning Points Star / Lightning Markers */}
              {turningPoints.map((tp) => (
                <g key={`tp-${tp.ply}`} onClick={() => onSelectPly(tp.ply)} className="cursor-pointer">
                  <circle
                    cx={tp.x}
                    cy={tp.y}
                    r="5"
                    fill="#f59e0b"
                    stroke="#0f172a"
                    strokeWidth="1.5"
                    className="animate-pulse"
                  />
                  <text x={tp.x - 3} y={tp.y + 3} fill="#ffffff" fontSize="7" fontWeight="bold" pointerEvents="none">
                    ⚡
                  </text>
                </g>
              ))}
            </>
          )}

          {/* 3. VIEW: CUMULATIVE RUNNING ACCURACY */}
          {chartMode === 'accuracy' && (
            <>
              {/* Reference Grid lines: 100%, 80%, 60% */}
              <line
                x1="0"
                y1={paddingY}
                x2={width}
                y2={paddingY}
                stroke="#334155"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text x={8} y={paddingY + 9} fill="#94a3b8" fontSize="9" fontFamily="monospace">
                100%
              </text>

              <line
                x1="0"
                y1={paddingY + (height - paddingY * 2) / 3}
                x2={width}
                y2={paddingY + (height - paddingY * 2) / 3}
                stroke="#334155"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={8}
                y={paddingY + (height - paddingY * 2) / 3 - 3}
                fill="#64748b"
                fontSize="9"
                fontFamily="monospace"
              >
                80%
              </text>

              <line
                x1="0"
                y1={paddingY + ((height - paddingY * 2) * 2) / 3}
                x2={width}
                y2={paddingY + ((height - paddingY * 2) * 2) / 3}
                stroke="#334155"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={8}
                y={paddingY + ((height - paddingY * 2) * 2) / 3 - 3}
                fill="#64748b"
                fontSize="9"
                fontFamily="monospace"
              >
                60%
              </text>

              {/* White Running Accuracy Line */}
              <path
                d={accuracyPoints.pathWhite}
                fill="none"
                stroke="#818cf8"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Black Running Accuracy Line */}
              <path
                d={accuracyPoints.pathBlack}
                fill="none"
                stroke="#34d399"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Active / Current Ply vertical cursor across all modes */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1="0"
                x2={activePoint.x}
                y2={height}
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <circle
                cx={activePoint.x}
                cy={
                  chartMode === 'accuracy'
                    ? activeAccW?.y || height / 2
                    : chartMode === 'momentum'
                      ? zeroY
                      : activePoint.y
                }
                r="5"
                fill="#38bdf8"
                stroke="#0f172a"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Invisible click targets for smooth scrubbing across the entire chart */}
          {evalPoints.map((p, idx) => {
            const nextX = evalPoints[idx + 1] ? evalPoints[idx + 1].x : width;
            const prevX = evalPoints[idx - 1] ? evalPoints[idx - 1].x : 0;
            const bandWidth = (nextX - prevX) / 2;

            return (
              <rect
                key={`hit-${p.ply}`}
                x={p.x - bandWidth / 2}
                y="0"
                width={Math.max(4, bandWidth)}
                height={height}
                fill="transparent"
                onClick={() => onSelectPly(p.ply)}
                onMouseEnter={() => setHoveredPly(p.ply)}
              />
            );
          })}
        </svg>
      </div>

      {/* Quick Turning Points Bar (when in Momentum mode) */}
      {chartMode === 'momentum' && turningPoints.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pt-1">
          <span className="text-amber-400 font-bold flex items-center gap-1 shrink-0">
            <Zap className="w-3.5 h-3.5" />
            <span>Tournants clés :</span>
          </span>
          {turningPoints.map((tp) => (
            <button
              key={`tp-btn-${tp.ply}`}
              onClick={() => onSelectPly(tp.ply)}
              aria-current={tp.ply === currentPly ? 'true' : undefined}
              className={`shrink-0 px-2 py-0.5 rounded-md border text-[11px] font-mono font-medium transition-all cursor-pointer ${
                tp.ply === currentPly
                  ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-sm'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800 hover:text-white'
              }`}
            >
              {tp.moveNumber}
              {tp.color === 'w' ? '.' : '...'} {tp.san}{' '}
              <span className={tp.swing >= 0 ? 'text-blue-400 font-bold' : 'text-rose-400 font-bold'}>
                ({tp.swing >= 0 ? `+${(tp.swing / 100).toFixed(1)}` : (tp.swing / 100).toFixed(1)})
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
