import type { CoachParts } from './moveCoach';

/**
 * The part of the "local model" coach that does not depend on a model: what is asked of it, how its answer is read,
 * and the checks that keep it honest.
 *
 * The model never decides anything about the position and never writes a number. It receives the two sentences of the
 * rule-based coach that explain what is going on (every piece, square and move in them was read on the board or given
 * by the engine) and rewrites them more naturally. The evaluation, the lines of moves and the plan stay as the code wrote
 * them. Its answer is shown only if it passes `isGroundedIn`; otherwise the rule-based text stays.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** What the model rewrites: the sentence about the problem (a bad move only) and the one about the idea. */
export interface Rewrite {
  problem: string;
  idea: string;
}

const SYSTEM = [
  "Tu es un entraîneur d'échecs bienveillant. Tu écris en français.",
  'On te donne des FAITS déjà vérifiés par un moteur. Tu les reformules en phrases naturelles et claires, pour un joueur qui progresse.',
  "Règles strictes : n'ajoute aucun coup, aucune case, aucune pièce et aucun chiffre qui ne figure pas dans les FAITS.",
  "Ne parle jamais de l'évaluation, du score ni de pourcentages. N'ajoute aucun conseil.",
  "Garde la notation française des coups (R, D, T, F, C) exactement comme elle est écrite. N'invente aucune variante.",
  'Réponds uniquement dans le format demandé, sans introduction ni conclusion.',
].join('\n');

const EXAMPLE_BAD = {
  facts: [
    'Idée de la position : Fourchette',
    "Ce qui ne va pas : Rg1 passe à côté d'une tactique : Ce5+ créait une fourchette.",
    'Le meilleur coup : Ce5+ amène une fourchette : le Cavalier en e5 attaque en même temps le Roi en g8 et la Dame en d7.',
  ],
  answer: [
    'PROBLEME: Avec Rg1, les Noirs laissent passer une tactique : Ce5+ était une fourchette.',
    'SOLUTION: Ce5+ était le bon coup : le Cavalier en e5 attaque en même temps le Roi en g8 et la Dame en d7.',
  ].join('\n'),
};

const EXAMPLE_GOOD = {
  facts: [
    'Idée de la position : Clouage',
    'Pourquoi le coup est bon : Fg5 crée un clouage : le Cavalier en f6 ne peut pas bouger sans laisser prendre la Dame en d8.',
  ],
  answer:
    'BON: Fg5 est un bon coup : il cloue le Cavalier en f6, qui ne peut pas bouger sans laisser prendre la Dame en d8.',
};

const formatOf = (isGood: boolean) =>
  isGood
    ? 'BON: <2 à 3 phrases>'
    : ['PROBLEME: <1 à 2 phrases sur ce qui ne va pas>', 'SOLUTION: <1 à 2 phrases sur le meilleur coup>'].join('\n');

const asUser = (facts: string[], isGood: boolean) =>
  `FAITS :\n${facts.join('\n')}\n\nFormat de la réponse :\n${formatOf(isGood)}`;

/** The messages to send to the model for an explanation; a good move (no `problem`) needs no criticism. */
export function buildRewriteMessages(parts: CoachParts): ChatMessage[] {
  const isGood = !parts.problem;
  const lines = [`Idée de la position : ${parts.concept}`];
  if (!isGood) lines.push(`Ce qui ne va pas : ${parts.problem}`);
  lines.push(`${isGood ? 'Pourquoi le coup est bon' : 'Le meilleur coup'} : ${parts.idea}`);
  // One worked example: a small model follows a format it has seen far better than one it is told about
  const example = isGood ? EXAMPLE_GOOD : EXAMPLE_BAD;
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: asUser(example.facts, isGood) },
    { role: 'assistant', content: example.answer },
    { role: 'user', content: asUser(lines, isGood) },
  ];
}

