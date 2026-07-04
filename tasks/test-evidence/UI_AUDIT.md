# HYPER-critical UI Audit — task #17 (v1.31 dev build, commit cc8c8fb)

**Date:** 2026-07-04 · **Build:** production `next build` at commit `cc8c8fb` (post-FFR-18), served at `localhost:9002` against live Firestore
**Viewports:** 1920×1080 and 1366×768 (every screen, both)
**Driver:** `tests/ui-audit.spec.ts` (screenshots + read-only DOM probes; no Firestore writes, never Finalize)
**Evidence:** `tasks/test-evidence/ui-audit/1920/*.png`, `tasks/test-evidence/ui-audit/1366/*.png`, `tasks/test-evidence/ui-audit/probes.jsonl`

Probes per screen: horizontal document overflow + widest offenders, broken images (`naturalWidth === 0`), aspect-distorted images, `$NaN` / `$undefined` / bare `undefined` text nodes, unformatted raw floats (3+ decimals or no thousands separator).

> DRAFT — findings being appended as the run completes. Final table + fix/handoff status at bottom.

---

## Findings

_(numbered UI-1…; class tags: [alignment] [truncation] [currency] [empty-state] [loading] [image] [badge] [scrollbar] [focus-hover] [contrast] [z-index] [data])_

### UI-1 — Step-5 dealer fit shows other-range option packs on SP560 (FFR-18 gap) — [data] [empty-state] — HANDOFF
- **Where:** Quote flow Step 5, SP560 (Sport). `tasks/test-evidence/ui-audit/1920/09-sp560-step5-dealerfit.png`
- **What:** First dealer-fit section is **"HIGHFIELD - PATROL · 100 OPTIONS"** — one hundred `PATROL - PA420 …` tube-cover SKUs at $1,104 each, on a **Sport SP560** quote. Exactly the "other-model packs" class FFR-18 (commit `cc8c8fb`) was shipped to kill; this build IS post-FFR-18.
- **Root cause (exact):** `src/components/highfield-quote-flow.tsx`
  - `classifySection()` (~line 926-934): the model-pack regex `/(HIGHFIELD|STACER|…)/.test(c) && /\d{3}/.test(c)` requires **3 digits** in the section name. `"HIGHFIELD - PATROL"` has no digits → classified `general` → always shown.
  - Defense-in-depth also fails: `modelSectionMatches()` (~line 944-946) returns `true` for any **digitless section containing the vendor's brand word** (`c.includes('HIGHFIELD')`), so even if classified `model` it would pass on every Highfield hull.
- **Suggested fix (for main agent):** in `classifySection`, treat brand + RANGE_WORD (CLASSIC/SPORT/PATROL/ROLL/ULTRAL/ADVENTURE/COASTER) as `model` even without digits; in `modelSectionMatches`, when the section contains a range word, require it to equal the current model's `modelRangeWord` (and drop the digitless same-brand auto-pass for boat-brand vendors).
- **Status:** HANDOFF (file is main-owned mid-FFR-18-follow-up; do not patch from this task).

### UI-2 — Selected-motor card renders a huge blank white void when the motor image is dead — [image] [empty-state] — HANDOFF
- **Where:** Quote flow Step 3, SP560 + CL290. `1920/06-sp560-step3-motor.png`, `1920/07-sp560-step3-motor-selected.png`, CL290 retry artifact.
- **What:** The selected motor card reserves a ~400px image area; the Yamaha CDN URL (`https://www.yamaha-motor.com.au/-/media/products/marine/outboard/...`, Incapsula-blocked — known since v1.11) 404s/blocks → broken-img alt text ("Motor") floats in a giant white void. Same for the hero carousel slide (alt "Build Preview" top-left, whole hero blank).
- **Probe evidence:** `probes.jsonl` `07-sp560-step3-motor-selected` brokenImages ×2 (same Yamaha URL).
- **Suggested fix:** `onError` fallback on the motor `<Image>` sites (~lines 1806-1809, 2140, 2205) hiding the image container or swapping to a BuildBand-style placeholder (Ship icon + model name), mirroring the PDF's SummaryImage fallback chain shipped in v1.11.
- **Status:** HANDOFF (`highfield-quote-flow.tsx` main-owned).

