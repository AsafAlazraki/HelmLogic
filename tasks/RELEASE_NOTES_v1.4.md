# HelmLogic — Release Notes v1.4.0
> Release Date: 2026-04-23
> Branch: `claude/app-overview-wKiZ1` → main
> Major release since v1.3.0

### Release Stats
- **70 commits** since divergence from `main`
- **65 files changed** · **+11,594 / −825 lines** (~10.8K net new code)
- **2 new module types** added: `trailers` and `rego`
- **1 new vendor type**: `Rego Authority`; one existing type promoted: `Trailer Brand`
- **9 implementation steps** per `tasks/v1.4-trailers-module-design.md` §11 — all complete
- **Pricing Manager uplift** — 8-stage rebuild matching Highfield's depth: Brand→Series→Trailer tree, full waterfall inline editing on every row + expanded panel, row/brand/series multi-select, bulk reset, Global Update dialog, staged-Publish workflow
- **Settings parity** — new reusable `<ModuleSettingsPanel>` ensures every module's Settings tab has the same card set (Module Image, Associated Vendors, **Associated Modules** [new v1.4 concept], Dealer Fit Categories, Sub Dealers, Module Roles)
- **Associated Modules** — boat module can link the Trailer module and auto-inherit its brand list + DF categories + associated vendors, no duplicate wiring. Quote flow honors the link: Step 4 narrows to linked trailer modules; Step 5 merges their DF categories (critical fix in commit `0b83ead`).
- **Per-boat-model trailer assignments** — design doc §5 shipped. Models carry `trailerAssignments[]`; quote flow auto-pre-selects the default; users click a tile to switch between assigned trailers (no full-catalog browse at quote time). Available in both the Highfield model editor and the Catalog Explorer's TRAILER OPTIONS tab.
- **Dealer Fit Options inside trailer detail sheet** — same Master Data Browser as Yamaha motor detail sheet, scoped to the trailer module's own categories
- **Trailer Specs modal** — dense row list matching Engine Specs styling: Code, Brand, Series, Boat Size, Length, ATM, Tare, Wheel Size, Winch, Between Guards, Plug, Cost, Sell + Available Options
- Full pricing waterfall ingested column-for-column from the client's xlsx source
- Snapshot-on-select pattern extended to trailers + rego for price stability across catalog edits
- Trailer quotes now carry cost, specs, and brand provenance through to the proposal PDF — parity with motor quote rendering
- Editing surfaces open to any signed-in user (not just platform admins) so dealer-level admins like Bill Hull can edit images / fields / pricing overrides on v1.4 modules
- Day-1 tester-flagged polish round: banner colour uniformity, detail sheet sizing, Edit/X button overlap, broken-image gracefully hidden instead of rendering "Build Preview" placeholder, null "FROM —" pill removed, Recent Proposals hero image

### Source of Requirements
Client (Northside Marine) supplied `Trailer Module.xlsx` — a 20-column dealer pricing sheet covering Dealer → Discount → Settlement → Nett → Freight → Landed → PD → CTD → MU% → GP → RRP → Sell plus PD parts, factory options, lead times, and rego hints. v1.4 ingests the full sheet and exposes it on a new Trailers workspace. A parallel new Rego module consolidates boat + trailer registration fees previously hard-coded on Highfield model documents.

---

## New Module Types

### Trailers module
- New `moduleType: 'trailers'` with dedicated workspace at `/modules/{id}`.
- Three tabs: **Dashboard** (Yamaha-style, boat-size-range grouped, Cards/Table view toggle), **Pricing Manager** (Brand→Series tree, waterfall inline editing, staged Publish), **Settings** (uniform across all modules).
- One module can source from multiple trailer brand vendors (REDCO, TINKA, STACER, DUNBIER, MACKAY, GFAB, NSM CUSTOM).
- Trailer detail sheet is wide (lg:max-w-4xl) and renders: image (admin-editable), specs, features, factory options, pricing summary, and the Dealer Fit Options Master Data Browser.

### Rego module
- New `moduleType: 'rego'` — shared between boats and trailers.
- Replaces the ad-hoc `registration` fields on Highfield model docs.
- Rego types are sub-documents on each Rego Authority vendor: `data-warehouse/{regoVendorId}/regoTypes/{typeId}`.

### New vendor types
- `Trailer Brand` — surfaces in `/data-warehouse/add` alongside existing brand types.
- `Rego Authority` — new vendor type carrying `regoTypes` sub-collection.

---

