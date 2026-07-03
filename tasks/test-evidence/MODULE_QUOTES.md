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
| **Stabicraft** (`xt4zMPPE97QfT28owE1O`) | **PASS** *(2026-07-03 gate lift)* — quote flow mounts, 1450 Explorer Step 1 auto-selects the single MPF variant | **PASS** — Step 2 renders **14 materialized factory options** (FO import, see §5); "+$2,590 Stage 1 Gloss" moved the total exactly; Step 3 NSM Recommended (motorMenu 1) | **PASS** — Step 1 $19,000 ex GST; Step 6 summary $21,590 ex / $23,750 inc + MPF deposit schedule (20/30/50) + ~45d lead time | not re-run (no Finalize — read-only walk) |
| **Stacer** (`I0dGRbh39uhNJ3gotEb0`) | **PASS** *(2026-07-03 gate lift)* — 409 Assault Pro Step 1 auto-selects the single MPF variant | **PASS** — Step 2 renders **37 materialized factory options** + Standard Inclusions card; "+$920 Bimini & Envelope" moved the total exactly; Step 3 NSM Recommended (motorMenu 3); Step 4 correctly skipped (no trailer config — data-gate); Step 5 Dealer Fit mounts | **PASS** — Step 1 $9,736 ex GST; Step 6 summary $10,656 = base + FO | not re-run (no Finalize — read-only walk) |
| **Haines Signature** (`eKfpwpuYl0EAlAxIMPtG`) | gate lifted — the variant probe checks the field is present+numeric, and Haines variants carry `sellPriceExclGst: 0`, so the flow now mounts (code-verified predicate; not browser-re-run this pass) | Step 2 FOs materialized (FO import §5 covered Haines sections where the MPF has them) | totals render **$0** — faithful to the MPF source (all 9 models unpriced); NSM data gap, not an app bug | untested at $0 |

¹ Interval line lands as an operation `F150LC — 100h service` with hours 5.00 and a synthesized rate (sell ÷ hours = $209.40/hr) — display-only derivation, sell price is the schedule's $1,047.
² The `draft offers exactly sent/cancelled` raw check shows one false-negative record: it string-matched lowercase `draft` while `innerText` reflects the CSS-uppercased `DRAFT`. The transitions themselves were exercised and passed (see raw records + `service-quote-lines.png` showing the DRAFT badge with `→ SENT` / `→ CANCELLED`). Check fixed in the spec.

---

## 2. Honest gaps (ranked)

1. ~~**The boat quote flow is Highfield-only.**~~ **RESOLVED 2026-07-03 (phase5b.allbrands, see §5).** The gate in `src/app/(app)/modules/[id]/quote/[modelId]/page.tsx` now mounts the same quote flow for **any `vendorType: 'Boat Brand'` vendor whose model has ≥1 variant with a numeric `sellPriceExclGst`** (defensive variant probe added to the page loader); brands without MPF-priced variants keep the placeholder. Step 1 hides the material picker and auto-selects the single MPF variant for non-Highfield brands. Browser-verified end-to-end for Stacer + Stabicraft (`allbrands-*.png`). Pre-lift screenshots kept for history: `stabicraft-step1.png`, `haines-step1.png`.
2. **No standalone dealer-fit / parts-only quote flow exists (no boat).** Checked every module surface: the Fit-Up module is a catalog manager; dealer-fit options only exist inside boat-quote Step 5. **The parts + labor use case IS served today by service quotes** (364 operations, 26,345 parts, 157 engine schedules with intervals) — that is the recommended path until a dedicated flow ships (Epic 11.2 continues).
3. **Trailers + motors are not standalone-quotable** — both modules are catalog/pricing surfaces; trailer and motor quoting lives inside the Highfield boat flow (Steps 4 and 3). No quote-start affordance exists on either module (checked both trailer modules + Yamaha).
4. ~~**`factoryOptionCodes` has no consumer.**~~ **RESOLVED 2026-07-03 (phase5b.allbrands, see §5).** `scripts/mpf/import-fo-nonhf.py` materialized `optionalFeatures` arrays (HF-shape-exact) onto **213 non-HF models — 9,633 options, 0 errors** — from `tasks/mpf-audit/extracted/factory-options.json`, resolving each model's `factoryOptionCodes` own-section-first then via the global code catalog. Residual: 2,199 code refs have **no importable source in the MPF itself** (embargoed Formosa hulls, FO sections absent from NSM's workbook) — logged, not invented; 9 Formosa models resolve 0 options and were left untouched. Apply log + readback: `tasks/mpf-audit/apply-log-fo-nonhf.jsonl`.
5. **Haines pricing is $0 across the board** (all 9 models, variants, and full price ladders) — faithful to the MPF source workbook. Data gap for NSM to fill, not an app defect.
6. **The v1.31 "Context Error" bug still reproduces**: opening a quote via the org-scoped route (`/{orgSlug}/modules/{id}` → dialog → model) intermittently strips `?range=&vendor=` and lands on "Context Error — could not locate the required configuration data". Hit twice during this phase; the non-org `/modules/{id}` route is the reliable workaround (now used by the spec, same as `ultimate-test.spec.ts`).