### UI-3 — Trailer card broken image: `imageUrl` points at an auth-walled SharePoint URL — [image] [data] — HANDOFF
- **Where:** Quote flow Step 4, SP560. `1920/08-sp560-step4-trailer.png`
- **What:** "GFAB HIGHFIELD PA600 SERIES" trailer card shows browser broken-image + alt text. Probe: `https://northsidemarine1.sharepoint.com/sites/NSMMasterPriceFile/Shared%20Documents/General/Master%20Price%20File/Origin…` — a SharePoint document URL saved as `imageUrl` by the MPF import. It can never render for a customer/salesperson (auth-walled), in any environment.
- **Suggested fix:** two layers — (a) data: image-remediation pass should mirror-or-null SharePoint-hosted `imageUrl`s (same treatment as the 171 mirrored in v1.31, `mpf-mirror/`); (b) code: same `onError` hide as UI-2 at trailer card image sites (~2542-2551).
- **Status:** HANDOFF (code file main-owned) + data note for the MPF image remediation owner.

### UI-4 — Quote-flow header title overlaps the step label for long model names — [truncation] [alignment] — HANDOFF
- **Where:** Quote flow header, all steps, any long model name. Evidence (pre-existing runs, same code): `tasks/test-evidence/module-quotes/allbrands-stacer-step1.png` … `step6` — "STACER - 409 ASSAULT PRO" runs under the "STEP x OF 6 / …" sub-label. Reproduced identically at 1366 (narrower stepper next to it).
- **Root cause:** `src/components/highfield-quote-flow.tsx` ~line 1752-1753 — title container is `shrink-0 sm:w-56` while the `<h2>` is `whitespace-nowrap`; anything wider than 14rem paints over the adjacent flex sibling.
- **Suggested fix:** `whitespace-nowrap` → `truncate` on the h2 (+ `title={model?.name}` for hover recovery).
- **Status:** HANDOFF (main-owned).

### UI-5 — Hero carousel is a bare white void with orphan arrows when a model has zero imagery — [empty-state] [image] — HANDOFF
- **Where:** Quote flow, all steps for image-less MPF models (Stacer 409 Assault Pro; most non-HF brands). `1920/11-stacer-step1-build-config.png` (+ pre-existing `module-quotes/allbrands-stacer-*.png`).
- **What:** `carouselSlides` (highfield-quote-flow.tsx ~761-780) is empty → `<Carousel>` renders nothing, but `CarouselPrevious/Next` arrows still render, pointing at a giant empty white panel — reads as "broken", not "no photos".
- **Suggested fix:** when `carouselSlides.length === 0` render a placeholder (Ship icon + "No imagery on file" + model name); hide arrows when `length < 2`.
- **Status:** HANDOFF (main-owned).

### UI-6 — `toLocaleString()` used for prices in NSM Recommended surfaces (can render $1,016.545 / $17,643.5) — [currency] — FIXED
- **Where:** `src/components/nsm-recommended.tsx` line 173 (motor card price), line 360 (rigging-kit retail).
- **What:** `toLocaleString()` default = up to 3 fraction digits and no fixed 2-dp: a fractional MPF price renders as `$1,016.545` or `$17,643.5`, violating the app's whole-dollar/2-dp rule (`formatCurrency` in `src/lib/currency-utils.ts`). Current SP560 menu prices happen to be whole dollars so the live shots pass — the bug is latent for any fractional price (most Highfield FO/rigging rows carry cents post-v1.31 reprice).
- **Fix:** swap both sites to `formatCurrency(...)`. Deposit-schedule line (467) already integer-safe via `Math.ceil` — left alone.

### UI-7 — Horizontal-scroll strips missing `overflow-y-hidden` (Windows phantom-scrollbar class) — [scrollbar] — FIXED (components) + HANDOFF (app routes)
- **Static check requested by the task**: `grep overflow-x-auto` minus `overflow-y-hidden`.
- **Fixed (in authority, `src/components/**`):**
  - `stock-location-map.tsx:134` — location summary chip strip
  - `master-price-file-workspace.tsx:468` — dataset tab strip
  - `sales-pipeline-board.tsx:56` — Kanban column scroller
  - `proposal-view.tsx:693` — sticky proposal action bar (`overflow-x-auto` last-resort per in-code comment; y-hidden added)
- **Not fixed (outside authority / forbidden):**
  - `src/app/(app)/modules/[id]/page.tsx:1011` and `:1319` — module tab strips (**forbidden path** — HANDOFF)
  - `src/app/(app)/data-warehouse/[id]/page.tsx:1487` — TabsList (outside `src/components/**` — noted)
  - Table wrappers (`overflow-x-auto rounded-xl border` around `<table>` in the five MPF managers etc.) are intentional horizontal scroll containers whose height is content-defined — no phantom-y risk, left alone.

