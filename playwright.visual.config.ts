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
 *
 * SANDBOX PROXY: outbound HTTPS (Firebase auth/Firestore) must go through
 * the agent proxy (HTTPS_PROXY). Chromium 147's TLS ClientHello is RESET
 * by that proxy's TLS-intercepting endpoint and no --disable-features
 * combination fixes it any more, so the browser is pointed at a local TLS
 * bridge (tests/visual/tls-bridge.mjs) that terminates Chromium's TLS and
 * relays via Node's TLS stack — which the proxy accepts. The bridge is
 * auto-started via `webServer` below, and only when HTTPS_PROXY is set;
 * outside the sandbox the browser connects directly.
 */
const BRIDGE_PORT = Number(process.env.VISUAL_TLS_BRIDGE_PORT || 39555);
const useBridge = !!process.env.HTTPS_PROXY;

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
    // inherit HTTPS_PROXY from env, so without a proxy setting the browser
    // can't reach identitytoolkit.googleapis.com (Firebase login) or
    // Firestore. We route via the local TLS bridge (see header comment)
    // because Chromium's TLS handshake is reset by the agent proxy itself.
    proxy: useBridge
      ? { server: `http://127.0.0.1:${BRIDGE_PORT}`, bypass: 'localhost,127.0.0.1' }
      : undefined,
    // Modern Chromium's post-quantum/ECH TLS ClientHello breaks the
    // TLS-intercepting proxy (CONNECT resets mid-handshake). Disable.
    // (Kept for defense-in-depth even though the bridge is the real fix.)
    launchOptions: {
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
    ['html', { outputFolder: 'test-results/visual-report', open: 'never' }],
    ['line'],
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
