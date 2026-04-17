# HelmLogic Testing

This folder is the home for everything QA on HelmLogic — the handbook, per-release
test plans, manual test cases, automated-test notes, bug reports, and shared
templates.

If you are new to the team, **start with [`HANDBOOK.md`](./HANDBOOK.md)**. It walks
through the product, your environment, the test workflow, and every UI surface
you're expected to cover.

---

## Folder Structure

```
testing/
├── HANDBOOK.md                ← START HERE. The QA onboarding + reference doc.
├── README.md                  ← This file.
│
├── shared/                    ← Templates and resources used across every release.
│   ├── bug-report-template.md
│   └── test-case-template.md
│
├── v1.0/                      ← Archive: first shipped release.
│   └── release-notes.md
├── v1.1/
│   └── release-notes.md
├── v1.2/                      ← Most recent full regression on record.
│   ├── release-notes.md
│   ├── test-cases.md
│   └── test-results.md
├── v1.2.1/                    ← Patch release (pricing precision).
│   └── release-notes.md
└── v1.3/                      ← Current active release in QA.
    ├── release-notes.md
    ├── test-plan.md           ← Created at start of a release cycle.
    ├── test-cases.md          ← Detailed cases with expected behavior.
    ├── test-results.md        ← Running pass/fail log.
    └── bugs-found.md          ← Bugs discovered during this release's QA.
```

When a new release starts (e.g. v1.4), create `testing/v1.4/` and seed it with
those four markdown files. The HANDBOOK's Part 9 has step-by-step instructions.

---

## Quick Commands Cheat Sheet

Run these from the repo root (`/home/user/HelmLogic` or wherever you cloned it).

```bash
# First-time setup
npm install
npx playwright install        # downloads browser binaries for Playwright

# Run the full automated suite (~2–5 min)
npm run test:e2e

# Run just the critical-path smoke tests (~30 s)
npm run test:e2e:smoke

# Run with a visible browser (helpful when debugging a flake)
npx playwright test --headed

# Run one spec file
npx playwright test tests/critical-paths.spec.ts

# Run one test by name
npx playwright test -g "Highfield module loads all 5 tabs"

# View the last HTML report (screenshots, traces, logs)
npx playwright show-report

# List every test without running them
npm run test:e2e:list
```

---

## Test Environments

| Env | URL | Branch | Purpose |
|---|---|---|---|
| **Dev** | https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app/ | `claude/app-overview-wKiZ1` | Auto-deployed on every push. Test here first. |
| **Prod** | https://studio--studio-2290360004-3b963.us-central1.hosted.app/ | `main` | Production. Smoke test after every merge to main. |

Default test user: **Bill Hull** — `billh@nsmarine.com.au` / `Bill2026!`
(Managing Director, Northside Marine).

---

## Reporting a Bug

1. Copy `shared/bug-report-template.md`.
2. Fill in all the fields (severity, steps, expected vs actual, console errors, screenshots).
3. Save it into the current release's `bugs-found.md` (or link from there).
4. Flag the corresponding test case as **Fail** in `test-results.md` and link the bug ID.

---

## Questions?

The HANDBOOK is meant to answer every question a new tester has. If it doesn't,
that's a bug in the handbook — open a PR to fix it, or flag it to the team lead.

---

## Automated Test Coverage & Known Gaps

The `/tests` folder contains Playwright E2E specs. As of v1.3 they cover:

| Area | Status |
|---|---|
| Login + dashboard loads | ✅ |
| Module loads all 5 tabs | ✅ |
| Catalog drill-down (range → model → editor) | ✅ |
| Quote builder Steps 1–6 reachable | ⚠ best-effort |
| Quote builder advanced features (PDF attach, promotions, etc.) | ⚠ visibility only |
| **Tab / view / range / model survive refresh** | ✅ (new in v1.3) |
| **Model editor save roundtrip (edit → save → reload → persisted)** | ✅ (new in v1.3) |
| **Replace cover image button opens file picker** | ✅ (new in v1.3) |
| Stock / On Order / Pending sub-views persist across refresh | ✅ (new in v1.3) |
| Sub-dealer flows | ❌ NOT COVERED |
| Price level switching changes displayed prices | ⚠ shallow |
| Firestore write confirmation (not just toast) | ❌ NOT COVERED |
| Photo upload to Firebase Storage | ❌ NOT COVERED |
| Mobile viewport rendering | ❌ NOT COVERED |
| PDF generation / download | ❌ NOT COVERED |

### Spec files
- `tests/critical-paths.spec.ts` — smoke tests. Must pass for any deploy.
- `tests/hotfixes-v1.3.spec.ts` — regression tests for the three eve-of-release bugs (Update Config silent save, refresh redirect, Replace button dead). Ensures those don't resurface.
- `tests/persistence.spec.ts` — save-then-reload roundtrips. The single most valuable file here — it catches the class of bug where the UI appears to succeed but the action didn't persist.
- `tests/quote-builder.spec.ts` — quote flow steps
- `tests/stock-management.spec.ts` — stock workspace
- `tests/settings.spec.ts` — module settings
- `tests/yamaha-motors.spec.ts` — Yamaha motor workspace
- `tests/v1.2-features.spec.ts` — v1.2 regression

### Test quality rules (for future contributors)
1. **No `test.skip()` when a feature is broken.** If an element you need isn't visible, fail loudly — silent skips are how bugs reach prod.
2. **Every save action must assert a toast.** Use `waitForToast(page, { text: /.../ })` from `tests/helpers/utils.ts`. Saves without toast confirmation hid the Update Config bug for a full sprint.
3. **Persistence > visibility.** Prefer a save → reload → re-read test over a "the input is visible" test. The former catches real bugs; the latter catches typos.
4. **Use `openTab()` not `click()` on tabs.** `openTab` asserts the tab's `data-state="active"` after clicking so you know the tab actually switched.
5. **Any new page-level state should sync to URL.** When you add a tab/view/selection, add it to the URL via `window.history.replaceState` and add a refresh test in `persistence.spec.ts`.
6. **URL-synced state needs tests for every param combo, not just the happy path.** If state is serialized as `?a=X&b=Y&c=Z`, test refresh with: (a) no params, (b) `?a=X` only, (c) `?a=X&b=Y`, (d) all three, (e) params in a different order, (f) invalid values. The v1.3.1 hotfix existed because the happy-path refresh test passed (`?view=bmt&range=X&model=Y`) but the partial-param case (`?range=X&model=Y` with view stripped as default) wasn't covered, and that was the one real users hit.
7. **Loading overlays must be scoped to the view that consumes the data.** Never render a page-root overlay keyed on a global loading flag — if URL-restored state triggers a Firestore query for data a different view doesn't need, the overlay will freeze the UI. Write it as `{view === 'target' && isLoading && <Overlay/>}`. Add a regression test for each overlay condition.

### Known gaps — on the roadmap
- Sub-dealer login + quote flow (currently only parent org `billh@` is tested)
- Firestore read-back verification via Admin SDK or direct query (harder in a test env)
- Visual regression (Percy / Playwright snapshots) — not yet wired up
- Mobile viewports — Playwright can emulate device; no specs use this yet
- PDF generation + download validation

