import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { FAULT_CLASSIFICATIONS, FAULT_KINDS, classifyFault, type FaultKind } from './faultKinds';
import { parseDurationToSeconds, parseTimeControl } from './clockUtils';
import { accuracyFromMoves } from './moveAnalysis';
import { phaseOf, type GamePhase } from './gamePhase';

/**
 * What the games kept in the browser say about the player: where the accuracy is lost (phase of the game, kind of
 * fault, time left, colour, strength of the opponent, time control) and how it evolves.
 *
 * Only the player's own moves count, and the moves of the opening theory are left out (they are always "best" and
 * would flatter the opening).
 */

/** What this needs of a stored game. */
export interface ProfileSource {
  id: string;
  savedAt: number;
  result: GameAnalysisResult;
}

export interface Bucket {
  moves: number;
  /** Accuracy (0-100) of these moves, null without moves. */
  accuracy: number | null;
  /** Mistakes, blunders and misses. */
  faults: number;
  faultsPer100: number;
}

/** A bucket of moves that also knows the games they come from. */
export interface GameBucket extends Bucket {
  games: number;
  /** Points per game (win 1, draw 0.5), null when no game has a result. */
  score: number | null;
}

export type Outcome = 'win' | 'draw' | 'loss';
export type TimeControlClass = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily';

export interface ProfileGame {
  id: string;
  /** Milliseconds since the epoch: the date of the game, else the one it was saved. */
  date: number;
  opponent: string;
  color: 'w' | 'b';
  outcome: Outcome | null;
  accuracy: number;
  faults: number;
  moves: number;
}

export interface WorstFault {
  gameId: string;
  opponent: string;
  date: number;
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  /** The engine's move, in English SAN (as stored). */
  bestSan: string;
  kind: FaultKind;
  /** Win % given away. */
  loss: number;
}

export type InsightId = 'fault' | 'phase' | 'time' | 'color' | 'trend';

export interface Insight {
  id: InsightId;
  text: string;
}

export interface Profile {
  /** Games that count (the player is named in them), and those left out. */
  counted: number;
  ignored: number;
  overview: {
    /** Mean of the accuracy of each game. */
    accuracy: number;
    wins: number;
    draws: number;
    losses: number;
    /** Points per game, null when no game has a result. */
    score: number | null;
    faultsPerGame: number;
  };
  /** All the moves together: what the buckets are compared with. */
  baseline: Bucket;
  phases: Record<GamePhase, Bucket>;
  kinds: { counts: Record<FaultKind, number>; total: number };
  worst: WorstFault[];
  colors: Record<'w' | 'b', GameBucket>;
  time: {
    /** Moves played with little time left, and the others. */
    pressure: Bucket;
    comfortable: Bucket;
    /** Moves played at once (3 s or less), and the others. */
    instant: Bucket;
    thoughtful: Bucket;
    gamesWithClocks: number;
  };
  /** By the strength of the opponent (needs both ratings). */
  opponents: { stronger: GameBucket; similar: GameBucket; weaker: GameBucket };
  timeControls: Partial<Record<TimeControlClass, GameBucket>>;
  /** The games, oldest first. */
  trend: ProfileGame[];
  /** The last games against the ones before them, null with too few games. */
  trendChange: {
    count: number;
    accuracy: { recent: number; previous: number };
    faults: { recent: number; previous: number };
  } | null;
  insights: Insight[];
}

/** Under this many moves, a figure says too little to be called a weakness. */
export const MIN_BUCKET_MOVES = 30;
/** Games with fewer moves (both sides) are left out. */
export const MIN_GAME_PLIES = 10;
/** Rating gap (points) from which an opponent counts as stronger or weaker. */
export const ELO_MARGIN = 50;
/** A move played this quickly (seconds) counts as instant. */
export const INSTANT_SECONDS = 3;
/** Games compared in the trend (recent against previous), and the least needed to show it. */
export const TREND_WINDOW = 10;
export const MIN_TREND_GAMES = 6;

const MAX_WORST = 5;

