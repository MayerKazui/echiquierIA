import type { StoredGame } from '../services/gameStore';
import { toFrenchOpeningName } from './openingNames';
import { parseOutcome, parsePgnDate, type Outcome } from './weaknessProfile';
import { hasContent, type GameNote } from './gameNotes';
import { playedLabel, playedOutcome, type PlayedGame } from './playedGames';

/**
 * Searching, filtering and sorting the games of the history ("Mes parties"): by text, result, side, opponent,
 * opening, period and accuracy, and by the tags the player gave. Everything works on `GameFacts`, the few figures of
 * a game worked out once, so that typing in the search box does not read the moves again.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface GameFacts {
  /** The id of the game (what its note is kept under). */
  id: string;
  /** The analysed game; null for a game against the engine that was not analysed yet. */
  game: StoredGame | null;
  /** The record of the game, when it was played against the engine here (an analysed game keeps it). */
  played: PlayedGame | null;
  /** Milliseconds since the epoch: when the game was saved (analysed, or finished against the engine). */
  savedAt: number;
  note: GameNote | undefined;
  /** The side the player had (the one kept with the game), null when it is not known. */
  color: 'w' | 'b' | null;
  /** From the player's side; null when the side or the result is not known (a game still in progress, `*`). */
  outcome: Outcome | null;
  /** The other player's name, empty when the side is not known. */
  opponent: string;
  /** The opening family in English ("Sicilian Defense"), empty when the game has none named. */
  family: string;
  /** Milliseconds since the epoch: the date of the game, else the one it was saved. */
  date: number;
  /** The player's accuracy, 0 to 100; null when the side is not known. */
  accuracy: number | null;
  /** Lower case without accents: what the search looks into. */
  haystack: string;
}

/** Lower case, without accents or diacritics ("Défense" → "defense"). */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export const familyOfOpening = (name: string): string => name.split(':')[0].trim();

/** The words a game against the engine is found by. */
const engineWords = (played: PlayedGame): string => `${playedLabel(played)} stockfish moteur ordinateur`;

/** The figures of one game, with its note if it has one, and the record of the game when it was played here. */
export function describeGame(game: StoredGame, note?: GameNote, played?: PlayedGame): GameFacts {
  const { metadata, statsWhite, statsBlack, userColor } = game.result;
  const color = userColor === 'w' || userColor === 'b' ? userColor : null;
  const opponent = color === null ? '' : (color === 'w' ? metadata.black : metadata.white) || '';
  const stats = color === null ? undefined : color === 'w' ? statsWhite : statsBlack;
  const accuracy = typeof stats?.accuracy === 'number' && Number.isFinite(stats.accuracy) ? stats.accuracy : null;
  const family = metadata.opening ? familyOfOpening(metadata.opening) : '';
  const kept = hasContent(note) ? note : undefined;
  const haystack = fold(
    [
      metadata.white,
      metadata.black,
      metadata.event,
      metadata.site,
      metadata.date,
      metadata.result,
      metadata.eco,
      metadata.opening,
      metadata.opening ? toFrenchOpeningName(metadata.opening) : '',
      played ? engineWords(played) : '',
      kept?.tags.join(' '),
      kept?.note,
    ]
      .filter(Boolean)
      .join(' ')
  );
  return {
    id: game.id,
    game,
    played: played ?? null,
    savedAt: game.savedAt,
    note: kept,
    color,
    outcome: color === null ? null : parseOutcome(metadata.result, color),
    opponent,
    family,
    date: parsePgnDate(metadata.date) ?? game.savedAt,
    accuracy,
    haystack,
  };
}

/** The figures of a game against the engine that was not analysed: it has no opening named, nor accuracy. */
export function describePlayed(played: PlayedGame, note?: GameNote): GameFacts {
  const kept = hasContent(note) ? note : undefined;
  const opponent = `Stockfish (${played.levelLabel})`;
  const haystack = fold(
    [played.userName, opponent, played.result, played.label, engineWords(played), kept?.tags.join(' '), kept?.note]
      .filter(Boolean)
      .join(' ')
  );
  return {
    id: played.id,
    game: null,
    played,
    savedAt: played.finishedAt,
    note: kept,
    color: played.color,
    outcome: playedOutcome(played),
    opponent,
    family: '',
    date: played.finishedAt,
    accuracy: null,
    haystack,
  };
}

