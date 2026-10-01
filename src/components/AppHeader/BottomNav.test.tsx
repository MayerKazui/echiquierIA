// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BottomNav } from './BottomNav';

describe('BottomNav', () => {
  it('is a labelled navigation with both views, the current one pressed', () => {
    render(<BottomNav activeTab="board" onChangeTab={() => {}} />);
    expect(screen.getByRole('navigation', { name: 'Vue' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Échiquier' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Bilan' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('switches the view', async () => {
    const onChangeTab = vi.fn();
    render(<BottomNav activeTab="board" onChangeTab={onChangeTab} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bilan' }));
    expect(onChangeTab).toHaveBeenCalledWith('dashboard');
  });

  it('keeps the summary out of reach while an analysis runs', async () => {
    const onChangeTab = vi.fn();
    render(<BottomNav activeTab="board" isAnalyzing onChangeTab={onChangeTab} />);
    const bilan = screen.getByRole('button', { name: 'Bilan' }) as HTMLButtonElement;
    expect(bilan.disabled).toBe(true);
    await userEvent.click(bilan);
    expect(onChangeTab).not.toHaveBeenCalled();
  });
});
