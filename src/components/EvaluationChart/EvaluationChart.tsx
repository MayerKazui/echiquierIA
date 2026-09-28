import React, { useMemo, useState } from 'react';
import { MoveAnalysis } from '../../types/chess';

interface EvaluationChartProps {
  moves: MoveAnalysis[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
}

export const EvaluationChart: React.FC<EvaluationChartProps> = ({
  moves,
  currentPly,
  onSelectPly,
}) => {
  const [hoveredPly, setHoveredPly] = useState<number | null>(null);

  // Normalize evaluations to a clamped range [-600, +600] centipawns for clean visualization
  const MAX_CP = 600;
  const width = 800;
  const height = 120;
  const paddingX = 16;
  const paddingY = 12;

  const points = useMemo(() => {
    if (moves.length === 0) return [];

    const effectiveWidth = width - paddingX * 2;
    const effectiveHeight = height - paddingY * 2;
    const zeroY = paddingY + effectiveHeight / 2;

    return moves.map((m, index) => {
      const x = paddingX + (index / Math.max(1, moves.length - 1)) * effectiveWidth;
      const clampedEval = Math.max(-MAX_CP, Math.min(MAX_CP, m.evalAfter));
      // eval > 0 is White advantage (y decreases towards top)
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

  // Construct SVG paths for area above zero (White) and area below zero (Black)
  const { pathD, whiteAreaD, blackAreaD, zeroY } = useMemo(() => {
    if (points.length === 0) {
      return { pathD: '', whiteAreaD: '', blackAreaD: '', zeroY: height / 2 };
    }

    const effectiveHeight = height - paddingY * 2;
    const zeroY = paddingY + effectiveHeight / 2;

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${points[i].x} ${points[i].y}`;
    }

    // White advantage area (between curve and zero line when curve < zeroY)
    const whiteAreaD = `${pathD} L ${points[points.length - 1].x} ${zeroY} L ${points[0].x} ${zeroY} Z`;

    return { pathD, whiteAreaD, blackAreaD: whiteAreaD, zeroY };
  }, [points]);

  if (moves.length === 0) {
    return (
      <div className="h-28 w-full flex items-center justify-center text-slate-500 text-xs bg-slate-900/40 rounded-xl border border-slate-800">
        Chargement de l'analyse Stockfish...
      </div>
    );
  }

  const activePoint = points.find((p) => p.ply === (hoveredPly !== null ? hoveredPly : currentPly));

  const formatEval = (cp: number, mate: number | null) => {
    if (mate !== null) return `M${Math.abs(mate)} (${mate > 0 ? 'Blancs' : 'Noirs'})`;
    const val = (cp / 100).toFixed(1);
    return cp > 0 ? `+${val}` : val;
  };

  return (
    <div className="w-full bg-slate-900/70 border border-slate-800/80 rounded-xl p-3 shadow-lg flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-200">Graphique d'évaluation</span>
          <span className="text-slate-400">
            {activePoint
              ? `${activePoint.moveNumber}${activePoint.color === 'w' ? '.' : '...'} ${activePoint.san} · Score : ${formatEval(activePoint.evalAfter, activePoint.mateAfter)}`
              : 'Cliquez ou survolez un coup'}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-slate-400 select-none">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            Gaffe
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            Erreur
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
            Imprécision
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            Meilleur
          </span>
        </div>
      </div>

      <div className="relative w-full h-28 overflow-hidden rounded-lg bg-slate-950/80 border border-slate-800/60 select-none">
        <svg
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

          {/* Grid lines */}
          <line
            x1="0"
            y1={zeroY}
            x2={width}
            y2={zeroY}
            stroke="#475569"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
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
          <path
            d={whiteAreaD}
            fill="url(#whiteAdvantageGrad)"
            clipPath="url(#aboveZeroClip)"
          />

          {/* Area fill for Black advantage */}
          <path
            d={blackAreaD}
            fill="url(#blackAdvantageGrad)"
            clipPath="url(#belowZeroClip)"
          />

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
          {points.map((p) => {
            const isBlunder = p.classification === 'blunder' || p.classification === 'missedWin';
            const isMistake = p.classification === 'mistake';
            const isInaccuracy = p.classification === 'inaccuracy';
            const isBrilliant = p.classification === 'brilliant' || p.classification === 'best';

            let color = '';
            let radius = 2.5;

            if (isBlunder) {
              color = '#f43f5e'; // rose-500
              radius = 4.5;
            } else if (isMistake) {
              color = '#f97316'; // orange-500
              radius = 3.5;
            } else if (isInaccuracy) {
              color = '#eab308'; // yellow-500
              radius = 3;
            } else if (isBrilliant) {
              color = '#10b981'; // emerald-500
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

          {/* Active / Current Ply vertical cursor */}
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
                cy={activePoint.y}
                r="5.5"
                fill="#38bdf8"
                stroke="#0f172a"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Invisible click targets for smooth scrubbing across the entire chart */}
          {points.map((p, idx) => {
            const nextX = points[idx + 1] ? points[idx + 1].x : width;
            const prevX = points[idx - 1] ? points[idx - 1].x : 0;
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
    </div>
  );
};