export type ResultFilter = 'all' | Outcome;
export type ColorFilter = 'all' | 'w' | 'b';
export type PeriodFilter = 'all' | '7d' | '30d' | '90d' | '365d' | 'custom';
/** `<60` is the games under 60 %, the others the games from that accuracy up. */
export type AccuracyFilter = 'all' | '90' | '80' | '70' | '60' | '<60';
/** `engine`: the games played against Stockfish here; `other`: the games analysed from a PGN or an import. */
export type SourceFilter = 'all' | 'engine' | 'other';
export type SortKey = 'recent' | 'date-desc' | 'date-asc' | 'accuracy-desc' | 'accuracy-asc' | 'opponent';

export interface HistoryFilters {
  query: string;
  result: ResultFilter;
  color: ColorFilter;
  /** An opponent's name as `GameFacts.opponent` has it, empty for all. */
  opponent: string;
  /** An opening family as `GameFacts.family` has it, empty for all. */
  opening: string;
  period: PeriodFilter;
  /** `yyyy-mm-dd`, for the custom period. */
  from: string;
  to: string;
  accuracy: AccuracyFilter;
  /** A tag, empty for all. */
  tag: string;
  source: SourceFilter;
  sort: SortKey;
}

export const NO_FILTERS: HistoryFilters = {
  query: '',
  result: 'all',
  color: 'all',
  opponent: '',
  opening: '',
  period: 'all',
  from: '',
  to: '',
  accuracy: 'all',
  tag: '',
  source: 'all',
  sort: 'recent',
};

export const RESULT_LABELS: Record<ResultFilter, string> = {
  all: 'Tous les résultats',
  win: 'Victoires',
  draw: 'Nulles',
  loss: 'Défaites',
};
export const COLOR_LABELS: Record<ColorFilter, string> = {
  all: 'Les deux couleurs',
  w: 'Avec les Blancs',
  b: 'Avec les Noirs',
};
export const PERIOD_LABELS: Record<PeriodFilter, string> = {
  all: 'Toute la période',
  '7d': '7 derniers jours',
  '30d': '30 derniers jours',
  '90d': '3 derniers mois',
  '365d': '12 derniers mois',
  custom: 'Entre deux dates',
};
export const ACCURACY_LABELS: Record<AccuracyFilter, string> = {
  all: 'Toutes les précisions',
  '90': '90 % et plus',
  '80': '80 % et plus',
  '70': '70 % et plus',
  '60': '60 % et plus',
  '<60': 'Moins de 60 %',
};
export const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: 'Toutes les parties',
  engine: 'Contre Stockfish',
  other: 'Autres parties',
};
export const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Ajoutées récemment',
  'date-desc': 'Date de la partie, la plus récente',
  'date-asc': 'Date de la partie, la plus ancienne',
  'accuracy-desc': 'Précision, la plus haute',
  'accuracy-asc': 'Précision, la plus basse',
  opponent: 'Adversaire, de A à Z',
};

const PERIOD_DAYS: Record<Exclude<PeriodFilter, 'all' | 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
};

/** `yyyy-mm-dd` (what a date input gives) as milliseconds at the start of that day in UTC; null when it is not one. */
function parseInputDate(raw: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(time) ? time : null;
}

/** How many filters are set (the sort is not one): what the "Réinitialiser" button and the badge speak of. */
export function activeFilterCount(filters: HistoryFilters): number {
  let count = 0;
  if (filters.query.trim() !== '') count += 1;
  if (filters.result !== 'all') count += 1;
  if (filters.color !== 'all') count += 1;
  if (filters.opponent !== '') count += 1;
  if (filters.opening !== '') count += 1;
  if (filters.period !== 'all') count += 1;
  if (filters.accuracy !== 'all') count += 1;
  if (filters.tag !== '') count += 1;
  if (filters.source !== 'all') count += 1;
  return count;
}

function matchesAccuracy(accuracy: number | null, filter: AccuracyFilter): boolean {
  if (filter === 'all') return true;
  if (accuracy === null) return false;
  return filter === '<60' ? accuracy < 60 : accuracy >= Number(filter);
}

function matchesPeriod(date: number, filters: HistoryFilters, now: number): boolean {
  if (filters.period === 'all') return true;
  if (filters.period === 'custom') {
    const from = parseInputDate(filters.from);
    const to = parseInputDate(filters.to);
    // A day that is given is included whole
    return (from === null || date >= from) && (to === null || date < to + DAY_MS);
  }
  return date >= now - PERIOD_DAYS[filters.period] * DAY_MS;
}

