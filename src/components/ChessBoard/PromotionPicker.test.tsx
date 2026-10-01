// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PromotionPicker } from './PromotionPicker';

const promotion = { from: 'a7', to: 'a8', color: 'w' } as const;

describe('PromotionPicker', () => {
  it('offers the four pieces, the queen focused first', () => {
    render(<PromotionPicker promotion={promotion} onChoose={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('dialog', { name: /Promotion/ })).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Dame',
      'Tour',
      'Fou',
      'Cavalier',
    ]);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dame' }));
  });

  it('reports the chosen piece, including an under-promotion', async () => {
    const onChoose = vi.fn();
    render(<PromotionPicker promotion={promotion} onChoose={onChoose} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cavalier' }));
    expect(onChoose).toHaveBeenCalledWith('n');
  });

  it('Escape and a click outside cancel; a click inside does not', async () => {
    const onCancel = vi.fn();
    const { container } = render(<PromotionPicker promotion={promotion} onChoose={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('dialog'));
    expect(onCancel).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.click(container.firstElementChild!);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
