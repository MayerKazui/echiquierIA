import { describe, expect, it } from 'vitest';
import { MoveAnalysis } from '../types/chess';
import {
  CLASSIFICATION_LABELS,
  describeMove,
  formatEvaluationForSpeech,
  nextSquare,
  squareLabel,
} from './accessibility';

const move = (overrides: Partial<MoveAnalysis>): MoveAnalysis =>
  ({
    ply: 22,
    moveNumber: 12,
    color: 'w',
    san: 'Nxd5',
    classification: 'good',
    evalAfter: 30,
    mateAfter: null,
    bestMoveSan: 'Nxd5',
    ...overrides,
  }) as MoveAnalysis;

describe('formatEvaluationForSpeech', () => {
  it.each<[number, number | null, string]>([
    [30, null, '+0,3'],
    [-125, null, '-1,3'],
    [0, null, '0,0'],
    [0, 3, 'mat en 3 pour les Blancs'],
    [0, -2, 'mat en 2 pour les Noirs'],
  ])('%s cp, mate %s -> %s', (cp, mate, expected) => {
    expect(formatEvaluationForSpeech(cp, mate)).toBe(expected);
  });
});

describe('describeMove', () => {
  it('announces the initial position', () => {
    expect(describeMove(null, 40)).toBe('Position initiale');
  });

  it('gives the move in French, its classification, the evaluation and the position in the game', () => {
    expect(describeMove(move({ classification: 'best' }), 40)).toBe(
      'Coup 12, Blancs : Cxd5. Meilleur coup. Évaluation +0,3. 23 sur 40'
    );
  });

  it('says which side played and reads a mate', () => {
    const text = describeMove(move({ color: 'b', ply: 23, san: 'Qh4#', mateAfter: -1, evalAfter: -10000 }), 40);
    expect(text).toContain('Noirs : Dh4#');
    expect(text).toContain('mat en 1 pour les Noirs');
  });

  it('points to the better move after an inaccuracy, mistake or blunder', () => {
    const text = describeMove(move({ classification: 'blunder', san: 'Nxd5', bestMoveSan: 'Bb5+' }), 40);
    expect(text).toContain('Gaffe critique');
    expect(text).toContain('Meilleur coup : Fb5+');
  });

  it('does not repeat the played move as the better move, nor mention it for good moves', () => {
    expect(describeMove(move({ classification: 'mistake', bestMoveSan: 'Nxd5' }), 40)).not.toContain('Meilleur coup :');
    expect(describeMove(move({ classification: 'good', bestMoveSan: 'Bb5+' }), 40)).not.toContain('Meilleur coup :');
  });

  it('has a label for every classification', () => {
    expect(Object.keys(CLASSIFICATION_LABELS)).toHaveLength(10);
    for (const label of Object.values(CLASSIFICATION_LABELS)) expect(label).toBeTruthy();
  });
});

describe('squareLabel', () => {
  it('names the piece and its color, or an empty square', () => {
    expect(squareLabel('e4', { type: 'p', color: 'w' })).toBe('e4, pion blanc');
    expect(squareLabel('g8', { type: 'n', color: 'b' })).toBe('g8, cavalier noir');
    expect(squareLabel('a3', null)).toBe('a3, vide');
    expect(squareLabel('e1', { type: 'k', color: 'w' })).toBe('e1, roi blanc');
    // tour and dame are feminine
    expect(squareLabel('a1', { type: 'r', color: 'w' })).toBe('a1, tour blanche');
    expect(squareLabel('d8', { type: 'q', color: 'b' })).toBe('d8, dame noire');
  });

  it('adds the selection and the possible-move state', () => {
    expect(squareLabel('e2', { type: 'p', color: 'w' }, { selected: true })).toBe('e2, pion blanc, sélectionné');
    expect(squareLabel('e4', undefined, { legalDestination: true })).toBe('e4, vide, coup possible');
  });
});

describe('nextSquare', () => {
  it.each<[string, Parameters<typeof nextSquare>[1], string]>([
    ['e4', 'ArrowRight', 'f4'],
    ['e4', 'ArrowLeft', 'd4'],
    ['e4', 'ArrowUp', 'e5'],
    ['e4', 'ArrowDown', 'e3'],
    ['e4', 'Home', 'a4'],
    ['e4', 'End', 'h4'],
  ])('white at the bottom: %s %s -> %s', (from, key, expected) => {
    expect(nextSquare(from, key, false)).toBe(expected);
  });

  it('mirrors the directions when the board is flipped (what is on screen stays consistent)', () => {
    expect(nextSquare('e4', 'ArrowRight', true)).toBe('d4'); // h-file is on the left when flipped
    expect(nextSquare('e4', 'ArrowLeft', true)).toBe('f4');
    expect(nextSquare('e4', 'ArrowUp', true)).toBe('e3'); // rank 1 is at the top when flipped
    expect(nextSquare('e4', 'ArrowDown', true)).toBe('e5');
    expect(nextSquare('e4', 'Home', true)).toBe('h4');
    expect(nextSquare('e4', 'End', true)).toBe('a4');
  });

  it('stops at the edges of the board', () => {
    expect(nextSquare('a1', 'ArrowLeft', false)).toBe('a1');
    expect(nextSquare('a1', 'ArrowDown', false)).toBe('a1');
    expect(nextSquare('h8', 'ArrowRight', false)).toBe('h8');
    expect(nextSquare('h8', 'ArrowUp', false)).toBe('h8');
    expect(nextSquare('a1', 'ArrowLeft', true)).toBe('b1');
    expect(nextSquare('h8', 'ArrowUp', true)).toBe('h7');
  });
});
