# v1.4 — Trailers & Rego Module (Test Folder)

> **Release:** v1.4.0  •  **Ship date:** 2026-04-20  •  **Branch:** `Dev`
> **Audience:** the QA tester. Read the files below in order.

This folder contains **everything you need** to test v1.4 end to end. If you have
never tested this release before, read the files in the **Reading Order** table
below from top to bottom — don't skip.

---

## Reading Order

| # | File | What it is | When to read |
|---|---|---|---|
| 1 | [`overview.md`](./overview.md) | **Business context.** What shipped, why it matters, and the new Firestore data model in plain English. | Read first — sets the stage. |
| 2 | [`release-notes.md`](./release-notes.md) | Engineering changelog — modules, fields, files touched. | Skim to understand scope. |
| 3 | [`test-plan.md`](./test-plan.md) | **How to test.** Environment setup, test user, data prerequisites, priority order, time estimate. | Before you start testing. |
| 4 | [`test-cases.md`](./test-cases.md) | **The actual checklist.** ~180 test steps across 9 feature areas. | Work through top to bottom. |
| 5 | [`regression-checklist.md`](./regression-checklist.md) | Existing features to re-verify (didn't break). | After feature tests pass. |
| 6 | [`known-gotchas.md`](./known-gotchas.md) | Weird-but-expected behaviour — don't log these as bugs. | Keep open while testing. |
| 7 | [`test-results.md`](./test-results.md) | Your running pass/fail log. | Update as you go. |
| 8 | [`bugs-found.md`](./bugs-found.md) | Bug log for this release. Use the template in `testing/shared/`. | Any time you find a bug. |

> **Automated tests** live at `tests/v1.4-trailers.spec.ts` (read-only Playwright
> smoke). Run with `npx playwright test tests/v1.4-trailers.spec.ts` before
> starting manual passes to confirm the build isn't fundamentally broken.

---

## TL;DR — What's new in v1.4

1. **Trailers module** — `/modules/{trailersModuleId}` — new workspace with
   Catalog (449 trailers across 6 brands), Pricing Manager (full 15-row pricing
   waterfall per trailer with per-org sell-price overrides), and Settings.
2. **Rego module** — new `moduleType: 'rego'` for boat + trailer registration
   fees, replacing ad-hoc `registration` fields on boat docs.
3. **Highfield quote flow** — trailer step adds **Pick from Catalog** button;
   trailer + rego selections freeze a snapshot into the quote so prices don't
   drift if the catalog changes later.
4. **Dealer Fit four-source merge** — categories now combine global +
   boat-module + motor-module + trailer-module sources.
5. **Data importer** — `scripts/seed-trailers.ts` parses the 20-column dealer
   xlsx into Firestore. Already run for Northside Marine.

---

## Quick Environment Setup

```bash
# One-time
npm install
npx playwright install

# Run automated smoke to confirm the build isn't broken
npx playwright test tests/v1.4-trailers.spec.ts

# Then start the dev server to do manual testing
npm run dev   # localhost:9002
```

**Test user (Bill Hull):** `billh@nsmarine.com.au` / `Bill2026!` — Managing
Director of Northside Marine, admin access to all modules.

**Environments** (prefer Dev for testing):
- **Dev:** <https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app/>
- **Prod:** <https://studio--studio-2290360004-3b963.us-central1.hosted.app/>

---

## Where to find source-of-truth content

| Thing | Lives at |
|---|---|
| Full engineering release notes | [`tasks/RELEASE_NOTES_v1.4.md`](../../tasks/RELEASE_NOTES_v1.4.md) |
| Design spec (why each decision was made) | [`tasks/v1.4-trailers-module-design.md`](../../tasks/v1.4-trailers-module-design.md) |
| Seed script + live import logs | [`scripts/seed-trailers.ts`](../../scripts/seed-trailers.ts) |
| Playwright specs | [`tests/v1.4-trailers.spec.ts`](../../tests/v1.4-trailers.spec.ts) |
| The handbook for new testers | [`testing/HANDBOOK.md`](../HANDBOOK.md) |

---

## If you get stuck

- Unknown term? → `testing/HANDBOOK.md` Part 1 (Glossary).
- Can't log in? → Dev env uses the Firebase studio project — login should work with the user above.
- Test failing in a way that feels like a bug? → **Check `known-gotchas.md` first.** Several things look weird but are intentional.
- Genuine bug? → Copy `testing/shared/bug-report-template.md` into `bugs-found.md` and fill it in.
