# Visual Regression Tests

Playwright `toHaveScreenshot` baselines for HelmLogic's core screens.

## What's here

| File | Purpose |
|---|---|
| `core-screens.spec.ts` | Captures login, dashboard, Highfield module, quote-flow Step 1 (+ build header element), Catalog Manager, Customers, Reporting |
| `__screenshots__/` | Committed PNG baselines, one per screen |
| `tls-bridge.mjs` | Sandbox-only local TLS bridge (see "Sandbox TLS bridge" below) |
| `../../playwright.visual.config.ts` | Dedicated config: `workers: 1`, `retries: 0`, `maxDiffPixelRatio: 0.02`, `animations: 'disabled'` |

## How baselines work

`expect(page).toHaveScreenshot('name.png')` compares the live render against
the committed PNG at
`tests/visual/__screenshots__/core-screens.spec.ts/name.png`
(via `snapshotPathTemplate` in the config — note there is NO per-platform
suffix in the path, see "Environment-specific" below). A test fails when more
than 2% of pixels differ (`maxDiffPixelRatio: 0.02`). On failure, Playwright
writes `*-actual.png`, `*-expected.png` and `*-diff.png` under `test-results/`
and the HTML report at `test-results/visual-report/` shows a side-by-side
slider.

## Running

```bash
# App must be running as a production build on :9002 first:
npm run build && npx next start -p 9002 &

# Compare against baselines
npm run test:visual

# Regenerate baselines (after an INTENTIONAL visual change)
npm run test:visual:update
```

Both scripts pin `E2E_BASE_URL=http://localhost:9002` so `tests/helpers/auth.ts`
targets the local build instead of the dev host. Run against the dev build
(`npm run dev`) at your own risk — dev-mode overlays and hydration timing make
screenshots noisier.

## Update workflow

1. Make your UI change.
2. `npm run test:visual` — confirm ONLY the screens you expect to change fail.
3. Inspect the diffs in `test-results/visual-report/` — every changed pixel
   should be explained by your change.
4. `npm run test:visual:update` to rewrite the affected baselines.
5. Commit the updated PNGs together with the code change, in the same PR, so
   reviewers see the visual delta alongside the code.

Never blind-update: if a screen you didn't touch changed, that's the
regression this suite exists to catch.

## Baselines are environment-specific

Baselines were generated on **linux + chromium** (this sandbox container,
production `next build`). The `snapshotPathTemplate` deliberately omits the
platform suffix, so there is exactly one baseline set — it will NOT match
pixel-for-pixel on macOS/Windows (font rasterisation, scrollbar metrics,
GPU rendering all differ). Consequences:

- **CI runners must either use this container image or regenerate their own
  baselines once** (`npm run test:visual:update` on the runner, commit from
  there). Don't mix baselines generated on different OSes.
- Local macOS runs are expected to fail on anti-aliasing noise; treat the
  linux run as the source of truth.

The suite also runs against the **live dev Firestore project** with the
standard E2E login (`tests/helpers/auth.ts`). Masks (below) cover the
data-shaped regions, but a large structural data change (e.g. a new module
card on the dashboard) will legitimately move layout and require a baseline
update.

## Masking policy

Masks hide dynamic pixels; everything unmasked is asserted. The rules:

1. **All `<img>` elements are always masked.** Boat/motor/trailer photography
   comes from external CDNs (Cloudflare/Incapsula-protected) and loads
   non-deterministically through the sandbox proxy — never assert on it.
2. **Timestamps and dates are always masked** — relative ("3 minutes ago"),
   clock times, and date strings (regex-based `getByText` masks in
   `baseMasks()`).
3. **Live-data regions get targeted masks**: the quote-flow carousel, the
   Customers table body (`tbody`), Reporting charts (`recharts` containers)
   and dollar-amount KPIs. Page chrome — headings, tabs, filters, column
   headers, nav — stays asserted.
4. **Prefer element screenshots of stable chrome over masking half a page**:
   `quote-header.png` captures just the build header bar (model name +
   stepper + Exit Build) instead of fighting the carousel.
5. When adding a screen: start with `baseMasks(page)`, run the suite twice
   back-to-back, and add targeted masks only for regions that actually
   diff. Over-masking erodes coverage; a mask is a documented decision that
   a region is data, not design.

## Sandbox TLS bridge (`tls-bridge.mjs`)

In the Claude sandbox, all outbound HTTPS goes through a TLS-intercepting
agent proxy (`HTTPS_PROXY`). Chromium 147's TLS ClientHello gets
connection-RESET by that proxy's MITM endpoint, and unlike older Chromium
builds **no** `--disable-features` combination (ECH, PostQuantumKeyAgreement,
X25519MLKEM768, `--ssl-version-max=tls1.2`, `--disable-http2`) fixes it —
while curl and Node's TLS stack handshake with the same proxy fine.

Fix: the config points the browser at a local bridge instead. The bridge
accepts Chromium's CONNECT, terminates its TLS with a throwaway self-signed
cert (Playwright runs with `ignoreHTTPSErrors`), and relays each request
outbound with Node's TLS through the real agent proxy (verifying against
`/root/.ccr/ca-bundle.crt`). It is auto-started by the config's `webServer`
entry **only when `HTTPS_PROXY` is set** — on a normal machine/CI without the
sandbox proxy, the browser connects directly and the bridge never runs.

Limitations (fine for this app): HTTPS only (no plain-http proxying, no
WebSocket upgrades — Firebase Auth/Firestore/Storage use fetch/XHR), fresh
upstream tunnel per request. Requires `openssl` on PATH.

## Repo lessons that apply here

- **Never `waitForLoadState('networkidle')`** — Firebase websockets keep the
  network active forever. Use `domcontentloaded` + explicit selector waits.
- Tests must use the standard `page` fixture (not `browser.newPage()` in a
  `beforeAll`) so they inherit the proxy settings from the config — without
  them, Firebase auth cannot reach `identitytoolkit.googleapis.com` in the
  sandbox.
- The app must be a **production** build (`npm run build` + `next start`).
  A stale `.next` dir serves HTML whose chunk URLs 400 — the page renders
  but never hydrates, and login silently no-ops (the button submits a plain
  HTML form). If login "does nothing", rebuild first.
