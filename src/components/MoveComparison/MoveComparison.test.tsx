// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MoveAnalysis } from '../../types/chess';
import { MoveComparison } from './MoveComparison';

const FORK = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
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

  it('names the opening of a theoretical move in French', () => {
    const { container } = renderMove(
      move({ classification: 'book', openingName: 'Sicilian Defense: Dragon Variation', eco: 'B70' })
    );
    expect(container.textContent).toContain('Coup théorique (Défense sicilienne : variante Dragon)');
    expect(container.textContent).not.toContain('Sicilian');
  });

  it('names the opening known for the position when the move has none', () => {
    const { container } = render(
      <MoveComparison
        currentMove={move({ classification: 'book' })}
        previousMove={null}
        isPreviewingAlternative={false}
        onTogglePreviewAlternative={() => {}}
        onUpdateAiExplanation={() => {}}
        openingName="Ruy Lopez: Berlin Defense"
      />
    );
    expect(container.textContent).toContain('Coup théorique (Partie espagnole : défense de Berlin)');
  });

  it('explains the move on the spot, with no network, when the button is pressed', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onUpdate = vi.fn();
    render(
      <MoveComparison
        currentMove={move({
          aiExplanation: undefined,
          fenBefore: FORK,
          uci: 'e1d2',
          san: 'Kd2',
          bestMoveUci: 'd5c7',
          bestMoveSan: 'Nc7+',
        })}
        previousMove={null}
        isPreviewingAlternative={false}
        onTogglePreviewAlternative={() => {}}
        onUpdateAiExplanation={onUpdate}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Expliquer ce coup/ }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [ply, explanation] = onUpdate.mock.calls[0];
    expect(ply).toBe(20);
    expect(explanation.concept).toBe('Fourchette');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('disables the button while the analysis runs', () => {
    render(
      <MoveComparison
        currentMove={move({ aiExplanation: undefined })}
        previousMove={null}
        isPreviewingAlternative={false}
        onTogglePreviewAlternative={() => {}}
        onUpdateAiExplanation={() => {}}
        isCoachDisabled
      />
    );
    expect((screen.getByRole('button', { name: /Expliquer ce coup/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
