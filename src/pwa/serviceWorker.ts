/// <reference lib="webworker" />
import {
  activate,
  handleAsset,
  handleNavigation,
  install,
  requestKind,
  type CacheStorageLike,
  type ResponseLike,
  type SwConfig,
} from './swCore';

/**
 * Entry of the service worker (`sw.js`, built with the app: see `vite/serviceWorkerPlugin.ts`). The build puts the
 * list of its files and a version in `__SW_CONFIG__`.
 */
declare const __SW_CONFIG__: SwConfig;

const worker = self as unknown as ServiceWorkerGlobalScope;
const caches_ = worker.caches as unknown as CacheStorageLike;
const scope = () => worker.registration.scope;

const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
const fetchRequest = (request: unknown) => fetch(request as Request) as unknown as Promise<ResponseLike>;

worker.addEventListener('install', (event) => {
  // The new version waits for the page to ask for it (see `SKIP_WAITING`): a page open on the old one keeps working
  event.waitUntil(install(__SW_CONFIG__, scope(), caches_));
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(activate(__SW_CONFIG__, caches_).then(() => worker.clients.claim()));
});

worker.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void worker.skipWaiting();
});

worker.addEventListener('fetch', (event) => {
  const kind = requestKind(event.request, scope());
  if (kind === 'ignore') return;
  const deps = { config: __SW_CONFIG__, scope: scope(), caches: caches_, fetch: fetchRequest, timeout };
  event.respondWith(
    (kind === 'navigate'
      ? handleNavigation(event.request, deps)
      : handleAsset(event.request, deps)) as Promise<Response>
  );
});