### UI-8 — Org dashboard module cards: inconsistent empty-logo treatment — [empty-state] [image] — DOCUMENTED (out of authority)
- **Where:** `1920/02-dashboard.png` — "Yamaha Outboards" and "Used Boats" cards render a pure blank white logo panel while "Trailers Module" / "QLD Registration" show the placeholder glyph.
- **File:** `src/app/(app)/[orgSlug]/dashboard/page.tsx` (module card logo slot) — outside `src/components/**` fix authority.
- **Suggested fix:** always render the placeholder glyph when `logoUrl` is falsy OR fails to load (onError), so no card ever shows a bare white void.

### UI-9 — Step-6 Powertrain line renders stale `sellPriceExclGst` instead of the level-resolved price — [currency] [data] — HANDOFF (known, still unfixed)
- **Where:** `1920/10-sp560-step6-summary.png` — Step 3 card shows YAMAHA F90XB **$17,643**; Step 6 Powertrain line shows **$13,912.21**.
- **Known issue:** logged in `tasks/mpf-audit/AUDIT_LOG.jsonl` (`phase6.ultimate` findings: "step-6 Powertrain line renders stale sellPriceExclGst … highfield-quote-flow.tsx ~2934"). Re-confirmed on this build; also inconsistent decimals next to whole-dollar lines.
- **Status:** HANDOFF (main-owned file; already on the ledger — this is a re-observation with fresh evidence).

### UI-10 — Step-6 Base Vessel shows $0 at Cash Price level on SP560 — [currency] [data] — HANDOFF (observation)
- **Where:** `1920/10-sp560-step6-summary.png` — "SPORT SP560 / PVC · STANDARD COLOR — **$0**" while the package total is $28,356.
- **What:** At the default "Cash Price" level with no explicit variant click, the base-vessel summary line resolves to $0 (honest-fail style) even though Step 1 showed $10,430 package pricing. Needs a pricing-owner ruling: either the line should show the resolved hull price or an explicit "not priced at this level" marker — a silent $0 on a customer-facing summary is the class stakeholders catch.
- **Status:** HANDOFF (quote-flow owned; money-math domain).

### UI-11 — Reporting: every quote renders STATE "—" and TOTAL "$0" — [currency] [empty-state] [data] — FIXED
- **Where:** `/reporting` → All quotes table + metrics strip. `1920/22-reporting.png` — 18 quotes this month, Pipeline **$0**, Conversion **0%**, all 100 rows **$0** / **—**, while the same quotes show real totals elsewhere (e.g. SP560 $71,837.82 on the module landing).
- **Root cause:** `src/components/reporting-dashboard.tsx` `quoteTotal()` read `financials.totalInclGst ?? totalInclGst` — fields finalized quote docs don't have. `finalize-quote-dialog.tsx` stores **`totalPriceExclGst`** + **`finalPriceExclGst`** (ex GST). State column read `q.lifecycleState` raw, but `src/lib/quote-lifecycle.ts` documents "default 'draft' when absent" — most docs never transitioned.
- **Fix:** `quoteTotal()` falls back to `finalPriceExclGst ?? totalPriceExclGst` with the whole-dollar inc-GST `Math.ceil(ex * 1.1)` rule; state badge renders `lifecycleState ?? 'draft'`. Pipeline metric now computes from real totals.

### UI-12 — MPF Rigging Kits manager: Part No / Name / 4 price columns / Install Hrs all "—" for every imported row — [empty-state] [data] — FIXED
- **Where:** `/manage → MPF Data → Rigging Kits`. `1920/14-mpf-rigging-kits.png` — 846 imported kits render only Section + Dealer Cost; everything else em-dash.
- **Root cause:** field-name mismatch. `scripts/mpf/import-parts.py build_rigging_kit()` writes `partNumber / description / kitCost / sellPriceExclGst / tradePriceExclGst / subDealerPriceExclGst / installHours / mpfImport{}`; the manager read `partNo / name·desc / kitCtd / retailExGst / tradeExGst / subDealerExGst / installHrs / mpfSource`.
- **Fix:** read-time fallbacks in `rigging-kits-manager.tsx` (cells, label, search, sort, MPF badge via `mpfImport.source`). Manual-entry writes unchanged.

