// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODEL_CACHE_NAME, deleteCachedModel, formatBytes, listCachedModels } from './localModelCache';

/** A Cache API in memory: what the browser keeps, as far as the module reads it. */
function fakeCaches(initial: Record<string, Record<string, number | null>> = {}) {
  const stores = new Map<string, Map<string, number | null>>(
    Object.entries(initial).map(([name, files]) => [name, new Map(Object.entries(files))])
  );
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, number | null>();
    stores.set(name, store);
    return {
      keys: async () => [...store.keys()].map((url) => ({ url })),
      match: async (request: { url: string }) =>
        store.has(request.url)
          ? {
              headers: new Headers(
                store.get(request.url) === null ? {} : { 'content-length': String(store.get(request.url)) }
              ),
            }
          : undefined,
      delete: async (request: { url: string }) => store.delete(request.url),
    };
  };
  vi.stubGlobal('caches', { has: async (name: string) => stores.has(name), open });
  return stores;
}

const HF = 'https://huggingface.co';

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('listCachedModels', () => {
  it('groups the files by model and adds up their sizes, largest model first', async () => {
    fakeCaches({
      [MODEL_CACHE_NAME]: {
        [`${HF}/onnx-community/Qwen2.5-0.5B-Instruct/resolve/main/config.json`]: 700,
        [`${HF}/onnx-community/Qwen2.5-0.5B-Instruct/resolve/main/onnx/model_q4f16.onnx`]: 483_000_000,
        [`${HF}/onnx-community/Qwen3-1.7B-ONNX/resolve/main/onnx/model_q4f16.onnx`]: 1_426_000_000,
      },
    });
    expect(await listCachedModels()).toEqual([
      { repo: 'onnx-community/Qwen3-1.7B-ONNX', bytes: 1_426_000_000, files: 1 },
      { repo: 'onnx-community/Qwen2.5-0.5B-Instruct', bytes: 483_000_700, files: 2 },
    ]);
  });

  it('says the size is unknown when a file did not keep its length', async () => {
    fakeCaches({ [MODEL_CACHE_NAME]: { [`${HF}/org/model/resolve/main/a.onnx`]: null } });
    expect((await listCachedModels())[0].bytes).toBeNull();
  });

  it('ignores what is not a file of a model', async () => {
    fakeCaches({ [MODEL_CACHE_NAME]: { 'https://example.com/page': 10, 'not a url': 10 } });
    expect(await listCachedModels()).toEqual([]);
  });

  it('is empty without a cache, and without the Cache API', async () => {
    fakeCaches({});
    expect(await listCachedModels()).toEqual([]);
    vi.stubGlobal('caches', undefined);
    expect(await listCachedModels()).toEqual([]);
  });
});

describe('deleteCachedModel', () => {
  it('removes every file of that model and only those', async () => {
    const stores = fakeCaches({
      [MODEL_CACHE_NAME]: {
        [`${HF}/org/old/resolve/main/config.json`]: 10,
        [`${HF}/org/old/resolve/main/onnx/model.onnx`]: 100,
        [`${HF}/org/new/resolve/main/onnx/model.onnx`]: 200,
      },
    });
    expect(await deleteCachedModel('org/old')).toBe(2);
    expect([...stores.get(MODEL_CACHE_NAME)!.keys()]).toEqual([`${HF}/org/new/resolve/main/onnx/model.onnx`]);
  });

  it('removes nothing, without failing, when the model is not there or there is no cache', async () => {
    fakeCaches({ [MODEL_CACHE_NAME]: { [`${HF}/org/new/resolve/main/a.onnx`]: 1 } });
    expect(await deleteCachedModel('org/absent')).toBe(0);
    fakeCaches({});
    expect(await deleteCachedModel('org/new')).toBe(0);
  });
});

describe('formatBytes', () => {
  it('writes gigabytes and megabytes in French', () => {
    expect(formatBytes(1_426_000_000)).toBe('1,4 Go');
    expect(formatBytes(483_000_700)).toBe('483 Mo');
    expect(formatBytes(200)).toBe('1 Mo');
    expect(formatBytes(null)).toBe('taille inconnue');
  });
});
