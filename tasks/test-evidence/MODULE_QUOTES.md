# Phase 5b — Module Quotability Verification

Generated 2026-07-03 (UTC) · org `AcFZVEFA5UDJG2hyetWT` (Northside Marine) · auth billh@nsmarine.com.au · production build on `localhost:9002` · live Firestore.

**Question under test (Asaf):** "on every module, the functionality should work — trailers, dealer fits, motors, everything should be quotable. Even a dealer-fit or parts quote with labor and service, or a service quote."

**Method:** real-browser walkthroughs (`tests/module-quotes.spec.ts`, chromium via the TLS bridge, `playwright.evidence.config.ts`, `--workers=1`). Every price asserted against read-only Firestore fixtures harvested the same day. Raw check log: `module-quotes-raw.json` (append-only, includes the failed/retried attempts). Curated verdicts: `module-quotes.json`. Screenshots + PDF: `module-quotes/`.

**Firestore write footprint:** two test service quotes created through the app UI (wizard), both deleted through the app UI at the end — verified read-only afterwards (only the pre-existing `TEST CUSTOMER — v1.12 walkthrough` quote remains). Boat-quote walks never hit Finalize, so nothing persisted. One **code** fix applied to the dev worktree (not committed) — see Bug 1.

---

## 1. Verdict matrix — module × capability

| Module | quote-start | lines-add | totals | PDF |
|---|---|---|---|---|
| **Service Quoting** (`service-module`) | **PASS** — dashboard + 4-step wizard | **PASS** — MPF op `9HI-CON-GT` ($381.36 = 2.50h × $144.55), MPF part `90790-BZ404` ($15 × 2), engine-schedule interval `F150LC 100h` (5.00 hrs, $1,047) ¹ | **PASS** — $411.36 → $1,458.36 ex GST in UI; PDF: subtotal $1,458 · GST $147 · **total $1,605 incl = ceil(1,458.36 × 1.1)** (GST-ceil rule holds) | **PASS** — `service-quote.pdf` downloaded, org-branded, page render `service-quote-pdf-page.png` |
| **Service Quoting — lifecycle** | **PASS** — draft → sent → draft exercised; draft offers exactly `→ sent` / `→ cancelled`; complete/cancelled are terminal per state machine ² | | | |
| **Highfield boat flow** (module `M1Yf3R9igpJDxJnOVr6f`) — parts + labor via Fit-Up | **PASS** — CL380 to Step 5 | **PASS** — imported fitUpItem "4-Pin Power Cable" (LOWRANCE, `installHours 0.5`, op `LOW-000-00128-001`) searchable in the Custom Fit-Up picker; added, qty→2 | **PASS** — line $158 = 2 × $79; running package total moved **exactly +$158** in both green runs ($17,877 → $18,035 and $10,637 → $10,795 ex GST, config-dependent base) | (customer PDF renders fit-up as a single summary line per locked Story 9.2.3 — verified in v1.11/ultimate-test phases, not re-run here) |
| **Trailers** (`trailers-module` + `TNxHmr6BmjEBeTZcrl6p`) | **GAP** — catalog-only standalone | n/a standalone — trailers ARE quotable inside the boat flow (Step 4) | n/a | n/a |
| **Yamaha Outboards** (`KddayQaREA5tdZzzXjDW`) | **GAP** — catalog/pricing/promotions/fit-up tabs only | n/a standalone — motors ARE quotable inside the boat flow (Step 3) | n/a | n/a |
| **Fit-Up & Rigging** (`fit-up-module`) | **GAP** — catalog manager only, no quote surface | fit-up items quotable inside boat flow Step 5 (above) | via boat total | single PDF summary line (by design) |
| **Stabicraft** (`xt4zMPPE97QfT28owE1O`) | **GAP** — New Quote dialog works (range → model), but the quote route renders the **"Quotation Engine — being developed" placeholder** | unreachable | unreachable (variant pricing IS live: 1450 Explorer $19,000 ex / $20,900 inc in catalog) | unreachable |
| **Haines Signature** (`eKfpwpuYl0EAlAxIMPtG`) | **GAP** — same placeholder | unreachable | unreachable — AND all 9 Haines models carry **$0** in `sellPriceExclGst` + full `priceLadder` (faithful to the MPF source; data gap, not app bug) | unreachable |

¹ Interval line lands as an operation `F150LC — 100h service` with hours 5.00 and a synthesized rate (sell ÷ hours = $209.40/hr) — display-only derivation, sell price is the schedule's $1,047.
² The `draft offers exactly sent/cancelled` raw check shows one false-negative record: it string-matched lowercase `draft` while `innerText` reflects the CSS-uppercased `DRAFT`. The transitions themselves were exercised and passed (see raw records + `service-quote-lines.png` showing the DRAFT badge with `→ SENT` / `→ CANCELLED`). Check fixed in the spec.

---

## 2. Honest gaps (ranked)

