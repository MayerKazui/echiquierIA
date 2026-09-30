import compression from 'compression';
import express, { type RequestHandler } from 'express';
import path from 'node:path';

/**
 * Cache policy of a built file, by its path relative to the build folder.
 * - `assets/*`: file names carry a content hash, so they never change: cache for a year.
 * - everything else (index.html, the engine, openings.json): names are fixed, so the browser keeps a copy
 *   but must revalidate it (ETag) before using it, and gets a cheap 304 when nothing changed.
 */
export function cacheControlFor(relativePath: string): string {
  const normalized = relativePath.split(path.sep).join('/').replace(/^\/+/, '');
  return normalized.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
}

/** Compression (brotli or gzip) then the built front, with the cache policy above. */
export function staticMiddlewares(root: string): RequestHandler[] {
  return [
    compression(),
    express.static(root, {
      index: false, // index.html goes through the SPA fallback, with its own headers
      setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', cacheControlFor(path.relative(root, filePath)));
      },
    }),
  ];
}

/** SPA fallback: every other GET gets index.html, always revalidated so a new deploy is picked up. */
export function spaFallback(root: string): RequestHandler {
  return (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile('index.html', { root: path.resolve(root) });
  };
}
