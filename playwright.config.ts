import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  retries: 1,
  use: {
    baseURL: 'https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    // ALWAYS run with a fresh browser context — no leftover cache, no
    // service worker, no localStorage from a prior session. Otherwise
    // we end up screenshotting stale-but-cached UI and thinking the
    // deploy hasn't landed when in fact the browser is just serving
    // the old bundle from its cache. Add a query-string buster on
    // every page.goto in helpers so even edge-caches can't fool us.
    serviceWorkers: 'block',
    extraHTTPHeaders: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
