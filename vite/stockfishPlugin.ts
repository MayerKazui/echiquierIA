import { createReadStream, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * The Stockfish engine comes from the `stockfish` package instead of being copied into `public/`:
 * it is served at the site root in development and emitted into `dist/` by the build, under the names
 * loaded by src/services/stockfishEngine.ts (`new Worker('/stockfish-19.js#stockfish-19.wasm')`).
 *
 * It is the lite single-threaded build: no SharedArrayBuffer, so no COOP/COEP headers are needed.
 */
export const ENGINE_FILES = [
  { url: '/stockfish-19.js', source: 'stockfish-19-lite-single.js', type: 'text/javascript' },
  { url: '/stockfish-19.wasm', source: 'stockfish-19-lite-single.wasm', type: 'application/wasm' },
] as const;

/** Folder of the engine files inside node_modules. */
export function engineDirectory(): string {
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve('stockfish/package.json')), 'bin');
}

export function stockfishEngine(): Plugin {
  const directory = engineDirectory();
  const sourcePath = (file: (typeof ENGINE_FILES)[number]) => path.join(directory, file.source);

  return {
    name: 'stockfish-engine',

    buildStart() {
      for (const file of ENGINE_FILES) {
        if (!existsSync(sourcePath(file))) {
          throw new Error(
            `Stockfish engine file not found: ${sourcePath(file)}. Install the dependencies (bun install); ` +
              'if the `stockfish` package was upgraded, update ENGINE_FILES in vite/stockfishPlugin.ts.'
          );
        }
      }
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0];
        const file = ENGINE_FILES.find((f) => f.url === pathname);
        if (!file) return next();

        res.setHeader('Content-Type', file.type);
        res.setHeader('Content-Length', statSync(sourcePath(file)).size);
        if (req.method === 'HEAD') return res.end();
        createReadStream(sourcePath(file)).pipe(res);
      });
    },

    async generateBundle() {
      const { readFile } = await import('node:fs/promises');
      for (const file of ENGINE_FILES) {
        this.emitFile({ type: 'asset', fileName: file.url.slice(1), source: await readFile(sourcePath(file)) });
      }
    },
  };
}
