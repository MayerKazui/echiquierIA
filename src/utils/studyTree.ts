import { Chess } from 'chess.js';
import type { PlayerColor } from '../types/ui';
import type { StudyChapter, StudyNode, StudyShape } from '../types/study';

/** The standard starting position. */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

let counter = 0;

/** Short id, unique enough for the nodes and chapters of a browser's studies. */
export function newId(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function createRoot(fen: string = START_FEN): StudyNode {
  return { id: newId(), san: '', from: '', to: '', fen, children: [] };
}

export function createChapter(name: string, orientation: PlayerColor = 'w', fen: string = START_FEN): StudyChapter {
  return { id: newId(), name, orientation, root: createRoot(fen) };
}

/** True if `fen` is a position chess.js accepts. */
export function isValidFen(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

/** A new node for the move `from`→`to` played in the position of `parent`, or null when it is not legal there. */
export function makeNode(
  parent: StudyNode,
  move: { from: string; to: string; promotion?: string } | string
): StudyNode | null {
  try {
    const chess = new Chess(parent.fen);
    const played = chess.move(move);
    return {
      id: newId(),
      san: played.san,
      from: played.from,
      to: played.to,
      ...(played.promotion ? { promotion: played.promotion } : {}),
      fen: chess.fen(),
      children: [],
    };
  } catch {
    return null;
  }
}

/** The nodes from the root down to the node `id` (both included), or null when it is not in the tree. */
export function pathTo(root: StudyNode, id: string): StudyNode[] | null {
  if (root.id === id) return [root];
  for (const child of root.children) {
    const below = pathTo(child, id);
    if (below) return [root, ...below];
  }
  return null;
}

export function findNode(root: StudyNode, id: string): StudyNode | null {
  const path = pathTo(root, id);
  return path ? path[path.length - 1] : null;
}

/** The main line: from the root, always the first continuation. */
export function mainLine(root: StudyNode): StudyNode[] {
  const line: StudyNode[] = [];
  for (let node = root.children[0]; node; node = node.children[0]) line.push(node);
  return line;
}

/** Number of moves in the tree, variations included. */
export function countMoves(root: StudyNode): number {
  return root.children.reduce((total, child) => total + 1 + countMoves(child), 0);
}

/** The tree with `node` replaced by `update(node)`; the nodes outside the path to it are shared, not copied. */
export function updateNode(root: StudyNode, id: string, update: (node: StudyNode) => StudyNode): StudyNode {
  if (root.id === id) return update(root);
  let changed = false;
  const children = root.children.map((child) => {
    const next = updateNode(child, id, update);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

/** Adds `child` after the node `parentId`: as the main continuation when there is none, as a variation otherwise. */
export function addChild(root: StudyNode, parentId: string, child: StudyNode): StudyNode {
  return updateNode(root, parentId, (node) => ({ ...node, children: [...node.children, child] }));
}

/** The node `id` and everything after it removed. The root cannot be removed. */
export function removeNode(root: StudyNode, id: string): StudyNode {
  if (root.id === id) return root;
  let changed = false;
  const kept: StudyNode[] = [];
  for (const child of root.children) {
    if (child.id === id) {
      changed = true;
      continue;
    }
    const next = removeNode(child, id);
    if (next !== child) changed = true;
    kept.push(next);
  }
  return changed ? { ...root, children: kept } : root;
}

/** Makes the node `id` the main continuation of its parent (the line it replaces becomes a variation). */
export function promoteNode(root: StudyNode, id: string): StudyNode {
  const path = pathTo(root, id);
  if (!path || path.length < 2) return root;
  const parent = path[path.length - 2];
  const index = parent.children.findIndex((c) => c.id === id);
  if (index <= 0) return root;
  return updateNode(root, parent.id, (node) => ({
    ...node,
    children: [node.children[index], ...node.children.filter((_, i) => i !== index)],
  }));
}

/** True for a node that is not the main continuation of its parent. */
export function isVariation(root: StudyNode, id: string): boolean {
  const path = pathTo(root, id);
  if (!path || path.length < 2) return false;
  return path[path.length - 2].children[0]?.id !== id;
}

export function setComment(root: StudyNode, id: string, comment: string): StudyNode {
  return updateNode(root, id, (node) => {
    const { comment: _removed, ...rest } = node;
    return comment.trim() === '' ? rest : { ...rest, comment };
  });
}

/** Adds the glyph `nag` to the node, or removes it when it is already there. A move glyph (1 to 6) replaces another one. */
export function toggleNag(root: StudyNode, id: string, nag: number): StudyNode {
  return updateNode(root, id, (node) => {
    const current = node.nags ?? [];
    const isMoveGlyph = (n: number) => n >= 1 && n <= 6;
    let next: number[];
    if (current.includes(nag)) next = current.filter((n) => n !== nag);
    else next = [...current.filter((n) => !(isMoveGlyph(nag) && isMoveGlyph(n))), nag];
    const { nags: _removed, ...rest } = node;
    return next.length === 0 ? rest : { ...rest, nags: next };
  });
}

const NAG_SYMBOLS: Record<number, string> = {
  1: '!',
  2: '?',
  3: '!!',
  4: '??',
  5: '!?',
  6: '?!',
  10: '=',
  13: '∞',
  14: '⩲',
  15: '⩱',
  16: '±',
  17: '∓',
  18: '+−',
  19: '−+',
};

/** The glyphs the editor offers, in the order of the toolbar. */
export const MOVE_GLYPHS = [1, 2, 3, 4, 5, 6] as const;
export const POSITION_GLYPHS = [10, 14, 15, 16, 17, 18, 19, 13] as const;

export function nagSymbol(nag: number): string {
  return NAG_SYMBOLS[nag] ?? '';
}

/** The symbols of the glyphs of a node ("!?", "±"), glyphs we have no symbol for left out. */
export function nagText(nags: readonly number[] | undefined): string {
  return (nags ?? []).map(nagSymbol).join('');
}

/** "12.Nf3" for a white move, "12...Nf6" for a black one, from the position before the move. */
export function moveLabel(fenBefore: string, san: string): string {
  const fields = fenBefore.split(' ');
  const number = fields[5] ?? '1';
  return fields[1] === 'b' ? `${number}...${san}` : `${number}.${san}`;
}

/** The side to move in the position of the node. */
export function turnOf(node: StudyNode): PlayerColor {
  return node.fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

const NAG_LABELS: Record<number, string> = {
  1: 'Bon coup',
  2: 'Erreur',
  3: 'Très bon coup',
  4: 'Gaffe',
  5: 'Coup intéressant',
  6: 'Coup douteux',
  10: 'Position égale',
  13: 'Position floue',
  14: 'Léger avantage aux Blancs',
  15: 'Léger avantage aux Noirs',
  16: 'Avantage aux Blancs',
  17: 'Avantage aux Noirs',
  18: 'Les Blancs gagnent',
  19: 'Les Noirs gagnent',
};

/** What a glyph means, in French (the name of its button, for a screen reader). */
export function nagLabel(nag: number): string {
  return NAG_LABELS[nag] ?? `Annotation ${nag}`;
}

/** The arrows and circles of a node replaced by `shapes` (none removes them). */
export function setShapes(root: StudyNode, id: string, shapes: readonly StudyShape[]): StudyNode {
  return updateNode(root, id, (node) => {
    const { shapes: _removed, ...rest } = node;
    return shapes.length === 0 ? rest : { ...rest, shapes: [...shapes] };
  });
}