/** Time left (seconds) under which the clock is a problem: a tenth of the time control, between 10 s and 2 min. */
export function pressureThreshold(baseSeconds: number | null): number {
  if (baseSeconds === null || baseSeconds < 30) return 20;
  return Math.min(120, Math.max(10, baseSeconds * 0.1));
}

/** Speed class of a time control header ("300+3", "600", "1/86400"), null when it cannot be read. */
export function classifyTimeControl(raw: string | undefined): TimeControlClass | null {
  if (!raw) return null;
  if (raw.includes('/')) return 'daily';
  const parsed = parseTimeControl(raw);
  if (!parsed) return null;
  const estimated = parsed.baseTime + 40 * parsed.increment;
  if (estimated < 180) return 'bullet';
  if (estimated < 480) return 'blitz';
  if (estimated < 1500) return 'rapid';
  return 'classical';
}

function bucketOf(moves: MoveAnalysis[]): Bucket {
  const faults = moves.filter((m) => FAULT_CLASSIFICATIONS.has(m.classification)).length;
  return {
    moves: moves.length,
    accuracy: moves.length === 0 ? null : accuracyFromMoves(moves),
    faults,
    faultsPer100: moves.length === 0 ? 0 : (faults / moves.length) * 100,
  };
}

interface CountedGame {
  source: ProfileSource;
  color: 'w' | 'b';
  opponent: string;
  date: number;
  outcome: Outcome | null;
  /** The player's moves, theory left out. */
  moves: MoveAnalysis[];
  /** The player's moves, theory included (what the game page calls the accuracy). */
  allMoves: MoveAnalysis[];
  userElo: number | null;
  opponentElo: number | null;
}

const sameName = (a: string | undefined, b: string | undefined) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