## Data Model

### Trailer documents
`data-warehouse/{brandVendorId}/series/{seriesId}/trailers/{trailerId}`:
- Top-level essentials: `code`, `name`, `imageUrl`, `isActive`, `supplier`, `features[]`, `cost`, `sellPriceExclGst`, `landedCost`
- `specifications`: `boatSizeMtr`, `wheelSize`, `tareKg`, `atmKg`, `winch`, `betweenGuardsMm`, `lengthMtr`, `plug`
- `pricingDetail`: full waterfall from cols AN-BW — `dealer`, `discount`, `settlement`, `nettPrice`, `freight`, `landed`, `pdDollars`, `pdParts[]`, `sundry`, `detailing`, `totalPdCharges`, `totalNettCtd`, `markupPercent`, `grossProfit`, `rrp`, `sell`
- `optionalFeatures[]`: 20 factory-option slots (cols CD-FX)
- `leadTimes`: factory build/lockout/completion/shipping dates
- Obsolete rows and "Trailer Not Required" preserved with `isActive: false`

### Rego types
`data-warehouse/{regoVendorId}/regoTypes/{typeId}`:
- `name`, `sellExclGst`, `appliesTo: 'boat' | 'trailer' | 'both'`, `description?`, `isActive?`

### Org-level overrides (new collection)
`organisations/{orgId}/trailerOverrides/{trailerId}`:
- `sellPriceExclGst` — per-org override of the imported `pricingDetail.sell`
- `note?`, `overrideAt: Timestamp`, provenance fields `trailerId`, `brandVendorId`, `seriesId`
- Mirrors the existing `modelOverrides` pattern for Highfield boats

---

## Importer

- `scripts/seed-trailers.ts` (and the dry-run sibling) mirror `seed-master-price-file.ts`.
- Walks `Trailer Module.xlsx` and emits one Firestore doc per row under the correct brand/series.
- Dry-run flag prints a per-brand summary; `--live` writes to Firestore.
- Handles DUNBIER/HAINES BMT "package only" rows via a `packageOnly: true` flag.

---

## Trailers Workspace

### Dashboard tab (default)
- Yamaha-style gradient banner (orange), aggregate stats (Total / Active / Brands)
- Catalog grouped by **boat size range** (<4m / 4–5m / 5–6m / 6–7m / 7m+ / Unknown) — same pattern as motor HP ranges
- Per-trailer card shows image, code, name, badges for boat size / length / ATM, and `sellPriceExclGst`
- **View toggle**: Cards ↔ Table, URL-synced via `?trailerView=table`
- **Broader search** — matches code, name, brand, series, supplier, and feature text
- Detail sheet opens on click — specs, features, factory options, read-only waterfall summary, rego hint (info only)
- **Admin-only edit surfaces**:
  - Trailer image — upload file, paste URL, or remove (writes `data-warehouse/{vendor}/series/{s}/trailers/{t}.imageUrl`)
  - Trailer model fields — inline editor for basic info, specifications, features, and factory options; pricing waterfall stays in the Pricing Manager tab
- Tab URL param is `dashboard`; legacy `?trailerTab=catalog` is remapped to dashboard for existing bookmarks

### Pricing Manager tab
- Full waterfall per trailer (collapsible rows): Dealer (AN) → Discount (AO) → Settlement (AP) → **Nett (AQ)** → Freight (AR) → Landed (AS) → PD $ (BD) → Sundry (BO) → Detailing (BP) → Total PD (BQ) → **Total Nett CTD (BS)** → MU% (BT) → GP (BU) → RRP (BV) → **Sell ex GST (BW)**
- Source xlsx column codes visible next to every row for dealer audit
- PD Parts breakdown rendered when present
- **Org Override** — admins click Override on any row, enter a new ex-GST sell + optional note, save to `organisations/{orgId}/trailerOverrides/{trailerId}`
- Overridden rows show amber "Org Override" badge with strikethrough source price
- Reset-to-source deletes the override doc and the row reverts instantly

### Settings tab
- **Module Image editor** (new reusable `ModuleImageEditor` card) — upload / paste URL / remove for the module's `logoUrl`. Drop-in for any module workspace; currently wired into Trailers.
- Trailer Brand multi-select writes `modules/{id}.trailerBrandVendorIds[]`
- Trailer Dealer Fit Categories manager writes `modules/{id}.trailerDealerFitCategories[]`
- Module role assignment (Brand Captain, Module Manager) unchanged from v1.3

