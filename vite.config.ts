import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { stockfishEngine } from './vite/stockfishPlugin.ts';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    // Sub-folder of the site (GitHub Pages project site: /echiquierIA/); the root otherwise
    base: process.env.BASE_PATH ?? '/',
    plugins: [react(), tailwindcss(), stockfishEngine()],
    build: {
      rolldownOptions: {
        output: {
          // Third-party code changes rarely: a separate chunk stays in the browser cache across deployments
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: 'chess', test: /node_modules[\\/]chess\.js[\\/]/ },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
