// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { Chess } from 'chess.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoveAnalysis } from '../types/chess';

const deepAnalyseMove = vi.fn();
const generateLocally = vi.fn();

vi.mock('../services/deepMoveAnalysis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/deepMoveAnalysis')>()),
  deepAnalyseMove: (...args: unknown[]) => deepAnalyseMove(...args),
}));
vi.mock('../services/localLlm', () => ({
  isLocalModelSupported: () => true,
  isUnsupportedDevice: (error: unknown) => error instanceof Error && error.message.includes('UNSUPPORTED_DEVICE'),
  generateLocally: (...args: unknown[]) => generateLocally(...args),
}));

import { useCoach } from './useCoach';

// White: king e1, knight d5. Black: king e8, rook a8. Nc7+ forks the king and the rook; Kd2 misses it.
const FORK = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';

function missedFork(): MoveAnalysis {
  const chess = new Chess(FORK);
  chess.move({ from: 'e1', to: 'd2' });
  return {
    ply: 20,
    moveNumber: 10,
    color: 'w',
    san: 'Kd2',
    uci: 'e1d2',
    from: 'e1',
    to: 'd2',
    fenBefore: FORK,
    fenAfter: chess.fen(),
    evalBefore: 300,
    evalAfter: -100,
    mateBefore: null,
    mateAfter: null,
    bestMoveUci: 'd5c7',
    bestMoveSan: 'Nc7+',
    bestMoveFrom: 'd5',
    bestMoveTo: 'c7',
    pv: ['d5c7', 'e8d8', 'c7a8'],
    centipawnLoss: 400,
    winPercentBefore: 80,
    winPercentAfter: 45,
    winPercentLoss: 35,
    classification: 'blunder',
  } as MoveAnalysis;
}

const DEEP = {
  depth: 14,
  before: { cp: 450, mate: null, bestMoveUci: 'd5c7', pv: ['d5c7', 'e8d8', 'c7a8'] },
  // After Kd2 Black replies Kd7 (from the position after the move)
  after: { cp: -50, mate: null, bestMoveUci: 'e8d7', pv: ['e8d7', 'd5c3'] },
};

const GOOD_ANSWER = [
  'PROBLEME: Rd2 laisse passer une tactique : Cc7+ était une fourchette.',
  'SOLUTION: Cc7+ était le bon coup : le Cavalier en c7 attaque en même temps le Roi en e8 et la Tour en a8.',
].join('\n');

beforeEach(() => {
  deepAnalyseMove.mockReset().mockResolvedValue(DEEP);
  generateLocally.mockReset();
  localStorage.clear();
});
afterEach(() => localStorage.clear());

function setup() {
  const onUpdate = vi.fn();
  const hook = renderHook(() => useCoach(missedFork(), onUpdate));
  return { onUpdate, ...hook };
}

