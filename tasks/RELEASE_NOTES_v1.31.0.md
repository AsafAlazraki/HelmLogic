# HelmLogic — Release Notes v1.31.0

**Date:** 2026-07-03
**Branch:** `claude/app-overview-wKiZ1` (dev → main)
**Theme:** Master Price File migration + Testing & Evidence overhaul — NSM's 17-workbook MPF lives in HelmLogic 1:1, and the testing system that proves it

This release is the largest data event in HelmLogic's history and the release that rebuilt testing around evidence. NSM's Master Price File — the 17-workbook Excel monolith that has run the dealership's pricing for years — was ingested, decoded, mapped, migrated (36,551 Firestore writes, 0 errors) and then *proven* migrated by a 34,512-check parity battery with zero unexpected deltas. Alongside it, the codebase gained its first real unit-test suite (which immediately found and fixed 3 money bugs), a CI gate, a nightly synthetic run, visual regression, and a fail→fix→retest ledger. Two new epics carry the story: **Epic 12 — Master Price File Migration** and **Epic 13 — Testing & Evidence Overhaul**.

---

## Release Stats

| Metric | Value |
|---|---|
| Stories shipped | 14 (12.1.1–12.4.1 · 13.1.1–13.2.2) |
| New epics | 2 (Epic 12 `mpf-migration` · Epic 13 `testing-evidence`) |
| Firestore writes (Phase 4 apply) | 36,551 · 0 errors |
| Parity checks | 34,498 / 34,512 passed — every fail explained, zero unexpected deltas |
| New Firestore collections | 6 (`riggingKits`, `suppliers`, `supplierPriceLists`, `pricingMatrix`, `engineServiceSchedules`, `freightConfig` — all under `organisations/{orgId}/`) |
| Unit tests | 460 / 460 green (3 real money-math bugs found + fixed) |
| Image remediation | 171 images mirrored to Storage `mpf-mirror/` · 1,056 doc patches |
| Fail→fix→retest ledger | FFR-1 … FFR-16 |
| New release-schedule entries | 1 (`'v1.31': { shipped: true }`) |

---

## Epic 12 — Master Price File Migration

### 12.1.1 + 12.1.2 — Ingestion, analysis, mapping, decisions

All 17 MPF workbooks decoded in 4 parallel analysis groups: the 678-real-column Boat Module matrix (2,003 boats, 29 blocks), the 21-sheet Parts family, Motors/Trailers/Factory Options, and Service + Price Matrix + 7 small modules. The extractors defuse the MPF's structural traps — phantom Excel dimensions (one sheet claims 1,048,576 rows for 645 real), data-island gaps, cached `#N/A`/`#VALUE!` cells (193 quarantined, never imported as prices).

Phase 1 synthesis lives in `tasks/mpf-audit/MAPPING.md`: every workbook mapped to its HelmLogic destination, 10 schema flexes, and the systemic form upgrades — display-name string joins become validated ID references, mixed GST bases normalise to ex-GST with per-row conversion records, hardcoded FX becomes explicit `exchangeRates`. Ten decisions (D1–D10) were put to the stakeholder and ruled before any write; all rulings logged in `AUDIT_LOG.jsonl`. The audit also surfaced NSM's own data bugs for report-back — most notably that **Stabicraft factory options are broken in the MPF today** (the active FO section was re-keyed and the Boat Module never migrated; we import via the verified join and get right what their spreadsheet gets wrong).

### 12.2.1 — Boats: 9 brands, 810 boats, landed cost, curated menus