function parseElo(raw: string | undefined): number | null {
  const value = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseOutcome(result: string | undefined, color: 'w' | 'b'): Outcome | null {
  if (result === '1/2-1/2') return 'draw';
  if (result !== '1-0' && result !== '0-1') return null;
  return (result === '1-0') === (color === 'w') ? 'win' : 'loss';
}

/** "2024.03.17" → milliseconds; null for a missing or partial date ("2024.??.??"). */
export function parsePgnDate(raw: string | undefined): number | null {
  const match = raw ? /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(raw) : null;
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(time) ? time : null;
}

/** The side the player (the pseudo kept with the game) has in it, from the names; null when not named, or both. */
export function playerColorIn({ userPseudo, metadata }: GameAnalysisResult): 'w' | 'b' | null {
  const isWhite = sameName(userPseudo, metadata.white);
  const isBlack = sameName(userPseudo, metadata.black);
  if (isWhite === isBlack) return null;
  return isWhite ? 'w' : 'b';
}

/** The game seen from the player's side, or null when the player is not named in it (or it is too short). */
function countGame(source: ProfileSource): CountedGame | null {
  const { result } = source;
  const { metadata, moves } = result;
  const color = playerColorIn(result);
  if (color === null || moves.length < MIN_GAME_PLIES) return null; // not named, playing oneself, or too short
  const isWhite = color === 'w';
  const allMoves = moves.filter((m) => m.color === color);
  return {
    source,
    color,
    opponent: (isWhite ? metadata.black : metadata.white) || 'Adversaire',
    date: parsePgnDate(metadata.date) ?? source.savedAt,
    outcome: parseOutcome(metadata.result, color),
    moves: allMoves.filter((m) => m.classification !== 'book'),
    allMoves,
    userElo: parseElo(isWhite ? metadata.whiteElo : metadata.blackElo),
    opponentElo: parseElo(isWhite ? metadata.blackElo : metadata.whiteElo),
  };
}

function gameBucket(games: CountedGame[]): GameBucket {
  const scored = games.filter((g) => g.outcome !== null);
  const points = scored.reduce((sum, g) => sum + (g.outcome === 'win' ? 1 : g.outcome === 'draw' ? 0.5 : 0), 0);
  return {
    ...bucketOf(games.flatMap((g) => g.moves)),
    games: games.length,
    score: scored.length === 0 ? null : points / scored.length,
  };
}

/** Kinds of fault worked out here for games stored before they were recorded with the game. */
const lateKinds = new Map<string, FaultKind>();

export function faultKindOf(gameKey: string, move: MoveAnalysis): FaultKind {
  if (move.faultKind) return move.faultKind;
  const key = `${gameKey}:${move.ply}`;
  let kind = lateKinds.get(key);
  if (!kind) {
    kind = classifyFault(move);
    lateKinds.set(key, kind);
  }
  return kind;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

function movesWithClock(game: CountedGame): MoveAnalysis[] {
  return game.moves.filter((m) => m.clock !== undefined || m.thinkTimeSeconds !== undefined);
}

export interface ProfileOptions {
  /** Called between games when the work has been long: lets the page breathe. Rejecting stops the work. */
  yieldToUi?: () => Promise<void>;
  /** Milliseconds of work between two calls of `yieldToUi`. */
  sliceMs?: number;
}

/** The profile of the games that name the player, `latest` being the number of latest ones to use (all if absent). */
export async function buildProfile(
  sources: ProfileSource[],
  latest?: number,
  { yieldToUi, sliceMs = 12 }: ProfileOptions = {}
): Promise<Profile> {
  const all = sources.map(countGame);
  const named = all.filter((g): g is CountedGame => g !== null);
  const ignored = sources.length - named.length;
  // Oldest first; two games of the same day keep the order in which they were stored
  named.sort((a, b) => a.date - b.date || a.source.savedAt - b.source.savedAt);
  const games = latest ? named.slice(-latest) : named;

  const pressureMoves: MoveAnalysis[] = [];
  const comfortableMoves: MoveAnalysis[] = [];
  let gamesWithClocks = 0;
  const counts = Object.fromEntries(FAULT_KINDS.map((k) => [k, 0])) as Record<FaultKind, number>;
  const faults: WorstFault[] = [];
  const trend: ProfileGame[] = [];

  let sliceStart = performance.now();
  for (const game of games) {
    const key = game.source.id;
    const faultMoves = game.moves.filter((m) => FAULT_CLASSIFICATIONS.has(m.classification));
    for (const move of faultMoves) {
      const kind = faultKindOf(`${key}:${game.source.savedAt}`, move);
      counts[kind] += 1;
      faults.push({
        gameId: key,
        opponent: game.opponent,
        date: game.date,
        moveNumber: move.moveNumber,
        color: game.color,
        san: move.san,
        bestSan: move.bestMoveSan,
        kind,
        loss: move.winPercentLoss,
      });
    }

    const timed = movesWithClock(game);
    if (timed.length > 0) gamesWithClocks += 1;
    const base = parseTimeControl(game.source.result.metadata.timeControl)?.baseTime ?? null;
    const threshold = pressureThreshold(base);
    for (const move of timed) {
      const left = move.clock !== undefined ? parseDurationToSeconds(move.clock) : null;
      if (left === null) continue;
      (left <= threshold ? pressureMoves : comfortableMoves).push(move);
    }

    trend.push({
      id: key,
      date: game.date,
      opponent: game.opponent,
      color: game.color,
      outcome: game.outcome,
      accuracy: accuracyFromMoves(game.allMoves),
      faults: faultMoves.length,
      moves: game.allMoves.length,
    });

    if (yieldToUi && performance.now() - sliceStart > sliceMs) {
      await yieldToUi();
      sliceStart = performance.now();
    }
  }

  const everyMove = games.flatMap((g) => g.moves);
  const baseline = bucketOf(everyMove);
  const phaseMoves = (phase: GamePhase) => everyMove.filter((m) => phaseOf(m) === phase);
  const phases = {
    opening: bucketOf(phaseMoves('opening')),
    middlegame: bucketOf(phaseMoves('middlegame')),
    endgame: bucketOf(phaseMoves('endgame')),
  };

  const instantMoves = everyMove.filter(
    (m) => m.thinkTimeSeconds !== undefined && m.thinkTimeSeconds <= INSTANT_SECONDS
  );
  const thoughtfulMoves = everyMove.filter(
    (m) => m.thinkTimeSeconds !== undefined && m.thinkTimeSeconds > INSTANT_SECONDS
  );

  const opponentGap = (g: CountedGame) =>
    g.userElo !== null && g.opponentElo !== null ? g.opponentElo - g.userElo : null;
  const rated = games.filter((g) => opponentGap(g) !== null);
  const opponents = {
    stronger: gameBucket(rated.filter((g) => opponentGap(g)! >= ELO_MARGIN)),
    similar: gameBucket(rated.filter((g) => Math.abs(opponentGap(g)!) < ELO_MARGIN)),
    weaker: gameBucket(rated.filter((g) => opponentGap(g)! <= -ELO_MARGIN)),
  };

  const timeControls: Profile['timeControls'] = {};
  for (const cls of ['bullet', 'blitz', 'rapid', 'classical', 'daily'] as const) {
    const inClass = games.filter((g) => classifyTimeControl(g.source.result.metadata.timeControl) === cls);
    if (inClass.length > 0) timeControls[cls] = gameBucket(inClass);
  }

  const wins = trend.filter((g) => g.outcome === 'win').length;
  const draws = trend.filter((g) => g.outcome === 'draw').length;
  const losses = trend.filter((g) => g.outcome === 'loss').length;
  const decided = wins + draws + losses;

  const profile: Profile = {
    counted: games.length,
    ignored,
    overview: {
      accuracy: games.length === 0 ? 0 : mean(trend.map((g) => g.accuracy)),
      wins,
      draws,
      losses,
      score: decided === 0 ? null : (wins + draws / 2) / decided,
      faultsPerGame: games.length === 0 ? 0 : mean(trend.map((g) => g.faults)),
    },
    baseline,
    phases,
    kinds: { counts, total: faults.length },
    worst: faults.sort((a, b) => b.loss - a.loss).slice(0, MAX_WORST),
    colors: {
      w: gameBucket(games.filter((g) => g.color === 'w')),
      b: gameBucket(games.filter((g) => g.color === 'b')),
    },
    time: {
      pressure: bucketOf(pressureMoves),
      comfortable: bucketOf(comfortableMoves),
      instant: bucketOf(instantMoves),
      thoughtful: bucketOf(thoughtfulMoves),
      gamesWithClocks,
    },
    opponents,
    timeControls,
    trend,
    trendChange: trendChangeOf(trend),
    insights: [],
  };
  profile.insights = buildInsights(profile);
  return profile;
}

function trendChangeOf(trend: ProfileGame[]): Profile['trendChange'] {
  if (trend.length < MIN_TREND_GAMES) return null;
  const count = Math.min(TREND_WINDOW, Math.floor(trend.length / 2));
  const recent = trend.slice(-count);
  const previous = trend.slice(-2 * count, -count);
  return {
    count,
    accuracy: { recent: mean(recent.map((g) => g.accuracy)), previous: mean(previous.map((g) => g.accuracy)) },
    faults: { recent: mean(recent.map((g) => g.faults)), previous: mean(previous.map((g) => g.faults)) },
  };
}

const percent = (value: number) => `${Math.round(value)} %`;

const PHASE_LABELS: Record<GamePhase, string> = {
  opening: "l'ouverture",
  middlegame: 'le milieu de jeu',
  endgame: 'la finale',
};

const FAULT_SENTENCES: Record<Exclude<FaultKind, 'other'>, string> = {
  mate: 'sont un mat manqué ou subi',
  hanging: 'laissent une pièce en prise',
  tactic: "passent à côté d'une fourchette, d'un clouage ou d'une pièce adverse à prendre",
  wasted: 'laissent filer une position gagnée',
};

/** Share of the faults, and the least number of them, from which a kind is worth pointing out. */
const MIN_KIND_SHARE = 0.25;
const MIN_KIND_COUNT = 5;
const PHASE_GAP = 3;
const PRESSURE_GAP = 8;
const COLOR_GAP = 5;
const TREND_GAP = 3;

/** The phase to work on: the least accurate one, if it is 3 points under the average and has enough moves. */
export function weakestPhase({ phases, baseline }: Pick<Profile, 'phases' | 'baseline'>): GamePhase | null {
  if (baseline.accuracy === null) return null;
  const weakest = (Object.keys(phases) as GamePhase[])
    .filter((p) => phases[p].moves >= 2 * MIN_BUCKET_MOVES && phases[p].accuracy !== null)
    .sort((a, b) => phases[a].accuracy! - phases[b].accuracy!)[0];
  return weakest && baseline.accuracy - phases[weakest].accuracy! >= PHASE_GAP ? weakest : null;
}

/** The few things worth remembering, from what is measured (only when there are enough moves to say it). */
export function buildInsights(profile: Profile): Insight[] {
  const insights: Insight[] = [];
  const { kinds, baseline, phases, time, colors, trendChange } = profile;

  const dominant = (Object.keys(FAULT_SENTENCES) as Array<keyof typeof FAULT_SENTENCES>)
    .map((kind) => ({ kind, count: kinds.counts[kind] }))
    .sort((a, b) => b.count - a.count)[0];
  if (
    dominant &&
    kinds.total > 0 &&
    dominant.count >= MIN_KIND_COUNT &&
    dominant.count / kinds.total >= MIN_KIND_SHARE
  ) {
    const share = percent((dominant.count / kinds.total) * 100);
    insights.push({
      id: 'fault',
      text: `${share} de vos erreurs (${dominant.count} sur ${kinds.total}) ${FAULT_SENTENCES[dominant.kind]}.`,
    });
  }

  const weakest = weakestPhase(profile);
  if (weakest && baseline.accuracy !== null) {
    insights.push({
      id: 'phase',
      text: `Votre phase la plus fragile est ${PHASE_LABELS[weakest]} : ${percent(phases[weakest].accuracy!)} de précision, contre ${percent(baseline.accuracy)} en moyenne.`,
    });
  }

  const { pressure, comfortable } = time;
  if (
    pressure.moves >= MIN_BUCKET_MOVES &&
    comfortable.moves >= MIN_BUCKET_MOVES &&
    pressure.accuracy !== null &&
    comfortable.accuracy !== null &&
    comfortable.accuracy - pressure.accuracy >= PRESSURE_GAP
  ) {
    insights.push({
      id: 'time',
      text: `Avec peu de temps à la pendule, votre précision tombe à ${percent(pressure.accuracy)} (contre ${percent(comfortable.accuracy)} sinon).`,
    });
  }

  const [white, black] = [colors.w, colors.b];
  if (
    white.moves >= MIN_BUCKET_MOVES &&
    black.moves >= MIN_BUCKET_MOVES &&
    white.accuracy !== null &&
    black.accuracy !== null
  ) {
    const gap = white.accuracy - black.accuracy;
    if (Math.abs(gap) >= COLOR_GAP) {
      const [weak, strong, weakName, strongName] =
        gap > 0 ? [black, white, 'les Noirs', 'les Blancs'] : [white, black, 'les Blancs', 'les Noirs'];
      insights.push({
        id: 'color',
        text: `Avec ${weakName}, vous jouez moins bien : ${percent(weak.accuracy!)} de précision, contre ${percent(strong.accuracy!)} avec ${strongName}.`,
      });
    }
  }

  if (trendChange) {
    const change = trendChange.accuracy.recent - trendChange.accuracy.previous;
    if (Math.abs(change) >= TREND_GAP) {
      const points = Math.round(Math.abs(change));
      insights.push({
        id: 'trend',
        text: `Vos ${trendChange.count} dernières parties : ${percent(trendChange.accuracy.recent)} de précision, ${points} point${points > 1 ? 's' : ''} ${change > 0 ? 'de plus' : 'de moins'} que les ${trendChange.count} précédentes.`,
      });
    }
  }
  return insights;
}
