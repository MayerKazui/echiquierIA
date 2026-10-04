import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCAL_MODEL, LOCAL_MODELS, resolveLocalModel } from './localLlm.protocol';

describe('the models of the coach', () => {
  it('has unique ids, a repository, a size and a note for each', () => {
    const ids = LOCAL_MODELS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of LOCAL_MODELS) {
      expect(preset.repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(preset.sizeLabel).toMatch(/Go$/);
      expect(preset.note.length).toBeGreaterThan(20);
    }
  });

  it('offers the default model, and no other model that the processor could run beyond what fits in memory', () => {
    expect(LOCAL_MODELS.some((preset) => preset.id === DEFAULT_LOCAL_MODEL)).toBe(true);
    // The 1.5 Md models and above do not fit in what WebAssembly can address: they need a GPU
    for (const preset of LOCAL_MODELS) {
      if (!/0[.,]5/.test(preset.label)) expect(preset.cpuDtype).toBeNull();
    }
  });

  it('tells the models that reason first (Qwen3) from the others', () => {
    expect(resolveLocalModel('qwen3-1.7b').noThink).toBe(true);
    expect(resolveLocalModel('qwen3-4b').noThink).toBe(true);
    expect(resolveLocalModel('qwen2.5-1.5b').noThink).toBe(false);
  });

  it('falls back on the default for an unknown or missing id', () => {
    expect(resolveLocalModel(undefined).id).toBe(DEFAULT_LOCAL_MODEL);
    expect(resolveLocalModel('n’importe quoi').id).toBe(DEFAULT_LOCAL_MODEL);
    expect(resolveLocalModel('').id).toBe(DEFAULT_LOCAL_MODEL);
  });

  it('accepts a repository set by hand, which may use the processor', () => {
    const custom = resolveLocalModel('onnx-community/Qwen3-0.6B-ONNX');
    expect(custom.repo).toBe('onnx-community/Qwen3-0.6B-ONNX');
    expect(custom.cpuDtype).toBe('q4');
    expect(custom.noThink).toBe(true);
    expect(resolveLocalModel('org/modèle espace').id).toBe(DEFAULT_LOCAL_MODEL);
  });
});
