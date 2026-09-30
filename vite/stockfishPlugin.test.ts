import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import type { ViteDevServer } from 'vite';
import { ENGINE_FILES, engineDirectory, stockfishEngine } from './stockfishPlugin';

const read = (file: (typeof ENGINE_FILES)[number]) => readFileSync(path.join(engineDirectory(), file.source));

describe('engine files in node_modules', () => {
  it('exist under the names the plugin expects', () => {
    for (const file of ENGINE_FILES) {
      expect(read(file).length, file.source).toBeGreaterThan(1000);
    }
  });

  it('are a WebAssembly module and its loader', () => {
    const wasm = ENGINE_FILES.find((f) => f.url.endsWith('.wasm'))!;
    expect([...read(wasm).subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]); // "\0asm"
    const loader = ENGINE_FILES.find((f) => f.url.endsWith('.js'))!;
    expect(read(loader).toString('utf-8', 0, 200)).toContain('Stockfish');
  });

  it('match the URL loaded by the engine service', () => {
    const service = readFileSync(path.resolve(import.meta.dirname, '../src/services/stockfishEngine.ts'), 'utf-8');
    for (const file of ENGINE_FILES) {
      expect(service, file.url).toContain(file.url.slice(1));
    }
  });
});

describe('stockfishEngine plugin', () => {
  it('serves the engine files in development and lets other requests through', async () => {
    const plugin = stockfishEngine();
    let middleware!: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
    (plugin.configureServer as (server: ViteDevServer) => void)({
      middlewares: { use: (fn: typeof middleware) => (middleware = fn) },
    } as unknown as ViteDevServer);

    const wasm = ENGINE_FILES.find((f) => f.url.endsWith('.wasm'))!;
    const headers: Record<string, unknown> = {};
    const chunks: Buffer[] = [];
    const done = new Promise<void>((resolve) => {
      const res = {
        setHeader: (name: string, value: unknown) => (headers[name] = value),
        write: (chunk: Buffer) => chunks.push(Buffer.from(chunk)),
        end: (chunk?: Buffer) => {
          if (chunk) chunks.push(Buffer.from(chunk));
          resolve();
        },
        on: () => res,
        once: () => res,
        emit: () => true,
      };
      middleware(
        { url: '/stockfish-19.wasm?x=1', method: 'GET' } as IncomingMessage,
        res as unknown as ServerResponse,
        () => {
          throw new Error('should not fall through');
        }
      );
    });
    await done;
    expect(headers['Content-Type']).toBe('application/wasm');
    expect(Buffer.concat(chunks).equals(read(wasm))).toBe(true);

    const next = vi.fn();
    middleware({ url: '/src/main.tsx', method: 'GET' } as IncomingMessage, {} as ServerResponse, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('emits both engine files into the build output', async () => {
    const plugin = stockfishEngine();
    const emitted: Array<{ fileName: string; source: Buffer }> = [];
    await (plugin.generateBundle as (this: unknown) => Promise<void>).call({
      emitFile: (file: { type: string; fileName: string; source: Buffer }) => emitted.push(file),
    });
    expect(emitted.map((f) => f.fileName).sort()).toEqual(['stockfish-19.js', 'stockfish-19.wasm']);
    for (const file of ENGINE_FILES) {
      const out = emitted.find((f) => f.fileName === file.url.slice(1))!;
      expect(out.source.equals(read(file))).toBe(true);
    }
  });
});
