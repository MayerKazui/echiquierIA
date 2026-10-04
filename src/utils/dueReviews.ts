import { ENDGAMES } from '../data/endgames';
import { ENDGAME_ID_PREFIX, endgameCardId } from './endgameDrill';
import { DRILL_ID_PREFIX } from './openingDrill';
import type { PuzzleEntry } from './puzzleReview';
import { statusOf, type Card } from './spacedRepetition';
import type { WoodpeckerSet } from './woodpecker';

/**
 * What is to be reviewed today, over the five places where something comes back: the errors replayed, the puzzles
 * missed, the lines of the openings, the theoretical endgames and the Woodpecker lot. Four of them are stocks of
 * spaced repetition (a card each, due from a date, see `spacedRepetition`); the fifth, Woodpecker, has no date: a
 * cycle begun and not finished is what waits there.
 */

export type StockId = 'errors' | 'puzzles' | 'repertoire' | 'endgames' | 'woodpecker';

/** The order "Tout réviser" goes through them: the games' own mistakes first, the cycle left half done last. */
export const STOCK_ORDER: readonly StockId[] = ['errors', 'puzzles', 'repertoire', 'endgames', 'woodpecker'];

export interface DueStock {
  id: StockId;
  label: string;
  /** What waits: positions or puzzles that are due; for Woodpecker, 1 when a cycle is in progress. */
  due: number;
  /** What it is, in a few words ("positions", "cycle en cours : 12 puzzles restants"). */
  detail: string;
  /** When the first one not due yet comes back, null without any: "demain" is said from it. */
  nextDueAt: number | null;
}

export interface DueSummary {
  /** The moment it was worked out at. */
  now: number;
  stocks: DueStock[];
  /** What is due in all. */
  total: number;
  /** The first stock with something due, in `STOCK_ORDER`; null when there is nothing. */
  next: DueStock | null;
  /** When the soonest item not due yet comes back (all stocks), null without any. */
  nextDueAt: number | null;
  /** Whether the player has any card, puzzle or lot at all: without, nothing is worth showing yet. */
  hasAnything: boolean;
}

export interface DueInput {
  cards: ReadonlyMap<string, Card>;
  /** Ids of the games kept: the card of an error whose game was deleted is not asked any more. */
  gameIds: ReadonlySet<string>;
  puzzles: ReadonlyMap<string, PuzzleEntry>;
  woodpecker: WoodpeckerSet | null;
  now: number;
}

const LABELS: Record<StockId, string> = {
  errors: 'Mes erreurs',
  puzzles: 'Puzzles ratés',
  repertoire: 'Mes ouvertures',
  endgames: 'Finales',
  woodpecker: 'Woodpecker',
};

const ENDGAME_IDS: ReadonlySet<string> = new Set(ENDGAMES.map((endgame) => endgameCardId(endgame)));

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Which stock a card of the shared store belongs to (see `trainingStore`), null for an error whose game is gone. */
function stockOfCard(id: string, gameIds: ReadonlySet<string>): StockId | null {
  if (id.startsWith(DRILL_ID_PREFIX)) return 'repertoire';
  if (id.startsWith(ENDGAME_ID_PREFIX)) return ENDGAME_IDS.has(id) ? 'endgames' : null;
  // An error is `gameId:ply`
  return gameIds.has(id.split(':')[0]) ? 'errors' : null;
}

export function summarizeDue({ cards, gameIds, puzzles, woodpecker, now }: DueInput): DueSummary {
  const due: Record<StockId, number> = { errors: 0, puzzles: 0, repertoire: 0, endgames: 0, woodpecker: 0 };
  const nextAt: Record<StockId, number | null> = {
    errors: null,
    puzzles: null,
    repertoire: null,
    endgames: null,
    woodpecker: null,
  };
  const seen: Record<StockId, number> = { errors: 0, puzzles: 0, repertoire: 0, endgames: 0, woodpecker: 0 };
  const note = (stock: StockId, card: Card) => {
    seen[stock] += 1;
    switch (statusOf(card, now)) {
      case 'due':
        due[stock] += 1;
        break;
      case 'scheduled':
        nextAt[stock] = Math.min(nextAt[stock] ?? Infinity, card.dueAt);
        break;
    }
  };

  for (const card of cards.values()) {
    const stock = stockOfCard(card.id, gameIds);
    if (stock) note(stock, card);
  }
  for (const entry of puzzles.values()) note('puzzles', entry.card);

  let woodpeckerDetail = 'Aucun lot';
  if (woodpecker) {
    seen.woodpecker = 1;
    if (woodpecker.progress && woodpecker.progress.queue.length > 0) {
      due.woodpecker = 1;
      woodpeckerDetail = `Cycle ${woodpecker.progress.number} en cours : ${plural(woodpecker.progress.queue.length, 'puzzle restant', 'puzzles restants')}`;
    } else {
      woodpeckerDetail = `Lot de ${woodpecker.puzzles.length} puzzles, aucun cycle en cours`;
    }
  }

  const detail = (stock: StockId): string => {
    switch (stock) {
      case 'errors':
        return due.errors > 0 ? plural(due.errors, 'position à rejouer', 'positions à rejouer') : 'Rien à rejouer';
      case 'puzzles':
        return due.puzzles > 0 ? plural(due.puzzles, 'puzzle à revoir', 'puzzles à revoir') : 'Rien à revoir';
      case 'repertoire':
        return due.repertoire > 0 ? plural(due.repertoire, 'ligne à rejouer', 'lignes à rejouer') : 'Rien à rejouer';
      case 'endgames':
        return due.endgames > 0 ? plural(due.endgames, 'finale à rejouer', 'finales à rejouer') : 'Rien à rejouer';
      case 'woodpecker':
        return woodpeckerDetail;
    }
  };

  const stocks: DueStock[] = STOCK_ORDER.map((id) => ({
    id,
    label: LABELS[id],
    due: due[id],
    detail: detail(id),
    nextDueAt: nextAt[id],
  }));
  const dates = stocks.map((stock) => stock.nextDueAt).filter((date): date is number => date !== null);
  return {
    now,
    stocks,
    total: stocks.reduce((sum, stock) => sum + stock.due, 0),
    next: stocks.find((stock) => stock.due > 0) ?? null,
    nextDueAt: dates.length > 0 ? Math.min(...dates) : null,
    hasAnything: STOCK_ORDER.some((id) => seen[id] > 0),
  };
}
