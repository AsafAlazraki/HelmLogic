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
2. ~~**No standalone dealer-fit / parts-only quote flow exists (no boat).**~~ **RESOLVED 2026-07-03 (build.counter-quotes, see §6).** Service Quoting is now **Service & Counter Quotes**: the wizard's Parts step (and the detail sheet, next to the engine-schedule picker) mounts a new tabbed `CatalogItemPicker` (Motors / Trailers / Dealer Fit / Rigging Kits) so a standalone quote — no boat — can carry catalog items at MPF prices. Browser-proven end-to-end with exact-price assertions (`tests/counter-quote.spec.ts`).
3. ~~**Trailers + motors are not standalone-quotable**~~ **RESOLVED 2026-07-03 (build.counter-quotes, see §6).** Both are quotable standalone via counter quotes, and the Trailers / Yamaha Outboards / Fit-Up & Rigging module heroes now carry a "New … Quote" pill that deep-links into the counter-quote wizard with the matching catalog tab preselected (`?newQuote=1&catalogTab=…`).
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

---

## 6. Addendum 2026-07-03 — build.counter-quotes (Service & Counter Quotes)

Asaf's `decision.standalone-quotes` built: Service Quoting extended into **Service & Counter Quotes** so standalone quotes (no boat) can include CATALOG items — motors, trailers, dealer-fit options, rigging kits — alongside operations + parts. Gaps 2 + 3 above are closed in the dev worktree (NOT committed — same posture as the earlier fixes).

**What shipped**

1. **New `src/components/catalog-item-picker.tsx`** — tabbed picker (Motors / Trailers / Dealer Fit / Rigging Kits) mirroring the engine-schedule picker's caught-getDocs pattern (lazy per-tab load, missing collection/rule → inert empty state), MQ-2 search guards (≥2 chars on >50-row lists, 50-row render cap, String()-guarded fields). Data: motors from Motor-Brand vendors' dataSet rows (`'NSM Retail'`/hull_cash sell, `'Dealer Buy'` cost), trailers from Trailer-Brand vendors' `series/*/trailers` (+ direct `/trailers`), dealer fit from `organisations/{org}/dealerFitSelections` (`items[0].data['Act Sell']`/`'Act CTD'`), rigging kits from `organisations/{org}/riggingKits` (`sellPriceExclGst`, `kitCost`). Emits lines in the EXISTING shapes — items as part lines (`{id, partNumber, name, qty, cost, sellPrice, itemType}`), rigging install labour as an op line `Install: {kit}` (`hours` = installHours, `sellPrice` = MPF `installLabour`, `rate` = labour/hours, fallback rate 130.09 = MPF labourRateExGst) — one atomic `onAdd({part, installOp?})` so the detail sheet writes a single Firestore patch (no stale-snapshot totals clobber).
2. **Wizard** (`service-quote-flow.tsx`) — picker mounted under the Parts step; dashboard renamed "Service & Counter Quotes"; `?newQuote=1&catalogTab=…` deep link auto-opens the wizard with the picker tab preselected (params stripped after consumption so refresh doesn't re-open).
3. **Detail sheet** (`service-quote-detail-sheet.tsx`) — picker mounted next to the engine-schedule picker (locked quotes hide it); one-patch add keeps `totalSell`/`totalCost` honest; parts section retitles to "Parts & Catalog Items" and lines carry an itemType tag.
4. **PDF** (`service-quote-pdf.tsx`) — minimal label change only: itemType-aware section title + small gold type tag per catalog line. Totals math untouched (GST-ceil rule pre-existing).
5. **Module entry points** (`modules/[id]/page.tsx` + `CounterQuoteEntryButton` export) — "New Trailer Quote" / "New Motor Quote" / "New Rigging Quote" hero pills on the Trailers / Yamaha / Fit-Up modules, styled identically to "Back to Hub"; service module discovered via caught getDocs (no service module → no button).

**Browser evidence** (`tests/counter-quote.spec.ts`, evidence config, `--workers=1`, production build on `localhost:9002`, live Firestore — 2 tests, both green):

| Check | Result |
|---|---|
| Standalone wizard: motor F90XB @ **$17,643** (NSM Retail) + dealer-fit `6x3-0000l-15-05` @ **$1,909** (Act Sell) + rigging kit `6X0-6Y52R-SE-50` @ **$1,019** + auto install-labour op **$520.36** (4.00h × $130.09) | **PASS** — every price asserted against same-day read-only fixtures |
| Review + card + sheet total ex GST | **PASS** — **$21,091.36** exact (= 17,643 + 1,909 + 1,019 + 520.36); card "1 ops · 3 parts" |
| PDF grand total | **PASS** — **$23,201 = ceil(21,091.36 × 1.1)** asserted via pdftotext; page render `counter-quote-pdf-page-1.png`; "Parts & Catalog Items" + MOTOR/DEALER FIT/RIGGING KIT tags present |
| Lifecycle | draft state machine untouched (sheet offers → sent / → cancelled); estimateType semantics intact |
| Cleanup | test quote deleted through the app UI; Firestore verified read-only afterwards (only the pre-existing v1.12 walkthrough quote remains) |
| Entry points | **PASS** ×3 — pill renders on each module hero (1366px + a 1920px shot), deep link opens the wizard, Parts step shows the matching tab preselected (Trailers 496 rows / Motors / Rigging Kits) |

Screenshots: `module-quotes/counter-*.png` (dashboard title, per-tab picker rows, review, detail sheet, cleanup, PDF page) + `module-quotes/entry-{trailers,yamaha,fitup}[-picker].png` + `entry-trailers-1920.png`. PDF: `module-quotes/counter-quote.pdf`.

**Firestore write footprint:** one test service quote created + deleted through the app UI (verified clean via REST); entry-point probes abandoned at the wizard (never saved). Build: `npm run typecheck` 0 errors, `npm run build` green.
