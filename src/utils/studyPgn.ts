import type { Study, StudyChapter, StudyNode, StudyShape } from '../types/study';
import { START_FEN, createRoot, isValidFen, makeNode, moveLabel, newId } from './studyTree';

/**
 * PGN with variations, comments and annotation glyphs, as Lichess writes a study (one game per chapter).
 * `chess.js` keeps the main line only, so this reads the movetext itself and uses `chess.js` to play the moves.
 */

export interface ParsedStudyPgn {
  /** The name of the study when the PGN gives one (`StudyName`, or the start of `Event` before the colon). */
  name?: string;
  chapters: StudyChapter[];
  /** What was left out or cut short, in French, ready to show. */
  warnings: string[];
}

interface RawGame {
  headers: Record<string, string>;
  movetext: string;
}

const TAG = /\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]/y;

/** Splits a PGN text into games: the headers, then the movetext up to the next header block. */
function splitGames(text: string): RawGame[] {
  const games: RawGame[] = [];
  let headers: Record<string, string> = {};
  let movetext = '';
  let inMoves = false;
  const flush = () => {
    if (inMoves || Object.keys(headers).length > 0) games.push({ headers, movetext });
    headers = {};
    movetext = '';
    inMoves = false;
  };

  const source = text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '{') {
      const close = source.indexOf('}', i);
      const end = close < 0 ? source.length : close + 1;
      movetext += source.slice(i, end);
      inMoves = true;
      i = end;
    } else if (c === ';') {
      const close = source.indexOf('\n', i);
      const end = close < 0 ? source.length : close;
      movetext += source.slice(i, end) + '\n';
      inMoves = true;
      i = end;
    } else if (c === '[') {
      TAG.lastIndex = i;
      const match = TAG.exec(source);
      if (!match) {
        i += 1;
        continue;
      }
      if (inMoves) flush();
      headers[match[1]] = match[2].replace(/\\(["\\])/g, '$1');
      i = TAG.lastIndex;
    } else {
      if (!/\s/.test(c)) inMoves = true;
      movetext += c;
      i += 1;
    }
  }
  flush();
  return games;
}

type Token =
  | { kind: 'comment'; text: string }
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'nag'; value: number }
  | { kind: 'result' }
  | { kind: 'move'; san: string; nags: number[] };

const SUFFIX_NAGS: Record<string, number> = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

