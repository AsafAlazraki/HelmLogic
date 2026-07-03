import { defineConfig } from '@playwright/test';

/**
 * Evidence config — full-suite run with video, screenshot and trace
 * captured on EVERY test (not just failures), against a local build so
 * the sandbox network block to the dev host doesn't apply.
 *
 * Run: E2E_BASE_URL=http://localhost:9002 npx playwright test --config=playwright.evidence.config.ts
 * Artifacts:
 *   - test-results/evidence-report/  (Playwright HTML report)
 *   - test-results/evidence.json     (machine-readable results)
 *   - per-test .webm videos + screenshots under test-results/
 */
export default defineConfig({
  testDir: './tests',
  timeout: 150000,
  retries: 1,
  workers: 3,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:9002',
    headless: true,
    video: 'on',
    screenshot: 'on',
    trace: 'on',
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
    ['html', { outputFolder: 'test-results/evidence-report', open: 'never' }],
    ['json', { outputFile: 'test-results/evidence.json' }],
    ['line'],
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
