import { describe, expect, it } from 'vitest';
import { judgeMove, pickReply } from './studyPlay';
import { parseStudyPgn } from './studyPgn';

const root = parseStudyPgn('1. e4 e5 (1... c5 2. Nf3) (1... e6) 2. Nf3 *').chapters[0].root;
const e4 = root.children[0];

describe('pickReply', () => {
  it('returns null at the end of a line and the only continuation when there is one', () => {
    expect(pickReply(e4.children[0].children[0])).toBeNull();
    expect(pickReply(root)?.san).toBe('e4');
  });

  it('follows the main line most of the time and the variations otherwise', () => {
    expect(pickReply(e4, () => 0.1)?.san).toBe('e5');
    expect(pickReply(e4, () => 0.59)?.san).toBe('e5');
    // Past the share of the main line, the draw picks among the two variations
    let draw = 0;
    const draws = [0.7, 0.1, 0.9, 0.9];
    const random = () => draws[draw++ % draws.length];
    expect(pickReply(e4, random)?.san).toBe('c5');
    expect(pickReply(e4, random)?.san).toBe('e6');
  });
});

describe('judgeMove', () => {
  it('accepts a move of the main line or of a variation', () => {
    expect(judgeMove(root, 'e2', 'e4')).toMatchObject({ kind: 'followed', node: { san: 'e4' } });
    expect(judgeMove(e4, 'c7', 'c5')).toMatchObject({ kind: 'followed', node: { san: 'c5' } });
  });

  it('reports a legal move the study does not play, and an illegal one', () => {
    expect(judgeMove(root, 'd2', 'd4')).toEqual({ kind: 'off-book', san: 'd4' });
    expect(judgeMove(root, 'e2', 'e5')).toEqual({ kind: 'illegal' });
  });
});