/** Whether a game passes the filters (not the sort). */
export function matchesFilters(facts: GameFacts, filters: HistoryFilters, now: number): boolean {
  if (filters.result !== 'all' && facts.outcome !== filters.result) return false;
  if (filters.color !== 'all' && facts.color !== filters.color) return false;
  if (filters.opponent !== '' && fold(facts.opponent) !== fold(filters.opponent)) return false;
  if (filters.opening !== '' && facts.family !== filters.opening) return false;
  if (filters.tag !== '' && !facts.note?.tags.includes(filters.tag)) return false;
  if (filters.source !== 'all' && (facts.played !== null) !== (filters.source === 'engine')) return false;
  if (!matchesAccuracy(facts.accuracy, filters.accuracy)) return false;
  if (!matchesPeriod(facts.date, filters, now)) return false;
  // Every word typed must be found somewhere in the game
  for (const word of fold(filters.query).split(/\s+/)) {
    if (word !== '' && !facts.haystack.includes(word)) return false;
  }
  return true;
}

/** Orders a copy of the games; the ones without a figure to sort on come last, and ties keep the order they had. */
export function sortFacts(list: readonly GameFacts[], sort: SortKey): GameFacts[] {
  const indexed = list.map((facts, index) => ({ facts, index }));
  const byNumber = (value: (facts: GameFacts) => number | null, direction: 1 | -1) =>
    indexed.sort((a, b) => {
      const x = value(a.facts);
      const y = value(b.facts);
      if (x === null || y === null) return x === y ? a.index - b.index : x === null ? 1 : -1;
      return (x - y) * direction || a.index - b.index;
    });
  switch (sort) {
    case 'date-desc':
      byNumber((f) => f.date, -1);
      break;
    case 'date-asc':
      byNumber((f) => f.date, 1);
      break;
    case 'accuracy-desc':
      byNumber((f) => f.accuracy, -1);
      break;
    case 'accuracy-asc':
      byNumber((f) => f.accuracy, 1);
      break;
    case 'opponent':
      indexed.sort((a, b) => {
        if (a.facts.opponent === '' || b.facts.opponent === '') {
          return a.facts.opponent === b.facts.opponent ? a.index - b.index : a.facts.opponent === '' ? 1 : -1;
        }
        return a.facts.opponent.localeCompare(b.facts.opponent, 'fr', { sensitivity: 'base' }) || a.index - b.index;
      });
      break;
    case 'recent':
      // The order of the history: the most recently added (analysed, or finished against the engine) first
      indexed.sort((a, b) => b.facts.savedAt - a.facts.savedAt || a.index - b.index);
      break;
  }
  return indexed.map(({ facts }) => facts);
}

/** The games that pass the filters, in the order asked. */
export function applyFilters(list: readonly GameFacts[], filters: HistoryFilters, now: number): GameFacts[] {
  return sortFacts(
    list.filter((facts) => matchesFilters(facts, filters, now)),
    filters.sort
  );
}

export interface FilterChoices {
  /** How many games were played against the engine here (the filter on the source is offered when there are some). */
  engineGames: number;
  opponents: Array<{ name: string; count: number }>;
  openings: Array<{ name: string; count: number }>;
}

/** The opponents and the opening families found in the games, the most frequent first: what the lists offer. */
export function filterChoices(list: readonly GameFacts[]): FilterChoices {
  const count = (pick: (facts: GameFacts) => string) => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const facts of list) {
      const name = pick(facts);
      if (name === '') continue;
      // The same name written in another case is the same opponent
      const key = fold(name);
      const known = counts.get(key);
      if (known) known.count += 1;
      else counts.set(key, { name, count: 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));
  };
  return {
    engineGames: list.filter((facts) => facts.played !== null).length,
    opponents: count((facts) => facts.opponent),
    openings: count((facts) => facts.family),
  };
}

/** What the filters leave, in a sentence: "12 parties sur 340", "340 parties". */
export function describeCount(shown: number, total: number): string {
  const plural = (n: number) => `${n} partie${n > 1 ? 's' : ''}`;
  return shown === total ? plural(total) : `${plural(shown)} sur ${total}`;
}
