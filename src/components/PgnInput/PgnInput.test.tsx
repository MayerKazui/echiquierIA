// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgnInput } from './PgnInput';

function renderInput(props: Partial<React.ComponentProps<typeof PgnInput>> = {}) {
  const onAnalyze = vi.fn();
  render(
    <PgnInput
      currentPgn="1. e4 e5 2. Nf3 Nc6"
      userPseudo=""
      onUpdatePseudo={() => {}}
      onAnalyze={onAnalyze}
      isAnalyzing={false}
      {...props}
    />
  );
  return { onAnalyze };
}

beforeEach(() => {
  localStorage.clear();
});

describe('PgnInput accessibility', () => {
  it('labels the PGN text area and the pseudo field', () => {
    renderInput();
    expect(screen.getByRole('textbox', { name: 'Contenu PGN' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Mon pseudo de joueur' })).toBeTruthy();
  });

  it('offers the depth as a native radio group with the current choice checked', () => {
    renderInput();
    const group = screen.getByRole('radiogroup', { name: /Profondeur de calcul/ });
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(6);
    expect((screen.getByRole('radio', { name: /Standard/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('changes the depth with the arrow keys and remembers it', async () => {
    const user = userEvent.setup();
    renderInput();
    screen.getByRole('radio', { name: /Standard/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect((screen.getByRole('radio', { name: /Poussé/ }) as HTMLInputElement).checked).toBe(true);
    expect(localStorage.getItem('chess_analysis_depth')).toBe('14');
  });

  it('starts the analysis at the chosen depth', async () => {
    const user = userEvent.setup();
    const { onAnalyze } = renderInput();
    await user.click(screen.getByRole('radio', { name: /Expert/ }));
    await user.click(screen.getByRole('button', { name: /Lancer l'Analyse/ }));
    expect(onAnalyze).toHaveBeenCalledWith('1. e4 e5 2. Nf3 Nc6', 16);
  });

  it('lets a keyboard user reach the file picker (the input is not display:none)', () => {
    renderInput();
    const file = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(file.className).toContain('sr-only');
    expect(file.className).not.toContain('hidden');
  });

  it('announces an invalid PGN as an alert', async () => {
    const user = userEvent.setup();
    renderInput({ currentPgn: '' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Contenu PGN' }), { target: { value: '1. e4 e4 zzz' } });
    await user.click(screen.getByRole('button', { name: /Lancer l'Analyse/ }));
    expect((await screen.findByRole('alert')).textContent).toBeTruthy();
  });
});
