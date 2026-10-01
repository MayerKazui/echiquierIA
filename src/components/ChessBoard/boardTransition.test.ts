import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { diffPositions } from './boardTransition';

/** Positions before and after the last of the given moves. */
function play(sans: string[]) {
  const chess = new Chess();
  let before = chess.fen();
  for (const san of sans) {
    before = chess.fen();
    chess.move(san);
  }
  return { before, after: chess.fen() };
}

describe('diffPositions', () => {
  it('slides the moved piece from its square, forward', () => {
    const { before, after } = play(['e4']);
    expect(diffPositions(before, after)).toEqual({ slides: { e4: 'e2' }, vanished: {}, appeared: [] });
  });

  it('slides the piece back to its origin square when stepping backward', () => {
    const { before, after } = play(['e4']);
    expect(diffPositions(after, before)).toEqual({ slides: { e2: 'e4' }, vanished: {}, appeared: [] });
  });

  it('makes the captured piece fade out, and come back when the capture is taken back', () => {
    const { before, after } = play(['e4', 'd5', 'exd5']);
    expect(diffPositions(before, after)).toEqual({
      slides: { d5: 'e4' },
      vanished: { d5: { type: 'p', color: 'b' } },
      appeared: [],
    });
    expect(diffPositions(after, before)).toEqual({
      slides: { e4: 'd5' },
      vanished: {},
      appeared: ['d5'],
    });
  });

  it('slides the king and the rook when castling, both ways', () => {
    const { before, after } = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']);
    expect(diffPositions(before, after)?.slides).toEqual({ g1: 'e1', f1: 'h1' });
    expect(diffPositions(after, before)?.slides).toEqual({ e1: 'g1', h1: 'f1' });
  });

  it('handles en passant: the pawn that is taken is not on the destination square', () => {
    const { before, after } = play(['e4', 'a6', 'e5', 'd5', 'exd6']);
    const transition = diffPositions(before, after);
    expect(transition?.slides).toEqual({ d6: 'e5' });
    expect(transition?.vanished).toEqual({ d5: { type: 'p', color: 'b' } });
    expect(diffPositions(after, before)?.appeared).toEqual(['d5']);
  });

  it('follows a promotion, with or without a capture', () => {
    const start = '1r5k/P7/8/8/8/8/8/4K3 w - - 0 1';
    const quiet = new Chess(start);
    quiet.move('a8=Q+');
    expect(diffPositions(start, quiet.fen())?.slides).toEqual({ a8: 'a7' });

    const capture = new Chess(start);
    capture.move('axb8=N');
    const transition = diffPositions(start, capture.fen());
    expect(transition?.slides).toEqual({ b8: 'a7' });
    expect(transition?.vanished).toEqual({ b8: { type: 'r', color: 'b' } });
  });

  it('is null when nothing changed, for a jump of several moves, and for an invalid position', () => {
    const { before, after } = play(['e4']);
    expect(diffPositions(after, after)).toBeNull();
    expect(diffPositions(before, play(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']).after)).toBeNull();
    expect(diffPositions('not a fen', after)).toBeNull();
  });

  it('ignores the move counters', () => {
    const { after } = play(['e4']);
    expect(diffPositions(after, after.replace(/ \d+ \d+$/, ' 9 40'))).toBeNull();
  });
});
