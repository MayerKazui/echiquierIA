import { describe, expect, it } from 'vitest';
import { describeForPlayer, formatPlayerScore, scoreForPlayer } from './playHelp';

describe('the evaluation for the player', () => {
  it('is seen from the side the player has', () => {
    expect(scoreForPlayer({ cp: 120, mate: null }, 'w')).toEqual({ cp: 120, mate: null });
    expect(scoreForPlayer({ cp: 120, mate: null }, 'b')).toEqual({ cp: -120, mate: null });
    expect(scoreForPlayer({ cp: 9990, mate: 3 }, 'b')).toEqual({ cp: -9990, mate: -3 });
  });

  it('is written as a score', () => {
    expect(formatPlayerScore({ cp: 40, mate: null }, 'w')).toBe('+0,4');
    expect(formatPlayerScore({ cp: 40, mate: null }, 'b')).toBe('-0,4');
    expect(formatPlayerScore({ cp: 0, mate: null }, 'w')).toBe('0,0');
    expect(formatPlayerScore({ cp: 10000, mate: 2 }, 'w')).toBe('M2');
    expect(formatPlayerScore({ cp: -10000, mate: -2 }, 'w')).toBe('-M2');
  });

  it.each([
    [10, 'w', 'La position est équilibrée.'],
    [-20, 'w', 'La position est équilibrée.'],
    [60, 'w', 'Vous êtes un peu mieux.'],
    [-60, 'w', 'Stockfish est un peu mieux.'],
    [-60, 'b', 'Vous êtes un peu mieux.'],
    [180, 'w', 'Vous êtes nettement mieux.'],
    [400, 'w', 'Vous êtes bien mieux : l’avantage est important.'],
    [900, 'w', 'Votre position est gagnante.'],
    [-900, 'w', 'La position de Stockfish est gagnante.'],
  ] as const)('puts %i for %s into words', (cp, color, text) => {
    expect(describeForPlayer({ cp, mate: null }, color)).toBe(text);
  });

  it('speaks of a mate for whoever gives it', () => {
    expect(describeForPlayer({ cp: 10000, mate: 1 }, 'w')).toBe('Vous avez un mat en 1 coup.');
    expect(describeForPlayer({ cp: 10000, mate: 3 }, 'w')).toBe('Vous avez un mat en 3 coups.');
    expect(describeForPlayer({ cp: -10000, mate: -3 }, 'w')).toBe('Stockfish a un mat en 3 coups.');
    expect(describeForPlayer({ cp: -10000, mate: -1 }, 'w')).toBe('Stockfish a un mat en 1 coup.');
    expect(describeForPlayer({ cp: -10000, mate: -2 }, 'b')).toBe('Vous avez un mat en 2 coups.');
  });
});
