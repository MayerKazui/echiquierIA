import { build } from 'esbuild';

/**
 * Compiles server.ts (and the few files of src/ it shares with the app) into server.js, which `node server.js`
 * runs without tsx: starting then takes a fraction of a second instead of compiling TypeScript at launch,
 * which matters on hosts that give a container a few seconds to listen on its port (Cloud Run).
 * Dependencies stay external (they are installed next to it); NODE_ENV is fixed to "production".
 */
await build({
  entryPoints: ['server.ts'],
  outfile: 'server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});
