import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeBuild, writeServiceWorker } from './serviceWorkerPlugin';

let dist = '';

async function write(file: string, content: string | Buffer = file) {
  const full = path.join(dist, file);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

beforeEach(async () => {
  dist = await mkdtemp(path.join(tmpdir(), 'sw-build-'));
  await write('index.html', '<html></html>');
  await write('assets/index-abc.js', 'console.log(1)');
  await write('assets/index-abc.css', 'a{}');
  await write('manifest.webmanifest', '{}');
  await write('icons/icon-192.png', 'png');
  await write('stockfish-19.js', 'engine');
  await write('stockfish-19.wasm', 'wasm');
  await write('openings.json', '{}');
});

afterEach(async () => {
  await rm(dist, { recursive: true, force: true });
});

describe('describeBuild', () => {
  it('lists the files to start the app as critical, and the engine and the openings as optional', async () => {
    const config = await describeBuild(dist);
    expect(config.critical).toEqual([
      'assets/index-abc.css',
      'assets/index-abc.js',
      'icons/icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
    expect(config.optional).toEqual(['openings.json', 'stockfish-19.js', 'stockfish-19.wasm']);
  });

  it('leaves the puzzles to be cached when used, but a new selection changes the version', async () => {
    await write('puzzles/index.json', '{}');
    await write('puzzles/1000.json', '{}');
    const config = await describeBuild(dist);
    expect([...config.critical, ...config.optional].some((file) => file.startsWith('puzzles/'))).toBe(false);
    await write('puzzles/1000.json', '{"band":1000}');
    expect((await describeBuild(dist)).version).not.toBe(config.version);
  });

  it('leaves the runtime of the local language model to be cached when used', async () => {
    await write('assets/ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm', 'wasm');
    await write('assets/localLlm.worker-Cf0tFivF.js', 'worker');
    await write('assets/index-abc.js', 'app');
    const config = await describeBuild(dist);
    const all = [...config.critical, ...config.optional];
    expect(all).toContain('assets/index-abc.js');
    expect(all.some((file) => file.includes('ort-wasm') || file.includes('localLlm'))).toBe(false);
    await write('assets/ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm', 'other wasm');
    expect((await describeBuild(dist)).version).not.toBe(config.version);
  });

  it('leaves out the worker itself and the source maps', async () => {
    await write('sw.js', 'old worker');
    await write('assets/index-abc.js.map', '{}');
    const config = await describeBuild(dist);
    const all = [...config.critical, ...config.optional];
    expect(all).not.toContain('sw.js');
    expect(all).not.toContain('assets/index-abc.js.map');
  });

  it('has a version that is the same for the same build, and differs when a file changes', async () => {
    const first = (await describeBuild(dist)).version;
    expect((await describeBuild(dist)).version).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{12}$/);
    await write('assets/index-abc.js', 'console.log(2)');
    expect((await describeBuild(dist)).version).not.toBe(first);
  });

  it('has a version that changes when a file is added, even an empty one', async () => {
    const first = (await describeBuild(dist)).version;
    await write('extra.txt', '');
    expect((await describeBuild(dist)).version).not.toBe(first);
  });

  it('is not changed by the worker that is already there', async () => {
    const first = (await describeBuild(dist)).version;
    await write('sw.js', 'something');
    expect((await describeBuild(dist)).version).toBe(first);
  });
});

/** Runs the built `sw.js` in a context that looks like a service worker, and returns what it registered. */
async function runWorker(options: { scope?: string; fetch?: (request: unknown) => Promise<unknown> } = {}) {
  const code = await readFile(path.join(dist, 'sw.js'), 'utf8');
  const handlers: Record<string, (event: unknown) => void> = {};
  const stores = new Map<string, Map<string, unknown>>();
  // The cache is asked with a request (or a URL): either way it is keyed by the URL
  const urlOf = (key: unknown) =>
    typeof key === 'object' && key !== null && 'url' in key ? String(key.url) : String(key);
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        addAll: async (urls: string[]) => urls.forEach((url) => store.set(url, { cached: url, ok: true })),
        add: async (url: string) => void store.set(url, { cached: url, ok: true }),
        put: async (key: unknown, value: unknown) => void store.set(urlOf(key), value),
        match: async (key: unknown) => store.get(urlOf(key)),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (key: unknown) => {
      for (const store of stores.values()) if (store.has(urlOf(key))) return store.get(urlOf(key));
      return undefined;
    },
  };
  const skipWaiting = vi.fn();
  const claim = vi.fn(async () => {});
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers[type] = handler;
    },
    registration: { scope: options.scope ?? 'https://example.com/' },
    caches,
    skipWaiting,
    clients: { claim },
  };
  const fetchSpy = vi.fn(
    options.fetch ??
      (async () => ({
        ok: true,
        status: 200,
        type: 'basic',
        clone() {
          return this;
        },
      }))
  );
  vm.runInNewContext(code, { self, fetch: fetchSpy, URL, setTimeout, Promise, Error });
  const waitUntil = async (type: string, event: Record<string, unknown> = {}) => {
    let pending: Promise<unknown> = Promise.resolve();
    handlers[type]({ ...event, waitUntil: (promise: Promise<unknown>) => (pending = promise) });
    await pending;
  };
  return { handlers, stores, skipWaiting, claim, fetchSpy, waitUntil };
}

