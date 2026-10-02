import { describe, expect, it } from 'vitest';
import { materialSacrificed, SACRIFICE_MIN } from './sacrifice';

const sacrificed = (fen: string, uci: string) =>
  materialSacrificed(fen, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });

describe('materialSacrificed', () => {
  it('is 0 for a quiet move that leaves nothing to take', () => {
    expect(sacrificed('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'e2e4')).toBe(0);
  });

  it('counts a bishop given for a defended pawn as 200', () => {
    // Bxh7+ Kxh7: a pawn won, a bishop lost
    expect(sacrificed('6k1/7p/8/8/8/3B4/8/4K3 w - - 0 1', 'd3h7')).toBe(200);
  });

  it('is negative for a free capture', () => {
    // The h7 pawn is not defended: nothing is given up, a pawn is won
    expect(sacrificed('4k3/7p/8/8/8/3B4/8/4K3 w - - 0 1', 'd3h7')).toBe(-100);
  });

  it('is 0 for an even trade', () => {
    // Nxd5 exd5: a knight for a knight
    expect(sacrificed('4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1', 'c3d5')).toBe(0);
  });

  it('counts the exchange (a rook for a knight) as 200', () => {
    // Rxd5 exd5
    expect(sacrificed('4k3/8/4p3/3n4/8/8/8/3RK3 w - - 0 1', 'd1d5')).toBe(200);
  });

  it('counts a queen left to a pawn as 900, though no capture was made', () => {
    // Qd4?? exd4
    expect(sacrificed('4k3/8/8/4p3/8/8/8/3QK3 w - - 0 1', 'd1d4')).toBe(900);
  });

  it('is negative for a recapture: the piece lost a move ago comes back', () => {
    // cxd5 wins back the knight that took on d5
    expect(sacrificed('4k3/8/8/3n4/2P5/8/8/4K3 w - - 0 1', 'c4d5')).toBeLessThan(0);
  });

  it('follows a chain of captures to its end', () => {
    // Nxe5 Nxe5 dxe5 Qxe5?? : the pawn is taken twice by pieces that are then recaptured; whoever stops first is fine
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 1';
    expect(sacrificed(fen, 'd4e5')).toBeLessThan(SACRIFICE_MIN);
  });

  it('leaves the position untouched', () => {
    const fen = '6k1/7p/8/8/8/3B4/8/4K3 w - - 0 1';
    sacrificed(fen, 'd3h7');
    expect(sacrificed(fen, 'd3h7')).toBe(200);
  });
});
