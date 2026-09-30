import React from 'react';

interface EvaluationBarProps {
  evalCp: number; // centipawns from White's perspective (+ White, - Black)
  mate: number | null; // mate in N moves (+ White wins, - Black wins)
  isFlipped?: boolean; // if true, Black is at the bottom (Black's perspective)
}

export const EvaluationBar: React.FC<EvaluationBarProps> = ({
  evalCp,
  mate,
  isFlipped = false,
}) => {
  // Convert evaluation into percentage height for White (0% = Black winning, 100% = White winning, 50% = Equal)
  let whitePercent: number;

  if (mate !== null) {
    whitePercent = mate > 0 ? 100 : 0;
  } else {
    // Sigmoid curve mapping -1000cp (-10) to +1000cp (+10) into 5% to 95%
    const clampedCp = Math.max(-1000, Math.min(1000, evalCp));
    whitePercent = 50 + 50 * (2 / (1 + Math.exp(-0.004 * clampedCp)) - 1);
  }

  // Display label
  let label: string;
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

  // Orientation logic:
  // When isFlipped is FALSE (White perspective):
  //   - Black pieces are at the TOP of the board => Top section is Black
  //   - White pieces are at the BOTTOM of the board => Bottom section is White
  //   - Top section height = (100 - whitePercent)% (Black's share)
  //   - Bottom section height = whitePercent% (White's share)
  //
  // When isFlipped is TRUE (Black perspective):
  //   - White pieces are at the TOP of the board => Top section is White
  //   - Black pieces are at the BOTTOM of the board => Bottom section is Black
  //   - Top section height = whitePercent% (White's share)
  //   - Bottom section height = (100 - whitePercent)% (Black's share)

  const topIsWhite = isFlipped;
  const topHeight = isFlipped ? whitePercent : 100 - whitePercent;
  const bottomHeight = isFlipped ? 100 - whitePercent : whitePercent;

  // Decide where the score label goes:
  // Show in whichever player's side is winning (or bottom if equal)
  const showLabelInTop =
    (topIsWhite && isWhiteWinning) || (!topIsWhite && isBlackWinning);
  const showLabelInBottom =
    (!topIsWhite && isWhiteWinning) ||
    (topIsWhite && isBlackWinning) ||
    (!isWhiteWinning && !isBlackWinning);

  return (
    <div
      className="relative w-5 sm:w-7 md:w-8 shrink-0 self-stretch min-h-[220px] sm:min-h-[320px] md:min-h-[380px] bg-slate-900 rounded-lg overflow-hidden border border-slate-700/60 shadow-inner flex flex-col justify-between select-none"
      title={`Évaluation : ${label} (${whitePercent.toFixed(1)}% pour les Blancs)`}
    >
      {/* Top section */}
      <div
        className={`w-full transition-all duration-300 ease-out flex items-start justify-center pt-1.5 sm:pt-2 ${
          topIsWhite ? 'bg-white' : 'bg-slate-900'
        }`}
        style={{ height: `${topHeight}%` }}
      >
        {showLabelInTop && (
          <span
            className={`text-[9px] sm:text-[11px] font-mono font-bold tracking-tight px-0.5 ${
              topIsWhite ? 'text-slate-900' : 'text-slate-200'
            }`}
          >
            {label}
          </span>
        )}
      </div>

      {/* Middle indicator zero line */}
      <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-amber-500/40 z-10 pointer-events-none" />

      {/* Bottom section */}
      <div
        className={`w-full transition-all duration-300 ease-out flex items-end justify-center pb-1.5 sm:pb-2 shadow-sm ${
          topIsWhite ? 'bg-slate-900' : 'bg-white'
        }`}
        style={{ height: `${bottomHeight}%` }}
      >
        {showLabelInBottom && (
          <span
            className={`text-[9px] sm:text-[11px] font-mono font-bold tracking-tight px-0.5 ${
              topIsWhite
                ? isBlackWinning
                  ? 'text-slate-200'
                  : 'text-slate-400'
                : isWhiteWinning
                ? 'text-slate-900'
                : 'text-slate-600'
            }`}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
};
