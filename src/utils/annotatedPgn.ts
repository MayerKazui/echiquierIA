import type { GameAnalysisResult, MoveAnalysis, MoveClassification } from '../types/chess';
import { parseDurationToSeconds } from './clockUtils';

/**
 * An analysed game as a PGN that carries the analysis: the engine's evaluation (`[%eval]`), the clocks (`[%clk]`),
 * the symbols of the moves (`!!`, `!`, `?!`, `?`, `??`) and the comments of the coach. It is the notation Lichess
 * and most PGN readers (ChessBase, Scid, Lucas Chess…) understand, so the game can be studied elsewhere; nothing is
 * sent anywhere and the PGN holds no link of its own.
 */

export interface AnnotatedPgnOptions {
  /** `[%eval 0.34]` / `[%eval #3]` after each move, from White's point of view. */
  evals: boolean;
  /** `[%clk 0:09:58]`, when the game has clocks. */
  clocks: boolean;
  /** The symbol of the move (`?!`, `?`, `??`, `!`, `!!`) after its notation. */
  glyphs: boolean;
  /** What the coach says of a move: its verdict, the best move, the explanation when there is one. */
  comments: boolean;
}

export const ALL_ANNOTATIONS: AnnotatedPgnOptions = { evals: true, clocks: true, glyphs: true, comments: true };

export interface AnnotatedPgnSource {
  /** The PGN as it was analysed: its headers are kept. */
  pgn: string;
  result: GameAnalysisResult;
  /** Search depth of the analysis, named in the `Annotator` header. */
  depth?: number | null;
}

/** The symbol written after a move; the quiet classifications have none. */
const GLYPHS: Partial<Record<MoveClassification, string>> = {
  brilliant: '!!',
  great: '!',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
  // The win was there and the move let it go: written as a mistake
  missedWin: '?',
};

/** What the coach calls a move, for the ones worth a remark. */
const VERDICTS: Partial<Record<MoveClassification, string>> = {
  brilliant: 'Coup brillant.',
  great: 'Excellent coup.',
  inaccuracy: 'Imprécision.',
  mistake: 'Erreur.',
  blunder: 'Gaffe.',
  missedWin: 'Occasion manquée.',
};

/** The classifications that gave something away: the best move is worth naming. */
const FAULTS: ReadonlySet<MoveClassification> = new Set(['inaccuracy', 'mistake', 'blunder', 'missedWin']);

const SEVEN_TAGS = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'] as const;
/** Written from the analysis, whatever the original PGN said. */
const OWN_TAGS: ReadonlySet<string> = new Set(['ECO', 'Opening', 'Annotator']);
const TAG_LINE = /^\s*\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/;
const LINE_WIDTH = 80;

