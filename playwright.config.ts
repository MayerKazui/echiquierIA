import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/**
 * End-to-end tests: the built application (what is deployed) in a real browser, with Stockfish running in its
 * Web Workers. Google and the online game sites are replaced by fakes (see e2e/support), so nothing leaves the machine.
 * `bun run test:e2e` builds and serves the app itself; the browser comes from `bunx playwright install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // The analysis runs the real engine on the machine's cores: tests must not fight over them
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'fr-FR',
    // A service worker would answer some requests itself, out of reach of the fakes
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The client ID is a dummy: it only switches the Drive button on, the sign-in itself is faked
    command: `bunx vite build && bunx vite preview --port ${PORT} --strictPort`,
    env: { VITE_GOOGLE_CLIENT_ID: 'e2e.apps.googleusercontent.com' },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
