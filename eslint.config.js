import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import Module, { createRequire } from 'node:module';

// typescript-eslint needs the TypeScript 6 JS API, which TypeScript 7 (used by `tsc` here) no longer
// ships. Until typescript-eslint supports TS >= 7.1, point its `require('typescript')` at the
// side-by-side @typescript/typescript6 package. `tsc` itself is unaffected.
const ts6Entry = createRequire(import.meta.url).resolve('@typescript/typescript6');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return request === 'typescript' ? ts6Entry : resolveFilename.call(this, request, ...args);
};
const { default: tseslint } = await import('typescript-eslint');

export default tseslint.config(
  { ignores: ['dist', 'server.js', 'node_modules', 'coverage', 'public'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['server.ts', 'server/**/*.ts', 'scripts/**/*.ts', 'vite/**/*.ts', '*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  prettier
);