const quote = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** The tags of a PGN in the order they came, the last one winning when a name is repeated. */
function readTags(pgn: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const line of pgn.replace(/\r\n?/g, '\n').split('\n')) {
    const match = TAG_LINE.exec(line);
    if (match) tags.set(match[1], match[2].replace(/\\(["\\])/g, '$1'));
  }
  return tags;
}

/** `[%eval 0.34]`, or null where the position has no evaluation to give (the game ends on that move). */
export function evalTag(move: Pick<MoveAnalysis, 'san' | 'evalAfter' | 'mateAfter'>): string | null {
  if (move.san.endsWith('#')) return null;
  if (move.mateAfter !== null && move.mateAfter !== undefined && move.mateAfter !== 0)
    return `[%eval #${move.mateAfter}]`;
  if (!Number.isFinite(move.evalAfter)) return null;
  const pawns = Math.max(-99.99, Math.min(99.99, move.evalAfter / 100));
  // "-0.00" would read as a sign of its own
  return `[%eval ${(Math.round(pawns * 100) / 100).toFixed(2).replace(/^-0\.00$/, '0.00')}]`;
}

/** `[%clk 0:09:58]` from the clock as the PGN gave it ("0:09:58", "9:58", "9:58.4"), or null when it cannot be read. */
export function clockTag(clock: string | undefined): string | null {
  if (!clock) return null;
  const seconds = parseDurationToSeconds(clock);
  if (seconds === null || seconds < 0) return null;
  const whole = Math.floor(seconds);
  const tenths = Math.round((seconds - whole) * 10);
  const total = tenths === 10 ? whole + 1 : whole;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const fraction = tenths > 0 && tenths < 10 ? `.${tenths}` : '';
  return `[%clk ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${fraction}]`;
}

/** Text that can sit inside a PGN comment: no brace (it cannot be escaped), no line break. */
export function commentSafe(text: string): string {
  return text
    .replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'))
    .replace(/\s+/g, ' ')
    .trim();
}

function coachText(move: MoveAnalysis): string {
  const parts: string[] = [];
  const verdict = VERDICTS[move.classification];
  if (verdict) parts.push(verdict);
  if (FAULTS.has(move.classification) && move.bestMoveSan && move.bestMoveSan !== move.san) {
    parts.push(`Meilleur coup : ${move.bestMoveSan}.`);
  }
  const explanation = move.aiExplanation;
  if (explanation) {
    if (explanation.concept) parts.push(`Idée : ${explanation.concept}`);
    if (explanation.whyPlayedIsBad) parts.push(explanation.whyPlayedIsBad);
    if (explanation.whyBestIsBetter) parts.push(explanation.whyBestIsBetter);
    if (explanation.plan) parts.push(`Plan : ${explanation.plan}`);
  }
  return commentSafe(parts.join(' '));
}

/** The comment braces of a move, or an empty string when nothing is to be said. */
function commentOf(move: MoveAnalysis, options: AnnotatedPgnOptions): string {
  const parts: string[] = [];
  if (options.evals) {
    const tag = evalTag(move);
    if (tag) parts.push(tag);
  }
  if (options.clocks) {
    const tag = clockTag(move.clock);
    if (tag) parts.push(tag);
  }
  if (options.comments) {
    const text = coachText(move);
    if (text) parts.push(text);
  }
  return parts.length > 0 ? `{ ${parts.join(' ')} }` : '';
}

/** Whether the game has something of each kind to write: what the export dialog can offer. */
export function availableAnnotations(result: GameAnalysisResult): AnnotatedPgnOptions {
  const { moves } = result;
  return {
    evals: moves.some((move) => evalTag(move) !== null),
    clocks: moves.some((move) => clockTag(move.clock) !== null),
    glyphs: moves.some((move) => GLYPHS[move.classification] !== undefined),
    comments: moves.some((move) => coachText(move) !== ''),
  };
}

/** Breaks the movetext into lines between two tokens (a comment is never cut). */
function wrap(tokens: readonly string[]): string {
  const lines: string[] = [];
  let line = '';
  for (const token of tokens) {
    if (line !== '' && line.length + 1 + token.length > LINE_WIDTH) {
      lines.push(line);
      line = token;
    } else {
      line = line === '' ? token : `${line} ${token}`;
    }
  }
  if (line !== '') lines.push(line);
  return lines.join('\n');
}

/** The analysed game as an annotated PGN: the headers of the original PGN, then the moves with what was asked. */
export function gameToAnnotatedPgn(
  { pgn, result, depth }: AnnotatedPgnSource,
  options: AnnotatedPgnOptions = ALL_ANNOTATIONS
): string {
  const original = readTags(pgn);
  const { metadata } = result;
  const gameResult = original.get('Result') ?? metadata.result ?? '*';

  const headers: Array<[string, string]> = [];
  const given = (name: string): string | undefined => {
    if (name === 'Result') return gameResult;
    const fromMetadata: Record<string, string | undefined> = {
      Event: metadata.event,
      Site: metadata.site,
      Date: metadata.date,
      Round: metadata.round,
      White: metadata.white,
      Black: metadata.black,
    };
    return original.get(name) ?? fromMetadata[name];
  };
  for (const name of SEVEN_TAGS) headers.push([name, given(name) || (name === 'Result' ? '*' : '?')]);
  for (const [name, value] of original) {
    if (!(SEVEN_TAGS as readonly string[]).includes(name) && !OWN_TAGS.has(name)) headers.push([name, value]);
  }
  const eco = metadata.eco ?? original.get('ECO');
  const opening = metadata.opening ?? original.get('Opening');
  if (eco) headers.push(['ECO', eco]);
  if (opening) headers.push(['Opening', opening]);
  headers.push(['Annotator', depth ? `Échiquier IA (Stockfish, profondeur ${depth})` : 'Échiquier IA (Stockfish)']);

  const tokens: string[] = [];
  let needsNumber = true;
  for (const move of result.moves) {
    const isWhite = move.color === 'w';
    // Black's move is numbered again after a comment, and at the start of the game
    const number = isWhite ? `${move.moveNumber}.` : needsNumber ? `${move.moveNumber}...` : '';
    const glyph = options.glyphs ? (GLYPHS[move.classification] ?? '') : '';
    // The number and its move stay on one line
    tokens.push(`${number ? `${number} ` : ''}${move.san}${glyph}`);
    const comment = commentOf(move, options);
    if (comment) tokens.push(comment);
    needsNumber = comment !== '';
  }
  tokens.push(gameResult);

  const head = headers.map(([name, value]) => `[${name} "${quote(value)}"]`).join('\n');
  return `${head}\n\n${wrap(tokens)}\n`;
}

/** `Dupont-vs-Martin-2026-10-03.pgn`, safe as a file name. */
export function annotatedPgnFileName(result: GameAnalysisResult): string {
  const { metadata } = result;
  const clean = (value: string | undefined, fallback: string) =>
    (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || fallback;
  const date = /^\d{4}[.-]\d{2}[.-]\d{2}$/.test(metadata.date ?? '') ? (metadata.date ?? '').replace(/\./g, '-') : '';
  return `${clean(metadata.white, 'Blancs')}-vs-${clean(metadata.black, 'Noirs')}${date ? `-${date}` : ''}.pgn`;
}
