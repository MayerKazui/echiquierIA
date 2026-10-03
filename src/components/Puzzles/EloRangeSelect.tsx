import React from 'react';
import { RANGE_FROM_VALUES, RANGE_TO_VALUES, TOP_END, normalizeRange, type EloRange } from '../../utils/puzzleRun';

interface EloRangeSelectProps {
  range: EloRange;
  onChange: (range: EloRange) => void;
  /** How many puzzles the range holds, told next to the selects. */
  total: number;
}

const SELECT =
  'rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

/** The two ends of a range of ratings, in bands of 200. */
export const EloRangeSelect: React.FC<EloRangeSelectProps> = ({ range, onChange, total }) => (
  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
    <label className="flex items-center gap-1.5">
      De
      <select
        aria-label="Elo minimum"
        value={range.from}
        onChange={(e) => onChange(normalizeRange({ from: Number(e.target.value), to: range.to }))}
        className={SELECT}
      >
        {RANGE_FROM_VALUES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
    <label className="flex items-center gap-1.5">
      à
      <select
        aria-label="Elo maximum (exclu)"
        value={range.to}
        onChange={(e) => onChange(normalizeRange({ from: range.from, to: Number(e.target.value) }))}
        className={SELECT}
      >
        {RANGE_TO_VALUES.map((value) => (
          <option key={value} value={value}>
            {value >= TOP_END ? 'et plus' : value}
          </option>
        ))}
      </select>
    </label>
    <span className="text-slate-400 tabular-nums">{total.toLocaleString('fr-FR')} puzzles</span>
  </div>
);
