import { describe, expect, it } from 'vitest';
import { detectUserColor } from './gameResult';

describe('detectUserColor', () => {
  it('follows the pseudo when it is in a name', () => {
    expect(detectUserColor({ white: 'Alice', black: 'Bob' }, 'bob', 'w')).toBe('b');
    expect(detectUserColor({ white: 'Alice', black: 'Bob' }, 'alice', 'b')).toBe('w');
  });

  it('falls back when the pseudo is not there', () => {
    expect(detectUserColor({ white: 'Alice', black: 'Bob' }, '', 'b')).toBe('b');
    expect(detectUserColor({ white: 'Alice', black: 'Bob' }, 'carol', 'w')).toBe('w');
  });

  it('takes the side that is not the engine in a game against Stockfish', () => {
    expect(detectUserColor({ white: 'Moi', black: 'Stockfish (Club)' }, '', 'b')).toBe('w');
    expect(detectUserColor({ white: 'Stockfish (Maître)', black: 'Moi' }, '', 'w')).toBe('b');
    expect(detectUserColor({ white: 'Stockfish (Club)', black: 'Alice' }, 'alice', 'w')).toBe('b');
  });

  it('does not guess when both sides or none are the engine', () => {
    expect(detectUserColor({ white: 'Stockfish (Club)', black: 'Stockfish (Expert)' }, '', 'b')).toBe('b');
    expect(detectUserColor({ white: 'Stockfishy', black: 'Bob' }, '', 'b')).toBe('b');
  });
});