1. **The boat quote flow is Highfield-only.** `src/app/(app)/modules/[id]/quote/[modelId]/page.tsx` (~line 188) hard-gates on `vendor.slug === 'highfield'`; every other boat brand (Stabicraft, Haines Signature, Stacer, Surtees, Jeanneau, Formosa) reaches a "Quotation Engine … currently being developed" placeholder. The v1.31 MPF import gave these brands catalogs, landed costs, price ladders and curated motor/trailer/dealer-fit menus — but no quote flow consumes them yet. Screenshots: `stabicraft-step1.png`, `haines-step1.png`.
2. **No standalone dealer-fit / parts-only quote flow exists (no boat).** Checked every module surface: the Fit-Up module is a catalog manager; dealer-fit options only exist inside boat-quote Step 5. **The parts + labor use case IS served today by service quotes** (364 operations, 26,345 parts, 157 engine schedules with intervals) — that is the recommended path until a dedicated flow ships (Epic 11.2 continues).
3. **Trailers + motors are not standalone-quotable** — both modules are catalog/pricing surfaces; trailer and motor quoting lives inside the Highfield boat flow (Steps 4 and 3). No quote-start affordance exists on either module (checked both trailer modules + Yamaha).
4. **`factoryOptionCodes` has no consumer.** The MPF boats import wrote `factoryOptionCodes[]` onto every Stabicraft/Haines/etc. model doc, but nothing in `src/` reads that field (grep-verified) and these models have empty `optionalFeatures`. Even once gap 1 is fixed, Step 2 would render no factory options for these brands without a mapping step. (Highfield unaffected — its FO live in per-model `optionalFeatures`, repriced by the MPF wave.)
5. **Haines pricing is $0 across the board** (all 9 models, variants, and full price ladders) — faithful to the MPF source workbook. Data gap for NSM to fill, not an app defect.
6. **The v1.31 "Context Error" bug still reproduces**: opening a quote via the org-scoped route (`/{orgSlug}/modules/{id}` → dialog → model) intermittently strips `?range=&vendor=` and lands on "Context Error — could not locate the required configuration data". Hit twice during this phase; the non-org `/modules/{id}` route is the reliable workaround (now used by the spec, same as `ultimate-test.spec.ts`).

## 3. Bugs found

1. **FIXED (code, dev worktree — NOT committed): engine-schedule search crash white-screened the service module.** `engineServiceSchedules/5c` carries `familyCode: 6000` as a **number** (MPF import kept the numeric cell). `engine-schedule-picker.tsx`'s filter called `(s.familyCode ?? '').toLowerCase()` → `TypeError: …toLowerCase is not a function` on the **first keystroke** in the schedule search → global error boundary replaced the whole page ("SOMETHING WENT WRONG"). Evidence: `debug-schedule-picker.png`. Fix applied: `String(s.engineModel ?? '')` / `String(s.familyCode ?? '')` in the filter (defensive-string per CLAUDE.md legacy-data lesson); production build rebuilt and the flow re-verified green. **Needs commit + ship**; alternatively/additionally patch the doc's `familyCode` to a string (Firestore write — out of scope for this read-only phase).
2. **Perf risk (not fixed): service-quote wizard Step 3 renders the entire 26,345-row serviceParts catalog into the DOM when the search is empty** (`service-quote-flow.tsx` PartsPicker has no virtualization/row-limit; the ops picker's 364 rows are fine). With a search term typed promptly the step is responsive; an operator who opens Step 3 and scrolls without typing gets a multi-second hang. Recommend `filtered.slice(0, 200)` + "refine your search" hint, or virtualization.

## 4. Evidence index

| File | What it shows |
|---|---|
| `module-quotes/service-module-landing.png` | Service module dashboard mounts |
| `module-quotes/service-quote-wizard-review.png` | Review step: op $381.36 + part $30, total $411.36 ex GST |
| `module-quotes/service-quote-lines.png` | Detail sheet: both op lines, schedule picker working post-fix, $1,458.36 card, DRAFT + transitions |
| `module-quotes/service-quote.pdf` + `service-quote-pdf-page.png` | Customer PDF: $1,428 + $30 → $1,458 ex · GST $147 · $1,605 incl (ceil rule) |
| `module-quotes/debug-schedule-picker.png` | Bug 1: page-level crash from one search keystroke (pre-fix) |
| `module-quotes/fitup-parts-line.png` + `fitup-step5-full.png` | CL380 Step 5: "4-Pin Power Cable" added, $158 = 2 × $79, total $18,035 |
| `module-quotes/trailers-module-landing.png` (+ `-2-`) | Trailers modules: Dashboard/Pricing/Settings — no quote surface |
| `module-quotes/yamaha-module-landing.png` | Yamaha: Catalog/Pricing/Promotions/Fit-up/Settings — no quote surface |
| `module-quotes/fitup-module-landing.png` | Fit-Up module: catalog manager — no quote surface |
| `module-quotes/stabicraft-step1.png` / `haines-step1.png` | Quotation Engine placeholder for non-Highfield brands |
| `module-quotes-raw.json` | Append-only raw check log (incl. failed attempts + retries) |
| `module-quotes.json` | Curated machine-readable verdicts |

Driver: `tests/module-quotes.spec.ts`. Fixtures were harvested read-only via the Firestore REST helpers (`scripts/mpf/_fs.py`) — no writes outside the two app-created-and-app-deleted test quotes.