describe('writeServiceWorker', () => {
  it('writes sw.js with the version of the build, and returns what it caches', async () => {
    const config = await writeServiceWorker(dist);
    const code = await readFile(path.join(dist, 'sw.js'), 'utf8');
    expect(code).toContain(config.version);
    expect(code).toContain('assets/index-abc.js');
    expect(code).toContain('stockfish-19.wasm');
    // The configuration is a constant of the build: nothing is left to define
    expect(code).not.toContain('__SW_CONFIG__');
  });

  it('writes a worker that does not change the version it is built from (it is not part of it)', async () => {
    const first = await writeServiceWorker(dist);
    const second = await writeServiceWorker(dist);
    expect(second.version).toBe(first.version);
  });

  describe('the worker it writes', () => {
    it('caches the build when it installs', async () => {
      const config = await writeServiceWorker(dist);
      const worker = await runWorker();
      await worker.waitUntil('install');
      const cached = [...worker.stores.get(`echiquier-ia-${config.version}`)!.keys()];
      expect(cached).toContain('https://example.com/index.html');
      expect(cached).toContain('https://example.com/assets/index-abc.js');
      expect(cached).toContain('https://example.com/stockfish-19.wasm');
      expect(cached).toContain('https://example.com/openings.json');
    });

    it('resolves the files against its scope (a site in a sub-folder)', async () => {
      await writeServiceWorker(dist);
      const worker = await runWorker({ scope: 'https://user.github.io/echiquierIA/' });
      await worker.waitUntil('install');
      const cached = [...[...worker.stores.values()][0].keys()];
      expect(cached).toContain('https://user.github.io/echiquierIA/index.html');
    });

    it('does not take over by itself when it installs, the page decides', async () => {
      await writeServiceWorker(dist);
      const worker = await runWorker();
      await worker.waitUntil('install');
      expect(worker.skipWaiting).not.toHaveBeenCalled();
    });

    it('takes over when the page asks, and only then', async () => {
      await writeServiceWorker(dist);
      const worker = await runWorker();
      worker.handlers.message({ data: { type: 'SOMETHING_ELSE' } });
      worker.handlers.message({ data: null });
      expect(worker.skipWaiting).not.toHaveBeenCalled();
      worker.handlers.message({ data: { type: 'SKIP_WAITING' } });
      expect(worker.skipWaiting).toHaveBeenCalledTimes(1);
    });

    it('removes the old caches and claims the pages when it activates', async () => {
      const config = await writeServiceWorker(dist);
      const worker = await runWorker();
      await worker.stores.set('echiquier-ia-old', new Map());
      await worker.waitUntil('activate');
      expect([...worker.stores.keys()]).not.toContain('echiquier-ia-old');
      expect(worker.claim).toHaveBeenCalledTimes(1);
      void config;
    });

    it('serves a cached file and leaves the API and other sites to the browser', async () => {
      await writeServiceWorker(dist);
      const worker = await runWorker();
      await worker.waitUntil('install');
      const respond = (url: string, mode = 'cors') => {
        const respondWith = vi.fn();
        worker.handlers.fetch({
          request: { method: 'GET', mode, url, headers: { has: () => false } },
          respondWith,
        });
        return respondWith;
      };
      expect(respond('https://example.com/api/explain')).not.toHaveBeenCalled();
      expect(respond('https://api.chess.com/pub/player/x')).not.toHaveBeenCalled();
      const respondWith = respond('https://example.com/stockfish-19.wasm');
      expect(respondWith).toHaveBeenCalledTimes(1);
      expect(await respondWith.mock.calls[0][0]).toMatchObject({ cached: 'https://example.com/stockfish-19.wasm' });
      expect(worker.fetchSpy).not.toHaveBeenCalled();
    });

    it('serves the cached page when a navigation fails (offline)', async () => {
      await writeServiceWorker(dist);
      const worker = await runWorker({
        fetch: async () => {
          throw new TypeError('offline');
        },
      });
      await worker.waitUntil('install').catch(() => {});
      const respondWith = vi.fn();
      worker.handlers.fetch({
        request: { method: 'GET', mode: 'navigate', url: 'https://example.com/', headers: { has: () => false } },
        respondWith,
      });
      expect(await respondWith.mock.calls[0][0]).toMatchObject({ cached: 'https://example.com/index.html' });
    });
  });
});
