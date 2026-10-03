import { describe, expect, it } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis, PlayerStats } from '../types/chess';
import { buildGameHeadline, findDecisiveMove, formatEval } from './gameHeadline';
import { computePhaseStats } from './phaseStats';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function move(ply: number, overrides: Partial<MoveAnalysis> = {}): MoveAnalysis {
  return {
    ply,
    moveNumber: Math.floor(ply / 2) + 1,
    color: ply % 2 === 0 ? 'w' : 'b',
    san: 'Nf3',
    uci: 'g1f3',
    fenBefore: START,
    evalBefore: 0,
    evalAfter: 0,
    mateBefore: null,
    mateAfter: null,
    bestMoveUci: 'g1f3',
    winPercentBefore: 50,
    winPercentAfter: 50,
    winPercentLoss: 0,
    centipawnLoss: 0,
    classification: 'good',
    ...overrides,
  } as MoveAnalysis;
}

const stats = (accuracy: number): PlayerStats => ({ accuracy }) as PlayerStats;

function game(moves: MoveAnalysis[]): GameAnalysisResult {
  return { metadata: { white: 'Alice', black: 'Bob' }, moves, statsWhite: stats(71), statsBlack: stats(88) };
}

const blunder = (ply: number, loss: number, overrides: Partial<MoveAnalysis> = {}) =>
  move(ply, {
    classification: 'blunder',
    winPercentLoss: loss,
    faultKind: 'hanging',
    san: 'Qxf7',
    evalBefore: 280,
    evalAfter: -40,
    ...overrides,
  });

describe('formatEval', () => {
  it('writes pawns with a sign, from the side asked', () => {
    expect(formatEval(280, null, 'w')).toBe('+2,8');
    expect(formatEval(-40, null, 'w')).toBe('−0,4');
    expect(formatEval(280, null, 'b')).toBe('−2,8');
    expect(formatEval(0, null, 'w')).toBe('0,0');
  });

  it('names mates, for or against the side', () => {
    expect(formatEval(0, 3, 'w')).toBe('mat en 3');
    expect(formatEval(0, 3, 'b')).toBe('mat subi en 3');
  });
});

describe('findDecisiveMove', () => {
  it('picks the fault that gave away the most, from either side', () => {
    const moves = [blunder(2, 25), blunder(45, 60), blunder(46, 40)];
    expect(findDecisiveMove(moves)?.ply).toBe(45);
  });

  it('ignores inaccuracies and returns null without a fault', () => {
    expect(findDecisiveMove([move(0, { classification: 'inaccuracy', winPercentLoss: 9 })])).toBeNull();
  });
});

describe('buildGameHeadline', () => {
  const moves = Array.from({ length: 46 }, (_, ply) => move(ply));
  moves[44] = blunder(44, 50);
  const analysis = game(moves);
  const phases = computePhaseStats(analysis.moves);

  it('gives three lines for a known player, compared with their average', () => {
    const lines = buildGameHeadline(analysis, 'w', { accuracy: 77, games: 24 }, phases);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Moment décisif : 23. Qxf7, votre coup : +2,8 puis −0,4, pièce laissée en prise.');
    expect(lines[1]).toBe('Précision de 71 %, 6 points sous votre moyenne (77 % sur 24 autres parties).');
    expect(lines[2]).toContain('Vos fautes : 1 gaffe');
  });

  it('seen from the other side, the move is the opponent’s and the sign flips', () => {
    const [line] = buildGameHeadline(analysis, 'b', null, phases);
    expect(line).toBe("Moment décisif : 23. Qxf7, coup de l'adversaire : −2,8 puis +0,4, pièce laissée en prise.");
  });

  it('only gives the decisive moment, from White, when the player is unknown', () => {
    const lines = buildGameHeadline(analysis, null, null, phases);
    expect(lines).toEqual([
      'Moment décisif : 23. Qxf7, coup des Blancs : +2,8 puis −0,4 (côté Blancs), pièce laissée en prise.',
    ]);
  });

  it('says so when a game has no clear fault', () => {
    const [line] = buildGameHeadline(game([move(0), move(1)]), 'w', null, computePhaseStats([move(0), move(1)]));
    expect(line).toContain('aucune erreur nette');
  });

  it('keeps the comparison out until there are enough other games, and recognises an average game', () => {
    expect(buildGameHeadline(analysis, 'w', { accuracy: 77, games: 2 }, phases)[1]).toBe('Précision de 71 %.');
    expect(buildGameHeadline(analysis, 'w', { accuracy: 71.4, games: 10 }, phases)[1]).toContain('dans votre moyenne');
    expect(buildGameHeadline(analysis, 'w', { accuracy: 60, games: 10 }, phases)[1]).toContain('au-dessus de');
  });

  it('writes "Aucune gaffe ni erreur" for a clean game', () => {
    const clean = game(Array.from({ length: 20 }, (_, ply) => move(ply)));
    const lines = buildGameHeadline(clean, 'w', null, computePhaseStats(clean.moves));
    expect(lines[2]).toBe('Aucune gaffe ni erreur.');
  });
});
