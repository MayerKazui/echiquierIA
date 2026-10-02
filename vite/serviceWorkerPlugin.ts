import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import type { SwConfig } from '../src/pwa/swCore';

/**
 * Builds the service worker (`sw.js`, at the root of the build) once the rest of the build is written: it needs the
 * list of the files to cache, and a version that changes with their content (a new build replaces the old cache).
 *
 * The engine and the openings database are cached too, so that a game can be analysed offline; they are optional
 * for the installation (a failure to download them does not stop the app from being usable offline).
 *
 * The puzzles (about 30 MB in all) are neither: each file is cached the first time it is asked for. They still count
 * in the version, so that a new selection of puzzles replaces the cached files.
 */

/** The heavy files: cached when possible, never a reason to fail the installation. */
const OPTIONAL = [/^stockfish-[\w.-]+\.(js|wasm)$/, /^openings\.json$/];
/** Cached when used, not before. */
const ON_DEMAND = /^puzzles\//;

async function listFiles(directory: string, root = directory): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full, root)));
    else files.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return files.sort();
}

/** The files to cache and the version of the build, from the folder of the build. */
export async function describeBuild(dist: string): Promise<SwConfig> {
  const files = (await listFiles(dist)).filter((file) => file !== 'sw.js' && !file.endsWith('.map'));
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update(await readFile(path.join(dist, file)));
  }
  const preloaded = files.filter((file) => !ON_DEMAND.test(file));
  return {
    version: hash.digest('hex').slice(0, 12),
    critical: preloaded.filter((file) => !OPTIONAL.some((pattern) => pattern.test(file))),
    optional: preloaded.filter((file) => OPTIONAL.some((pattern) => pattern.test(file))),
  };
}

/** Writes `sw.js` into the folder of the build. Resolves with what it caches. */
export async function writeServiceWorker(dist: string): Promise<SwConfig> {
  const config = await describeBuild(dist);
  const result = await build({
    entryPoints: [path.resolve(import.meta.dirname, '../src/pwa/serviceWorker.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    define: { __SW_CONFIG__: JSON.stringify(config) },
    logLevel: 'silent',
  });
  await writeFile(path.join(dist, 'sw.js'), result.outputFiles[0].text);
  return config;
}

export function serviceWorker(): Plugin {
  let dist = '';
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) {
      dist = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const config = await writeServiceWorker(dist);
      const size = (await stat(path.join(dist, 'sw.js'))).size;
      this.info?.(`service worker: ${config.critical.length + config.optional.length} files cached, ${size} bytes`);
    },
  };
}