### UI-13 — MPF Pricing Matrix manager: doc-id slugs as labels; Markup / Trade Tiers all "—" — [empty-state] [data] — FIXED
- **Where:** `/manage → MPF Data → Pricing Matrix`. `1920/16-mpf-pricing-matrix.png` — rows labelled `9du-dunbier-trailers` (raw doc ids), Markup % / Margin % / Trade Tiers all "—".
- **Root cause:** import (`import-service-config.py`) writes `brand / franchiseCode / sellMarkup / tradeDiscount / subDealerDiscount` (fractions, 0.21 = 21%); manager read `franchise / key / markupPct / marginPct / tradeTiers`.
- **Fix:** `pricing-matrix-manager.tsx` — label falls back to `brand · franchiseCode`; Markup % falls back to `sellMarkup` (fraction → %); Trade Tiers cell falls back to a compact `Trade −x% · Sub-dealer −y%` readout. Margin % deliberately left "—" for MPF rows (no honest source field — not mislabelled).

### UI-14 — MPF Freight manager: Vendor and Rate columns "—" on both rows; buffer shown as "0.1%" — [empty-state] [currency] [data] — FIXED
- **Where:** `/manage → MPF Data → Freight`. `1920/17-mpf-freight.png`.
- **Root cause:** import writes `vendorKey / supplier / perLinearMetreAud / bufferPct(fraction)`; manager read `vendor / ratePerLinearMetre` and rendered `bufferPct` raw (0.1 → "0.1%" instead of 10%).
- **Fix:** `freight-config-manager.tsx` — vendor falls back to `supplier ?? vendorKey`; rate falls back to `perLinearMetreAud`; buffer normalised fraction→percent **only** for MPF-shaped docs (identified by their import-only fields) so a manually-entered whole-percent row is untouched.

### UI-15 — Engine Servicing manager: default sort floats 32 legacy "0 · 0" rows to the top — [alignment] [empty-state] — FIXED
- **Where:** `/manage → MPF Data → Engine Servicing`. `1920/18-mpf-engine-servicing.png` — first screenful is all `115C / 2 Stroke / 2C / 3A …` with Intervals 0 · BOM 0, reading as a broken import.
- **Root cause:** NOT missing data — those are genuine `legacyNoPricing` engines with empty intervals/BOM (verified against `tasks/mpf-audit/extracted/engine-service-schedules.json`: 32 of 189 legacy). Alphabetical sort puts numeric-leading legacy names first.
- **Fix:** `engine-service-schedules-manager.tsx` — rank populated schedules first, alphabetical within group. No data change.

### UI-16 — Service quoting dashboard + detail sheet — PASS (no defects)
- `1920/19-service-dashboard.png` — counts, status filter pills, card truncation, $1,250 formatting all correct. Detail sheet captured on the re-run pass (`20-service-detail-sheet.png`).

### UI-17 — Catalog Manager, Suppliers manager, Customers, login — PASS (no defects)
- `13-catalog-manager.png` (proper empty state, brand list), `15-mpf-suppliers.png` (ID/Name/ABN populated; Terms/Credit "—" is honest data), `21-customers.png`, `01-login.png` — clean at both viewports.

### UI-18 — 1366×768 pass — no viewport-specific regressions
- Every screen re-audited at 1366×768 (`tasks/test-evidence/ui-audit/1366/*.png`). Layouts hold: quote-flow stepper keeps labels, hull-color grid reflows to 2-col, summary cards stack, no horizontal document overflow on any screen (probe-verified), no new truncation. The only 1366 probe hits are the same broken-image URLs as 1920 plus date-string false-positives ("01.07.2024" matching the raw-float regex).

---

## FFR-18 / FFR-19 retest — CL290 (Classic) Step 5 dealer fit

Requested by main agent as FFR-18's retest; executed post-FFR-19 (commit `e86cbe7`, which fixed UI-1 from this audit).

**Text-scan checks (`after/probes.jsonl`, screen `ffr18-cl290-step5`, 1920×1080): ALL PASS**
- no `### OBSELETE` ✓ · no `PATROL 600` pack ✓ · no `PRE DELIVERY` ✓ · no `RIGGING KITS` section ✓
- Tube Covers ✓ · Garmin ✓ · Outboard Accessories ✓ (present, per mid-scroll evidence)

