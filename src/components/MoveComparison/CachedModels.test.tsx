// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listCachedModels = vi.fn();
const deleteCachedModel = vi.fn();
const releaseLocalModel = vi.fn();

vi.mock('../../services/localModelCache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/localModelCache')>()),
  listCachedModels: () => listCachedModels(),
  deleteCachedModel: (repo: string) => deleteCachedModel(repo),
}));
vi.mock('../../services/localLlm', () => ({ releaseLocalModel: () => releaseLocalModel() }));

import { CachedModels } from './CachedModels';

const OLD = { repo: 'onnx-community/Qwen2.5-1.5B-Instruct', bytes: 1_222_000_000, files: 5 };
const CURRENT = { repo: 'onnx-community/Qwen3-1.7B-ONNX', bytes: 1_426_000_000, files: 5 };

beforeEach(() => {
  listCachedModels.mockReset().mockResolvedValue([CURRENT, OLD]);
  deleteCachedModel.mockReset().mockResolvedValue(5);
  releaseLocalModel.mockReset();
});

describe('CachedModels', () => {
  it('lists the downloaded models with their size and marks the one in use', async () => {
    render(<CachedModels refreshKey="idle" currentRepo={CURRENT.repo} />);
    const list = await screen.findByTestId('cached-models');
    expect(list.textContent).toContain('Qwen3 1,7 Md (recommandé)');
    expect(list.textContent).toContain('1,4 Go');
    expect(list.textContent).toContain('Qwen2.5 1,5 Md');
    expect(list.textContent).toContain('1,2 Go');
    expect(list.textContent).toContain('(utilisé)');
  });

  it('deletes the old model, frees the one in memory, and reads the list again', async () => {
    render(<CachedModels refreshKey="idle" currentRepo={CURRENT.repo} />);
    await screen.findByTestId('cached-models');
    listCachedModels.mockResolvedValue([CURRENT]);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le modèle Qwen2.5 1,5 Md' }));
    await waitFor(() => expect(deleteCachedModel).toHaveBeenCalledWith(OLD.repo));
    expect(releaseLocalModel).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('button', { name: /Qwen2.5 1,5 Md/ })).toBeNull());
    expect(screen.getByRole('button', { name: 'Supprimer le modèle Qwen3 1,7 Md (recommandé)' })).toBeTruthy();
  });

  it('shows a model it does not know by its repository', async () => {
    listCachedModels.mockResolvedValue([{ repo: 'org/autre', bytes: null, files: 2 }]);
    render(<CachedModels refreshKey="idle" currentRepo={CURRENT.repo} />);
    const list = await screen.findByTestId('cached-models');
    expect(list.textContent).toContain('org/autre');
    expect(list.textContent).toContain('taille inconnue');
  });

  it('shows nothing when there is nothing to delete, or when the cache cannot be read', async () => {
    listCachedModels.mockResolvedValue([]);
    const { container, rerender } = render(<CachedModels refreshKey="a" currentRepo={CURRENT.repo} />);
    await waitFor(() => expect(listCachedModels).toHaveBeenCalled());
    expect(container.textContent).toBe('');
    listCachedModels.mockRejectedValue(new Error('no cache'));
    rerender(<CachedModels refreshKey="b" currentRepo={CURRENT.repo} />);
    await waitFor(() => expect(listCachedModels).toHaveBeenCalledTimes(2));
    expect(container.textContent).toBe('');
  });

  it('reads the list again when a download ends', async () => {
    const { rerender } = render(<CachedModels refreshKey="model" currentRepo={CURRENT.repo} />);
    await screen.findByTestId('cached-models');
    rerender(<CachedModels refreshKey="idle" currentRepo={CURRENT.repo} />);
    await waitFor(() => expect(listCachedModels).toHaveBeenCalledTimes(2));
  });
});
