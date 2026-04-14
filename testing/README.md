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
