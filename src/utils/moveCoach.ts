import type { Chess, Color, Move, PieceSymbol, Square } from 'chess.js';
import type { MoveAnalysis } from '../types/chess';
import { formatPvToFrench, toFrenchSan } from './chessNotation';
import { chessFromFen } from './chessFromFen';
import { diagnoseFault, FAULT_KIND_TEXT, type FaultDiagnosis } from './faultKinds';
import { phaseOfPosition, type GamePhase } from './gamePhase';
import { VALUE, kingSquareOf, other, pieceSquares, winnable } from './tacticBoard';
import { TACTIC_THEME_TEXT, tacticThemesOfMove, type TacticTheme } from './tacticThemes';
import { toFrenchOpeningName } from './openingNames';
import { winPercentOfEvaluation } from './moveAnalysis';
import { analyzeTacticalThreatsForMove } from './tacticalThreats';

/**
 * The coach: it explains a move in French from what the position and the engine say, with no network and no model.
 * Everything it states is a fact read on the board (a piece left en prise, a fork, a mate missed, the squares involved)
 * or a number from the analysis (the evaluation before and after, the line the engine expects); the sentences around
 * them are written here. A language model could rephrase these facts, but it could not be trusted to find them.
 */

export type CoachExplanation = NonNullable<MoveAnalysis['aiExplanation']>;

/** One line of a deeper search: the score (White's side), the engine's move and the line that follows. */
export interface DeepLine {
  cp: number;
  mate: number | null;
  bestMoveUci: string;
  pv: string[];
}

/** A deeper look at one move: the position before it (the engine's move) and after it (the answer to the move). */
export interface DeepAnalysis {
  depth: number;
  before: DeepLine;
  after: DeepLine;
}

/**
 * The explanation in the pieces it is made of. The sentences (`problem`, `idea`, `plan`) say what is going on; the
 * lines made of numbers and moves (`evalLine`, `replyLine`, `line`) are only ever written by the code from the engine's
 * output, so that whatever rewrites the sentences cannot touch them.
 */
export interface CoachParts {
  concept: string;
  problem: string;
  evalLine: string;
  replyLine: string;
  idea: string;
  line: string;
  plan: string;
}

const GOOD = new Set<MoveAnalysis['classification']>(['brilliant', 'great', 'best', 'excellent', 'good', 'book']);

/* ---------- French words ---------- */

const PIECE_NAME: Record<PieceSymbol, { word: string; feminine: boolean }> = {
  p: { word: 'pion', feminine: false },
  n: { word: 'Cavalier', feminine: false },
  b: { word: 'Fou', feminine: false },
  r: { word: 'Tour', feminine: true },
  q: { word: 'Dame', feminine: true },
  k: { word: 'Roi', feminine: false },
};

/** "le Cavalier", "la Tour". */
const the = (type: PieceSymbol) => `${PIECE_NAME[type].feminine ? 'la' : 'le'} ${PIECE_NAME[type].word}`;
/** "le Cavalier en f3". */
const at = (type: PieceSymbol, square: string) => `${the(type)} en ${square}`;
/** "laissé" / "laissée": the agreement of a participle with the piece. */
const agree = (type: PieceSymbol, word: string) => (PIECE_NAME[type].feminine ? `${word}e` : word);
const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const sideName = (color: Color) => (color === 'w' ? 'les Blancs' : 'les Noirs');
const plural = (count: number, one: string, many: string) => (count > 1 ? many : one);

/** A list in running text: "a, b et c". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/** Same position and move, same wording; a different position, another turn of phrase. */
function pick<T>(options: readonly T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return options[hash % options.length];
}

/* ---------- the board ---------- */

interface Played {
  before: Chess;
  after: Chess;
  move: Move;
}

function play(fen: string, uci: string): Played | null {
  if (!fen || !uci || uci.length < 4) return null;
  try {
    const before = chessFromFen(fen);
    const after = chessFromFen(fen);
    const move = after.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return { before, after, move };
  } catch {
    return null;
  }
}

/** The position with `side` to move, to look at what that side could do. */
function withTurn(chess: Chess, side: Color): Chess | null {
  try {
    const parts = chess.fen().split(' ');
    parts[1] = side;
    parts[3] = '-';
    return chessFromFen(parts.join(' '));
  } catch {
    return null;
  }
}

/** The file has no pawn at all (`own` undefined) or none of `own` colour. */
function fileState(chess: Chess, file: string, own: Color): 'open' | 'half' | 'closed' {
  const pawns = pieceSquares(chess, 'w')
    .concat(pieceSquares(chess, 'b'))
    .filter(({ type, square }) => type === 'p' && square[0] === file)
    .map(({ square }) => chess.get(square)!.color);
  if (pawns.length === 0) return 'open';
  return pawns.includes(own) ? 'closed' : 'half';
}

const CENTRE = new Set(['d4', 'e4', 'd5', 'e5']);
const BACK_RANK: Record<Color, string> = { w: '1', b: '8' };

