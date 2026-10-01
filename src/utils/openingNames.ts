import {
  ADJECTIVES,
  COMPLEMENTS,
  CONNECTORS,
  EXPRESSIONS,
  HEADS,
  PIECE_NOUNS,
  PREFIXES,
  type Adjective,
  type Gender,
  type HeadNoun,
} from '../data/openingTerms';
import { toFrenchSan } from './chessNotation';

/**
 * The name of an opening in French. The names of the openings database are English ("Sicilian Defense: Dragon
 * Variation"): the nouns, the adjectives and the nationalities are translated and put in the French order and
 * agreement ("Défense sicilienne : variante Dragon"), and what is a name (of a player, a place, a nickname) is kept
 * as it is. The stored names stay English; this is only for display.
 */

type Token =
  | { kind: 'head'; head: HeadNoun; isPlural: boolean; text: string }
  | { kind: 'adj'; adj: Adjective; text: string }
  | { kind: 'comp'; fr: string; text: string }
  | { kind: 'name'; text: string }
  | { kind: 'move'; fr: string; text: string }
  | { kind: 'connector'; fr: string; text: string };

/** A move written in English algebraic notation ("Nf3", "Bb4+", "Qxd4") or a pawn move ("e6", "dxc4"). */
const PIECE_MOVE = /^[KQRBN][a-h]?[1-8]?x?[a-h][1-8][+#]?$/;
const PAWN_MOVE = /^(?:[a-h]x)?[a-h][1-8]$/;

/** The most words in a key of the lexicon. */
const MAX_WORDS = Math.max(
  ...[...Object.keys(HEADS), ...Object.keys(COMPLEMENTS), ...Object.keys(ADJECTIVES)].map(
    (key) => key.split(' ').length
  )
);

const PLURAL_HEADS = new Set(['Variations', 'Defenses', 'Deviations']);

const capitalize = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** "Anglo-Slav" → a compound adjective, when every part is a prefix or an adjective that agrees. */
function compoundAdjective(word: string): Adjective | null {
  const parts = word.split('-');
  if (parts.length < 2) return null;
  const last = ADJECTIVES[parts[parts.length - 1]];
  const lead = parts.slice(0, -1);
  if (!last || last.m.includes(' ') || !lead.every((part) => part in PREFIXES)) return null;
  const prefix = lead.map((part) => PREFIXES[part]).join('-');
  return { m: `${prefix}-${last.m}`, f: `${prefix}-${last.f ?? last.m}` };
}

/** "Anti-Berlin", "Czech-Indian": the parts that are prefixes or adjectives translated, the names kept. */
function compoundName(word: string): string | null {
  const parts = word.split('-');
  if (parts.length < 2) return null;
  const translated = parts.map((part, index) => {
    if (index < parts.length - 1 && part in PREFIXES) return part === 'Neo' ? 'Néo' : part;
    const adjective = ADJECTIVES[part];
    return adjective && !adjective.m.includes(' ') ? adjective.m : part;
  });
  return capitalize(translated.join('-'));
}

function classify(words: string[], start: number): { token: Token; length: number } {
  // The longest expression of the lexicon that starts here
  for (let size = Math.min(MAX_WORDS, words.length - start); size >= 1; size--) {
    const key = words.slice(start, start + size).join(' ');
    const head = HEADS[key];
    if (head) return { token: { kind: 'head', head, isPlural: PLURAL_HEADS.has(key), text: key }, length: size };
    const complement = COMPLEMENTS[key];
    if (complement) return { token: { kind: 'comp', fr: complement, text: key }, length: size };
    const adjective = size > 1 ? ADJECTIVES[key] : undefined;
    if (adjective) return { token: { kind: 'adj', adj: adjective, text: key }, length: size };
  }
  const word = words[start];
  const adjective = ADJECTIVES[word] ?? compoundAdjective(word);
  if (adjective) return { token: { kind: 'adj', adj: adjective, text: word }, length: 1 };
  const connector = CONNECTORS[word];
  if (connector) return { token: { kind: 'connector', fr: connector, text: word }, length: 1 };
  if (PIECE_MOVE.test(word)) return { token: { kind: 'move', fr: toFrenchSan(word), text: word }, length: 1 };
  if (PAWN_MOVE.test(word)) return { token: { kind: 'move', fr: word, text: word }, length: 1 };
  return { token: { kind: 'name', text: compoundName(word) ?? word }, length: 1 };
}

function tokenize(segment: string): Token[] {
  const words = segment.split(/\s+/).filter(Boolean);
  const tokens: Token[] = [];
  for (let i = 0; i < words.length;) {
    const { token, length } = classify(words, i);
    tokens.push(token);
    i += length;
  }
  // A word of the complements followed by a name is part of a nickname ("Prickly Pawn Pass"), not a complement
  return tokens.map((token, index) =>
    token.kind === 'comp' && tokens[index + 1]?.kind === 'name'
      ? { kind: 'name', text: PIECE_NOUNS[token.text] ?? token.text }
      : token
  );
}

/** An adjective in agreement with the noun. */
function agree(adjective: Adjective, gender: Gender, isPlural: boolean): string {
  const form = gender === 'f' ? (adjective.f ?? adjective.m) : adjective.m;
  if (isPlural && !/[sx]$/.test(form) && !form.includes(' ')) return `${form}s`;
  return form;
}

const isAdjective = (token: Token): token is Extract<Token, { kind: 'adj' }> => token.kind === 'adj';

/** What a token says when it is not a noun or an adjective to agree: its own words. */
function plainText(token: Token, isBesideHead: boolean): string {
  switch (token.kind) {
    case 'comp':
    case 'move':
    case 'connector':
      return token.fr;
    case 'head':
      return token.head.fr;
    case 'adj':
      return token.adj.m;
    case 'name':
      // A possessive name right before the noun ("Keene's Defense") is the name alone; elsewhere it stays as it is
      return isBesideHead ? token.text.replace(/['’]s$/, '') : token.text;
  }
}

/** The nationalities that can stand for the opening itself ("Sicilian" is the Sicilian Defense). */
const NATIONALITY_NOUNS = new Set([
  'Sicilian',
  'French',
  'English',
  'Italian',
  'Spanish',
  'Scandinavian',
  'Slav',
  'Russian',
  'Dutch',
  'Catalan',
  'Indian',
  'Czech',
  'Polish',
  'Scotch',
  'Danish',
  'Vienna',
  'Austrian',
  'Portuguese',
]);

function translateWithHead(tokens: Token[], headIndex: number): string {
  const head = tokens[headIndex] as Extract<Token, { kind: 'head' }>;
  const before = tokens.slice(0, headIndex);
  const after = tokens.slice(headIndex + 1);
  const { gender } = head.head;
  const lastBefore = before[before.length - 1];
  const complements = before.filter((t) => !isAdjective(t)).map((t) => plainText(t, t === lastBefore));
  // Adjectives said before the noun come in the reverse order after it ("Modern Main Line": "ligne principale moderne")
  const adjectives = [...before.filter(isAdjective).reverse(), ...after.filter(isAdjective)].map((t) =>
    agree(t.adj, gender, head.isPlural)
  );
  const others = after.filter((t) => !isAdjective(t)).map((t) => plainText(t, true));
  return [head.head.fr, ...complements, ...others, ...adjectives].join(' ');
}

function translateWithoutHead(tokens: Token[]): string {
  const adjectives = tokens.filter(isAdjective);
  const rest = tokens.filter((t) => !isAdjective(t));
  const last = tokens[tokens.length - 1];

  // A nationality stands for the opening itself: "Sicilian" is "Sicilienne", with its adjectives after it
  if (rest.length === 0 && isAdjective(last) && NATIONALITY_NOUNS.has(last.text)) {
    const others = adjectives.slice(0, -1).reverse();
    return [capitalize(agree(last.adj, 'f', false)), ...others.map((t) => agree(t.adj, 'f', false))].join(' ');
  }

  // Nothing but adjectives and complements: a variation ("Classical" is the classical variation)
  if (rest.every((t) => t.kind === 'comp' || t.kind === 'connector')) {
    return translateWithHead(
      [{ kind: 'head', head: HEADS.Variation, isPlural: false, text: 'Variation' }, ...tokens],
      0
    );
  }

  // Names keep their order, and the adjectives follow them ("Early b3" is "b3 précoce")
  const words = rest.map((t) => plainText(t, false));
  return [...words, ...adjectives.reverse().map((t) => agree(t.adj, 'm', false))].join(' ');
}

/** The French of one part of a name ("Dragon Variation", "with Bf5"). */
function translateSegment(segment: string): string {
  const exact = EXPRESSIONS[segment];
  if (exact) return exact;
  const withMatch = /^with\s+(.*)$/.exec(segment);
  if (withMatch) return `avec ${translateSegment(withMatch[1])}`;

  const tokens = tokenize(segment);
  if (tokens.length === 0) return segment;
  // The noun the part is built around: the last one, followed by nothing but adjectives ("Gambit Accepted")
  let headIndex = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].kind === 'head' && tokens.slice(i + 1).every(isAdjective)) {
      headIndex = i;
      break;
    }
    if (!isAdjective(tokens[i])) break;
  }
  return headIndex >= 0 ? translateWithHead(tokens, headIndex) : translateWithoutHead(tokens);
}

const translated = new Map<string, string>();

/** The French name of an opening ("Sicilian Defense: Dragon Variation" → "Défense sicilienne : variante Dragon"). */
export function toFrenchOpeningName(name: string): string {
  if (!name) return name;
  const known = translated.get(name);
  if (known !== undefined) return known;
  const plain = name.replace(/’/g, "'");
  const colon = plain.indexOf(':');
  const translateParts = (text: string) =>
    text
      .split(',')
      .map((part) => translateSegment(part.trim()))
      .join(', ');
  const family = capitalize(translateParts(colon >= 0 ? plain.slice(0, colon) : plain));
  const result = colon >= 0 ? `${family} : ${translateParts(plain.slice(colon + 1))}` : family;
  translated.set(name, result);
  return result;
}
