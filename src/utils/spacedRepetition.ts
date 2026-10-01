import type { FaultKind } from './faultKinds';
import type { GamePhase } from './phaseStats';

/**
 * Spaced repetition of the positions the player got wrong: a position found again comes back later and later,
 * a position missed again starts over.
 *
 * A position never worked on has no card. A card keeps `level`, the number of successes in a row: the first
 * success brings the position back in 1 day, the second in 3, the third in 7, and the fourth (the review after
 * 7 days) retires it as mastered. A failure puts the level back to 0 and the position back in 1 day.
 */

export interface Card {
  /** `TrainingPosition.id`. */
  id: string;
  /** Successes in a row (0 after a failure). */
  level: number;
  /** Milliseconds since the epoch from which the position is due again. */
  dueAt: number;
  /** When the position was last worked on. */
  lastSeen: number;
  /** Times the position was worked on, and missed. */
  attempts: number;
  failures: number;
}

/** Days before a position comes back after its 1st, 2nd and 3rd success in a row. */
export const INTERVAL_DAYS = [1, 3, 7] as const;
/** Level from which a position is retired. */
export const MASTERED_LEVEL = INTERVAL_DAYS.length + 1;
/** Days before a missed position comes back. */
export const RETRY_DAYS = 1;
/** Positions in a session. */
export const SESSION_SIZE = 10;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The card after an attempt (`previous` is undefined for a position never worked on). */
export function review(id: string, previous: Card | undefined, isSuccess: boolean, now: number): Card {
  const attempts = (previous?.attempts ?? 0) + 1;
  const failures = (previous?.failures ?? 0) + (isSuccess ? 0 : 1);
  if (!isSuccess) {
    return { id, level: 0, dueAt: now + RETRY_DAYS * DAY_MS, lastSeen: now, attempts, failures };
  }
  const level = (previous?.level ?? 0) + 1;
  // Retired: never due again (a finite number, so that the card survives a JSON export)
  const dueAt = level >= MASTERED_LEVEL ? Number.MAX_SAFE_INTEGER : now + INTERVAL_DAYS[level - 1] * DAY_MS;
  return { id, level, dueAt, lastSeen: now, attempts, failures };
}

export type CardStatus = 'new' | 'due' | 'scheduled' | 'mastered';

export function statusOf(card: Card | undefined, now: number): CardStatus {
  if (!card) return 'new';
  if (card.level >= MASTERED_LEVEL) return 'mastered';
  return card.dueAt <= now ? 'due' : 'scheduled';
}

/** What this needs to know of a position to choose it. */
export interface Pickable {
  id: string;
  kind: FaultKind;
  phase: GamePhase;
  /** Win % given away by the fault. */
  loss: number;
  /** Milliseconds since the epoch: the date of the game. */
  date: number;
}

/** The themes to work on: a position must be of one of the kinds and of one of the phases (none chosen: all). */
export interface TrainingFilter {
  kinds: ReadonlySet<FaultKind>;
  phases: ReadonlySet<GamePhase>;
}

export const NO_FILTER: TrainingFilter = { kinds: new Set(), phases: new Set() };

export function matchesFilter(position: Pickable, filter: TrainingFilter): boolean {
  return (
    (filter.kinds.size === 0 || filter.kinds.has(position.kind)) &&
    (filter.phases.size === 0 || filter.phases.has(position.phase))
  );
}

export interface TrainingSummary {
  /** Missed before and due again now. */
  due: number;
  /** Never worked on. */
  fresh: number;
  /** Waiting for their next day. */
  scheduled: number;
  mastered: number;
  /** When the first scheduled position is due, null without any. */
  nextDueAt: number | null;
}

/** How the positions that match the filter stand. */
export function summarize(
  positions: readonly Pickable[],
  cards: ReadonlyMap<string, Card>,
  now: number,
  filter: TrainingFilter = NO_FILTER
): TrainingSummary {
  const summary: TrainingSummary = { due: 0, fresh: 0, scheduled: 0, mastered: 0, nextDueAt: null };
  for (const position of positions) {
    if (!matchesFilter(position, filter)) continue;
    const card = cards.get(position.id);
    switch (statusOf(card, now)) {
      case 'new':
        summary.fresh += 1;
        break;
      case 'due':
        summary.due += 1;
        break;
      case 'mastered':
        summary.mastered += 1;
        break;
      case 'scheduled':
        summary.scheduled += 1;
        summary.nextDueAt = Math.min(summary.nextDueAt ?? Infinity, card!.dueAt);
        break;
    }
  }
  return summary;
}

export interface PickOptions {
  filter?: TrainingFilter;
  size?: number;
  /** Also take positions that are not due yet (the soonest first), once what is due and new is used up. */
  includeUpcoming?: boolean;
}

/**
 * The positions of a session: the ones due again first (the longest overdue first), then the ones never worked on
 * (the costliest fault first, the most recent game on a tie), then, if asked, the ones due soonest.
 */
export function pickSession<T extends Pickable>(
  positions: readonly T[],
  cards: ReadonlyMap<string, Card>,
  now: number,
  { filter = NO_FILTER, size = SESSION_SIZE, includeUpcoming = false }: PickOptions = {}
): T[] {
  const due: T[] = [];
  const fresh: T[] = [];
  const upcoming: T[] = [];
  for (const position of positions) {
    if (!matchesFilter(position, filter)) continue;
    switch (statusOf(cards.get(position.id), now)) {
      case 'due':
        due.push(position);
        break;
      case 'new':
        fresh.push(position);
        break;
      case 'scheduled':
        upcoming.push(position);
        break;
    }
  }
  const dueAt = (p: T) => cards.get(p.id)!.dueAt;
  due.sort((a, b) => dueAt(a) - dueAt(b) || b.loss - a.loss);
  fresh.sort((a, b) => b.loss - a.loss || b.date - a.date);
  upcoming.sort((a, b) => dueAt(a) - dueAt(b));
  return [...due, ...fresh, ...(includeUpcoming ? upcoming : [])].slice(0, size);
}

/** "demain", "dans 3 jours", "aujourd'hui" for a date `dueAt` seen from `now`. */
export function describeDelay(dueAt: number, now: number): string {
  const days = Math.ceil((dueAt - now) / DAY_MS);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  return `dans ${days} jours`;
}
