import { describe, expect, it } from 'vitest';
import { GameAnalysisResult, MoveAnalysis, PlayerStats } from '../types/chess';
import { buildGameSummary } from './gameSummary';
import { computePhaseStats } from './phaseStats';

const stats = (overrides: Partial<PlayerStats>): PlayerStats =>
  ({
    accuracy: 90,
    best: 10,
    brilliant: 1,
    inaccuracies: 2,
    mistakes: 1,
    blunders: 1,
    missedWins: 1,
    ...overrides,
  }) as PlayerStats;

function analysis(overrides: Partial<GameAnalysisResult['metadata']> = {}, moveCount = 24): GameAnalysisResult {
  const moves = Array.from(
    { length: moveCount },
    (_, ply) =>
      ({
        ply,
        moveNumber: Math.floor(ply / 2) + 1,
        color: ply % 2 === 0 ? 'w' : 'b',
        classification: 'good',
        centipawnLoss: 10,
      }) as MoveAnalysis
  );
  return {
    metadata: { white: 'Alice', black: 'Bob', result: '1-0', ...overrides },
    moves,
    statsWhite: stats({ accuracy: 91.5 }),
    statsBlack: stats({ accuracy: 78.2, best: 4, brilliant: 0 }),
  };
}

describe('buildGameSummary', () => {
  it('summarizes players, accuracy, result, opening and duration', () => {
    const game = analysis({ opening: 'Italian Game', eco: 'C50' });
    const text = buildGameSummary(game, computePhaseStats(game.moves));

    expect(text).toContain('Alice (91.5%) vs Bob (78.2%)');
    expect(text).toContain('🏆 Résultat : 1-0');
    expect(text).toContain('📖 Ouverture : Italian Game [C50]');
    expect(text).toContain('Durée : 12 coups');
    // best + brilliant, inaccuracies, mistakes, blunders, missed wins (counted apart)
    expect(text).toContain(
      '⚪ Blancs : 11 meilleurs coups · 2 imprécision(s) · 1 erreur(s) · 1 gaffe(s) · 1 occasion(s) manquée(s)'
    );
    expect(text).toContain('⚫ Noirs : 4 meilleurs coups');
  });

  it('omits the result when unknown and the opening when missing', () => {
    const game = analysis({ result: '*' });
    const text = buildGameSummary(game, computePhaseStats(game.moves));
    expect(text).not.toContain('Résultat');
    expect(text).not.toContain('Ouverture :');
  });

  it('reports the phases, and says when the endgame was not reached', () => {
    const short = analysis({}, 24); // 12 full moves: opening only
    const text = buildGameSummary(short, computePhaseStats(short.moves));
    expect(text).toContain('Ouverture (coups 1-12) : Blancs');
    expect(text).toContain('Finale (coups 31+) : Non atteinte');

    const long = analysis({}, 80);
    expect(buildGameSummary(long, computePhaseStats(long.moves))).toMatch(
      /Finale \(coups 31\+\) : Blancs [\d.]+% \| Noirs/
    );
  });
});
