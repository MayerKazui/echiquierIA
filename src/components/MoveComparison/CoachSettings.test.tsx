// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LOCAL_MODELS } from '../../services/localLlm.protocol';
import { CoachSettings } from './CoachSettings';

function renderSettings(overrides: Partial<React.ComponentProps<typeof CoachSettings>> = {}) {
  const props = {
    depth: 12 as const,
    onDepthChange: vi.fn(),
    useModel: true,
    onUseModelChange: vi.fn(),
    modelId: 'qwen3-1.7b',
    onModelIdChange: vi.fn(),
    modelSupported: true,
    ...overrides,
  };
  render(<CoachSettings {...props} />);
  return props;
}

describe('CoachSettings', () => {
  it('lists every model of the catalogue with its size, and selects the current one', () => {
    renderSettings();
    const select = screen.getByLabelText('Modèle') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(LOCAL_MODELS.map((preset) => preset.id));
    expect(select.value).toBe('qwen3-1.7b');
    expect(select.options[2].textContent).toContain('1,4 Go');
  });

  it('describes the selected model: download, graphics memory and what the tests showed', () => {
    renderSettings({ modelId: 'qwen3-4b' });
    const note = screen.getByTestId('model-note').textContent ?? '';
    expect(note).toContain('2,2 Go');
    expect(note).toContain('6 Go');
    expect(note).toContain('Le plus gros');
  });

  it('reports the choice of another model', () => {
    const props = renderSettings();
    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: 'qwen2.5-1.5b' } });
    expect(props.onModelIdChange).toHaveBeenCalledWith('qwen2.5-1.5b');
  });

  it('only lets the model be chosen once the option is on', () => {
    renderSettings({ useModel: false });
    expect((screen.getByLabelText('Modèle') as HTMLSelectElement).disabled).toBe(true);
  });

  it('shows a model set by hand as the one selected', () => {
    renderSettings({ modelId: 'onnx-community/Qwen3-0.6B-ONNX' });
    const select = screen.getByLabelText('Modèle') as HTMLSelectElement;
    expect(select.value).toBe('onnx-community/Qwen3-0.6B-ONNX');
    expect(select.selectedOptions[0].textContent).toContain('choisi à la main');
  });

  it('hides the model choices when the browser cannot run a model at all', () => {
    renderSettings({ modelSupported: false });
    expect(screen.queryByLabelText('Modèle')).toBeNull();
    expect(screen.getByLabelText('Profondeur de l’analyse')).toBeTruthy();
  });
});