---

## Rego Workspace

### Types tab
- Groups rego types by Rego Authority vendor
- Full CRUD per type: name, `sellExclGst`, `appliesTo` (boat/trailer/both), description, active toggle
- Saves to `data-warehouse/{vendorId}/regoTypes/{typeId}` with `{ merge: true }`

### Settings tab
- Multi-select of Rego Authority vendors — writes `modules/{id}.regoVendorIds[]`
- Module role assignment

---

## Highfield Quote Flow Integration

### Trailer step (Step 4)
- New `Pick from Catalog` trigger opens the shared `TrailerCatalogPicker` dialog
- Picker loads every trailers module visible to the org, fans out per-brand/per-series loaders, and renders a searchable grid
- Org's `trailerOverrides` are subscribed once at picker load and merged into every trailer card — overridden prices show in amber with an "Org Price" label
- On select, a `TrailerSnapshot` is frozen into the quote: `{ id, brandVendorId, seriesId, trailerId, code, name, imageUrl, sellPriceExclGst, cost, priceLevels, pricingDetail, specifications, options[], capturedAt }`
- `effectiveTrailerConfig` shadow memo wires the snapshot into every downstream reference without rewiring 15 call-sites

### Rego step
- Boat Registration card gets a new `Rego Module` dropdown (filter: `boat` or `both`)
- Trailer Registration card gets the same dropdown (filter: `trailer` or `both`)
- Picking a rego supersedes the legacy `isRegoSelected` / `isTrailerRegoSelected` toggles
- Snapshot captures `{ id, vendorId, vendorName, regoTypeId, name, sellExclGst, appliesTo, capturedAt }` so quote totals don't drift if the admin edits a rego type later
- Legacy toggles still work when no rego module is configured — full backwards compatibility

### Finalize payload additions
- `trailer.catalog` — the frozen `TrailerSnapshot` (or absent if the legacy flow was used)
- `registration.boatRegoSnapshot` / `registration.trailerRegoSnapshot` — rego snapshots alongside the legacy boolean/price fields
- Duplicate-quote rehydration restores all three snapshots so the pickers display the original selection exactly

---

## Imports — Upsert by Natural Key

Every data-import surface in the app now upserts by a detected natural key (Part Number → Model Code → Model ID → SKU → Code → ID → Model → Model Name → first column fallback) instead of wiping and re-inserting. Partial uploads no longer destroy rows that weren't in the file.

- Yamaha Master Price File (`master-price-file-workspace.tsx`) — was the worst offender; now partial imports preserve operator edits.
- Sam Allen uploader (`sam-allen-uploader.tsx`) — same conversion.
- Trailer pricing, delivered-deals, stock import already dedupe.

Every converted path toasts `N updated · M created · K skipped (no key)` so operators can see exactly what the import did.

---

## Trailer-on-Boat-Quote Parity

When a trailer is picked from the catalog during a Highfield boat quote, it now carries through to the proposal PDF with the same level of detail as the motor:

- **Cost** is persisted alongside sell price (`quote.trailer.cost`) — margin is visible in saved quotes, dealer audit, and stock roll-up. Previously the snapshot captured it but the finalize payload dropped it.
- **Specs** (boat size, trailer length, ATM, tare, wheel size, winch) snapshot onto `quote.trailer.catalog.specifications` at pick-time. The proposal PDF renders them as a dot-separated strip under the trailer line, plus a `BRAND · CODE` subtitle. Legacy quotes without snapshots fall back cleanly to the old single-line render.
- **Dealer fit** was already correctly gated on trailer selection and category-separated in the UI; quote payload unchanged.
- **Rego hint** fields on the trailer doc (`pricingDetail.regoTypeHint` / `regoDollarsHint`) are deliberately informational only — the Rego module is authoritative, with `trailerPrice12Months` on the boat model as the legacy fallback. Hints are surfaced in the dashboard detail sheet labelled "info only" and are NOT wired into quote pricing (they'd cross-state silently — xlsx notes aren't state-aware).

---

## Dealer Fit — Four-source merge

`DealerFitOptions` now merges categories from **four** sources (was three):

1. Global — `dealerFitCategories` collection
2. Boat module — `modules/{id}.moduleDealerFitCategories[]`
3. Motor module — `modules/{id}.motorDealerFitCategories[]`
4. **Trailer module** — `modules/{id}.trailerDealerFitCategories[]` (new)