/** What a move does on the board, as a clause that follows its subject ("prend…", "donne échec…"). */
function whatItDoes({ after, move }: Played): string {
  const mover = move.color;
  const clauses: string[] = [];
  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    clauses.push(`met le Roi à l'abri et rapproche la Tour du centre`);
  } else if (move.promotion) {
    clauses.push(`promeut le pion en ${the(move.promotion)}`);
  } else if (move.captured) {
    clauses.push(`prend ${at(move.captured, move.to)}`);
  } else if (move.piece === 'p' && CENTRE.has(move.to)) {
    clauses.push(`occupe le centre avec le pion ${move.to}`);
  } else if ((move.piece === 'n' || move.piece === 'b') && move.from[1] === BACK_RANK[mover]) {
    clauses.push(`développe ${the(move.piece)} en ${move.to}`);
  } else if (move.piece === 'r') {
    const state = fileState(after, move.to[0], mover);
    if (state === 'open') clauses.push(`place la Tour sur la colonne ${move.to[0]} (ouverte)`);
    else if (state === 'half') clauses.push(`place la Tour sur la colonne ${move.to[0]} (semi-ouverte)`);
  }
  if (clauses.length === 0 && move.piece === 'p') {
    const rank = Number(move.to[1]) + (mover === 'w' ? 1 : -1);
    const controlled = [-1, 1]
      .map((df) => String.fromCharCode(move.to.charCodeAt(0) + df))
      .filter((file) => file >= 'a' && file <= 'h' && rank >= 1 && rank <= 8)
      .map((file) => `${file}${rank}`);
    clauses.push(
      controlled.length > 0
        ? `avance le pion, qui contrôle ${plural(controlled.length, 'la case', 'les cases')} ${listOf(controlled)}`
        : `avance le pion en ${move.to}`
    );
  }
  if (clauses.length === 0) {
    const centre = move.piece !== 'p' && move.piece !== 'k' && CENTRE.has(move.to);
    clauses.push(centre ? `centralise ${the(move.piece)} en ${move.to}` : `place ${the(move.piece)} en ${move.to}`);
  }
  if (after.isCheckmate()) clauses.push('donne mat');
  else if (after.inCheck()) clauses.push('donne échec au Roi');
  return listOf(clauses);
}

/** The pieces `side` could win from a position, with the best capture: material gained, ignoring the long exchanges. */
interface Loss {
  square: Square;
  piece: PieceSymbol;
  by: PieceSymbol;
  from: Square;
  recaptured: boolean;
  net: number;
}

/** The capture the side to move of `chess` makes the most of (net of the recapture), if it wins anything. */
function bestCapture(chess: Chess): Loss | null {
  let best: Loss | null = null;
  for (const reply of chess.moves({ verbose: true })) {
    if (!reply.captured) continue;
    chess.move(reply);
    const recaptured = chess.moves({ verbose: true }).some((m) => m.to === reply.to && m.captured);
    chess.undo();
    const net = VALUE[reply.captured] - (recaptured ? VALUE[reply.piece] : 0);
    if (net > 0 && (!best || net > best.net)) {
      best = { square: reply.to, piece: reply.captured, by: reply.piece, from: reply.from, recaptured, net };
    }
  }
  return best;
}

/* ---------- evaluation ---------- */

/** An evaluation from the mover's side, in words and pawns ("+1,2", "-0,8", "mat en 3"). */
function moverEval(cp: number, mate: number | null, color: Color): string {
  const sign = color === 'w' ? 1 : -1;
  if (mate !== null) return mate * sign > 0 ? `mat en ${Math.abs(mate)}` : `mat subi en ${Math.abs(mate)}`;
  const pawns = (cp * sign) / 100;
  const text = Math.abs(pawns).toFixed(1).replace('.', ',');
  return pawns > 0.049 ? `+${text}` : pawns < -0.049 ? `-${text}` : '0,0';
}

const percent = (value: number) => `${Math.round(value)} %`;

function winPercents(move: MoveAnalysis): { before: number; after: number } {
  return move.color === 'w'
    ? { before: move.winPercentBefore, after: move.winPercentAfter }
    : { before: 100 - move.winPercentBefore, after: 100 - move.winPercentAfter };
}

/* ---------- tactical themes ---------- */

/** A theme in running text, with its article ("une fourchette"). */
const NAMED: Record<TacticTheme, string> = {
  backRankMate: 'un mat du couloir',
  smotheredMate: 'un mat étouffé',
  doubleCheck: 'un double échec',
  discoveredCheck: 'un échec à la découverte',
  discoveredAttack: 'une attaque à la découverte',
  fork: 'une fourchette',
  skewer: 'une enfilade',
  pin: 'un clouage',
  xRayAttack: 'un rayon X',
  attraction: 'une attraction',
  deflection: 'une déviation',
  interference: 'une interférence',
  intermezzo: 'un coup intermédiaire',
  capturingDefender: 'la capture du défenseur',
  overloading: 'une surcharge',
  trappedPiece: 'une pièce piégée',
  hangingPiece: 'une attaque sur une pièce sans défenseur',
  promotion: 'une promotion',
  sacrifice: 'un sacrifice',
};

/**
 * What a tactical theme means in the position of `played`: concrete when the board says it, the definition otherwise,
 * null when the theme is not worth telling (a pawn "pinned" in front of a piece, an attack the board does not confirm).
 */
