// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlaybackControls } from './PlaybackControls';

function renderControls(overrides: Partial<React.ComponentProps<typeof PlaybackControls>> = {}) {
  const props: React.ComponentProps<typeof PlaybackControls> = {
    currentPly: 3,
    totalMoves: 20,
    isPlaying: false,
    playbackSpeed: 1,
    criticalCount: 4,
    currentErrorIndex: null,
    hasPrevError: true,
    hasNextError: true,
    pauseOnErrors: true,
    onStart: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onEnd: vi.fn(),
    onTogglePlay: vi.fn(),
    onChangeSpeed: vi.fn(),
    onPrevError: vi.fn(),
    onNextError: vi.fn(),
    onTogglePauseOnErrors: vi.fn(),
    onFlip: vi.fn(),
    ...overrides,
  };
  render(<PlaybackControls {...props} />);
  return props;
}

const toggle = () => screen.getByRole('button', { name: 'Pause de la lecture automatique sur les erreurs' });

describe('PlaybackControls pause on errors', () => {
  it('shows whether auto-play stops on errors, and says what a click does', () => {
    renderControls({ pauseOnErrors: true });
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(toggle().title).toContain('cliquer pour désactiver');
  });

  it('shows when it does not', () => {
    renderControls({ pauseOnErrors: false });
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(toggle().title).toContain('cliquer pour activer');
  });

  it('switches the setting', async () => {
    const props = renderControls();
    await userEvent.click(toggle());
    expect(props.onTogglePauseOnErrors).toHaveBeenCalledOnce();
  });

  it('stays out of the way of the other controls', async () => {
    const props = renderControls();
    await userEvent.click(screen.getByRole('button', { name: 'Erreur suivante' }));
    expect(props.onNextError).toHaveBeenCalledOnce();
    expect(props.onTogglePauseOnErrors).not.toHaveBeenCalled();
  });
});
