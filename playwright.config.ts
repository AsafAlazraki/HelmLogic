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
    // Firebase App Hosting cert chain isn't always trusted by sandboxed CI
    // environments. Local/GitHub-Actions runs should set this to false to
    // catch actual TLS regressions, but the default allows the suite to
    // work from any environment.
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