function themeDetail(theme: TacticTheme, played: Played | null): string | null {
  const text = TACTIC_THEME_TEXT[theme];
  const generic = `${NAMED[theme]} (${lower(text.hint.replace(/\.$/, ''))})`;
  if (!played) return generic;
  const { after, move } = played;
  const mover = move.color;
  try {
    if (theme === 'fork') {
      const turn = withTurn(after, mover);
      const targets = turn
        ? turn
            .moves({ verbose: true, square: move.to })
            .filter((m) => m.captured && VALUE[m.captured] >= 3 && !(m.captured === 'k'))
            .map((m) => at(m.captured!, m.to))
        : [];
      if (after.inCheck()) targets.unshift(`le Roi en ${kingSquareOf(after, other(mover))}`);
      if (targets.length >= 2)
        return `une fourchette : ${at(move.piece, move.to)} attaque en même temps ${listOf(targets)}`;
    }
    if (theme === 'hangingPiece') {
      const loose = analyzeTacticalThreatsForMove(
        played.before.fen(),
        `${move.from}${move.to}${move.promotion ?? ''}`
      ).find((threat) => threat.type === 'hanging' && threat.targetPiece);
      if (!loose) return null;
      const target = loose.targetPiece as PieceSymbol;
      return `${NAMED.hangingPiece} : ${at(target, loose.targetSquare)} est attaqué${agree(target, '')} sans aucun défenseur`;
    }
    if (theme === 'pin') {
      const pin = analyzeTacticalThreatsForMove(
        played.before.fen(),
        `${move.from}${move.to}${move.promotion ?? ''}`
      ).find((threat) => threat.type === 'pin' && threat.targetPiece && threat.pinThroughSquare);
      const behind = pin?.pinThroughSquare ? played.after.get(pin.pinThroughSquare as Square) : null;
      if (pin && !pin.isAbsolutePin && pin.targetPiece === 'p') return null;
      if (pin && behind) {
        return pin.isAbsolutePin
          ? `un clouage : ${at(pin.targetPiece as PieceSymbol, pin.targetSquare)} est cloué${agree(pin.targetPiece as PieceSymbol, '')} devant le Roi et ne peut plus bouger`
          : `un clouage : ${at(pin.targetPiece as PieceSymbol, pin.targetSquare)} ne peut pas bouger sans laisser prendre ${at(behind.type, pin.pinThroughSquare!)}`;
      }
    }
    if (theme === 'doubleCheck') return `un double échec : le Roi adverse ne peut que se déplacer`;
    if (theme === 'promotion' && move.promotion) return `une promotion en ${the(move.promotion)}`;
  } catch {
    // fall back to the definition
  }
  return generic;
}

/** The first of the themes (most telling first) that has something to say about the move. */
function pickTheme(themes: TacticTheme[], played: Played | null): { theme: TacticTheme; detail: string } | null {
  for (const theme of themes) {
    const detail = themeDetail(theme, played);
    if (detail) return { theme, detail };
  }
  return null;
}

/** The name of a theme as the idea of a move. */
const themeConcept = (theme: TacticTheme): string =>
  theme === 'hangingPiece' ? 'Pièce sans défenseur' : TACTIC_THEME_TEXT[theme].label;

/* ---------- the explanation of a bad move ---------- */

interface Context {
  move: MoveAnalysis;
  mover: Color;
  played: Played | null;
  best: Played | null;
  playedSan: string;
  bestSan: string;
  seed: string;
  phase: GamePhase | null;
}

/** "le pion en g2": the piece that takes. */
const taker = (loss: Loss) => at(loss.by, loss.from);

