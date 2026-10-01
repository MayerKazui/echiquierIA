// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MoveAnalysis } from '../../types/chess';
import { MoveComparison } from './MoveComparison';

const AFTER_D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';

function move(overrides: Partial<MoveAnalysis> = {}): MoveAnalysis {
  return {
    ply: 20,
    moveNumber: 11,
    color: 'w',
    san: 'Qc5',
    uci: 'd3c5',
    from: 'd3',
    to: 'c5',
    fenBefore: AFTER_D4,
    fenAfter: AFTER_D4,
    evalBefore: 40,
    evalAfter: -30,
    mateBefore: null,
    mateAfter: null,
    bestMoveUci: 'd3b3',
    bestMoveSan: 'Qb3',
    bestMoveFrom: 'd3',
    bestMoveTo: 'b3',
    pv: ['d3b3'],
    centipawnLoss: 70,
    winPercentBefore: 55,
    winPercentAfter: 45,
    winPercentLoss: 10,
    classification: 'inaccuracy',
    aiExplanation: {
      concept: 'Contrôle du centre avec Nc3',
      whyPlayedIsBad: 'En jouant Qc5, tu permets ...Nf6 puis ...Bg4.',
      whyBestIsBetter: 'Qb3 soutient Nc3 et prépare Rad1 ; Db3 aussi.',
      plan: '1. Jouer Qb3 pour protéger Nc3.\n2. Manœuvrer Bg5 si ...Nh5.\n3. Doubler avec Td1.',
    },
    ...overrides,
  } as MoveAnalysis;
}

function renderMove(current: MoveAnalysis) {
  return render(
    <MoveComparison
      currentMove={current}
      previousMove={null}
      isPreviewingAlternative={false}
      onTogglePreviewAlternative={() => {}}
      onUpdateAiExplanation={() => {}}
      sanHistory={[]}
    />
  );
}

describe('MoveComparison: French notation', () => {
  it('writes the headings of the explanation with French piece letters', () => {
    const { container } = renderMove(move());
    const text = container.textContent ?? '';
    expect(text).toContain('Pourquoi Dc5 est une');
    expect(text).toMatch(/L.idée directrice de Db3/);
    expect(text).not.toMatch(/Pourquoi Qc5|directrice de Qb3/);
  });

  it('rewrites English moves found in the AI text and leaves French ones alone', () => {
    const { container } = renderMove(move());
    const text = container.textContent ?? '';
    expect(text).toContain('Contrôle du centre avec Cc3');
    expect(text).toContain('En jouant Dc5, tu permets ...Cf6 puis ...Fg4.');
    expect(text).toContain('Db3 soutient Cc3 et prépare Rad1 ; Db3 aussi.');
    expect(text).toContain('Jouer Db3 pour protéger Cc3.');
    expect(text).toContain('Manœuvrer Fg5 si ...Ch5.');
    expect(text).toContain('Doubler avec Td1.');
    expect(text).not.toMatch(/\b[QBN][a-h]?x?[a-h][1-8]\b/);
  });

  it('praises an optimal move with its French name', () => {
    const { container } = renderMove(move({ classification: 'best', bestMoveSan: 'Qc5', centipawnLoss: 0 }));
    expect(container.textContent).toContain('Pourquoi Dc5 est le coup optimal');
  });
});
