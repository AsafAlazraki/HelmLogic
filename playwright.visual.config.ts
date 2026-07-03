import { defineConfig } from '@playwright/test';

/**
 * Visual-regression config — Playwright toHaveScreenshot baselines for the
 * core HelmLogic screens. Runs against a local production build so the
 * sandbox network block to the dev host doesn't apply.
 *
 * Run:    npm run test:visual
 * Update: npm run test:visual:update
 *
 * Baselines live in tests/visual/__screenshots__/ and are ENVIRONMENT-
 * SPECIFIC (linux + chromium) — see tests/visual/README.md.
 */
export default defineConfig({
  testDir: './tests/visual',
  timeout: 240000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  snapshotPathTemplate: 'tests/visual/__screenshots__/{testFilePath}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:9002',
    headless: true,
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    // Sandbox routes outbound HTTPS via an agent proxy. Chromium doesn't
    // inherit HTTPS_PROXY from env, so without this the browser can't
    // reach identitytoolkit.googleapis.com (Firebase login) or Firestore.
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }
      : undefined,
    // Modern Chromium's post-quantum/ECH TLS ClientHello breaks the
    // TLS-intercepting proxy (CONNECT resets mid-handshake). Disable.
    launchOptions: {
      args: [
        '--disable-features=EncryptedClientHello,PostQuantumKeyAgreement,X25519MLKEM768,X25519Kyber768,UseDnsHttpsSvcb',
      ],
    },
  },
  reporter: [
    ['html', { outputFolder: 'test-results/visual-report', open: 'never' }],
    ['line'],
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