Synthetic IDs (`module-<name>`, `motor-<name>`, `trailer-<name>`) are looked up by category name so saved selections rebind automatically across the three module-level sources.

---

## Testing Infrastructure

- `tests/v1.4-trailers.spec.ts` — **7-test** Playwright smoke suite covering Trailers dashboard (default tab), cards↔table view toggle + URL persistence, Pricing Manager waterfall, Settings (module image + brand + dealer-fit), trailer detail sheet with admin edit affordance, Rego workspace, and the Highfield quote trailer step
- Read-only by design — every spec uses `test.skip()` guards so the suite is safe against any dev env regardless of seeded data
- Full manual test matrices in `testing/v1.4/README.md` (§§3-8) cover every mutation path: importer, catalog, quote integration, rego flow, dealer fit merge, pricing overrides
- Full project suite: 70 tests across 9 files, all parse

---

## Out of Scope for v1.4

Deferred per design doc §10:
- Registration & compliance form fields (cols KE-NU of the source xlsx)
- Per-trailer promotions
- Trailer variants (material/colour SKUs)
- Migration of historical Highfield quotes onto the new Rego module — new quotes only

---

## Files Changed (Key Components)

**New files**
- `src/components/trailer-catalog-picker.tsx` — shared dialog-based picker with overrides merge + `associatedModuleIds` narrowing
- `src/components/trailer-dashboard.tsx` — Yamaha-style dashboard with boat-size grouping, card/table toggle, admin edit surfaces for image + model fields, inline DealerFitOptions Master Browser (~1,400 lines)
- `src/components/trailer-pricing-workspace.tsx` — full Pricing Manager uplift: Brand→Series tree, waterfall inline editing, multi-select, Global Update, staged Publish (~2,000 lines)
- `src/components/module-image-editor.tsx` — reusable `logoUrl` editor card for module Settings tabs
- `src/components/module-settings-panel.tsx` — reusable Settings panel used by Trailer / Yamaha / Rego workspaces (Module Image + Associated Vendors + Associated Modules + Dealer Fit + Sub Dealers + Module Roles)
- `src/components/rego-picker.tsx` — shared boat/trailer rego dropdown
- `src/components/rego-workspace.tsx` — Rego module workspace (Types + Settings)
- `scripts/seed-trailers.ts` — xlsx importer with dry-run flag
- `tests/v1.4-trailers.spec.ts` — Playwright smoke suite
- `testing/v1.4/README.md` — per-step test matrices

**Modified**
- `src/components/trailers-workspace.tsx` — Dashboard default tab, ModuleSettingsPanel-backed Settings tab
- `src/components/yamaha-motor-workspace.tsx` — Settings tab now uses ModuleSettingsPanel for full card parity
- `src/components/highfield-quote-flow.tsx` — Step 4 rewrite: trailer tiles come from `model.trailerAssignments` only (no catalog browse); auto-pre-selects default assignment; click to switch, click again to untick. Step 5 now merges trailer DF categories from `associatedModuleIds`. Trailer Specs modal restyled dense row list. Carousel skips empty image URLs.
- `src/components/highfield-model-editor.tsx` — schema adds `trailerAssignments: z.array(...)`; new exported `TrailerAssignmentsSection` used by both the model editor and the Catalog Explorer TRAILER OPTIONS tab
- `src/components/trailer-options.tsx` — legacy Primary Trailer + Sub-Options cards removed; only TrailerAssignmentsSection renders
- `src/components/model-configuration-editor.tsx` — `getSafeDefaultValues` carries `trailerAssignments` so the form round-trips correctly (fixes the "poof" bug where assignments reset on editor reload)
- `src/components/finalize-quote-dialog.tsx` — payload writes `trailer.catalog.specifications` + `trailer.cost`, plus `registration.boatRegoSnapshot` / `trailerRegoSnapshot`
- `src/components/proposal-pdf.tsx` — trailer block renders `BRAND · CODE` subtitle + specs strip when the snapshot is present
- `src/components/master-price-file-workspace.tsx` — `handleImport` upserts by natural key instead of clear-and-replace
- `src/components/sam-allen-uploader.tsx` — `handleSave` upserts by natural key
- `src/components/dealer-fit-options.tsx` — five-source merge: global + boat-module + motor + trailer + **linked associated-module categories**
- `src/app/(app)/modules/[id]/page.tsx` — routing branches for `moduleType === 'trailers'` and `moduleType === 'rego'`; `isAdmin={true}` at v1.4 workspace call sites so dealer-admins can edit; Recent Proposals full-width hero image
- `src/app/(app)/data-warehouse/add/page.tsx` — adds `Trailer Brand` + `Rego Authority` vendor types
- `tasks/v1.4-trailers-module-design.md` — full design spec