function explainFaultSentence(
  ctx: Context,
  diagnosis: FaultDiagnosis
): { text: string; habit: string; kind?: FaultDiagnosis['kind'] } {
  const { move, mover, played, best, playedSan, bestSan, phase } = ctx;
  const side = sideName(mover);
  const percentages = winPercents(move);

  switch (diagnosis.kind) {
    case 'mate': {
      const sign = mover === 'w' ? 1 : -1;
      if (move.mateBefore !== null && move.mateBefore * sign > 0) {
        const n = Math.abs(move.mateBefore);
        return {
          text: `Avec ${playedSan}, ${side} laissent passer un mat forcé en ${n} ${plural(n, 'coup', 'coups')} : ${bestSan} le donnait.`,
          habit: `Quand le Roi adverse est exposé, chercher d'abord tous les échecs possibles, même ceux qui semblent perdre du matériel.`,
        };
      }
      const n = Math.abs(move.mateAfter ?? 0);
      return {
        text: `${playedSan} permet à l'adversaire de forcer un mat en ${n} ${plural(n, 'coup', 'coups')}.`,
        habit: `Avant de jouer, regarder tous les échecs de l'adversaire contre le Roi des ${side}, pas seulement les prises.`,
      };
    }

    case 'hanging': {
      const loss = played ? bestCapture(chessFromFen(played.after.fen())) : null;
      if (!loss || !played) break;
      const won = played.move.captured;
      if (won && loss.square === played.move.to && VALUE[won] >= VALUE[loss.piece]) {
        // The piece that took is taken back: it is a trade, which the engine's move simply did better
        return {
          text: `${playedSan} prend ${at(won, played.move.to)}, mais ${taker(loss)} reprend : c'est un échange, et ${bestSan} faisait mieux.`,
          habit: `Avant de prendre, compter les attaquants et les défenseurs de ${played.move.to} : un échange n'est bon que s'il sert un plan.`,
          kind: 'exchange',
        };
      }
      const victim = at(loss.piece, loss.square);
      const takerText = taker(loss);
      const it = PIECE_NAME[loss.piece].feminine ? 'la' : 'le';
      const outcome = loss.recaptured
        ? `même si la prise est reprise, l'échange reste gagnant pour l'adversaire`
        : `aucune pièce ne peut reprendre`;
      let cause: string;
      if (loss.square === played.move.to) {
        cause = `${playedSan} place ${the(loss.piece)} en ${loss.square}, où ${takerText} peut ${it} prendre`;
      } else if (played.before.attackers(loss.square, other(mover)).length > 0) {
        cause = `${upper(victim)} était déjà attaqué${agree(loss.piece, '')} et ${playedSan} ne règle pas la menace : ${takerText} peut ${it} prendre`;
      } else {
        cause = `${playedSan} laisse ${victim} sans protection : ${takerText} peut ${it} prendre`;
      }
      return {
        text: `${cause} (${outcome}).`,
        habit: `Avant chaque coup, regarder qui peut prendre sur la case d'arrivée, et si ${victim} reste ${agree(loss.piece, 'défendu')}.`,
      };
    }

    case 'tactic': {
      const theme = diagnosis.theme && diagnosis.theme in TACTIC_THEME_TEXT ? (diagnosis.theme as TacticTheme) : null;
      const label = theme ? NAMED[theme] : 'un coup tactique';
      if (theme && themeDetail(theme, best) === null) {
        // The theme the detector found is not worth telling: say what the engine's move does instead
        return {
          text: `${playedSan} laisse passer ${bestSan}, qui ${best ? whatItDoes(best) : 'était plus fort'}.`,
          habit: `Avant un coup tranquille, passer en revue les échecs, les prises et les attaques doubles.`,
          kind: best?.move.captured ? 'exchange' : 'other',
        };
      }
      return {
        text: `${playedSan} passe à côté d'une tactique : ${bestSan} créait ${label}.`,
        habit: `Avant un coup tranquille, passer en revue les échecs, les prises et les attaques doubles : ici ${bestSan} en cachait une.`,
      };
    }

    case 'wasted':
      return {
        text: `${upper(side)} avaient un net avantage (environ ${percent(percentages.before)} de chances de gagner) ; après ${playedSan}, il retombe à ${percent(percentages.after)}.`,
        habit: `Avec un avantage, choisir le coup le plus sûr : demander ce que l'adversaire menace, puis vérifier que le coup ne l'aide pas.`,
      };

    case 'exchange': {
      if (played?.move.captured) {
        return {
          text: `${playedSan} prend ${at(played.move.captured, played.move.to)}, mais cet échange n'était pas le meilleur choix : ${bestSan} faisait mieux.`,
          habit: `Avant de prendre, compter les attaquants et les défenseurs de ${played.move.to} : prendre n'est utile que si l'échange est favorable.`,
        };
      }
      const target = best?.move.captured && best.move.to;
      return {
        text: target
          ? `${bestSan} prenait ${at(best!.move.captured!, target)}, ce que ${playedSan} laisse passer.`
          : `${playedSan} laisse passer un échange favorable.`,
        habit: `À chaque tour, lister les prises possibles des deux camps avant de jouer un coup tranquille.`,
      };
    }

    case 'king': {
      if (played?.move.piece === 'k' && !played.move.isKingsideCastle() && !played.move.isQueensideCastle()) {
        const rights = played.before.fen().split(' ')[2] ?? '-';
        const canCastle = mover === 'w' ? /[KQ]/.test(rights) : /[kq]/.test(rights);
        return {
          text: `${playedSan} déplace le Roi ${canCastle ? 'et lui fait perdre le droit de roquer' : "hors de l'abri de ses pions"}, alors que ${bestSan} ${best ? whatItDoes(best) : 'était plus sûr'}.`,
          habit: `Garder le Roi à l'abri : le déplacer à la main n'est justifié que si une tactique l'impose.`,
        };
      }
      const bestCastles = best?.move.isKingsideCastle() || best?.move.isQueensideCastle();
      if (bestCastles) {
        return {
          text: `${bestSan} roquait : le Roi aurait été à l'abri et la Tour reliée au jeu, ce que ${playedSan} repousse.`,
          habit: `Roquer tôt : tant que le Roi reste au centre, une ouverture de colonne peut devenir dangereuse.`,
        };
      }
      if (best?.move.piece === 'k') {
        return {
          text:
            phase === 'endgame'
              ? `En finale, le Roi est une pièce active : ${bestSan} le rapprochait de l'action, ce que ${playedSan} ne fait pas.`
              : `${bestSan} mettait le Roi en sécurité en ${best.move.to}, ce que ${playedSan} ne fait pas.`,
          habit: `Avant de jouer, demander où le Roi est le plus utile ou le plus sûr, puis comparer avec le coup envisagé.`,
        };
      }
      if (played?.move.piece === 'p') {
        return {
          text: `${playedSan} avance un pion devant le Roi : cela affaiblit les cases autour de lui, que ${bestSan} laissait protégées.`,
          habit: `Les pions devant le Roi roqué ne se poussent qu'en connaissant leur effet sur les diagonales et les colonnes ouvertes.`,
        };
      }
      return {
        text: `La sécurité du Roi est en cause : ${bestSan} ${best ? whatItDoes(best) : 'était préférable'}.`,
        habit: `Avant de roquer ou de bouger le Roi, vérifier les échecs adverses sur la nouvelle case.`,
      };
    }

    case 'principles': {
      const developed = best?.move.piece === 'n' || best?.move.piece === 'b';
      const castles = best?.move.isKingsideCastle() || best?.move.isQueensideCastle();
      const reason =
        played?.move.piece === 'q'
          ? `sortir la Dame si tôt l'expose aux attaques de pièces mineures`
          : played?.move.piece === 'p' && developed
            ? `un coup de pion de plus retarde le développement des pièces`
            : (played?.move.piece === 'n' || played?.move.piece === 'b') &&
                played.move.from[1] !== BACK_RANK[mover] &&
                undeveloped(played.before, mover).length > 0
              ? `${the(played.move.piece)} bouge une seconde fois alors qu'il reste ${listOf(undeveloped(played.before, mover))} à développer`
              : played?.move.piece === 'k'
                ? `le Roi bouge au lieu de roquer`
                : played?.move.piece === 'p' && /^[ah]/.test(played.move.to)
                  ? `un pion de bord ne développe aucune pièce et ne touche pas au centre`
                  : castles
                    ? `le roque mettait le Roi à l'abri et connectait les Tours`
                    : (played?.move.piece === 'n' || played?.move.piece === 'b') &&
                        played.move.from[1] === BACK_RANK[mover]
                      ? `développer ${the(played.move.piece)} est naturel, mais ${bestSan} était plus précis ici`
                      : `il ne sert ni le développement ni le centre`;
      return {
        text: `Dans l'ouverture, ${playedSan} n'est pas le plus précis : ${reason}.`,
        habit: `Dans l'ouverture : développer une pièce par coup, contrôler le centre, roquer avant la dixième.`,
      };
    }

    case 'technique': {
      const kingBest = best?.move.piece === 'k';
      return {
        text: kingBest
          ? `En finale, le Roi est une pièce active : ${bestSan} le rapprochait de l'action, ce que ${playedSan} ne fait pas.`
          : `En finale, ${playedSan} perd le fil : ${bestSan} ${best ? whatItDoes(best) : 'était plus précis'}.`,
        habit: `En finale, avant de jouer, demander où le Roi est le plus utile et quels pions peuvent devenir passés.`,
      };
    }

    case 'passive': {
      const piece = played?.move.piece ?? 'p';
      return {
        text: `${playedSan} laisse ${the(piece)} sur une case sans avenir (${played?.move.to}) : ${bestSan} ${best ? whatItDoes(best) : 'gardait plus de jeu'}.`,
        habit: `Pour chaque pièce, chercher la case où elle contrôle le plus de cases : ici ${best?.move.to ?? 'une autre case'} valait mieux que ${played?.move.to ?? 'celle-ci'}.`,
      };
    }

    default:
      break;
  }

  return {
    text: `${playedSan} n'est pas le meilleur choix de la position : ${bestSan} ${best ? whatItDoes(best) : 'faisait mieux'}.`,
    habit: `Quand deux coups semblent proches, comparer les menaces qu'ils laissent à l'adversaire.`,
  };
}