function tokenize(movetext: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < movetext.length) {
    const c = movetext[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (c === '{') {
      const close = movetext.indexOf('}', i);
      const end = close < 0 ? movetext.length : close;
      tokens.push({ kind: 'comment', text: movetext.slice(i + 1, end) });
      i = end + 1;
    } else if (c === ';') {
      const close = movetext.indexOf('\n', i);
      const end = close < 0 ? movetext.length : close;
      tokens.push({ kind: 'comment', text: movetext.slice(i + 1, end) });
      i = end;
    } else if (c === '%' && (i === 0 || movetext[i - 1] === '\n')) {
      const close = movetext.indexOf('\n', i);
      i = close < 0 ? movetext.length : close;
    } else if (c === '(') {
      tokens.push({ kind: 'open' });
      i += 1;
    } else if (c === ')') {
      tokens.push({ kind: 'close' });
      i += 1;
    } else if (c === '$') {
      let j = i + 1;
      while (j < movetext.length && /\d/.test(movetext[j])) j += 1;
      const value = Number(movetext.slice(i + 1, j));
      if (j > i + 1) tokens.push({ kind: 'nag', value });
      i = Math.max(j, i + 1);
    } else {
      let j = i;
      while (j < movetext.length && !/[\s(){;$]/.test(movetext[j])) j += 1;
      const word = movetext.slice(i, j);
      i = j;
      if (RESULTS.has(word)) {
        tokens.push({ kind: 'result' });
        continue;
      }
      // "12." and "12..." (also glued to the move: "12.Nf3"), and a bare "…"
      let san = word
        .replace(/^\d+\.+/, '')
        .replace(/^\.+/, '')
        .replace(/^…/, '');
      if (san === '' || /^\d+$/.test(san)) continue;
      const nags: number[] = [];
      const suffix = /[!?]+$/.exec(san);
      if (suffix) {
        san = san.slice(0, suffix.index);
        const nag = SUFFIX_NAGS[suffix[0]];
        if (nag) nags.push(nag);
      }
      san = san.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
      tokens.push({ kind: 'move', san, nags });
    }
  }
  return tokens;
}

const BRUSHES = new Set(['G', 'R', 'Y', 'B']);

/** Separates the drawing commands ([%cal], [%csl]) of a comment from its text, and drops the clock ones. */
export function readComment(raw: string): { text: string; shapes: StudyShape[] } {
  const shapes: StudyShape[] = [];
  const text = raw
    .replace(/\[%(\w+)\s+([^\]]*)\]/g, (_whole, command: string, args: string) => {
      if (command === 'cal' || command === 'csl') {
        for (const item of args.split(',')) {
          const code = item.trim();
          if (!BRUSHES.has(code[0])) continue;
          const squares = code.slice(1);
          if (command === 'cal' && /^[a-h][1-8][a-h][1-8]$/.test(squares)) {
            shapes.push({ brush: code[0] as StudyShape['brush'], from: squares.slice(0, 2), to: squares.slice(2) });
          } else if (command === 'csl' && /^[a-h][1-8]$/.test(squares)) {
            shapes.push({ brush: code[0] as StudyShape['brush'], from: squares, to: squares });
          }
        }
      }
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { text, shapes };
}

function withComment(node: StudyNode, raw: string): StudyNode {
  const { text, shapes } = readComment(raw);
  const next: StudyNode = { ...node };
  if (text) next.comment = next.comment ? `${next.comment} ${text}` : text;
  if (shapes.length > 0) next.shapes = [...(next.shapes ?? []), ...shapes];
  return next;
}

interface Cursor {
  /** The node the next move is played from. */
  at: StudyNode;
  /** The last move played, and the node it was played from (a variation replaces it). */
  last: StudyNode | null;
  before: StudyNode | null;
}

/** The tree of one game. It is built with mutable nodes: it is not shared with anything yet. */
function buildTree(
  movetext: string,
  fen: string,
  chapterName: string,
  warnings: string[]
): { root: StudyNode; moves: number } {
  const root = createRoot(fen);
  const edit = (node: StudyNode, change: (n: StudyNode) => StudyNode): void => {
    Object.assign(node, change(node));
  };

  let cursor: Cursor = { at: root, last: null, before: null };
  const stack: Cursor[] = [];
  /** Depth of the line being skipped after an illegal move (0: not skipping). */
  let skipDepth = 0;
  let moves = 0;
  let isWarned = false;

  const warn = (message: string) => {
    if (isWarned) return;
    isWarned = true;
    warnings.push(`Chapitre « ${chapterName} » : ${message}`);
  };

  for (const token of tokenize(movetext)) {
    if (token.kind === 'result') break;
    if (skipDepth > 0) {
      if (token.kind === 'open') skipDepth += 1;
      else if (token.kind === 'close') {
        skipDepth -= 1;
        if (skipDepth === 0) cursor = stack.pop() ?? cursor;
      }
      continue;
    }
    switch (token.kind) {
      case 'comment': {
        // Before the first move the comment introduces the chapter; one opening a variation has nothing to attach to
        const target = cursor.last ?? (moves === 0 && stack.length === 0 ? root : null);
        if (target) edit(target, (n) => withComment(n, token.text));
        break;
      }
      case 'nag':
        if (cursor.last) {
          edit(cursor.last, (n) => ({ ...n, nags: [...(n.nags ?? []), token.value] }));
        }
        break;
      case 'open':
        if (!cursor.last || !cursor.before) {
          warn('une variante sans coup avant elle est ignorée.');
          skipDepth = 1;
          stack.push(cursor);
        } else {
          stack.push(cursor);
          cursor = { at: cursor.before, last: null, before: null };
        }
        break;
      case 'close':
        if (stack.length > 0) cursor = stack.pop() as Cursor;
        break;
      case 'move': {
        const existing = cursor.at.children.find((c) => c.san === token.san);
        const node = existing ?? makeNode(cursor.at, token.san);
        if (!node) {
          warn(`coup illégal « ${moveLabel(cursor.at.fen, token.san)} », la suite de cette ligne est ignorée.`);
          // In a variation: skip to its closing bracket, then go on with the line it was cut from.
          // In the main line: skip everything that follows.
          skipDepth = stack.length === 0 ? Number.MAX_SAFE_INTEGER : 1;
          break;
        }
        if (!existing) {
          cursor.at.children.push(node);
          moves += 1;
        }
        if (token.nags.length > 0) edit(node, (n) => ({ ...n, nags: [...(n.nags ?? []), ...token.nags] }));
        cursor = { at: node, last: node, before: cursor.at };
        break;
      }
    }
  }
  return { root, moves };
}

function chapterNameOf(headers: Record<string, string>, index: number): string {
  const named = headers.ChapterName?.trim();
  if (named) return named;
  const event = headers.Event?.trim();
  if (event && event !== '?') {
    const colon = event.indexOf(':');
    return (colon >= 0 ? event.slice(colon + 1).trim() : event) || `Chapitre ${index + 1}`;
  }
  const white = headers.White?.trim();
  const black = headers.Black?.trim();
  if (white && black && white !== '?' && black !== '?') return `${white} – ${black}`;
  return `Chapitre ${index + 1}`;
}

/** Reads a PGN (a game, or a whole study with a game per chapter) into chapters; what cannot be read is reported. */
export function parseStudyPgn(text: string): ParsedStudyPgn {
  const warnings: string[] = [];
  const chapters: StudyChapter[] = [];
  let name: string | undefined;

  splitGames(text).forEach((game, index) => {
    const { headers } = game;
    const chapterName = chapterNameOf(headers, index);
    if (headers.Variant && !/^(standard|chess)$/i.test(headers.Variant.trim())) {
      warnings.push(`Chapitre « ${chapterName} » : la variante « ${headers.Variant} » n'est pas prise en charge.`);
      return;
    }
    let fen = START_FEN;
    if (headers.FEN) {
      if (isValidFen(headers.FEN)) fen = headers.FEN;
      else {
        warnings.push(`Chapitre « ${chapterName} » : position de départ invalide, chapitre ignoré.`);
        return;
      }
    }
    const { root, moves } = buildTree(game.movetext, fen, chapterName, warnings);
    if (moves === 0 && !root.comment && !headers.FEN && !headers.ChapterName) return;
    name ??= headers.StudyName?.trim() || undefined;
    if (!name && headers.Event && headers.Event !== '?' && headers.Event.includes(':')) {
      name = headers.Event.slice(0, headers.Event.indexOf(':')).trim() || undefined;
    }
    chapters.push({
      id: newId(),
      name: chapterName,
      orientation: /^black$/i.test(headers.Orientation ?? '') ? 'b' : 'w',
      root,
    });
  });

  return { name, chapters, warnings };
}

const quote = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function shapeCommands(shapes: readonly StudyShape[] | undefined): string {
  if (!shapes || shapes.length === 0) return '';
  const circles = shapes.filter((s) => s.from === s.to).map((s) => `${s.brush}${s.from}`);
  const arrows = shapes.filter((s) => s.from !== s.to).map((s) => `${s.brush}${s.from}${s.to}`);
  return [
    circles.length > 0 ? `[%csl ${circles.join(',')}]` : '',
    arrows.length > 0 ? `[%cal ${arrows.join(',')}]` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** `{ ... }` for the comment and shapes of a node, or '' when there is nothing to say. */
function commentText(node: StudyNode): string {
  const parts = [shapeCommands(node.shapes), node.comment?.replace(/\}/g, ')').trim()].filter(Boolean);
  return parts.length > 0 ? `{ ${parts.join(' ')} }` : '';
}

/** The moves of the continuations of `parent`, the main one first and then the variations in brackets. */
function writeLine(parent: StudyNode, forceNumber: boolean, out: string[]): void {
  const [main, ...variations] = parent.children;
  if (!main) return;
  const isWhite = parent.fen.split(' ')[1] !== 'b';
  const number = parent.fen.split(' ')[5] ?? '1';
  const write = (node: StudyNode, withNumber: boolean) => {
    if (isWhite) out.push(`${number}.${node.san}`);
    else out.push(withNumber ? `${number}...${node.san}` : node.san);
    for (const nag of node.nags ?? []) out.push(`$${nag}`);
    const comment = commentText(node);
    if (comment) out.push(comment);
  };
  write(main, forceNumber);
  for (const variation of variations) {
    out.push('(');
    write(variation, true);
    writeLine(variation, false, out);
    out.push(')');
  }
  writeLine(main, variations.length > 0 || Boolean(commentText(main)), out);
}

/** One chapter as a PGN game, in the format Lichess reads (and writes) for a study. */
export function chapterToPgn(study: Pick<Study, 'name'>, chapter: StudyChapter): string {
  const headers: Array<[string, string]> = [
    ['Event', `${study.name}: ${chapter.name}`],
    ['Site', '?'],
    ['Result', '*'],
    ['StudyName', study.name],
    ['ChapterName', chapter.name],
    ['Orientation', chapter.orientation === 'b' ? 'black' : 'white'],
  ];
  if (chapter.root.fen !== START_FEN) {
    headers.push(['FEN', chapter.root.fen], ['SetUp', '1']);
  }
  const out: string[] = [];
  const intro = commentText(chapter.root);
  if (intro) out.push(intro);
  writeLine(chapter.root, intro !== '', out);
  out.push('*');
  const head = headers.map(([key, value]) => `[${key} "${quote(value)}"]`).join('\n');
  return `${head}\n\n${out.join(' ')}\n`;
}

/** The whole study as a PGN with a game per chapter. */
export function studyToPgn(study: Study): string {
  return study.chapters.map((chapter) => chapterToPgn(study, chapter)).join('\n');
}
