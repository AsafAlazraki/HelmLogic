# HelmLogic Testing

Everything QA on HelmLogic — the handbook, per-release test folders, shared
templates, and manual / automated test infrastructure.

**New to the team?** Read [`HANDBOOK.md`](./HANDBOOK.md) first. It walks
through the product, your environment, the test workflow, and every UI
surface you'll cover.

**Jumping straight to the current release?** Open
[`v1.4/README.md`](./v1.4/README.md) — it's the tester's entry point for
what's shipping right now.

---

## Folder layout

Every release lives in its own subfolder. Files are named consistently so
testers know where to find anything.

```
testing/
├── HANDBOOK.md                 ← START HERE. QA onboarding + reference.
├── README.md                   ← This file.
│
├── shared/                     ← Templates reused across releases.
│   ├── bug-report-template.md  ← Copy this when logging a bug.
│   └── test-case-template.md
│
├── v1.0/  ← Archive. Initial production release.
│   ├── README.md               ← Index + quick context.
│   ├── overview.md             ← Tester-facing summary of what shipped.
│   └── release-notes.md        ← Engineering changelog.
│
├── v1.1/  ← Archive. Pricing system overhaul.
│   ├── README.md
│   ├── overview.md
│   └── release-notes.md
│
├── v1.2/  ← Archive. Yamaha motor module + major quote builder pass.
│   ├── README.md
│   ├── overview.md
│   ├── release-notes.md
│   ├── test-cases.md           ← Historical QA checklist.
│   └── test-results.md         ← Historical signed-off results.
│
├── v1.2.1/  ← Archive. Pricing precision hotfix.
│   ├── README.md
│   ├── overview.md
│   └── release-notes.md
│
├── v1.3/  ← Archive. Client feedback + trailer dealer-fit groundwork.
│   ├── README.md
│   ├── overview.md
│   └── release-notes.md
│
└── v1.4/  ← CURRENT. Trailers + Rego modules.
    ├── README.md               ← START HERE for v1.4.
    ├── overview.md             ← Business context + data model.
    ├── release-notes.md        ← Engineering changelog mirror.
    ├── test-plan.md            ← Scope, env, fixtures, priority.
    ├── test-cases.md           ← ~180 step checklist.
    ├── regression-checklist.md ← Existing features to re-verify.
    ├── known-gotchas.md        ← Intentional weird behaviour.
    ├── test-results.md         ← Running pass/fail log (template).
    └── bugs-found.md           ← Bug log for this release (template).
```

### Standard doc set per release

Every **new** release (starting v1.4) should ship with the full nine-file set
above:

| File | Who writes it | When |
|---|---|---|
| `README.md` | Engineer closing the release | At design-lock |
| `overview.md` | Engineer closing the release | At design-lock |
| `release-notes.md` | Engineer closing the release | At ship time (mirror of `tasks/RELEASE_NOTES_vX.Y.Z.md`) |
| `test-plan.md` | Engineer or QA lead | Before QA begins |
| `test-cases.md` | Engineer closing the release | At ship time |
| `regression-checklist.md` | QA lead | Before QA begins |
| `known-gotchas.md` | Engineer closing the release | At ship time |
| `test-results.md` | Tester | During QA |
| `bugs-found.md` | Tester | During QA |

Older releases (v1.0–v1.3) carry at minimum `README.md`, `overview.md`, and
`release-notes.md`. They're archived and not actively tested.

### When a new release starts

1. `mkdir testing/vX.Y.Z/`.
2. Copy the shape of `testing/v1.4/` — same 9 filenames.
3. Fill `README.md` + `overview.md` + `release-notes.md` from the engineer side.
4. Fill `test-plan.md` + `regression-checklist.md` from the QA side.
5. Fill `test-cases.md` + `known-gotchas.md` progressively as features land.
6. Testers fill `test-results.md` + `bugs-found.md` during the pass.

---

## Quick commands cheat sheet

Run from the repo root (`/home/user/HelmLogic` or wherever you cloned it).

```bash
# First-time setup
npm install
npx playwright install                # browser binaries for Playwright

# Full automated suite (~2–5 min)
npm run test:e2e

# Critical-path smoke only (~30 s)
npm run test:e2e:smoke

# The v1.4 read-only smoke
npx playwright test tests/v1.4-trailers.spec.ts --project=chromium

# Run with visible browser (helpful when debugging a flake)
npx playwright test --headed

# Run one spec file
npx playwright test tests/critical-paths.spec.ts

# Run one test by name
npx playwright test -g "Highfield module loads all 5 tabs"

# View the last HTML report (screenshots, traces, logs)
npx playwright show-report

# List every test without running
npm run test:e2e:list
```

---

## Test environments

| Env | URL | Branch | Purpose |
|---|---|---|---|
| **Dev** | <https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app/> | `Dev` | Auto-deploys on every push. Test here first. |
| **Prod** | <https://studio--studio-2290360004-3b963.us-central1.hosted.app/> | `main` | Smoke test after every merge. |

**Default test user:** Bill Hull — `billh@nsmarine.com.au` / `Bill2026!`
(Managing Director, Northside Marine).

---

## Reporting a bug

1. Copy [`shared/bug-report-template.md`](./shared/bug-report-template.md).
2. Fill in every field (severity, steps, expected vs actual, console errors, screenshots).
3. Paste it into the current release's `bugs-found.md`.
4. Flag the corresponding test case as **Fail** in `test-results.md` and
   link the bug ID there.

---

## Release verdict criteria

A release is **Pass** for QA sign-off when:
1. Every checkbox in `test-cases.md` is Pass / Skip / Gotcha.
2. `regression-checklist.md` is fully Pass.
3. Automated smoke (`tests/vX.Y-*.spec.ts`) is green.
4. All Severity ≤ Low bugs are acknowledged in GitHub; no open High/Critical bugs.

**Conditional Pass** is acceptable if the Severity ≤ Low bugs are tracked in
a follow-up issue and engineering has acknowledged them.

---

## Questions?

The HANDBOOK is meant to answer every question a new tester has. If it
doesn't, that's a bug in the handbook — open a PR to fix it, or flag it to
the team lead.

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

