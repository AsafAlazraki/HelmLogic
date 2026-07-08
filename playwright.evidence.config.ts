import { defineConfig } from '@playwright/test';

// Sandbox TLS bridge (see tests/visual/tls-bridge.mjs header): Chromium's
// TLS handshake is RESET by the agent proxy itself — flags don't fix it.
// The bridge terminates Chromium TLS locally and relays via Node's stack.
const BRIDGE_PORT = Number(process.env.VISUAL_TLS_BRIDGE_PORT || 39555);
const useBridge = !!process.env.HTTPS_PROXY;

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
    // Sandbox routes outbound HTTPS via an agent proxy that RESETS
    // Chromium's TLS handshake. Route via the local TLS bridge instead
    // (Chromium → bridge self-signed TLS → Node https via proxy+CA).
    proxy: useBridge
      ? { server: `http://127.0.0.1:${BRIDGE_PORT}`, bypass: 'localhost,127.0.0.1' }
      : undefined,
    // Modern Chromium's post-quantum/ECH TLS ClientHello breaks the
    // TLS-intercepting proxy (CONNECT resets mid-handshake). Disable.
    launchOptions: {
      // Managed containers pre-install Chromium at /opt/pw-browsers/chromium;
      // when the project's Playwright pin wants a different browser build,
      // launch the pre-installed one instead of downloading (env rule).
      executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined,
      args: [
        '--disable-features=EncryptedClientHello,PostQuantumKeyAgreement,X25519MLKEM768,X25519Kyber768,UseDnsHttpsSvcb',
      ],
    },
  },
  // Auto-start the TLS bridge in sandboxed (HTTPS_PROXY) environments.
  webServer: useBridge
    ? [
        {
          command: `node tests/visual/tls-bridge.mjs ${BRIDGE_PORT}`,
          port: BRIDGE_PORT,
          reuseExistingServer: true,
          timeout: 15000,
        },
      ]
    : undefined,
  reporter: [
    ['html', { outputFolder: 'test-results/evidence-report', open: 'never' }],
    ['json', { outputFile: 'test-results/evidence.json' }],
    ['line'],
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
