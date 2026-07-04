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

_(further findings from 1366 pass + remaining screens appended below)_