/** The mean cost of a move in words, from the evaluation seen by the player who moved it. */
function evalSentence(move: MoveAnalysis, depth?: number): string {
  const before = moverEval(move.evalBefore, move.mateBefore, move.color);
  const after = moverEval(move.evalAfter, move.mateAfter, move.color);
  const lead = depth ? `À la profondeur ${depth}, pour` : 'Pour';
  return `${lead} ${sideName(move.color)}, l'évaluation passe de ${before} à ${after}.`;
}

/* ---------- plan ---------- */

/** The undeveloped minor pieces of `color` (still on their first rank), as "le Cavalier en b1". */
function undeveloped(chess: Chess, color: Color): string[] {
  return pieceSquares(chess, color)
    .filter(({ type, square }) => (type === 'n' || type === 'b') && square[1] === BACK_RANK[color])
    .map(({ type, square }) => at(type, square));
}

/** Pieces of `color` that are attacked and not defended. */
function loose(chess: Chess, color: Color): string[] {
  return pieceSquares(chess, color)
    .filter(({ type }) => type !== 'k' && type !== 'p')
    .filter(
      ({ square }) => chess.attackers(square, other(color)).length > 0 && chess.attackers(square, color).length === 0
    )
    .map(({ type, square }) => at(type, square));
}

/** Pieces of `color` that nobody defends (the targets of the next attack). */
function undefended(chess: Chess, color: Color): string[] {
  return pieceSquares(chess, color)
    .filter(({ type, square }) => type !== 'k' && type !== 'p' && chess.attackers(square, color).length === 0)
    .map(({ type, square }) => at(type, square));
}

