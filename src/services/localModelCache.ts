/**
 * The models the coach has downloaded, as the browser keeps them. The library stores each file of a model in the Cache API
 * (`transformers-cache`), under its URL on Hugging Face: `https://huggingface.co/<org>/<model>/resolve/main/<file>`.
 * Nothing leaves the browser to read or clear them, and clearing one is the only way to get its space back.
 */

export const MODEL_CACHE_NAME = 'transformers-cache';

export interface CachedModel {
  /** `org/model`. */
  repo: string;
  /** What its files weigh, from their `content-length`; null when the browser did not keep it. */
  bytes: number | null;
  files: number;
}

const REPO_OF_URL = /^\/([^/]+\/[^/]+)\/resolve\//;

const repoOf = (url: string): string | null => {
  try {
    return REPO_OF_URL.exec(new URL(url).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
};

const cachesAvailable = (): boolean => typeof caches !== 'undefined';

/** The models in the cache, largest first. Empty when there is no cache (an old browser, a private window). */
export async function listCachedModels(): Promise<CachedModel[]> {
  if (!cachesAvailable() || !(await caches.has(MODEL_CACHE_NAME))) return [];
  const cache = await caches.open(MODEL_CACHE_NAME);
  const found = new Map<string, CachedModel>();
  for (const request of await cache.keys()) {
    const repo = repoOf(request.url);
    if (!repo) continue;
    const response = await cache.match(request);
    const length = Number(response?.headers.get('content-length'));
    const entry = found.get(repo) ?? { repo, bytes: 0, files: 0 };
    entry.files += 1;
    entry.bytes = entry.bytes !== null && Number.isFinite(length) && length > 0 ? entry.bytes + length : null;
    found.set(repo, entry);
  }
  return [...found.values()].sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0));
}

/** Removes every file of a model from the cache. Resolves with how many files were removed. */
export async function deleteCachedModel(repo: string): Promise<number> {
  if (!cachesAvailable() || !(await caches.has(MODEL_CACHE_NAME))) return 0;
  const cache = await caches.open(MODEL_CACHE_NAME);
  let removed = 0;
  for (const request of await cache.keys()) {
    if (repoOf(request.url) === repo && (await cache.delete(request))) removed += 1;
  }
  return removed;
}

/** "1,2 Go", "480 Mo", "?" when the size is not known. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'taille inconnue';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace('.', ',')} Go`;
  return `${Math.max(1, Math.round(bytes / 1e6))} Mo`;
}