---

## Day-1 Remediation Log (2026-04-23)

Tester-flagged issues caught during dev testing before release sign-off.
Each commit referenced below is on `claude/app-overview-wKiZ1`.

| # | Issue | Resolution | Commit |
|---|---|---|---|
| 1 | Trailer banner was orange, jarred against Yamaha/Highfield blue | Matched app-wide blue gradient; muted card hover/price-text accents | `3477bf5` |
| 2 | Bill (dealer admin) couldn't see v1.4 editing controls | Dropped `isAdmin` gate on v1.4 editing surfaces only | `d7dd058` |
| 3 | Every module's Settings tab had a different card set | New reusable `ModuleSettingsPanel` with full card parity | `a1f2e63` |
| 4 | Linking trailer module didn't pull its data into the boat quote | Stage B.2: picker narrowing + DealerFitOptions 5-source merge | `190ede0` |
| 5 | No way to attach a trailer to a boat model | `model.trailerAssignments[]` schema + `TrailerAssignmentsSection` in both editors; quote flow auto-pre-selects default | `0cf9300` + `f023fbb` |
| 6 | No per-trailer dealer-fit browser in the trailer detail sheet | Ported the Yamaha `<DealerFitOptions moduleOnly>` pattern into the trailer detail sheet | `60b21e5` |
| 7 | Edit button overlapped the Sheet's built-in close X | `mr-8` clearance | `297aacd` |
| 8 | Recent Proposals cards showed a cramped thumbnail | Full-width hero image, object-cover, 144px tall | `404869b` |
| 9 | **Critical:** Step 5 trailer DF empty even when trailer module linked | Merged `associatedModuleIds` → linked modules' trailer DF categories into the quote flow's own memos | `0b83ead` |
| 10 | Trailer assignments "poofed" when re-opening the editor | `getSafeDefaultValues` now carries `trailerAssignments`; round-trip fixed | `3502153` |
| 11 | "Pick from Catalog" / "Change Trailer" at quote time confused operators | Step 4 now only shows assigned trailer tiles; click to switch, click again to untick | `3502153` |
| 12 | Catalog Explorer TRAILER OPTIONS tab had two legacy freeform cards below the catalog picker | Removed. Only `TrailerAssignmentsSection` renders. | `3502153` |
| 13 | Broken "Build Preview" image tile on quote carousel | Carousel slides only push when `coverImageUrl` is truthy; same for gallery | `3502153` |
| 14 | Null "FROM —" pill on quote trailer step | Gone with the catalog picker | `3502153` |
| 15 | Trailer Specs modal too sparse | Matches Engine Specs row pattern | `ad941bc` |
| 16 | **Critical:** pricing-manager overrides bypassed on auto-loaded trailers | Quote flow subscribes to `organisations/{orgId}/trailerOverrides` and applies both `sellPriceExclGst` and `pricingDetail` overrides inside `loadAssignmentSnapshot` | `3f3b07e` |
| 17 | Silent failure if assigned trailer's Firestore doc was deleted | Destructive toast names the missing trailer + prompts operator to update Trailer Options | `3f3b07e` |
| 18 | Sub-dealer trailer overrides ignored parent org's pricing-manager edits | Quote flow subscribes to BOTH the sub-dealer's and parent org's `trailerOverrides`, sub-dealer wins on conflicts | `bd3773a` |
| 19 | Saved quotes couldn't distinguish override vs source pricing for dealer audit | `TrailerSnapshot` + `quote.trailer.catalog` carry `pricingSource: 'source' \| 'override'` and `sourceSellPriceExclGst` | `bd3773a` |

**Pre-release verification done:**

- ✅ `npm run build` — clean production build, all 28 routes compile
- ✅ `npx tsc --noEmit` — 86 pre-existing errors, zero new from v1.4
- ✅ Playwright suite parses: 70 tests across 9 files
- ✅ End-to-end audit + sibling-bug audit — every finding fixed
- ⚠️ Playwright run-against-dev: blocked by sandbox DNS limitation; needs to run from a normal CI or local environment before final sign-off
- ⏳ Tester walkthrough of `testing/v1.4/test-cases.md` Sections L + M (especially M.9 + R9c/d/e regression guards)

**Release status:** awaiting user's green-light for PR → main.
