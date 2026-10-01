// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BatchView } from '../../hooks/useBatchAnalysis';
import { BatchAnalysisBanner } from './BatchAnalysisBanner';

const view = (over: Partial<BatchView> = {}): BatchView => ({
  status: 'running',
  total: 10,
  done: 3,
  failed: 1,
  failedLabels: ['contre Opp2 · Défaite · Blitz 5+3 · 3 oct.'],
  current: { id: 'g5', pgn: '1. e4 *', label: 'contre Opp5' },
  fraction: 0.5,
  ...over,
});

function renderBanner(batch: BatchView) {
  const handlers = { onResume: vi.fn(), onCancel: vi.fn(), onDismiss: vi.fn() };
  const { container } = render(<BatchAnalysisBanner batch={batch} {...handlers} />);
  return { ...handlers, container };
}

describe('BatchAnalysisBanner', () => {
  it('shows nothing when there is no queue', () => {
    const { container } = renderBanner(view({ status: 'idle', total: 0, done: 0, failed: 0, current: null }));
    expect(container.firstChild).toBeNull();
  });

  describe('while the queue runs', () => {
    it('says which game it is on, out of how many, and against whom', () => {
      renderBanner(view());
      // 3 done + 1 failed: the 5th game is being analysed
      expect(screen.getByRole('status').textContent).toContain('Analyse en lot : partie 5 sur 10');
      expect(screen.getByRole('status').textContent).toContain('contre Opp5');
    });

    it('keeps counting the games that failed while it goes on', () => {
      renderBanner(view());
      expect(screen.getByRole('status').textContent).toContain('1 partie en échec');
    });

    it('shows the overall progress, the games done plus the part of the current one', () => {
      renderBanner(view());
      const bar = screen.getByRole('progressbar', { name: "Progression de l'analyse en lot" });
      expect(bar.getAttribute('aria-valuenow')).toBe('45'); // (4 + 0.5) / 10
      expect(bar.getAttribute('aria-valuetext')).toBe('45 %');
    });

    it('never goes past the last game', () => {
      renderBanner(view({ done: 10, failed: 0, fraction: 1 }));
      expect(screen.getByRole('status').textContent).toContain('partie 10 sur 10');
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    });

    it('can be cancelled', async () => {
      const { onCancel } = renderBanner(view());
      await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('while it waits for the analysis the user started', () => {
    it('says it is paused and how many games remain', () => {
      renderBanner(view({ status: 'paused', current: null }));
      expect(screen.getByRole('status').textContent).toContain('en pause pendant votre analyse : 6 parties restantes');
    });

    it('says "restante" for the last game, and can still be cancelled', async () => {
      const { onCancel } = renderBanner(view({ status: 'paused', current: null, done: 9, failed: 0 }));
      expect(screen.getByRole('status').textContent).toContain('1 partie restante,');
      await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('when a previous visit left a queue', () => {
    it('offers to resume it or to drop it', async () => {
      const { onResume, onCancel } = renderBanner(view({ status: 'interrupted', current: null }));
      expect(screen.getByRole('status').textContent).toContain('interrompue : 6 parties restantes sur 10');
      await userEvent.click(screen.getByRole('button', { name: 'Reprendre' }));
      await userEvent.click(screen.getByRole('button', { name: 'Abandonner' }));
      expect(onResume).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('once the queue is done', () => {
    it('sums up how many games were analysed', async () => {
      const { onDismiss } = renderBanner(view({ status: 'finished', done: 10, failed: 0, current: null }));
      expect(screen.getByRole('status').textContent).toContain('terminée : 10 parties analysées');
      expect(screen.getByRole('status').textContent).not.toContain('échec');
      await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('says how many games failed, and uses the singular', () => {
      renderBanner(view({ status: 'finished', total: 2, done: 1, failed: 1, current: null }));
      const text = screen.getByRole('status').textContent;
      expect(text).toContain('1 partie analysée');
      expect(text).toContain('1 partie en échec');
    });

    it('names the games that could not be analysed', () => {
      renderBanner(view({ status: 'finished', total: 2, done: 1, failed: 1, current: null }));
      expect(screen.getByRole('status').textContent).toContain(
        'Non analysée : contre Opp2 · Défaite · Blitz 5+3 · 3 oct.'
      );
    });

    it('does not list anything when every game was analysed', () => {
      renderBanner(view({ status: 'finished', done: 10, failed: 0, failedLabels: [], current: null }));
      expect(screen.getByRole('status').textContent).not.toContain('Non analysée');
    });
  });
});
