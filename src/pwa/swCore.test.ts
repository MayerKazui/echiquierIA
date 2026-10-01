import { describe, expect, it, vi } from 'vitest';
import {
  CACHE_PREFIX,
  NAVIGATION_TIMEOUT_MS,
  activate,
  cacheName,
  handleAsset,
  handleNavigation,
  indexUrl,
  install,
  requestKind,
  type CacheLike,
  type CacheStorageLike,
  type FetchDeps,
  type RequestLike,
  type ResponseLike,
  type SwConfig,
} from './swCore';

const SCOPE = 'https://example.com/echiquierIA/';
const config: SwConfig = {
  version: 'v2',
  critical: ['index.html', 'assets/app.js'],
  optional: ['stockfish-19.wasm', 'openings.json'],
};

const request = (url: string, over: Partial<RequestLike> = {}): RequestLike => ({
  method: 'GET',
  mode: 'cors',
  url,
  headers: { has: () => false },
  ...over,
});

function response(over: Partial<ResponseLike> = {}): ResponseLike {
  const value: ResponseLike = { ok: true, status: 200, type: 'basic', clone: () => ({ ...value }), ...over };
  return value;
}

/** In-memory caches; `fail` makes the given URLs fail to be added. */
function fakeCaches(fail: string[] = []) {
  const stores = new Map<string, Map<unknown, ResponseLike>>();
  const open = async (name: string): Promise<CacheLike> => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      addAll: async (urls) => {
        if (urls.some((url) => fail.includes(url))) throw new Error('addAll failed');
        for (const url of urls) store.set(url, response());
      },
      add: async (url) => {
        if (fail.includes(url)) throw new Error('add failed');
        store.set(url, response());
      },
      put: async (key, value) => void store.set(key, value as ResponseLike),
      match: async (key) => store.get(key),
    };
  };
  const storage: CacheStorageLike = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (key) => {
      for (const store of stores.values()) if (store.has(key)) return store.get(key);
      return undefined;
    },
  };
  return { storage, stores };
}

describe('cacheName', () => {
  it('carries the version, so that a new build is a new cache', () => {
    expect(cacheName('abc')).toBe(`${CACHE_PREFIX}abc`);
    expect(cacheName('abc')).not.toBe(cacheName('abd'));
  });
});

describe('requestKind', () => {
  it('serves the page for a navigation inside the site', () => {
    expect(requestKind(request(`${SCOPE}`, { mode: 'navigate' }), SCOPE)).toBe('navigate');
    expect(requestKind(request(`${SCOPE}?x=1`, { mode: 'navigate' }), SCOPE)).toBe('navigate');
  });

  it('serves a file of the site from the cache', () => {
    expect(requestKind(request(`${SCOPE}assets/app.js`), SCOPE)).toBe('asset');
    expect(requestKind(request(`${SCOPE}stockfish-19.wasm`), SCOPE)).toBe('asset');
    expect(requestKind(request(`${SCOPE}openings.json`), SCOPE)).toBe('asset');
  });

  it('leaves alone what is not a GET', () => {
    expect(requestKind(request(`${SCOPE}assets/app.js`, { method: 'POST' }), SCOPE)).toBe('ignore');
  });

  it('leaves alone a request for part of a file (Range)', () => {
    expect(requestKind(request(`${SCOPE}stockfish-19.wasm`, { headers: { has: (n) => n === 'range' } }), SCOPE)).toBe(
      'ignore'
    );
  });

  it('leaves alone other sites (chess.com, Lichess, fonts)', () => {
    expect(requestKind(request('https://api.chess.com/pub/player/x/games/archives'), SCOPE)).toBe('ignore');
    expect(requestKind(request('https://lichess.org/api/games/user/x'), SCOPE)).toBe('ignore');
    expect(requestKind(request('https://example.com.evil.net/echiquierIA/a.js'), SCOPE)).toBe('ignore');
  });

  it('leaves alone the API of the site (the AI coach)', () => {
    expect(requestKind(request(`${SCOPE}api/explain`), SCOPE)).toBe('ignore');
    expect(requestKind(request(`${SCOPE}api/health`, { mode: 'navigate' }), SCOPE)).toBe('ignore');
  });

  it('leaves alone what is outside the scope of the site', () => {
    expect(requestKind(request('https://example.com/other/app.js'), SCOPE)).toBe('ignore');
  });

  it('works for a site at the root', () => {
    const root = 'https://example.com/';
    expect(requestKind(request('https://example.com/assets/a.js'), root)).toBe('asset');
    expect(requestKind(request('https://example.com/api/x'), root)).toBe('ignore');
    expect(requestKind(request('https://example.com/', { mode: 'navigate' }), root)).toBe('navigate');
  });
});

describe('indexUrl', () => {
  it('is the page next to the worker', () => {
    expect(indexUrl(SCOPE)).toBe(`${SCOPE}index.html`);
  });
});