**Visual evidence:** `after/1920/23-cl290-step5-ffr18.png` — first section is **HIGHFIELD - CLASSIC 290 · 8 OPTIONS** (this hull's own covers, $813 each) followed by general accessory categories (Tiller Fitting Kits etc.). `after/1920/24-cl290-step5-ffr18-mid.png` for the scrolled half.

**SP560 counter-check (UI-1 after):** `after/1920/09-sp560-step5-dealerfit.png` — the "HIGHFIELD - PATROL · 100 OPTIONS" leak is gone; first section is **HIGHFIELD - SPORT 560 · 15 OPTIONS**. FFR-19 verified both ways.

_(1366 CL290/managers/service/customers/reporting after-shots were re-captured after a concurrent agent's rebuild invalidated the first attempt's chunks — see run log note below.)_

---

## After-fixes verification

- `npm run typecheck` — **0 errors** after every fix.
- `npm run build` — **green** (production build served for the after-pass).
- After-shots in `tasks/test-evidence/ui-audit/after/{1920,1366}/` mirror the before-shot filenames:
  - `14-mpf-rigging-kits.png` — part numbers, names (long MPF names truncate with ellipsis), all five price tiers, install hrs, MPF badges all render (UI-12).
  - `16-mpf-pricing-matrix.png` — real franchise labels + markup % + trade-tier readouts (UI-13). First capture exposed a `−null%` render for NaN discounts — fixed with finite-guards in the same cycle.
  - `17-mpf-freight.png` — `AWW Global Logistics (Highfield Inflatables) · $128.47 · 10%` and `Quadrant Pacific Ltd (Surtees Boats) · $441.21 · 5%` (UI-14).
  - `18-mpf-engine-servicing.png` — populated schedules (11 intervals / 31-32 BOM lines) lead the table; legacy zero-rows sink (UI-15).
  - `22-reporting.png` — real totals + draft state badges (UI-11).
- NSM Recommended currency swap (UI-6) is behaviour-preserving for the whole-dollar prices on file; `after/1920/06-sp560-step3-motor.png` confirms no regression.
- Scrollbar-strip fixes (UI-7) are Windows-specific overlay behaviour — not screenshot-provable on Linux headless; evidence is the code diff (4 files, `overflow-y-hidden` added) plus the requested static grep inventory above.

## Run log note — concurrent-agent interference
The first after-pass overlapped another agent's rebuild of `.next`; several shots captured the "Loading chunk … failed" error boundary instead of the app (two distinct stale layout-chunk hashes). Those shots were re-captured in a follow-up pass once the tree was quiet. If a future audit sees `Something went wrong / Loading chunk NNN failed`, suspect a mid-run rebuild, not an app defect.

---

## Summary

| # | Finding | Class | Status |
|---|---|---|---|
| UI-1 | SP560 Step 5 shows Patrol option packs (FFR-18 gap) | data/empty-state | HANDOFF → fixed by main agent as FFR-19 (e86cbe7); retested PASS |
| UI-2 | Selected-motor card giant white void on dead image | image/empty-state | HANDOFF (quote-flow, main-owned) |
| UI-3 | Trailer imageUrl is auth-walled SharePoint link | image/data | HANDOFF + data note |
| UI-4 | Header title overlaps stepper for long model names | truncation/alignment | HANDOFF (quote-flow) |
| UI-5 | Hero carousel blank void + orphan arrows (no imagery) | empty-state/image | HANDOFF (quote-flow) |
| UI-6 | `toLocaleString()` prices in NSM surfaces | currency | **FIXED** (nsm-recommended.tsx) |
| UI-7 | overflow-x-auto strips missing overflow-y-hidden | scrollbar | **FIXED** ×4 components; 2 forbidden-path handoffs + 1 out-of-scope note |
| UI-8 | Dashboard module cards inconsistent empty-logo treatment | empty-state/image | DOCUMENTED (src/app, out of authority; partially load-timing) |
| UI-9 | Step-6 Powertrain stale sellPriceExclGst ($13,912.21 vs $17,643) | currency/data | HANDOFF (known ledger item, re-confirmed) |
| UI-10 | Step-6 Base Vessel $0 at Cash Price level | currency/data | HANDOFF (pricing-owner ruling needed) |
| UI-11 | Reporting all-$0 totals + "—" states | currency/empty-state | **FIXED** (reporting-dashboard.tsx) |
| UI-12 | Rigging Kits manager em-dash wall | empty-state/data | **FIXED** (rigging-kits-manager.tsx) |
| UI-13 | Pricing Matrix manager slugs + em-dashes | empty-state/data | **FIXED** (pricing-matrix-manager.tsx) |
| UI-14 | Freight manager em-dashes + fraction buffer | empty-state/currency | **FIXED** (freight-config-manager.tsx) |
| UI-15 | Engine Servicing legacy rows float to top | alignment/empty-state | **FIXED** (engine-service-schedules-manager.tsx) |
| UI-16/17/18 | Service dashboard, catalog manager, suppliers, customers, login, 1366 pass | — | PASS |

**Fixed: 6 findings (9 files) · Handoff: 6 (5 quote-flow + 1 data) · Documented: 2 · Pass: 3 screen groups.**
