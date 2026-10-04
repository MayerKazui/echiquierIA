import React, { useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, Flame, X } from 'lucide-react';
import { usePracticeCalendar } from '../../hooks/usePracticeCalendar';
import type { DueSummary, StockId } from '../../utils/dueReviews';
import { activeDaysIn, calendarWeeks, streakOf, type CalendarCell } from '../../utils/practiceDays';
import { describeDelay } from '../../utils/spacedRepetition';

interface ReviewTodayProps {
  summary: DueSummary | null;
  /** Opens one stock. */
  onReview: (stock: StockId) => void;
  /** Opens the first stock that has something due (the others follow, one at a time). */
  onReviewAll: () => void;
  /** Given in a window: the close button. */
  onClose?: () => void;
  /** A review of everything is going on: the button says "Continuer". */
  isChain?: boolean;
  /** The window shows the whole thing, the card of the start screen hides itself while there is nothing to say. */
  variant?: 'card' | 'dialog';
}

const WEEKS = 16;
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const LEVEL_CLASS = [
  'bg-slate-800/70',
  'bg-emerald-900',
  'bg-emerald-700',
  'bg-emerald-500',
  'bg-emerald-300',
] as const;

const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const MONTH_FORMAT = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

const parseDay = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

const PRIMARY =
  'px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';
const SECONDARY =
  'px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed';

function describeCell(cell: CalendarCell): string {
  const date = DAY_FORMAT.format(parseDay(cell.day));
  if (cell.isFuture) return date;
  return `${date} : ${cell.count > 0 ? plural(cell.count, 'révision', 'révisions') : 'rien'}`;
}

/** The weeks of the calendar, a column each, with the month written over the first week that starts it. */
function Calendar({ columns }: { columns: CalendarCell[][] }) {
  const labels = columns.map((column, index) => {
    const month = parseDay(column[0].day).getMonth();
    const before = index > 0 ? parseDay(columns[index - 1][0].day).getMonth() : -1;
    return month !== before ? MONTH_FORMAT.format(parseDay(column[0].day)) : '';
  });
  return (
    <div className="flex gap-1.5 overflow-x-auto" aria-hidden="true">
      <div className="flex flex-col gap-[3px] pt-4 text-[9px] leading-[14px] text-slate-400 shrink-0">
        {WEEKDAYS.map((label, index) => (
          <span key={index} className="h-[14px]">
            {index % 2 === 0 ? label : ''}
          </span>
        ))}
      </div>
      <div className="flex gap-[3px]">
        {columns.map((column, index) => (
          <div key={column[0].day} className="flex flex-col gap-[3px]">
            <span className="h-3 text-[9px] leading-3 text-slate-400 whitespace-nowrap overflow-visible">
              {labels[index]}
            </span>
            {column.map((cell) => (
              <span
                key={cell.day}
                title={describeCell(cell)}
                className={`w-[14px] h-[14px] rounded-[3px] ${cell.isFuture ? 'bg-transparent' : LEVEL_CLASS[cell.level]} ${
                  cell.isToday ? 'ring-1 ring-indigo-300' : ''
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "À réviser aujourd'hui": one number for everything that comes back today (the errors, the missed puzzles, the
 * lines of the openings, the endgames and the Woodpecker cycle left half done), a button for each stock and one for
 * all, then the streak of days practised in a row and the calendar of the last weeks.
 */
export const ReviewToday: React.FC<ReviewTodayProps> = ({
  summary,
  onReview,
  onReviewAll,
  onClose,
  isChain = false,
  variant = 'dialog',
}) => {
  const { days } = usePracticeCalendar();
  // The moment the counts were worked out: the calendar and the delays are seen from it
  const [openedAt] = useState(() => Date.now());
  const now = summary?.now ?? openedAt;
  const streak = useMemo(() => (days ? streakOf(days, now) : null), [days, now]);
  const columns = useMemo(() => (days ? calendarWeeks(days, now, WEEKS) : null), [days, now]);
  const activeDays = columns ? activeDaysIn(columns) : 0;

  const hasAnything = (summary?.hasAnything ?? false) || (streak?.longest ?? 0) > 0;
  // On the start screen the card only shows up once there is something to review or to be proud of
  if (variant === 'card' && (!summary || !hasAnything)) return null;

  const total = summary?.total ?? 0;
  const sentence = !summary
    ? 'Chargement…'
    : total > 0
      ? `${plural(total, 'chose à réviser', 'choses à réviser')}`
      : 'Tout est à jour';
  const nextDelay = summary?.nextDueAt != null ? describeDelay(summary.nextDueAt, now) : null;

  return (
    <section
      aria-label="À réviser aujourd'hui"
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 ${
        variant === 'dialog' ? 'shadow-2xl max-w-2xl w-full mx-auto max-h-[calc(100dvh-2rem)] overflow-y-auto' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <CalendarCheck className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">À réviser aujourd&apos;hui</h2>
            <p role="status" className="text-xs text-slate-400 mt-0.5">
              {sentence}
              {total === 0 && summary && nextDelay ? ` · la prochaine révision revient ${nextDelay}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span
              className="min-w-8 text-center px-2 py-1 rounded-full bg-indigo-500 text-white text-sm font-bold"
              aria-hidden="true"
            >
              {total}
            </span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {summary && summary.hasAnything && (
        <>
          {total > 0 && (
            <button type="button" onClick={onReviewAll} className={`${PRIMARY} self-start`}>
              {isChain ? 'Continuer à réviser' : 'Tout réviser'}
            </button>
          )}
          {total === 0 && (
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Rien à réviser pour l&apos;instant.
            </p>
          )}
          <ul className="flex flex-col divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/50">
            {summary.stocks.map((stock) => (
              <li key={stock.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100">{stock.label}</p>
                  <p className="text-xs text-slate-400">
                    {stock.detail}
                    {stock.due === 0 && stock.nextDueAt !== null
                      ? ` · le prochain ${describeDelay(stock.nextDueAt, now)}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onReview(stock.id)}
                  disabled={stock.due === 0}
                  aria-label={`Réviser : ${stock.label}`}
                  className={SECONDARY}
                >
                  Réviser
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {streak && columns && (
        <div className="flex flex-col gap-2.5">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
            <span className="flex items-center gap-1.5 font-semibold">
              <Flame
                className={`w-4 h-4 ${streak.current > 0 ? 'text-orange-400' : 'text-slate-600'}`}
                aria-hidden="true"
              />
              Série : {plural(streak.current, 'jour', 'jours')}
            </span>
            <span className="text-slate-400">Record : {plural(streak.longest, 'jour', 'jours')}</span>
            <span className={streak.isTodayDone ? 'text-emerald-300' : 'text-slate-400'}>
              {streak.isTodayDone
                ? "Aujourd'hui : déjà fait"
                : streak.current > 0
                  ? "Aujourd'hui : pas encore, la série continue si vous révisez"
                  : "Aujourd'hui : pas encore"}
            </span>
          </p>
          <div
            role="img"
            aria-label={`Calendrier d'assiduité : ${plural(activeDays, 'jour', 'jours')} d'entraînement sur les ${WEEKS} dernières semaines`}
          >
            <Calendar columns={columns} />
          </div>
        </div>
      )}
    </section>
  );
};
