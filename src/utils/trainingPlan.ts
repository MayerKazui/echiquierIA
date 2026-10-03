import { numberedFrenchMove } from './chessNotation';
import { FAULT_KIND_TEXT } from './faultKinds';
import type { GamePhase } from './gamePhase';
import { toFrenchOpeningName } from './openingNames';
import type { Repertoire } from './openingRepertoire';
import {
  DAY_MS,
  SESSION_SIZE,
  matchesFilter,
  summarize,
  type Card,
  type Pickable,
  type TrainingFilter,
} from './spacedRepetition';
import { FAULT_PUZZLE_THEMES, PHASE_PUZZLE_THEMES, themeLabel } from './puzzleThemes';
import { MIN_BUCKET_MOVES, dominantFaultKind, weakestPhase, type Profile } from './weaknessProfile';

/**
 * The plan of the week: the few things worth working on, from what the games show (the profile), where the player
 * leaves the opening theory (the repertoire) and what is left to replay (the training cards). Nothing here is
 * stored: it is worked out again from the same figures each time, so it follows the games as they come in.
 */

export type PlanAction =
  /** Replays the errors of a theme. */
  | { kind: 'train'; filter: TrainingFilter }
  /** Shows the position before a way out of the theory, in the opening explorer. */
  | { kind: 'openings'; line: string[] }
  /** Brings in more games. */
  | { kind: 'import' }
  /** Opens the puzzles on themes (the ones of Lichess), at the player's level. */
  | { kind: 'puzzles'; themes: string[] }
  /** A habit to take: nothing to open. */
  | { kind: 'habit' };

export interface PlanItem {
  id: string;
  title: string;
  /** What the games say, in a sentence. */
  why: string;
  action: PlanAction;
  /** Puzzles on the same theme as an other way to work on it (beside the action, which is not about puzzles). */
  puzzles?: string[];
  /** Progress over the last 7 days (positions replayed out of those to replay). */
  goal?: { done: number; target: number };
}

export interface Plan {
  items: PlanItem[];
  /** Why there is no real plan: too few games, or nothing that stands out. */
  note: 'few-games' | 'nothing' | null;
}

export interface PlanInput {
  profile: Profile;
  repertoire: Repertoire;
  positions: readonly Pickable[];
  cards: ReadonlyMap<string, Card>;
  now: number;
}

/** Games from which a plan means something (the profile itself warns under 5). */
export const MIN_PLAN_GAMES = 5;
/** Items in a plan: a few things at a time, or none is done. */
export const MAX_ITEMS = 3;
/** The window of the progress. */
export const WEEK_MS = 7 * DAY_MS;
/** Accuracy points that quick moves may lose against the others before it is worth a habit. */
const QUICK_GAP = 5;

const PHASE_LABELS: Record<GamePhase, string> = {
  opening: "l'ouverture",
  middlegame: 'le milieu de jeu',
  endgame: 'la finale',
};

/**
 * The item for a theme: the player's own errors to replay, with the puzzles of the theme beside them. When there is
 * nothing left to replay (or replayed this week) in it, the puzzles are what is left to work on it.
 */
function trainingItem(
  id: string,
  title: string,
  puzzleTitle: string,
  why: string,
  filter: TrainingFilter,
  themes: readonly string[],
  { positions, cards, now }: Pick<PlanInput, 'positions' | 'cards' | 'now'>
): PlanItem | null {
  const { due, fresh } = summarize(positions, cards, now, filter);
  const replayed = positions.filter(
    (p) => matchesFilter(p, filter) && (cards.get(p.id)?.lastSeen ?? 0) >= now - WEEK_MS
  ).length;
  const target = Math.min(SESSION_SIZE, replayed + due + fresh);
  if (themes.length === 0) {
    return target === 0
      ? null
      : { id, title, why, action: { kind: 'train', filter }, goal: { done: Math.min(replayed, target), target } };
  }
  if (target === 0) return { id, title: puzzleTitle, why, action: { kind: 'puzzles', themes: [...themes] } };
  return {
    id,
    title,
    why,
    action: { kind: 'train', filter },
    puzzles: [...themes],
    goal: { done: Math.min(replayed, target), target },
  };
}