/** A pawn of `color` that no enemy pawn can stop (none ahead of it on its file or the files next to it). */
function passedPawns(chess: Chess, color: Color): string[] {
  const enemy = pieceSquares(chess, other(color)).filter(({ type }) => type === 'p');
  return pieceSquares(chess, color)
    .filter(({ type }) => type === 'p')
    .filter(({ square }) => {
      const file = square.charCodeAt(0);
      const rank = Number(square[1]);
      return !enemy.some(({ square: foe }) => {
        if (Math.abs(foe.charCodeAt(0) - file) > 1) return false;
        const ahead = color === 'w' ? Number(foe[1]) > rank : Number(foe[1]) < rank;
        return ahead;
      });
    })
    .map(({ square }) => square);
}

function phaseStep(ctx: Context, phase: GamePhase, after: Chess): string {
  const { mover, move } = ctx;
  if (phase === 'opening') {
    const left = undeveloped(after, mover);
    const castled = ['g', 'c'].includes(kingSquareOf(after, mover)?.[0] ?? '');
    if (left.length > 0)
      return `Terminer le développement : ${listOf(left)} ${plural(left.length, 'attend', 'attendent')} encore${castled ? '' : ', puis roquer'}.`;
    return castled
      ? `Le développement est terminé : relier les Tours et choisir un plan (colonne ouverte, avant-poste, attaque).`
      : `Les pièces sont sorties : roquer pour mettre le Roi à l'abri et relier les Tours.`;
  }
  if (phase === 'endgame') {
    const king = kingSquareOf(after, mover);
    const passed = passedPawns(after, mover);
    if (passed.length > 0)
      return `Faire avancer le pion passé ${passed[0]}, soutenu par le Roi${king ? ` (en ${king})` : ''}.`;
    const theirs = passedPawns(after, other(mover));
    if (theirs.length > 0) return `Arrêter le pion passé adverse en ${theirs[0]} avec le Roi ou une Tour.`;
    return `Centraliser le Roi${king ? ` (il est en ${king})` : ''} et chercher à créer un pion passé.`;
  }
  const sign = mover === 'w' ? 1 : -1;
  const advantage = (ctx.move.evalAfter * sign) / 100;
  const targets = undefended(after, other(mover));
  if (targets.length > 0) return `Viser les pièces adverses sans défenseur : ${listOf(targets.slice(0, 2))}.`;
  if (advantage >= 1.5)
    return `Avec l'avantage (${moverEval(move.evalAfter, move.mateAfter, mover)}), simplifier par des échanges de pièces.`;
  if (advantage <= -1.5)
    return `Avec un désavantage, éviter les échanges et garder des pièces actives pour compliquer.`;
  return `Position équilibrée : améliorer la pièce la moins active avant de lancer une attaque.`;
}

/* ---------- main ---------- */

/** The second step after a good move: what is in danger, what the move threatens, or the checks to watch. */
function safetyStep(ctx: Context, played: Played | null, loosePieces: string[]): string {
  const { mover } = ctx;
  if (loosePieces.length > 0) return `Mettre ${listOf(loosePieces)} à l'abri avant toute chose.`;
  if (!played) return `Vérifier les menaces de l'adversaire avant de poursuivre.`;
  const { after } = played;
  const threatened = winnable(after, mover).map((square) => at(after.get(square)!.type, square));
  if (threatened.length > 0)
    return `Le coup menace ${listOf(threatened.slice(0, 2))} : l'adversaire doit réagir, sinon ${plural(threatened.length, 'elle tombe', 'elles tombent')}.`;
  const checks = after
    .moves({ verbose: true })
    .filter((m) => m.san.includes('+'))
    .map((m) => toFrenchSan(m.san));
  if (checks.length > 0) return `Surveiller les échecs possibles de l'adversaire : ${listOf(checks.slice(0, 3))}.`;
  return `Aucune pièce ${mover === 'w' ? 'blanche' : 'noire'} n'est menacée et l'adversaire n'a aucun échec : la position est solide.`;
}

/** What to do next with the piece that just moved, from its place on the board. */
function followUp(played: Played | null): string {
  if (!played) return `Poursuivre le plan commencé par ce coup.`;
  const { after, move } = played;
  const mover = move.color;
  if (move.isKingsideCastle() || move.isQueensideCastle())
    return `Relier les Tours et les placer sur une colonne ouverte ou semi-ouverte.`;
  if (move.piece === 'k') return `Garder le Roi à l'abri en ${move.to}.`;
  if (move.piece === 'p') {
    const defenders = after.attackers(move.to, mover).length;
    return defenders === 0
      ? `Soutenir le pion ${move.to} : aucune pièce ne le défend pour l'instant.`
      : `Le pion ${move.to} est défendu ${defenders} fois : s'en servir pour gagner de l'espace.`;
  }
  const turn = withTurn(after, mover);
  const squares = turn ? turn.moves({ verbose: true, square: move.to }).length : 0;
  return squares > 0
    ? `Garder ${at(move.piece, move.to)} actif : il dispose de ${squares} ${plural(squares, 'coup', 'coups')}.`
    : `Chercher une meilleure case pour ${the(move.piece)} en ${move.to}, qui n'a aucun coup.`;
}