## 3. Bugs found

1. **FIXED (code, dev worktree — NOT committed): engine-schedule search crash white-screened the service module.** `engineServiceSchedules/5c` carries `familyCode: 6000` as a **number** (MPF import kept the numeric cell). `engine-schedule-picker.tsx`'s filter called `(s.familyCode ?? '').toLowerCase()` → `TypeError: …toLowerCase is not a function` on the **first keystroke** in the schedule search → global error boundary replaced the whole page ("SOMETHING WENT WRONG"). Evidence: `debug-schedule-picker.png`. Fix applied: `String(s.engineModel ?? '')` / `String(s.familyCode ?? '')` in the filter (defensive-string per CLAUDE.md legacy-data lesson); production build rebuilt and the flow re-verified green. **Needs commit + ship**; alternatively/additionally patch the doc's `familyCode` to a string (Firestore write — out of scope for this read-only phase).
2. ~~**Perf risk (not fixed): service-quote wizard Step 3 renders the entire 26,345-row serviceParts catalog into the DOM when the search is empty.**~~ **FIXED 2026-07-03 (MQ-2, phase5b.allbrands).** `service-quote-flow.tsx` PartsPicker now requires ≥2 search characters when the catalogue exceeds 50 rows (empty-search hint: "Type at least 2 characters to search the 26,345-part catalogue") and caps the rendered list at 50 rows with a "refine your search" overflow hint. Small catalogues keep the old show-all UX. (Ops picker at 364 rows untouched — fine as-is.)

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

---

## 5. Addendum 2026-07-03 — phase5b.allbrands (gate lift + FO materialization + MQ-2)

Gaps 1 + 4 and Bug 2 above are now closed in the dev worktree (NOT committed — same posture as Bug 1's fix):

1. **Gate lift** — `src/app/(app)/modules/[id]/quote/[modelId]/page.tsx`: the `vendor.slug === 'highfield'` gate is now `highfield OR (vendorType === 'Boat Brand' AND ≥1 variant with numeric sellPriceExclGst)`, backed by a new variant-probe `useCollection` in the page loader. `src/components/highfield-quote-flow.tsx`: when no variant carries a `material` (MPF single-SKU brands), the Tube Material section hides, variants render as "Build Configuration" cards, and a lone variant auto-selects — everything downstream (motorMenu / trailerMenu / dealerFitLines / registration) keys off `activeVariant` unchanged.
2. **FO materialization** — `scripts/mpf/import-fo-nonhf.py` (idempotent, dry-run default, `--apply`): 213 models written, 9,633 options created, 0 errors; re-run dry-run converges to 0 writes. Semantics: active rows only; `priced` → sellExGst, `no-charge` → $0, `Std` → `isStandard: true` @ $0; `Bundle`/`error`/`POA`/`none` skipped (no importable price). Apply log with before/after per model: `tasks/mpf-audit/apply-log-fo-nonhf.jsonl`; readback verified on Stacer `sa409apr` (38 OFs), Stabicraft `7001401000` (15), Surtees `495-pro-fisher` (36).
3. **MQ-2** — PartsPicker render guard (see Bug 2 strike-through above).

**Browser evidence** (`tests/allbrands-quote.spec.ts`, evidence config, `--workers=1`, production build on `localhost:9002`, live Firestore, read-only — Finalize never clicked):

| Check | Stacer 409 Assault Pro | Stabicraft 1450 Explorer |
|---|---|---|
| Step 1 price + variant auto-select | **PASS** — $9,736 ex GST | **PASS** — $19,000 ex GST |
| Step 2 materialized FOs | **PASS** — 37 cards; +$920 Bimini moved total exactly | **PASS** — 14 cards; +$2,590 Stage 1 Gloss moved total exactly |
| Step 3 motor (NSM Recommended data-gate) | **PASS** — menu surfaced (motorMenu 3) | **PASS** — menu surfaced (motorMenu 1) |
| Step 4 trailer | correctly skipped (no trailer config assigned — existing data-gate) | correctly skipped (same) |
| Step 5 dealer fit | **PASS** — mounts | **PASS** — mounts |
| Step 6 summary totals | **PASS** — $10,656 = base + FO | **PASS** — $21,590 ex / $23,750 inc + MPF deposit schedule (20/30/50) + ~45d lead time |

Screenshots: `module-quotes/allbrands-stacer-step{1,2,2-selected,3,4,5,6-summary}.png`, `module-quotes/allbrands-stabicraft-step{1,2,2-selected,3,4,5,6-summary}.png`. Note: the RegoPicker auto-matched QLD "Recreational Vessel 4.5m–8m" ($163) from the Stabicraft hull length — intended behaviour; the spec clears it to assert the exact hull price (clear is sticky per the picker's `autoApplied` guard).
