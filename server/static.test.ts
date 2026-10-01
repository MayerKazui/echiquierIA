import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cacheControlFor, spaFallback, staticMiddlewares } from './static';

describe('cacheControlFor', () => {
  it('caches hashed build assets for a year', () => {
    expect(cacheControlFor('assets/index-Jcdy9Zbo.js')).toBe('public, max-age=31536000, immutable');
    expect(cacheControlFor('assets/chunks/Dashboard-abc123.js')).toBe('public, max-age=31536000, immutable');
    expect(cacheControlFor(`assets${path.sep}index.css`)).toBe('public, max-age=31536000, immutable');
  });

  it('makes the browser revalidate files whose name never changes', () => {
    for (const file of ['index.html', 'stockfish-19.wasm', 'stockfish-19.js', 'openings.json', 'favicon.svg']) {
      expect(cacheControlFor(file), file).toBe('no-cache');
    }
  });

  it('does not mistake a file that merely starts with "assets" for the assets folder', () => {
    expect(cacheControlFor('assets-list.json')).toBe('no-cache');
  });
});

describe('static middlewares', () => {
  let server: Server;
  let root: string;
  let base: string;
  const bigText = JSON.stringify({ positions: Array.from({ length: 400 }, (_, i) => `position-${i}`) });

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'dist-'));
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>app</title>');
    writeFileSync(path.join(root, 'openings.json'), bigText);
    writeFileSync(path.join(root, 'assets', 'app-abc123.js'), 'console.log("x");'.repeat(200));

    const app = express();
    app.use(...staticMiddlewares(root));
    app.get('*', spaFallback(root));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('compresses large text files with brotli, or gzip when brotli is not accepted', async () => {
    const br = await fetch(`${base}/openings.json`, { headers: { 'Accept-Encoding': 'br, gzip' } });
    expect(br.headers.get('content-encoding')).toBe('br');
    expect(await br.text()).toBe(bigText); // and the body is still the same file

    const gzip = await fetch(`${base}/openings.json`, { headers: { 'Accept-Encoding': 'gzip' } });
    expect(gzip.headers.get('content-encoding')).toBe('gzip');

    const plain = await fetch(`${base}/openings.json`, { headers: { 'Accept-Encoding': 'identity' } });
    expect(plain.headers.get('content-encoding')).toBeNull();
  });

  it('serves hashed assets as immutable and other files with revalidation', async () => {
    const asset = await fetch(`${base}/assets/app-abc123.js`);
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const json = await fetch(`${base}/openings.json`);
    expect(json.headers.get('cache-control')).toBe('no-cache');
  });

  it('answers a conditional request with 304 when the file did not change', async () => {
    // Raw http request: fetch() adds "Cache-Control: no-cache" to conditional requests, which disables revalidation
    const request = (headers: Record<string, string>) =>
      new Promise<{ status: number; etag?: string }>((resolve, reject) => {
        http
          .get(`${base}/openings.json`, { headers: { 'Accept-Encoding': 'identity', ...headers } }, (res) => {
            res.resume();
            res.on('end', () => resolve({ status: res.statusCode!, etag: res.headers.etag }));
          })
          .on('error', reject);
      });

    const first = await request({});
    expect(first.status).toBe(200);
    expect(first.etag).toBeTruthy();
    const second = await request({ 'If-None-Match': first.etag! });
    expect(second.status).toBe(304);
  });

  it('serves index.html (revalidated) for the root and for unknown routes', async () => {
    for (const url of ['/', '/some/route']) {
      const res = await fetch(`${base}${url}`);
      expect(res.status, url).toBe(200);
      expect(res.headers.get('cache-control'), url).toBe('no-cache');
      expect(await res.text()).toContain('<title>app</title>');
    }
  });
});