describe('useCoach', () => {
  it('searches deeper at the chosen depth and tells the answer to the move', async () => {
    const { result, onUpdate } = setup();
    act(() => result.current.setDepth(14));
    await act(() => result.current.explain());
    expect(deepAnalyseMove).toHaveBeenCalledWith(expect.objectContaining({ ply: 20 }), 14, expect.anything());
    const [ply, explanation] = onUpdate.mock.calls.at(-1)!;
    expect(ply).toBe(20);
    expect(explanation.source).toBe('rules');
    expect(explanation.depth).toBe(14);
    expect(explanation.whyPlayedIsBad).toContain(
      "À la profondeur 14, pour les Blancs, l'évaluation passe de +4,5 à -0,5"
    );
    expect(explanation.whyPlayedIsBad).toContain('Réponse la plus forte après Rd2 : 1... Rd7 2. Cc3');
  });

  it("uses the game's analysis without searching when the depth is 0", async () => {
    const { result, onUpdate } = setup();
    act(() => result.current.setDepth(0));
    await act(() => result.current.explain());
    expect(deepAnalyseMove).not.toHaveBeenCalled();
    expect(onUpdate.mock.calls.at(-1)![1].depth).toBeUndefined();
  });

  it('falls back on the position analysis of the game when the deeper search fails', async () => {
    deepAnalyseMove.mockRejectedValue(new Error('engine'));
    const { result, onUpdate } = setup();
    await act(() => result.current.explain());
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][1].whyPlayedIsBad).toContain("Pour les Blancs, l'évaluation passe de +3,0 à -1,0");
  });

  it('shows the rule-based text first, then the local model sentences when they hold to the facts', async () => {
    generateLocally.mockResolvedValue(GOOD_ANSWER);
    const { result, onUpdate } = setup();
    act(() => result.current.setUseModel(true));
    await act(() => result.current.explain());
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate.mock.calls[0][1].source).toBe('rules');
    const final = onUpdate.mock.calls[1][1];
    expect(final.source).toBe('model');
    expect(final.whyPlayedIsBad).toContain('Cc7+ était une fourchette');
    // Numbers and lines are the code's, whatever the model wrote
    expect(final.whyPlayedIsBad).toContain("l'évaluation passe de");
    expect(final.whyBestIsBetter).toContain('Suite probable');
    expect(result.current.note).toBe('accepted');
  });

  it('keeps the rule-based text when the model invents a move', async () => {
    generateLocally.mockResolvedValue(GOOD_ANSWER.replace('Cc7+ était le bon coup', 'Fg5 était le bon coup'));
    const { result, onUpdate } = setup();
    act(() => result.current.setUseModel(true));
    await act(() => result.current.explain());
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][1].source).toBe('rules');
    await waitFor(() => expect(result.current.note).toBe('rejected'));
  });

  it('keeps the rule-based text when the model does not answer', async () => {
    generateLocally.mockRejectedValue(new Error('out of memory'));
    const { result, onUpdate } = setup();
    act(() => result.current.setUseModel(true));
    await act(() => result.current.explain());
    expect(onUpdate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.note).toBe('failed'));
    expect(result.current.status.phase).toBe('idle');
  });

  it('says so, without a warning in the console, when the device cannot run the model', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    generateLocally.mockRejectedValue(new Error('UNSUPPORTED_DEVICE'));
    const { result, onUpdate } = setup();
    act(() => result.current.setUseModel(true));
    await act(() => result.current.explain());
    expect(onUpdate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.note).toBe('unsupported'));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('uses the recommended model by default and tells it not to reason first when it would', async () => {
    generateLocally.mockResolvedValue(GOOD_ANSWER);
    const { result } = setup();
    expect(result.current.modelId).toBe('qwen3-1.7b');
    act(() => result.current.setUseModel(true));
    await act(() => result.current.explain());
    const [messages, options] = generateLocally.mock.calls[0];
    expect(options.model.repo).toBe('onnx-community/Qwen3-1.7B-ONNX');
    expect(messages.at(-1).content).toContain('/no_think');
  });

  it('runs the model that was chosen, and remembers the choice', async () => {
    generateLocally.mockResolvedValue(GOOD_ANSWER);
    const first = setup();
    act(() => first.result.current.setModelId('qwen2.5-1.5b'));
    act(() => first.result.current.setUseModel(true));
    await act(() => first.result.current.explain());
    const [messages, options] = generateLocally.mock.calls[0];
    expect(options.model.repo).toBe('onnx-community/Qwen2.5-1.5B-Instruct');
    expect(messages.at(-1).content).not.toContain('/no_think');
    first.unmount();
    expect(setup().result.current.modelId).toBe('qwen2.5-1.5b');
  });

  it('does not use the model unless asked to', async () => {
    const { result } = setup();
    await act(() => result.current.explain());
    expect(generateLocally).not.toHaveBeenCalled();
  });

  it('remembers the choices', () => {
    const first = setup();
    act(() => first.result.current.setDepth(16));
    act(() => first.result.current.setUseModel(true));
    first.unmount();
    const second = setup();
    expect(second.result.current.depth).toBe(16);
    expect(second.result.current.useModel).toBe(true);
  });
});