/** What to do once the engine's move is played, when the line is too short to say: the targets, or the plan of the phase. */
function afterBest(ctx: Context, phase: GamePhase | null): string {
  const { best, bestSan, mover } = ctx;
  if (!best) return `Après ${bestSan}, reprendre l'analyse de la position.`;
  const targets = undefended(best.after, other(mover));
  if (targets.length > 0)
    return `Après ${bestSan}, viser les pièces adverses sans défenseur : ${listOf(targets.slice(0, 2))}.`;
  return phaseStep(ctx, phase ?? 'middlegame', best.after);
}

/** Text for a good move. */
function explainGoodMove(ctx: Context, phase: GamePhase | null): CoachParts {
  const { move, played, best, playedSan, bestSan, mover, seed } = ctx;
  const themes = tacticThemesOfMove(move.fenBefore, move.uci);
  const picked = pickTheme(themes, played);
  const theme = picked?.theme ?? null;
  const does = played ? whatItDoes(played) : `joue ${playedSan}`;
  const detail = picked?.detail ?? null;
  const isBest = !move.bestMoveSan || move.bestMoveSan === move.san || move.bestMoveUci === move.uci;

  let lead: string;
  if (move.classification === 'book') {
    const name = move.openingName ? toFrenchOpeningName(move.openingName) : '';
    lead = `${playedSan} est un coup de théorie${name ? ` (${name})` : ''} : il ${does}.`;
  } else if (move.classification === 'brilliant') {
    lead = `${playedSan} est un coup brillant : ${detail ?? `il ${does}`}, et le moteur confirme que ce choix audacieux est bon.`;
  } else if (detail) {
    lead = `${playedSan} ${pick(['amène', 'crée', 'réalise'], seed)} ${detail}.`;
  } else {
    lead = `${playedSan} ${does}.`;
  }

  const parts = [lead];
  if (!isBest && best) {
    parts.push(
      `Le moteur préférait légèrement ${bestSan} (qui ${whatItDoes(best)}), mais ${playedSan} reste un bon choix.`
    );
  }
  const loosePieces = played ? loose(played.after, mover) : [];
  if (loosePieces.length > 0)
    parts.push(
      `Attention : ${listOf(loosePieces)} ${plural(loosePieces.length, 'est', 'sont')} attaqué${loosePieces.length > 1 ? 's' : ''} sans défenseur.`
    );

  const frenchPv =
    move.pv.length > 0 ? formatPvToFrench(move.fenBefore, move.pv, 3, false).split(' ').filter(Boolean) : [];
  const steps: string[] = [];
  if (isBest && frenchPv.length >= 3) {
    steps.push(`Si l'adversaire répond ${frenchPv[1]}, continuer par ${frenchPv[2]}.`);
  } else if (isBest && frenchPv.length === 2) {
    steps.push(`La réponse attendue de l'adversaire est ${frenchPv[1]} : s'y préparer avant de poursuivre.`);
  } else {
    steps.push(followUp(played));
  }
  steps.push(safetyStep(ctx, played, loosePieces));
  steps.push(phaseStep(ctx, phase ?? 'middlegame', played?.after ?? chessFromFen(move.fenAfter)));

  const concept = theme
    ? themeConcept(theme)
    : move.classification === 'book'
      ? 'Théorie de l’ouverture'
      : phase === 'opening'
        ? 'Développement du jeu'
        : phase === 'endgame'
          ? 'Technique de finale'
          : 'Coup précis';

  return {
    concept,
    problem: '',
    evalLine: '',
    replyLine: '',
    idea: parts.join(' '),
    line: '',
    plan: steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
  };
}

