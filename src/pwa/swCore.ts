/**
 * The logic of the service worker, apart from the worker itself so that it can be tested: what is cached, when,
 * and which requests it leaves alone. `serviceWorker.ts` wires it to the events of the worker.
 *
 * Strategy:
 * - The files of the build (the page, the scripts, the styles, the icons) are cached when the worker installs, and
 *   the heavy ones (the engine, the openings database) as soon as they can be: they are what makes the analysis work
 *   offline. The page being asked for goes to the network first (a new deployment is seen at once) and falls back to
 *   the cached page when the network fails or is too slow.
 * - Files of the site are served from the cache first, and cached when they come from the network.
 * - Everything else is left to the browser: other sites (chess.com, Lichess), the API of the AI coach, anything
 *   that is not a GET.
 */

export interface SwConfig {
  /** Changes with the content of the build: a new build is a new cache. */
  version: string;
  /** Files needed to start the app, relative to the scope. The installation fails if one is missing. */
  critical: string[];
  /** Heavy files (engine, openings): cached when possible, a failure is not an installation failure. */
  optional: string[];
}

export const CACHE_PREFIX = 'echiquier-ia-';
export const cacheName = (version: string): string => `${CACHE_PREFIX}${version}`;

/** Wait this long (ms) for the network before showing the cached page. */
export const NAVIGATION_TIMEOUT_MS = 4000;

export type RequestKind = 'navigate' | 'asset' | 'ignore';

export interface RequestLike {
  method: string;
  mode: string;
  url: string;
  headers: { has(name: string): boolean };
}

/** What the worker does with a request: serve the page, serve a file of the site, or leave it alone. */
export function requestKind(request: RequestLike, scope: string): RequestKind {
  if (request.method !== 'GET') return 'ignore';
  // A partial request (Range) cannot be answered with a whole cached file
  if (request.headers.has('range')) return 'ignore';
  const url = new URL(request.url);
  const base = new URL(scope);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return 'ignore';
  if (url.pathname.startsWith(`${base.pathname}api/`)) return 'ignore';
  return request.mode === 'navigate' ? 'navigate' : 'asset';
}

/** The page the app starts from, in the cache. */
export const indexUrl = (scope: string): string => new URL('index.html', scope).href;

export interface CacheLike {
  addAll(urls: string[]): Promise<void>;
  add(url: string): Promise<void>;
  put(request: unknown, response: unknown): Promise<void>;
  match(request: unknown): Promise<ResponseLike | undefined>;
}

export interface ResponseLike {
  ok: boolean;
  status: number;
  type: string;
  clone(): ResponseLike;
}

export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
  match(request: unknown): Promise<ResponseLike | undefined>;
}

const resolve = (paths: string[], scope: string) => paths.map((path) => new URL(path, scope).href);

/** Caches the files of the build: the critical ones together, the heavy ones one by one. */
export async function install(config: SwConfig, scope: string, caches: CacheStorageLike): Promise<void> {
  const cache = await caches.open(cacheName(config.version));
  await cache.addAll(resolve(config.critical, scope));
  await Promise.all(
    resolve(config.optional, scope).map(async (url) => {
      try {
        await cache.add(url);
      } catch {
        // Cached later, when the app asks for it
      }
    })
  );
}

/** Removes the caches of the previous builds. */
export async function activate(config: SwConfig, caches: CacheStorageLike): Promise<void> {
  const current = cacheName(config.version);
  for (const name of await caches.keys()) {
    if (name.startsWith(CACHE_PREFIX) && name !== current) await caches.delete(name);
  }
}

export interface FetchDeps {
  config: SwConfig;
  scope: string;
  caches: CacheStorageLike;
  fetch: (request: unknown) => Promise<ResponseLike>;
  /** Waits `ms` then rejects: the network took too long. */
  timeout?: (ms: number) => Promise<never>;
}

/** A response worth keeping: it came from the site and succeeded. */
const isCacheable = (response: ResponseLike) => response.ok && response.status === 200 && response.type === 'basic';

async function store(deps: FetchDeps, request: unknown, response: ResponseLike): Promise<void> {
  try {
    const cache = await deps.caches.open(cacheName(deps.config.version));
    await cache.put(request, response.clone());
  } catch {
    // The cache is full or unavailable: the response is still served
  }
}

/** The page: from the network when it answers in time, else the cached one. */
export async function handleNavigation(request: unknown, deps: FetchDeps): Promise<ResponseLike> {
  const wait = deps.timeout ? deps.timeout(NAVIGATION_TIMEOUT_MS) : null;
  try {
    const network = deps.fetch(request);
    return await (wait ? Promise.race([network, wait]) : network);
  } catch (error) {
    const cached = await deps.caches.match(indexUrl(deps.scope));
    if (cached) return cached;
    throw error;
  }
}

/** A file of the site: from the cache, else from the network (and then cached). */
export async function handleAsset(request: unknown, deps: FetchDeps): Promise<ResponseLike> {
  const cached = await deps.caches.match(request);
  if (cached) return cached;
  const response = await deps.fetch(request);
  if (isCacheable(response)) await store(deps, request, response);
  return response;
}
