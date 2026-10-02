import { describe, expect, it } from 'vitest';
import {
  addChild,
  countMoves,
  createChapter,
  findNode,
  isVariation,
  makeNode,
  mainLine,
  moveItem,
  moveNode,
  moveLabel,
  nagText,
  pathTo,
  promoteNode,
  removeNode,
  setComment,
  setShapes,
  toggleNag,
} from './studyTree';

function build() {
  const chapter = createChapter('Test');
  let root = chapter.root;
  const e4 = makeNode(root, 'e4')!;
  root = addChild(root, root.id, e4);
  const e5 = makeNode(e4, 'e5')!;
  root = addChild(root, e4.id, e5);
  const c5 = makeNode(e4, 'c5')!;
  root = addChild(root, e4.id, c5);
  return { root, e4, e5, c5 };
}

describe('studyTree', () => {
  it('makeNode refuses an illegal move and fills in the move and the position', () => {
    const { root } = createChapter('A');
    expect(makeNode(root, 'e5')).toBeNull();
    const node = makeNode(root, { from: 'g1', to: 'f3' })!;
    expect(node).toMatchObject({ san: 'Nf3', from: 'g1', to: 'f3' });
    expect(node.fen).toContain(' b ');
  });

  it('adds the first move as the main line and the next ones as variations', () => {
    const { root, e4, e5, c5 } = build();
    expect(mainLine(root).map((n) => n.san)).toEqual(['e4', 'e5']);
    expect(countMoves(root)).toBe(3);
    expect(isVariation(root, c5.id)).toBe(true);
    expect(isVariation(root, e5.id)).toBe(false);
    expect(pathTo(root, c5.id)?.map((n) => n.san)).toEqual(['', 'e4', 'c5']);
    expect(findNode(root, 'nope')).toBeNull();
    expect(findNode(root, e4.id)?.san).toBe('e4');
  });

  it('promotes a variation to the main line', () => {
    const { root, c5 } = build();
    const promoted = promoteNode(root, c5.id);
    expect(mainLine(promoted).map((n) => n.san)).toEqual(['e4', 'c5']);
    expect(promoted.children[0].children.map((n) => n.san)).toEqual(['c5', 'e5']);
    expect(promoteNode(promoted, c5.id)).toBe(promoted);
  });

  it('removes a move with what follows it, and never the root', () => {
    const { root, e4, c5 } = build();
    expect(countMoves(removeNode(root, c5.id))).toBe(2);
    expect(countMoves(removeNode(root, e4.id))).toBe(0);
    expect(removeNode(root, root.id)).toBe(root);
  });

  it('sets and clears comments, and toggles the glyphs (one move glyph at a time)', () => {
    const { root, e4 } = build();
    const commented = setComment(root, e4.id, 'Le centre.');
    expect(findNode(commented, e4.id)?.comment).toBe('Le centre.');
    expect(findNode(setComment(commented, e4.id, '  '), e4.id)).not.toHaveProperty('comment');

    let next = toggleNag(root, e4.id, 1);
    next = toggleNag(next, e4.id, 16);
    expect(findNode(next, e4.id)?.nags).toEqual([1, 16]);
    next = toggleNag(next, e4.id, 2);
    expect(findNode(next, e4.id)?.nags).toEqual([16, 2]);
    expect(nagText(findNode(next, e4.id)?.nags)).toBe('±?');
    next = toggleNag(toggleNag(next, e4.id, 2), e4.id, 16);
    expect(findNode(next, e4.id)).not.toHaveProperty('nags');
  });

  it('leaves the other branches untouched when one is edited', () => {
    const { root, e5, c5 } = build();
    const next = setComment(root, c5.id, 'x');
    expect(findNode(next, e5.id)).toBe(findNode(root, e5.id));
  });

  it('labels the moves with their number', () => {
    const { root, e4 } = build();
    expect(moveLabel(root.fen, 'e4')).toBe('1.e4');
    expect(moveLabel(e4.fen, 'e5')).toBe('1...e5');
  });
});

describe('setShapes', () => {
  it('replaces the shapes of a node and removes them when there are none', () => {
    const { root, e4 } = build();
    const shapes = [{ brush: 'G' as const, from: 'e2', to: 'e4' }];
    const drawn = setShapes(root, e4.id, shapes);
    expect(findNode(drawn, e4.id)?.shapes).toEqual(shapes);
    expect(findNode(setShapes(drawn, e4.id, []), e4.id)).not.toHaveProperty('shapes');
  });
});

describe('moveItem and moveNode', () => {
  it('moves an item by one place and leaves the list alone at either end', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a'], 5, 1)).toEqual(['a']);
  });

  it('reorders the variations of a move, the first one being the main line', () => {
    const { root, e4, e5, c5 } = build();
    const down = moveNode(root, e5.id, 1);
    expect(findNode(down, e4.id)?.children.map((n) => n.san)).toEqual(['c5', 'e5']);
    expect(mainLine(down).map((n) => n.san)).toEqual(['e4', 'c5']);
    const up = moveNode(down, e5.id, -1);
    expect(findNode(up, e4.id)?.children.map((n) => n.san)).toEqual(['e5', 'c5']);
    expect(moveNode(root, c5.id, 1)).toBe(root); // already last
    expect(moveNode(root, e5.id, -1)).toBe(root); // already first
    expect(moveNode(root, root.id, 1)).toBe(root);
    expect(moveNode(root, 'nope', 1)).toBe(root);
  });

  it('keeps what follows each move when they change places', () => {
    const { root, e4, e5, c5 } = build();
    const down = moveNode(addChild(root, e5.id, makeNode(e5, 'Nf3')!), e5.id, 1);
    expect(findNode(down, e5.id)?.children).toHaveLength(1);
    expect(findNode(down, c5.id)?.children).toHaveLength(0);
    expect(countMoves(down)).toBe(countMoves(root) + 1);
    expect(findNode(down, e4.id)?.children).toHaveLength(2);
  });
});
