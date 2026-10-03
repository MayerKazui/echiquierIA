import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { FAULT_CLASSIFICATIONS, classifyFault, type FaultKind } from './faultKinds';
import type { PhaseStats } from './phaseStats';
import type { GamePhase } from './gamePhase';

/**
 * The few lines that open the summary of a game: the decisive moment, how the player did against their own
 * average, and what they gave away.
 */

/** Stored games needed before the average is worth comparing with. */
export const MIN_GAMES_FOR_AVERAGE = 3;
/** Accuracy (points) from which a game counts as above or below the average. */
const AVERAGE_MARGIN = 1;
/** A phase this many points under the game's accuracy is named as the weak one. */
const PHASE_GAP = 5;
/** Moves a phase needs for its accuracy to say something. */
const MIN_PHASE_MOVES = 5;

type Side = 'w' | 'b';

const FAULT_PHRASE: Record<FaultKind, string> = {
  mate: 'mat manqué ou subi',
  hanging: 'pièce laissée en prise',
  tactic: 'tactique manquée',
  wasted: 'avantage gâché',
  other: 'erreur de calcul ou de position',
};

const PHASE_NAME: Record<GamePhase, string> = {
  opening: "l'ouverture",
  middlegame: 'le milieu de jeu',
  endgame: 'la finale',
};

/** The move that gave away the most (a mistake, a blunder or a miss), by either side; null when there is none. */
export function findDecisiveMove(moves: MoveAnalysis[]): MoveAnalysis | null {
  let decisive: MoveAnalysis | null = null;
  for (const move of moves) {
    if (!FAULT_CLASSIFICATIONS.has(move.classification)) continue;
    if (!decisive || move.winPercentLoss > decisive.winPercentLoss) decisive = move;
  }
  return decisive;
}

/** "+2,8", "−0,4", "mat en 3" / "mat subi en 3", seen from `side`. */
export function formatEval(centipawns: number, mate: number | null, side: Side): string {
  const sign = side === 'w' ? 1 : -1;
  if (mate !== null) return mate * sign > 0 ? `mat en ${Math.abs(mate)}` : `mat subi en ${Math.abs(mate)}`;
  const pawns = Math.round((centipawns * sign) / 10) / 10;
  const text = Math.abs(pawns).toFixed(1).replace('.', ',');
  return pawns > 0 ? `+${text}` : pawns < 0 ? `−${text}` : text;
}

const WORDS_PLURAL = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

function decisiveLine(move: MoveAnalysis | null, side: Side, isPlayerKnown: boolean): string {
  if (!move) return 'Moment décisif : aucune erreur nette, la partie ne s’est pas jouée sur un coup.';
  const number = `${move.moveNumber}${move.color === 'b' ? '...' : '.'} ${move.san}`;
  const who = move.color === 'w' ? 'Blancs' : 'Noirs';
  const owner = isPlayerKnown ? (move.color === side ? 'votre coup' : "coup de l'adversaire") : `coup des ${who}`;
  const from = formatEval(move.evalBefore, move.mateBefore, side);
  const to = formatEval(move.evalAfter, move.mateAfter, side);
  const kind = FAULT_PHRASE[move.faultKind ?? classifyFault(move)];
  const perspective = isPlayerKnown ? '' : ' (côté Blancs)';
  return `Moment décisif : ${number}, ${owner} : ${from} puis ${to}${perspective}, ${kind}.`;
}

function comparisonLine(accuracy: number, average: { accuracy: number; games: number } | null): string {
  const shown = `Précision de ${Math.round(accuracy)} %`;
  if (!average || average.games < MIN_GAMES_FOR_AVERAGE) return `${shown}.`;
  const gap = accuracy - average.accuracy;
  const context = `${Math.round(average.accuracy)} % sur ${average.games} autres parties`;
  if (Math.abs(gap) < AVERAGE_MARGIN) return `${shown}, dans votre moyenne (${context}).`;
  const points = Math.round(Math.abs(gap));
  const unit = `point${points > 1 ? 's' : ''}`;
  return `${shown}, ${Math.max(points, 1)} ${unit} ${gap > 0 ? 'au-dessus de' : 'sous'} votre moyenne (${context}).`;
}

function faultsLine(moves: MoveAnalysis[], side: Side, accuracy: number, phaseStats: PhaseStats): string {
  const own = moves.filter((m) => m.color === side);
  const count = (...classes: MoveAnalysis['classification'][]) =>
    own.filter((m) => classes.includes(m.classification)).length;
  const blunders = count('blunder');
  const misses = count('missedWin');
  const mistakes = count('mistake');
  const parts = [
    blunders && WORDS_PLURAL(blunders, 'gaffe', 'gaffes'),
    mistakes && WORDS_PLURAL(mistakes, 'erreur', 'erreurs'),
    misses && WORDS_PLURAL(misses, 'occasion manquée', 'occasions manquées'),
  ].filter(Boolean);
  const faults = parts.length === 0 ? 'Aucune gaffe ni erreur' : `Vos fautes : ${parts.join(', ')}`;

  const weakest = (['opening', 'middlegame', 'endgame'] as const)
    .map((phase) => {
      const stat = phaseStats[phase];
      return {
        phase,
        moves: side === 'w' ? stat.whiteCount : stat.blackCount,
        accuracy: side === 'w' ? stat.whiteAccuracy : stat.blackAccuracy,
      };
    })
    .filter((p) => p.moves >= MIN_PHASE_MOVES && p.accuracy !== null)
    .sort((a, b) => a.accuracy! - b.accuracy!)[0];
  if (weakest && accuracy - weakest.accuracy! >= PHASE_GAP) {
    return `${faults} ; le plus fragile : ${PHASE_NAME[weakest.phase]} (${Math.round(weakest.accuracy!)} %).`;
  }
  return `${faults}.`;
}

/**
 * The lines of the headline. `side` is the player's colour, null when they cannot be told from the names (then only
 * the decisive moment is given, seen from White). `average` is the player's accuracy in their other stored games.
 */
export function buildGameHeadline(
  analysis: GameAnalysisResult,
  side: Side | null,
  average: { accuracy: number; games: number } | null,
  phaseStats: PhaseStats
): string[] {
  const lines = [decisiveLine(findDecisiveMove(analysis.moves), side ?? 'w', side !== null)];
  if (side === null) return lines;
  const stats = side === 'w' ? analysis.statsWhite : analysis.statsBlack;
  lines.push(comparisonLine(stats.accuracy, average), faultsLine(analysis.moves, side, stats.accuracy, phaseStats));
  return lines;
}