/** Text for a move that cost something. */
function explainBadMove(ctx: Context, phase: GamePhase | null, deep?: DeepAnalysis): CoachParts {
  const { move, best, bestSan, playedSan, mover, played } = ctx;
  const diagnosis = diagnoseFault(move);
  const { text, habit, kind } = explainFaultSentence(ctx, diagnosis);

  const themes = best ? tacticThemesOfMove(move.fenBefore, move.bestMoveUci) : [];
  const playedThemes = new Set(tacticThemesOfMove(move.fenBefore, move.uci));
  const picked = pickTheme(
    [...themes.filter((candidate) => !playedThemes.has(candidate)), ...themes.filter((c) => playedThemes.has(c))],
    best
  );
  const does = best ? whatItDoes(best) : '';
  const mateGiven = move.mateBefore !== null && move.mateBefore * (mover === 'w' ? 1 : -1) > 0;

  const why: string[] = [];
  const idea = picked?.detail ?? null;
  why.push(
    idea
      ? `${bestSan} amène ${idea}.`
      : `${bestSan} est le coup du moteur : il ${does || 'garde la position sous contrôle'}.`
  );
  if (diagnosis.kind === 'hanging' && best && !bestCapture(chessFromFen(best.after.fen())))
    why.push(`Il ne laisse aucune pièce en prise.`);
  if (mateGiven) why.push(`Il garde le mat forcé en main.`);

  const frenchPv = move.pv.length > 0 ? formatPvToFrench(move.fenBefore, move.pv, 4, true) : '';
  const line = move.pv.length >= 2 && frenchPv ? `Suite probable : ${frenchPv}.` : '';
  // What the opponent does after the move played: only a search of the position after it can say
  const reply =
    deep && played && deep.after.pv.length > 0 ? formatPvToFrench(played.after.fen(), deep.after.pv, 4, true) : '';
  const replyLine = reply ? `Réponse la plus forte après ${playedSan} : ${reply}.` : '';

  const tokens =
    move.pv.length > 0 ? formatPvToFrench(move.fenBefore, move.pv, 3, false).split(' ').filter(Boolean) : [];
  const steps = [`Jouer ${bestSan} à la place de ${playedSan} : il ${does || 'garde la position saine'}.`];
  steps.push(
    tokens.length >= 3
      ? `Après ${bestSan}, la réponse attendue est ${tokens[1]} ; poursuivre alors par ${tokens[2]}.`
      : afterBest(ctx, phase)
  );
  steps.push(habit || phaseStep(ctx, phase ?? 'middlegame', played?.after ?? chessFromFen(move.fenAfter)));

  const concept =
    !kind && diagnosis.kind === 'tactic' && diagnosis.theme && diagnosis.theme in TACTIC_THEME_TEXT
      ? themeConcept(diagnosis.theme as TacticTheme)
      : FAULT_KIND_TEXT[kind ?? diagnosis.kind].label;

  return {
    concept,
    problem: text,
    evalLine: evalSentence(move, deep?.depth),
    replyLine,
    idea: why.join(' '),
    line,
    plan: steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
  };
}

/** The move with the numbers and the lines of a deeper search in place of those of the game's analysis. */
function refined(move: MoveAnalysis, deep: DeepAnalysis): MoveAnalysis {
  let bestMoveSan = move.bestMoveSan;
  if (deep.before.bestMoveUci && deep.before.bestMoveUci !== move.bestMoveUci) {
    bestMoveSan = play(move.fenBefore, deep.before.bestMoveUci)?.move.san ?? deep.before.bestMoveUci;
  }
  const winBefore = winPercentOfEvaluation(deep.before.cp, deep.before.mate);
  const winAfter = winPercentOfEvaluation(deep.after.cp, deep.after.mate);
  const sign = move.color === 'w' ? 1 : -1;
  return {
    ...move,
    evalBefore: deep.before.cp,
    mateBefore: deep.before.mate,
    evalAfter: deep.after.cp,
    mateAfter: deep.after.mate,
    bestMoveUci: deep.before.bestMoveUci || move.bestMoveUci,
    bestMoveSan,
    pv: deep.before.pv.length > 0 ? deep.before.pv : move.pv,
    centipawnLoss: Math.max(0, Math.round((deep.before.cp - deep.after.cp) * sign)),
    winPercentBefore: Math.round(winBefore),
    winPercentAfter: Math.round(winAfter),
    winPercentLoss: Math.max(0, Math.round((winBefore - winAfter) * sign)),
  };
}

/**
 * The coach's comment on a move in its pieces. With `deep` (a search of the position before and after the move at a
 * chosen depth) the scores, the engine's move and its line come from that search, and the answer to the move played
 * is told too. Everything is computed on the spot.
 */
export function coachParts(original: MoveAnalysis, deep?: DeepAnalysis): CoachParts {
  const move = deep ? refined(original, deep) : original;
  const played = play(move.fenBefore, move.uci);
  const hasAlternative = Boolean(move.bestMoveUci) && move.bestMoveUci !== move.uci;
  const best = hasAlternative ? play(move.fenBefore, move.bestMoveUci) : null;
  let phase: GamePhase | null = move.phase ?? null;
  if (!phase) {
    try {
      phase = phaseOfPosition(move.fenBefore);
    } catch {
      phase = null;
    }
  }
  const ctx: Context = {
    move,
    mover: move.color,
    played,
    best,
    playedSan: toFrenchSan(move.san),
    bestSan: toFrenchSan(move.bestMoveSan || move.san),
    seed: `${move.fenBefore} ${move.uci}`,
    phase,
  };
  return GOOD.has(move.classification) || !hasAlternative
    ? explainGoodMove(ctx, phase)
    : explainBadMove(ctx, phase, deep);
}

/** The pieces put together in the three boxes of the coach. */
export function composeExplanation(parts: CoachParts): CoachExplanation {
  return {
    concept: parts.concept,
    whyPlayedIsBad: [parts.problem, parts.evalLine, parts.replyLine].filter(Boolean).join(' '),
    whyBestIsBetter: [parts.idea, parts.line].filter(Boolean).join(' '),
    plan: parts.plan,
  };
}

/** The coach's comment on a move: the idea, why the move is bad (empty for a good move), why the engine's move (or the move itself) is right, and a three-step plan. */
export const explainMove = (move: MoveAnalysis, deep?: DeepAnalysis): CoachExplanation =>
  composeExplanation(coachParts(move, deep));
