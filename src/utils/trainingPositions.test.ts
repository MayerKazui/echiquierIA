import { describe, expect, it, vi } from 'vitest';
import { faultMove, SCHOLAR } from '../test/trainingFixtures';
import { game, mv, PSEUDO } from '../test/profileFixtures';
import { collectPositions } from './trainingPositions';

/** A game of 40 plies with the given moves in place (White is the player, Alice, unless said otherwise). */
function gameWith(replaced: Record<number, ReturnType<typeof faultMove>>, over: Parameters<typeof game>[0] = {}) {
  return game({
    moves: Array.from({ length: 40 }, (_, ply) => replaced[ply] ?? mv(ply)),
    ...over,
  });
}

describe('collectPositions', () => {
  it('makes a position of each fault of the player', async () => {
    const source = gameWith({ 6: faultMove(), 20: faultMove({ ply: 20, moveNumber: 11, classification: 'mistake' }) });
    const positions = await collectPositions([source]);
    expect(positions.map((p) => [p.ply, p.classification])).toEqual([
      [6, 'blunder'],
      [20, 'mistake'],
    ]);
  });

  it('keeps what is needed to ask for the move again and to correct it', async () => {
    const [position] = await collectPositions([
      gameWith({ 6: faultMove() }, { id: 'abc', meta: { date: '2024.03.17' } }),
    ]);
    expect(position).toMatchObject({
      id: 'abc:6',
      gameId: 'abc',
      ply: 6,
      moveNumber: 4,
      color: 'w',
      fen: SCHOLAR,
      playedUci: 'h5h4',
      playedSan: 'Qh4',
      bestUci: 'h5f7',
      bestSan: 'Qxf7#',
      pv: ['h5f7'],
      classification: 'blunder',
      kind: 'mate',
      phase: 'opening',
      loss: 40,
      winBefore: 90,
      opponent: 'Bob',
      date: Date.UTC(2024, 2, 17),
    });
  });

  it('counts the win % before the fault from the player side when playing Black', async () => {
    const black = faultMove({ ply: 7, color: 'b', winPercentBefore: 30 });
    const [position] = await collectPositions([gameWith({ 7: black }, { white: 'Bob', black: PSEUDO })]);
    expect(position.color).toBe('b');
    expect(position.winBefore).toBe(70);
    expect(position.opponent).toBe('Bob');
  });

  it('leaves out the opponent faults and the moves that are not faults', async () => {
    const source = gameWith({
      7: faultMove({ ply: 7, color: 'b' }),
      8: faultMove({ ply: 8, classification: 'inaccuracy' }),
      10: faultMove({ ply: 10, classification: 'good' }),
    });
    expect(await collectPositions([source])).toEqual([]);
  });

  it('leaves out the games that do not name the player, and the short ones', async () => {
    const stranger = gameWith({ 6: faultMove() }, { id: 'x', white: 'Carl', black: 'Dora' });
    const short = game({ id: 's', moves: [mv(0), mv(1), faultMove({ ply: 2 })] });
    expect(await collectPositions([stranger, short])).toEqual([]);
  });

  it('leaves out a position that cannot be asked again', async () => {
    const noPosition = faultMove({ ply: 6, fenBefore: '' });
    const noBest = faultMove({ ply: 8, bestMoveUci: '' });
    const sameAsBest = faultMove({ ply: 10, bestMoveUci: 'h5h4' });
    expect(await collectPositions([gameWith({ 6: noPosition, 8: noBest, 10: sameAsBest })])).toEqual([]);
  });

  it('works out the kind of a fault stored without one', async () => {
    const [position] = await collectPositions([gameWith({ 6: faultMove({ faultKind: undefined }) })]);
    expect(position.kind).toBe('mate');
  });

  it('keeps the explanation of the coach', async () => {
    const aiExplanation = { concept: 'c', whyPlayedIsBad: 'p', whyBestIsBetter: 'b', plan: 'x' };
    const [position] = await collectPositions([gameWith({ 6: faultMove({ aiExplanation }) })]);
    expect(position.explanation).toEqual(aiExplanation);
  });

  it('puts the most recent game first, and the faults of a game in order', async () => {
    const older = gameWith({ 6: faultMove(), 20: faultMove({ ply: 20 }) }, { id: 'old', meta: { date: '2024.01.01' } });
    const newer = gameWith({ 6: faultMove() }, { id: 'new', meta: { date: '2024.02.01' } });
    const positions = await collectPositions([older, newer]);
    expect(positions.map((p) => p.id)).toEqual(['new:6', 'old:6', 'old:20']);
  });

  it('uses the date the game was saved when it has none', async () => {
    const source = gameWith({ 6: faultMove() }, { savedAt: 1234 });
    expect((await collectPositions([source]))[0].date).toBe(1234);
  });

  it('lets the page breathe between games when it is long, and stops when told to', async () => {
    const sources = [gameWith({ 6: faultMove() }, { id: 'a' }), gameWith({ 6: faultMove() }, { id: 'b' })];
    const yieldToUi = vi.fn(() => Promise.resolve());
    await collectPositions(sources, { yieldToUi, sliceMs: -1 });
    expect(yieldToUi).toHaveBeenCalledTimes(2);
    await expect(
      collectPositions(sources, { yieldToUi: () => Promise.reject(new Error('cancelled')), sliceMs: -1 })
    ).rejects.toThrow('cancelled');
  });
});