/** The answer of the model split into its boxes; null when it did not follow the format. */
export function parseRewrite(answer: string, isGood: boolean): Rewrite | null {
  const text = answer.replace(/\r/g, '').trim();
  const field = (label: string): string | null => {
    const match = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:PROBLEME|SOLUTION|BON)\\s*:|$)`, 'i').exec(
      text
    );
    const value = match?.[1]?.replace(/\s+/g, ' ').trim();
    return value && value.length >= 15 ? value : null;
  };
  if (isGood) {
    const good = field('BON');
    return good ? { problem: '', idea: good } : null;
  }
  const problem = field('PROBLEME');
  const solution = field('SOLUTION');
  return problem && solution ? { problem, idea: solution } : null;
}

// A move or a square: "Cf3", "Dxe5+", "exd5", "O-O-O", "e4", "a8=D"
const MOVE_TOKEN =
  /(?<![\p{L}\p{N}])(?:O-O(?:-O)?|[RDTFC]?[a-h]?[1-8]?x?[a-h][1-8](?:=[DTFC])?[+#]?)(?![\p{L}\p{N}])/gu;
const NUMBER = /\d+(?:[.,]\d+)?/g;
// "le Cavalier en c7", "pion e4": a piece placed on a square
const PIECE_ON_SQUARE =
  /(?<![\p{L}\p{N}])(Cavalier|Dame|Tour|Fou|Roi|pion)\s+(?:en\s+)?([a-h][1-8])(?![\p{L}\p{N}])/giu;
// What the code says about the score: the model has no business with it
const SCORE_WORDS = /évalu\p{L}*|score|pourcent\p{L}*|%|avantage|désavantage/giu;

/** The moves and squares a text mentions, without the signs that do not change the move. */
function movesIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(MOVE_TOKEN)) found.add(match[0].replace(/[+#]$/, ''));
  return found;
}

const numbersIn = (text: string): Set<string> =>
  new Set([...text.matchAll(NUMBER)].map((match) => match[0].replace(',', '.')));

/** The squares inside moves, so that "Cf3" in the source also allows "f3" in the answer. */
function squaresOf(moves: Set<string>): Set<string> {
  const squares = new Set<string>();
  for (const move of moves) for (const match of move.matchAll(/[a-h][1-8]/g)) squares.add(match[0]);
  return squares;
}

const piecesOnSquares = (text: string): Set<string> =>
  new Set([...text.matchAll(PIECE_ON_SQUARE)].map((match) => `${match[1].toLowerCase()} ${match[2]}`));

/**
 * Whether `answer` says nothing the `source` did not, as far as a program can tell:
 * - every move and square it mentions appears in the source;
 * - every number does too;
 * - every "piece on a square" ("le Cavalier en c7") is one the source places there;
 * - it does not talk about the score, which the code writes (unless the source itself does).
 * It cannot tell a correct sentence from a wrong one built with the same words ("le pion prend le Fou" for "le Fou
 * prend le pion"), which is why the model only rephrases and the numbers and lines are not its to write.
 */
export function isGroundedIn(answer: string, source: string): boolean {
  // The score is the code's to tell: the answer may only use the words about it that the source itself uses
  const scoreWords = (text: string) => new Set([...text.matchAll(SCORE_WORDS)].map((match) => match[0].toLowerCase()));
  const allowedScoreWords = scoreWords(source);
  for (const word of scoreWords(answer)) if (!allowedScoreWords.has(word)) return false;
  const allowed = movesIn(source);
  const allowedSquares = squaresOf(allowed);
  for (const move of movesIn(answer)) {
    if (!allowed.has(move) && !allowedSquares.has(move)) return false;
  }
  const allowedNumbers = numbersIn(source);
  for (const number of numbersIn(answer)) if (!allowedNumbers.has(number)) return false;
  const allowedPlaces = piecesOnSquares(source);
  for (const place of piecesOnSquares(answer)) if (!allowedPlaces.has(place)) return false;
  return true;
}

/** The text the answer is checked against: the sentences the model was given. */
export function sourceText(parts: CoachParts): string {
  return [parts.concept, parts.problem, parts.idea].join('\n');
}

/** The pieces with the model's sentences in place of the rule-based ones; numbers, lines and plan are kept. */
export function applyRewrite(parts: CoachParts, rewrite: Rewrite): CoachParts {
  return { ...parts, problem: rewrite.problem || parts.problem, idea: rewrite.idea || parts.idea };
}