810 current boats imported across 9 brands with zero-duplicate vendor routing (5/8 vendors pre-existed; Merry Fisher + Cap Camarat nest as Jeanneau ranges; only Formosa is net-new). Each boat carries its full landed-cost chain (base cost, factory charges, FX, duty, freight legs → landed AUD), its inc-GST price ladder (D2: NSM's hand-rounded cash prices stored as authoritative), and the MPF's curated per-boat menus — 13-slot motor menu, 10-slot trailer menu, 42 dealer-fit lines — as typed data on the variant. 1042/1042 writes after the transient-retry fix (FFR-12). Parity: 587/588 Highfield SKUs exact on sell AND cost.

### 12.2.2 — Motors / trailers / factory options

Motor wave maps the MPF's price columns onto `priceLevels` (NSM Retail / Trade / Commercial / Boating Alliance, Total CTD → `cost`) plus the new **`hull_campaign`** level (D7) for campaign-discounted retail — hidden unless populated. Trailer wave lands 431 current trailers. Factory-options wave reprices **1,011 live Highfield optionalFeatures** by option code, fixing the systemic live-data break the diff exposed: USD prices stored as AUD with cost==sell. 608 writes after the updateMask backtick fix for spaced field names (FFR-13).

### 12.2.3 — Parts wave (the 34k-doc marathon)

1,791 `dealerFitSelections` (the literal origin of the Act Sell / Act CTD convention) · 3,660 `fitUpItems` with install hours + op-code linkage · 26,345 `serviceParts` DMS rows keyed Franchise+Part · 846 `riggingKits` (128 NLA/`#N/A` rows quarantined) · 1,606 `suppliers` with ABN/terms/credit. Run with 12-worker parallel writes + 401 token auto-refresh. Upsert-by-natural-key throughout — pre-existing v1.10 items survived untouched.

### 12.2.4 — Service + pricing config

The org pricing brain: 364 `serviceOperations` (Sell<CTD legacy rows excluded), 189 `engineServiceSchedules` (per-engine 11-interval price matrix + parts BOM), the 48-row `pricingMatrix` (47 franchise margin rows + retail sliding scale), 19 QLD rego bands wrapped state-explicit per the v1.4 lesson, per-vendor `freightConfig` feeding landed cost, and 4 explicit exchange rates. 653/653 writes, 0 failures.

### 12.3.1 — Quote flow: NSM Recommended wiring

New `src/components/nsm-recommended.tsx` renders the MPF's relationship web inside the Highfield quote flow: recommended motors, trailers, dealer-fit lines, standard inclusions, deposit schedule, lead times. Curated menu primary, HP-range filter fallback (D3). Every section is **data-gated** — absent MPF fields render the pre-migration flow unchanged, zero regression. Assignment-web verification: motorMenu 94.7% / trailerMenu 99.0% / dealerFitLines 100% resolvable, with every miss traced to a source-data dangling reference or an approved plan skip.

### 12.3.2 — Admin + pricing-workspace surfaces

New **Manage → MPF Data** section hosting managers for rigging kits, suppliers, supplier price lists, pricing matrix, engine service schedules and freight config (`suppliers-manager.tsx`, `rigging-kits-manager.tsx`, `pricing-matrix-manager.tsx`, `engine-service-schedules-manager.tsx`, `freight-config-manager.tsx`). The pricing workspace gains a per-boat **landed-cost breakdown** (`landed-cost-breakdown.tsx` — chain rendered line by line, cost tagged `(landed)` when it equals MPF landed AUD, formula-deviation flag surfaced). The service-quote detail sheet gains an **engine service-schedule picker** (`engine-schedule-picker.tsx`) pulling priced intervals from the 189 imported schedules.

### 12.4.1 — Image remediation

579 unique catalog image URLs probed and classified. 171 fetchable-but-blocked images (NSM's own WAF 403s its catalog images to server-side fetchers) mirrored to Firebase Storage under `mpf-mirror/` and re-verified 200 `image/*`; 1,056 doc patches applied (896 dealerFitSelections + 31 motors + 129 boatModels). Unfetchable classes documented as the NSM ask-list — see "What v1.31 did NOT ship" in the user guide.

---

## Epic 13 — Testing & Evidence Overhaul

### 13.1.1 — Money-math unit suite

First real unit-test suite (vitest, `tests/unit/*`): 460 tests over quote-financials, landed-cost, payment-schedule, promotions, stacking/refunds and helpers. It immediately pinned 3 real production defects, all fixed in product code: over-discount drove totals negative (now clamped to subtotal), `cost: 0` was falsy-swallowed by `||` (now `??`), and the payment schedule could float below zero (now floored). FFR-8 GREEN 460/460.

### 13.1.2 — CI gate + nightly synthetic

`.github/workflows/ci.yml`: a **gate** job on every dev push + PR into main (typecheck → unit tests → build hard gate; 93 pre-existing TypeScript errors were fixed to make typecheck meaningful, FFR-7) and a **synthetic** job nightly at 4am AEST that builds, boots the prod server, runs smoke-1000 against it, gates on the parsed results, uploads the evidence JSON, and commits a dated history row to `tasks/test-evidence/history/`.

### 13.1.3 — Visual regression + sandbox TLS bridge

Screenshot-baseline visual regression for the core screens (`tests/visual/`) plus `tests/visual/tls-bridge.mjs` — the local bridge that carries Chromium's traffic through the agent proxy's TLS handshake. Chromium flags alone don't survive the handshake (FFR-6 corrected); the evidence + visual Playwright configs route through the bridge with localhost bypass.

### 13.2.1 — MPF parity battery (sections I/J)

`scripts/smoke-1000.py` grew section **I. MPF parity** (2,025 deterministic checks: 587 Highfield variants full-verify on sell+cost, sampled motors × 6 price fields, trailers × 4, DFOs × Act Sell/Act CTD, service ops, FX, pricing matrix, rego bands) and section **J. Assignment web** (menu references resolved against live catalog docs). Full battery: **34,498 / 34,512 passed** — the 14 fails are all individually explained (source-data dangling refs, approved plan skips, 2 negative-sell rows faithfully mirroring the MPF source) and none is a parity failure. Verdict in `tasks/test-evidence/MPF_PARITY.md`: **PARITY PROVEN, zero unexpected deltas across every module.**

### 13.2.2 — Fail→fix→retest ledger + evidence report

`tasks/test-evidence/fail-fix-retest.json` records every failure hit during the cycle — FFR-1 through FFR-16 — each with root cause, class, fixing commit and green re-test. A suite that is only ever green proves nothing; the ledger proves failures get fixed and re-proven, never ignored. Capped by the grand migration evidence report: 12 sections, 17/18 live data sources, embedded screenshots.

---

## v1.31 addendum — Story 12.4.2: Step-5 curation engine (2026-07-04)

Asaf's field audit of quote-flow Step 5 (screenshots, 2026-07-04) named a CLASS of problem the MPF migration created: **data-consistent but product-senseless presentation**. The data was right — parity-proven — but a CL380 tender saw eight identical $813 per-SKU "HIGHFIELD - CLASSIC 380" pack cards, F300 cowl covers against a 15–30hp motor envelope, 5.6-metre tube covers on a 3.8-metre hull, "SUPPLY & INSTALL -" job-card sub-items and "Engine Removal" workshop rows as standalone-selectable options, and supplier headings like "MAJESTIC TV OPTIONS" — with most card images showing the NSM logo (the WAF had served its logo to the 12.4.1 mirror fetch).

### The curation engine (`src/lib/step5-curation.ts`)

New pure module — no React, no Firestore — consumed by `highfield-quote-flow.tsx`; the FFR-24 section classifier moved here verbatim (plus a new `workshop` class for ENGINE REMOVALS / SURVEYING SUBLETS), so the 33-case harness now tests the REAL implementation instead of a port:

- **Per-SKU model-pack dedupe** — a model-scoped section shows ONE Boat Pack card matching the ACTIVE hull variant, not eight material×colour rows. Primary match: the MPF part code embeds the variant SKU (`9HI_HBC 065_PD` ↔ `HBC065`); fallback: progressive model-token → material → colour-code name parse, each step applied only when it leaves ≥1 row.
- **Named item relevance rules** (`RELEVANCE_RULES`, each with a written rationale; all fail OPEN on missing context): `R-SUBITEM` (Supply & Install job-card sub-items never standalone), `R-NEWBOAT` (engine removals stay in counter/service quotes), `R-HP` (HP-scoped items must overlap the model motor envelope — parses "115 to 225HP", "up to 70HP", F/VF/XF/T engine codes incl. slash lists `F225/250/300`; radio model codes like VHF115i deliberately excluded), `R-LEN` (metre-scoped items within ±0.4 m of hull length, range names like "3.6 to 4.5mtr" must span it; component dimensions "1.8mtr Aerial" exempt), `R-MATERIAL` (PVC vs Hypalon follows the active variant), `R-CONFIG` (tiller kits only on tiller-steer boats), `R-SIZE-TV`/`R-SIZE-RADAR`/`R-SIZE-UWLIGHT`/`R-SIZE-EREEL` (big-ticket gear gated at documented hull thresholds 7.0 / 6.0 / 5.0 / 6.0 m).
- **Keyword section routing** — OUTBOARD / TILLER / PROP sections render under Motor Dealer Fit; TRAILER ACCESSOR/SETUP sections under Trailer Dealer Fit (on top of the module-config category lists).
- **Display-name prettifier** — the 93 raw MPF headings map to operator-facing names ("MAJESTIC TV OPTIONS" → "TV & Entertainment", "GARMIN ELECTRONIC OPTIONS" → "Electronics — Garmin", model packs → "Boat Pack — Classic 380"); generic fallback title-cases and strips supplier prefixes; the raw heading stays in the `title` attribute for traceability.
- **Step-5 toolbar** — debounced search (name + category), category filter chips, and a **"Show all items" escape hatch** that bypasses every relevance narrowing. Narrowing can never hard-block a legitimate sale: already-selected items never hide, and everything stays reachable via search + Show all. A footer line reports "N items hidden as not relevant to this build".
- **Card + grid polish** — title-top consistent layout (the image area only exists when a real image resolves — no more empty voids or some-top/some-bottom inconsistency), `line-clamp` titles with full name in `title`, grid `sm:2 / xl:3 / 2xl:4` columns fixing the cramped 1366/1920 layout. Same treatment applied to the Motor and Trailer dealer-fit card grids.

Live effect on a CL380 (simulated over all 1,791 live rows): Boat Pack 8→1 cards · Tube Covers 60→6 (PVC, 3.4–4.2 m only) · 14 radomes + underwater lights + electric-reel wiring hidden by size class · 18 workshop rows + 20 job-card sub-items hidden · 15 rows routed to the motor/trailer steps. An SP760 (7.6 m, remote steer) keeps its radar/TV/underwater-light options and loses tiller kits.

### Image data patch (sanctioned, logged)

Hashed all 164 `mpf-mirror/dfo/` Storage objects (metadata md5): one hash accounted for **1,526 of 1,792** mirror references in `dealerFitSelections` — downloaded and visually verified as the **NSM logo**. Patch: nulled `imageLink` + `items[].data['Image Link']` on every doc pointing at a logo-hash mirror — **763 docs / 1,525 fields**, updateMask-scoped, logged to `tasks/mpf-audit/apply-log-images.jsonl` (class `dfo-logo-mirror`). Post-patch scan of all 1,791 docs: **0 logo refs remaining**; genuine product mirrors (Minn Kota, Garmin, Lone Star) untouched.

### Evidence

- `tests/unit/step5-curation.test.ts` — 67 tests: the FFR-24 33-case classifier harness (now importing the real module) + one suite per named rule, routing, dedupe, prettifier. Full unit suite 527/527, typecheck 0.
- `tasks/test-evidence/fail-fix-retest.json` — **FFR-25** (presentation-relevance class), **FFR-26** (logo-mirror imagery), **FFR-27** (R-LEN "1.8mtr Aerial" false positive caught by the harness during the cycle — the fail→fix→retest loop firing inside a single day's work).
- `scripts/mpf/verify-per-boat-sets.py` C1F front-end port synced to the new classifier + routing.
- Browser spot-check queued behind the fleet walk (the Playwright slot and the `next start` build it drives were occupied by the walk throughout this pass).

---

## Roadmap ceremony

- `scripts/seed-v131-mpf-release.py` — one-shot idempotent seed (DRY-RUN default, `--apply`): creates Epic 12 + Epic 13 and the 14 shipped v1.31 stories. Applied + read back 2026-07-03 (14/14 shipped, both epics HTTP 200).
- `scripts/seed-v131-step5-curation-story.py` — addendum seed for Story **12.4.2 Step-5 curation engine** (same idempotent pattern). Applied + read back 2026-07-04 (`features/v131-12-4-2`, status shipped, targetRelease v1.31, epic `mpf-migration`).
- `RELEASE_WINDOWS['v1.31'] = { shipped: true }`; `FORWARD_RUNWAY_START` bumped 31 → 32.

---

## Files Changed

**New — MPF pipeline (`scripts/mpf/`)**: `_common.py`, `_fs.py`, `extract-boats.py`, `extract-motors.py`, `extract-trailers.py`, `extract-factory-options.py`, `extract-parts.py`, `extract-service.py`, `extract-pricing-config.py`, `diff-boats.py`, `diff-motors-trailers-fo.py`, `diff-parts.py`, `diff-service-config.py`, `import-boats.py`, `import-motors-trailers-fo.py`, `import-parts.py`, `import-service-config.py`, `audit-images.py`, `remediate-images.py`, `verify-parity.py`, `ultimate-test/`.

**New — components**: `nsm-recommended.tsx`, `landed-cost-breakdown.tsx`, `engine-schedule-picker.tsx`, `suppliers-manager.tsx`, `rigging-kits-manager.tsx`, `pricing-matrix-manager.tsx`, `engine-service-schedules-manager.tsx`, `freight-config-manager.tsx`.

**New — testing**: `tests/unit/*` (6 suites, 460 tests), `vitest.config.ts`, `.github/workflows/ci.yml`, `tests/visual/` (+ `tls-bridge.mjs`), `playwright.visual.config.ts`, `playwright.evidence.config.ts`, `scripts/smoke-1000.py` sections I/J, `tests/ultimate-test.spec.ts`.

**New — evidence**: `tasks/mpf-audit/` (MAPPING.md, INVENTORY.md, AUDIT_LOG.jsonl, analysis/, apply logs), `tasks/test-evidence/` (MPF_PARITY.md, IMAGE_AUDIT.md, image-remediation.md, fail-fix-retest.json, smoke-data.json, ultimate-test/, history/).

**Modified**: `highfield-quote-flow.tsx` (NSM Recommended wiring), `highfield-pricing-workspace.tsx` (landed-cost breakdown), `service-quote-detail-sheet.tsx` (schedule picker), `manage/page.tsx` (MPF Data section), `quote-financials.ts` + `payment-schedule` libs (3 money-bug fixes), `firestore.rules` (6 new MPF collections, deployed + list-verified), `src/lib/release-schedule.ts`, ~20 files for the FFR-7 typecheck fix-up.

**Roadmap**: `scripts/seed-v131-mpf-release.py` (this release's ceremony seed).
