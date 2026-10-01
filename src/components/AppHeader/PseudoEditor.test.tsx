// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PseudoEditor } from './PseudoEditor';

describe('PseudoEditor', () => {
  it('does not open the blocking browser prompt', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    render(<PseudoEditor pseudo="Magnus" onChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Pseudo du joueur : Magnus/ }));
    expect(prompt).not.toHaveBeenCalled();
    prompt.mockRestore();
  });

  it('opens a form on the current pseudo and saves the trimmed value with Enter', async () => {
    const onChange = vi.fn();
    render(<PseudoEditor pseudo="Magnus" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Pseudo du joueur/ }));
    const input = screen.getByLabelText('Votre pseudo dans la partie') as HTMLInputElement;
    expect(input.value).toBe('Magnus');
    expect(document.activeElement).toBe(input);
    await userEvent.clear(input);
    await userEvent.type(input, '  Hikaru {Enter}');
    expect(onChange).toHaveBeenCalledWith('Hikaru');
    expect(screen.queryByRole('form')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Pseudo du joueur/ }));
  });

  it('Escape and Annuler close without saving', async () => {
    const onChange = vi.fn();
    render(<PseudoEditor pseudo="Magnus" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: /Pseudo du joueur/ });
    await userEvent.click(trigger);
    await userEvent.type(screen.getByLabelText('Votre pseudo dans la partie'), 'x{Escape}');
    expect(screen.queryByLabelText('Votre pseudo dans la partie')).toBeNull();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByLabelText('Votre pseudo dans la partie')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a click elsewhere closes it without saving, and the form starts again from the saved pseudo', async () => {
    const onChange = vi.fn();
    render(
      <div>
        <PseudoEditor pseudo="Magnus" onChange={onChange} />
        <button>ailleurs</button>
      </div>
    );
    const trigger = screen.getByRole('button', { name: /Pseudo du joueur/ });
    await userEvent.click(trigger);
    await userEvent.type(screen.getByLabelText('Votre pseudo dans la partie'), 'zzz');
    await userEvent.click(screen.getByRole('button', { name: 'ailleurs' }));
    expect(screen.queryByLabelText('Votre pseudo dans la partie')).toBeNull();
    await userEvent.click(trigger);
    expect((screen.getByLabelText('Votre pseudo dans la partie') as HTMLInputElement).value).toBe('Magnus');
    expect(onChange).not.toHaveBeenCalled();
  });
});