/** The most costly way out of the theory the player has: the one met most often, costing most. */
function costliestExit(repertoire: Repertoire): PlanItem | null {
  let best: { score: number; item: PlanItem } | null = null;
  for (const color of ['w', 'b'] as const) {
    for (const family of repertoire.colors[color]) {
      for (const exit of family.recurring) {
        if (!exit.isCostly) continue;
        const score = exit.count * exit.loss;
        if (best && best.score >= score) continue;
        const move = numberedFrenchMove(exit.moveNumber, color === 'w', exit.san);
        const name = family.name ? toFrenchOpeningName(family.name) : 'cette ouverture';
        best = {
          score,
          item: {
            id: 'exit',
            title: `Préparez votre sortie de théorie : ${move}`,
            why: `Dans ${name}, vous quittez le livre ${exit.count} fois avec ce coup, qui coûte en moyenne ${Math.round(exit.loss)} points de chances de gain.`,
            action: { kind: 'openings', line: exit.line },
          },
        };
      }
    }
  }
  return best?.item ?? null;
}

/** A habit to take, from the clock: a precision that drops with little time, or with quick moves. */
function habitItem({ time, insights }: Profile): PlanItem | null {
  const pressure = insights.find((i) => i.id === 'time');
  if (pressure) {
    return {
      id: 'habit-time',
      title: 'Gardez du temps pour la suite de la partie',
      why: pressure.text,
      action: { kind: 'habit' },
    };
  }
  const { instant, thoughtful } = time;
  if (
    instant.moves >= MIN_BUCKET_MOVES &&
    thoughtful.moves >= MIN_BUCKET_MOVES &&
    instant.accuracy !== null &&
    thoughtful.accuracy !== null &&
    thoughtful.accuracy - instant.accuracy >= QUICK_GAP
  ) {
    return {
      id: 'habit-speed',
      title: 'Prenez quelques secondes avant chaque coup',
      why: `Vos coups joués d'un seul coup perdent en précision : ${Math.round(instant.accuracy)} %, contre ${Math.round(thoughtful.accuracy)} % pour les coups réfléchis.`,
      action: { kind: 'habit' },
    };
  }
  return null;
}

/** Up to three objectives, the most telling first: the errors that come back, the opening, a habit, the weakest phase. */
export function buildPlan(input: PlanInput): Plan {
  const { profile, repertoire } = input;
  if (profile.counted < MIN_PLAN_GAMES) {
    return {
      note: 'few-games',
      items: [
        {
          id: 'import',
          title: 'Analysez plus de parties',
          why: `Le plan se règle sur vos parties : ${profile.counted} pour l'instant, il en faut ${MIN_PLAN_GAMES} au moins.`,
          action: { kind: 'import' },
        },
      ],
    };
  }

  const items: PlanItem[] = [];
  const add = (item: PlanItem | null) => item && items.push(item);

  const dominant = dominantFaultKind(profile.kinds);
  if (dominant) {
    const label = FAULT_KIND_TEXT[dominant.kind].label;
    add(
      trainingItem(
        `train-${dominant.kind}`,
        `Rejouez vos erreurs : ${label.toLowerCase()}`,
        `Faites des puzzles : ${label.toLowerCase()}`,
        `${Math.round((dominant.count / profile.kinds.total) * 100)} % de vos erreurs (${dominant.count} sur ${profile.kinds.total}) sont de ce type.`,
        { kinds: new Set([dominant.kind]), phases: new Set() },
        FAULT_PUZZLE_THEMES[dominant.kind] ?? [],
        input
      )
    );
  }

  add(costliestExit(repertoire));
  add(habitItem(profile));

  const phase = weakestPhase(profile);
  if (phase) {
    const accuracy = profile.phases[phase].accuracy!;
    add(
      trainingItem(
        `train-${phase}`,
        `Rejouez vos erreurs de ${PHASE_LABELS[phase]}`,
        `Faites des puzzles : ${themeLabel(phase).toLowerCase()}`,
        `C'est votre phase la plus fragile : ${Math.round(accuracy)} % de précision, contre ${Math.round(profile.baseline.accuracy!)} % en moyenne.`,
        { kinds: new Set(), phases: new Set([phase]) },
        PHASE_PUZZLE_THEMES[phase] ?? [],
        input
      )
    );
  }

  return { items: items.slice(0, MAX_ITEMS), note: items.length === 0 ? 'nothing' : null };
}
