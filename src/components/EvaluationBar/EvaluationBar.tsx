import React from 'react';

interface EvaluationBarProps {
  evalCp: number; // centipawns from White's perspective (+ White, - Black)
  mate: number | null; // mate in N moves (+ White wins, - Black wins)
  isFlipped?: boolean; // if true, Black is at the bottom
}

export const EvaluationBar: React.FC<EvaluationBarProps> = ({
  evalCp,
  mate,
  isFlipped = false,
}) => {
  // Convert evaluation into percentage height for White (0% = Black winning, 100% = White winning, 50% = Equal)
  let whitePercent = 50;

  if (mate !== null) {
    whitePercent = mate > 0 ? 100 : 0;
  } else {
    // Sigmoid curve mapping -1000cp (-10) to +1000cp (+10) into 5% to 95%
    // 0cp = 50%
    const clampedCp = Math.max(-1000, Math.min(1000, evalCp));
    // Standard logistic curve
    whitePercent = 50 + 50 * (2 / (1 + Math.exp(-0.004 * clampedCp)) - 1);
  }

  // Display label
  let label = '0.0';
  if (mate !== null) {
    label = `M${Math.abs(mate)}`;
  } else {
    const pawns = Math.abs(evalCp) / 100;
    const formatted = pawns >= 10 ? pawns.toFixed(0) : pawns.toFixed(1);
    if (evalCp > 0) label = `+${formatted}`;
    else if (evalCp < 0) label = `-${formatted}`;
    else label = '0.0';
  }

  const isWhiteWinning = (mate !== null && mate > 0) || evalCp > 0;
  const isBlackWinning = (mate !== null && mate < 0) || evalCp < 0;

  return (
    <div
      className="relative w-5 sm:w-7 md:w-8 shrink-0 self-stretch min-h-[220px] sm:min-h-[320px] md:min-h-[380px] bg-slate-900 rounded-lg overflow-hidden border border-slate-700/60 shadow-inner flex flex-col justify-between select-none"
      title={`Évaluation : ${label} (${whitePercent.toFixed(1)}% chances de gain pour les Blancs)`}
    >
      {/* Top section: Black */}
      <div
        className="w-full bg-slate-900 transition-all duration-300 ease-out flex items-start justify-center pt-1.5 sm:pt-2"
        style={{
          height: isFlipped ? `${whitePercent}%` : `${100 - whitePercent}%`,
        }}
      >
        {!isFlipped && isBlackWinning && (
          <span className="text-[9px] sm:text-[11px] font-mono font-bold text-slate-200 tracking-tight px-0.5">
            {label}
          </span>
        )}
      </div>

      {/* Middle indicator zero line */}
      <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-amber-500/40 z-10 pointer-events-none" />

      {/* Bottom section: White */}
      <div
        className="w-full bg-white transition-all duration-300 ease-out flex items-end justify-center pb-1.5 sm:pt-2 shadow-sm"
        style={{
          height: isFlipped ? `${100 - whitePercent}%` : `${whitePercent}%`,
        }}
      >
        {!isFlipped && isWhiteWinning && (
          <span className="text-[9px] sm:text-[11px] font-mono font-bold text-slate-900 tracking-tight px-0.5">
            {label}
          </span>
        )}
        {!isFlipped && !isWhiteWinning && !isBlackWinning && (
          <span className="text-[9px] sm:text-[11px] font-mono font-bold text-slate-600 tracking-tight px-0.5">
            0.0
          </span>
        )}
      </div>
    </div>
  );
};
