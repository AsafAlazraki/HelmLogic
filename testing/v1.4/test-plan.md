# v1.4 — Test Plan

This document tells you **how** to test v1.4: your setup, the scope, the
priority order, and time budget. The actual per-step checklists live in
[`test-cases.md`](./test-cases.md); the regression list lives in
[`regression-checklist.md`](./regression-checklist.md).

> **Assumption:** you have read [`overview.md`](./overview.md). If you skipped
> it, go back. Testing v1.4 without the data-model context will waste your
> time.

---

## 1. Scope

### In scope for this test pass
1. **Vendor types** (`Trailer Brand`, `Rego Authority`) on Data Warehouse list + add pages.
2. **Module types** (`Trailers`, `Rego`) on `/modules/add`.
3. **Trailers workspace** — all three tabs (Catalog, Pricing Manager, Settings).
4. **Rego workspace** — both tabs (Types, Settings).
5. **Highfield quote flow** — trailer step's `Pick from Catalog`, rego dropdowns on the Boat + Trailer Registration cards, snapshot persistence, duplicate-quote rehydration, finalize payload.
6. **Dealer Fit four-source merge** — boat module Settings now shows three managers (Boat / Motor / Trailer), all four sources merge into the quote flow.
7. **Seed importer** — verify the live data looks right (do **not** re-run unless asked).
8. **Automated smoke** — `tests/v1.4-trailers.spec.ts` runs green.

### Explicitly out of scope
- Registration & compliance form fields (xlsx cols KE-NU — deferred).
- Per-trailer promotions — deferred.
- Trailer variants (material/colour SKUs) — deferred.
- Historical Highfield quote migration to the rego module — new quotes only.
- Per-quote dealer-fit category overrides — module-level only today.

See `overview.md` "Out of scope for v1.4" for the design-doc references.

---

## 2. Test environment

| Env | URL | Purpose |
|---|---|---|
| **Dev** (primary) | <https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app/> | Auto-deploys on every push to `Dev`. Test here first. |
| **Prod** | <https://studio--studio-2290360004-3b963.us-central1.hosted.app/> | Only after Dev pass is signed off. |

Both environments point at the same Firestore project (`studio-2290360004-3b963`).
The v1.4 seed data is already live there — you do **not** need to re-run the
importer.

### Local dev (optional, for debugging)
```bash
git checkout Dev
npm install
npx playwright install       # one-time
npm run dev                  # http://localhost:9002
```

---

## 3. Test accounts

**Primary test user — Bill Hull (admin, Northside Marine):**
- Email: `billh@nsmarine.com.au`
- Password: `Bill2026!`
- Role: Managing Director, parent-org admin, access to every module.

**Secondary — non-admin user** (optional, used for permission checks):
- Any staff account configured under Northside Marine that is *not* a director.
- If no staff account is provisioned, flag it and skip the non-admin checks;
  they're marked clearly in `test-cases.md`.

---

## 4. Pre-flight data check (≤ 5 minutes)

Before you start Section 7 execution, confirm the live Firestore state. Log in
as Bill Hull, then:

1. Open `/data-warehouse`. Filter by `Trailer Brand`. You should see **7 vendors**:
   DUNBIER, DUNBIER/HAINES BMT, GFAB, MACKAY, Obsolete Trailers, REDCO/TINKA,
   STACER.
2. Open `/modules`. You should see a **Trailers** module card (label "TRAILERS").
3. Click into it → default tab is **Catalog**. Brand sections should render
   within a couple of seconds. You should see hundreds of trailer cards across
   5-6 brand sections.
4. Click the **Pricing Manager** tab. Trailer rows should render with the
   collapsible waterfall.
5. Open any Highfield boat model. Advance the quote flow to Step 4 (Trailer).
   The **Pick from Catalog** button should sit inside the Trailer Base header.

If any of those five checks fail, **stop** and report to engineering — the
build is broken, there's no point running the full test pass.

---

## 5. Fixtures you need to create during testing

Some tests require data that doesn't exist yet. Create these in order before
the relevant section of `test-cases.md`:

| Fixture | Created in | Needed for |
|---|---|---|
| 1× Rego Authority vendor (e.g. "QLD Transport") | `/data-warehouse/add` — Section A of test-cases.md | Rego workspace + quote-flow rego picker |
| 1× Rego module wired to that vendor | `/modules/add` — Section B | Rego workspace tests |
| 2× Rego types under that authority (one boat, one trailer) | Rego module → Types tab | Quote-flow rego picker tests |
| 1× Org-level trailer override on trailer `RE1213` at $14,500 | Trailers module → Pricing Manager | Quote-flow override merge tests |

These fixtures are **ephemeral**: you can delete them at the end of the pass,
or leave them in place for the next tester.

---

## 6. Priority order

Work through `test-cases.md` **top to bottom**. Sections are ordered so that
later sections build on fixtures created earlier. Skipping ahead will leave
you with cascading "can't test this yet" blockers.

| Section | Area | Time budget | Blocks |
|---|---|---|---|
| A | Vendor types (data warehouse) | 10 min | All subsequent sections |
| B | Module types (`/modules/add`) | 10 min | C, D |
| C | Trailers workspace — Catalog | 15 min | H |
| D | Rego workspace (requires A+B fixtures) | 15 min | G |
| E | Trailers workspace — Pricing Manager + overrides | 20 min | H |
| F | Trailers workspace — Settings | 10 min | |
| G | Highfield quote flow — Rego pickers | 20 min | |
| H | Highfield quote flow — Trailer picker + snapshot + finalize | 30 min | |
| I | Dealer Fit four-source merge | 15 min | |
| J | Regression checklist (`regression-checklist.md`) | 30 min | |
| K | Automated smoke (`tests/v1.4-trailers.spec.ts`) | 5 min | |

**Total manual budget: ~3 hours** for a clean pass with no bugs. Expect a second
~1-hour session for re-tests after bug fixes land.

---

## 7. How to record results

Use [`test-results.md`](./test-results.md). For each checkbox in
`test-cases.md`:

- ✅ **Pass** — behaviour matches expected.
- ❌ **Fail** — something doesn't match. Log a bug in `bugs-found.md` using
  the template in `testing/shared/bug-report-template.md`. Link the bug ID in
  `test-results.md`.
- ⚠️ **Known gotcha** — matches an entry in `known-gotchas.md`. Not a bug.
  Record it as a pass with a "gotcha-N" note.
- ⏭️ **Skip** — blocked by an earlier failure, missing fixture, or not
  applicable to your env. Note why.

---

## 8. When to call it "done"

v1.4 is testing-complete when:

1. Every checkbox in `test-cases.md` is Pass / Skip / Known gotcha.
2. `regression-checklist.md` is clean.
3. `tests/v1.4-trailers.spec.ts` runs green end-to-end.
4. Any bugs logged in `bugs-found.md` are either Severity ≤ Low or linked
   to an open GitHub issue acknowledged by engineering.
5. `test-results.md` has your sign-off line at the bottom (date, tester name,
   Pass / Conditional Pass / Fail verdict).

---

## 9. Escalation

- **Build is broken** (blank screens, app doesn't load, 500s everywhere) →
  stop testing, ping engineering immediately. Don't fill out 180 checkboxes
  against a broken build.
- **Firestore rules deny a read/write** → flag it to engineering. Don't try
  to modify rules yourself.
- **A test case that "should pass" looks wrong and isn't in
  `known-gotchas.md`** → log a bug, flag it with severity Medium or higher,
  and move on. Don't try to diagnose in-test.

---

Continue to [`test-cases.md`](./test-cases.md).
