import { defineConfig } from '@playwright/test';

process.env.NO_PROXY = 'localhost,127.0.0.1';
const PORT = 4392;

export default defineConfig({
  testDir: './tests/e2e',
  workers: 2,
  timeout: 60000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    // The dev server serves TypeScript sources directly, so module-level
    // harness tests can import from /src without a build step.
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${PORT} --strictPort`,
    env: { PLAYWRIGHT_TEST: '1' },
    url: `http://127.0.0.1:${PORT}`,
    timeout: 30000,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1100, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