describe('install', () => {
  it('caches the files of the build, the heavy ones too', async () => {
    const { storage, stores } = fakeCaches();
    await install(config, SCOPE, storage);
    expect([...stores.get('echiquier-ia-v2')!.keys()].sort()).toEqual(
      [`${SCOPE}assets/app.js`, `${SCOPE}index.html`, `${SCOPE}openings.json`, `${SCOPE}stockfish-19.wasm`].sort()
    );
  });

  it('is not stopped by a heavy file that cannot be downloaded', async () => {
    const { storage, stores } = fakeCaches([`${SCOPE}stockfish-19.wasm`]);
    await expect(install(config, SCOPE, storage)).resolves.toBeUndefined();
    const cached = [...stores.get('echiquier-ia-v2')!.keys()];
    expect(cached).toContain(`${SCOPE}openings.json`);
    expect(cached).not.toContain(`${SCOPE}stockfish-19.wasm`);
  });

  it('fails when a file needed to start the app cannot be downloaded', async () => {
    const { storage } = fakeCaches([`${SCOPE}assets/app.js`]);
    await expect(install(config, SCOPE, storage)).rejects.toThrow('addAll failed');
  });
});

describe('activate', () => {
  it('removes the caches of the previous builds, and only the ones of this app', async () => {
    const { storage, stores } = fakeCaches();
    await storage.open('echiquier-ia-v1');
    await storage.open('echiquier-ia-v2');
    await storage.open('another-app-cache');
    await activate(config, storage);
    expect([...stores.keys()].sort()).toEqual(['another-app-cache', 'echiquier-ia-v2']);
  });
});

describe('handleNavigation', () => {
  const deps = (
    over: Partial<FetchDeps> = {},
    fail: string[] = []
  ): FetchDeps & { stores: ReturnType<typeof fakeCaches>['stores'] } => {
    const { storage, stores } = fakeCaches(fail);
    return { config, scope: SCOPE, caches: storage, fetch: async () => response(), stores, ...over };
  };

  it('serves the page from the network when it answers', async () => {
    const network = response();
    const d = deps({ fetch: async () => network });
    expect(await handleNavigation({}, d)).toBe(network);
  });

  it('serves the cached page when the network fails (offline)', async () => {
    const d = deps({
      fetch: async () => {
        throw new TypeError('offline');
      },
    });
    const cache = await d.caches.open('echiquier-ia-v2');
    const cachedPage = response();
    await cache.put(indexUrl(SCOPE), cachedPage);
    expect(await handleNavigation({}, d)).toBe(cachedPage);
  });

  it('fails like the network when there is no cached page either', async () => {
    const error = new TypeError('offline');
    const d = deps({
      fetch: async () => {
        throw error;
      },
    });
    await expect(handleNavigation({}, d)).rejects.toBe(error);
  });

  it('serves the cached page when the network takes too long', async () => {
    const timeout = vi.fn((ms: number) => Promise.reject(new Error(`timeout ${ms}`)));
    const d = deps({ fetch: () => new Promise<ResponseLike>(() => {}), timeout });
    const cache = await d.caches.open('echiquier-ia-v2');
    const cachedPage = response();
    await cache.put(indexUrl(SCOPE), cachedPage);
    expect(await handleNavigation({}, d)).toBe(cachedPage);
    expect(timeout).toHaveBeenCalledWith(NAVIGATION_TIMEOUT_MS);
  });

  it('prefers a network that answers before the timeout', async () => {
    const network = response();
    const d = deps({ fetch: async () => network, timeout: () => new Promise<never>(() => {}) });
    expect(await handleNavigation({}, d)).toBe(network);
  });

  it('serves an error page from the server as it is (the cache is for failures of the network)', async () => {
    const serverError = response({ ok: false, status: 500 });
    const d = deps({ fetch: async () => serverError });
    expect(await handleNavigation({}, d)).toBe(serverError);
  });
});

describe('handleAsset', () => {
  const setup = (fetchImpl: FetchDeps['fetch']) => {
    const { storage, stores } = fakeCaches();
    const deps: FetchDeps = { config, scope: SCOPE, caches: storage, fetch: fetchImpl };
    return { deps, stores, cache: () => stores.get('echiquier-ia-v2') };
  };

  it('serves a cached file without asking the network', async () => {
    const fetchSpy = vi.fn(async () => response());
    const { deps, stores } = setup(fetchSpy);
    const cached = response();
    stores.set('echiquier-ia-v2', new Map([['key', cached]]));
    expect(await handleAsset('key', deps)).toBe(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches a file that is not cached, and keeps it', async () => {
    const network = response();
    const { deps, cache } = setup(async () => network);
    expect(await handleAsset('key', deps)).toBe(network);
    expect(cache()?.has('key')).toBe(true);
  });

  it.each([
    ['an error', { ok: false, status: 404 }],
    ['a partial response', { status: 206 }],
    ['an opaque response', { type: 'opaque' }],
    ['a redirect to another origin', { type: 'cors' }],
  ])('does not keep %s', async (_, over) => {
    const network = response(over);
    const { deps, cache } = setup(async () => network);
    expect(await handleAsset('key', deps)).toBe(network);
    expect(cache()?.has('key') ?? false).toBe(false);
  });

  it('serves the response even when it cannot be kept (full cache)', async () => {
    const network = response();
    const { deps } = setup(async () => network);
    deps.caches = {
      ...deps.caches,
      open: async () => {
        throw new Error('quota');
      },
    };
    expect(await handleAsset('key', deps)).toBe(network);
  });

  it('fails like the network when the file is neither cached nor reachable', async () => {
    const error = new TypeError('offline');
    const { deps } = setup(async () => {
      throw error;
    });
    await expect(handleAsset('key', deps)).rejects.toBe(error);
  });

  it('keeps a copy: the response served can still be read', async () => {
    const clone = vi.fn(() => response());
    const network = response({ clone });
    const { deps } = setup(async () => network);
    await handleAsset('key', deps);
    expect(clone).toHaveBeenCalledTimes(1);
  });
});
