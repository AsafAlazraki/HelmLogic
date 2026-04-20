# HelmLogic — Release Notes v1.4.0
> Release Date: 2026-04-20
> Branch: Dev → main
> Major release since v1.3.0

### Release Stats
- **2 new module types** added: `trailers` and `rego`
- **1 new vendor type**: `Rego Authority`; one existing type promoted: `Trailer Brand`
- **9 implementation steps** per `tasks/v1.4-trailers-module-design.md` §11 — all complete
- **13 commits** on the Dev branch from design lock through Playwright smoke
- Full pricing waterfall ingested column-for-column from the client's xlsx source
- Snapshot-on-select pattern extended to trailers + rego for price stability across catalog edits

### Source of Requirements
Client (Northside Marine) supplied `Trailer Module.xlsx` — a 20-column dealer pricing sheet covering Dealer → Discount → Settlement → Nett → Freight → Landed → PD → CTD → MU% → GP → RRP → Sell plus PD parts, factory options, lead times, and rego hints. v1.4 ingests the full sheet and exposes it on a new Trailers workspace. A parallel new Rego module consolidates boat + trailer registration fees previously hard-coded on Highfield model documents.

---

## New Module Types

### Trailers module
- New `moduleType: 'trailers'` with dedicated workspace at `/modules/{id}`.
- Three tabs: **Catalog**, **Pricing Manager**, **Settings**.
- One module can source from multiple trailer brand vendors (REDCO, TINKA, STACER, DUNBIER, MACKAY, GFAB, NSM CUSTOM).

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

### Catalog tab
- Grouped by brand, then by series
- Per-trailer card shows image, code, name, badges for boat size / length / ATM, and `sellPriceExclGst`
- Detail sheet opens on click — specs, features, factory options, read-only waterfall summary

### Pricing Manager tab
- Full waterfall per trailer (collapsible rows): Dealer (AN) → Discount (AO) → Settlement (AP) → **Nett (AQ)** → Freight (AR) → Landed (AS) → PD $ (BD) → Sundry (BO) → Detailing (BP) → Total PD (BQ) → **Total Nett CTD (BS)** → MU% (BT) → GP (BU) → RRP (BV) → **Sell ex GST (BW)**
- Source xlsx column codes visible next to every row for dealer audit
- PD Parts breakdown rendered when present
- **Org Override** — admins click Override on any row, enter a new ex-GST sell + optional note, save to `organisations/{orgId}/trailerOverrides/{trailerId}`
- Overridden rows show amber "Org Override" badge with strikethrough source price
- Reset-to-source deletes the override doc and the row reverts instantly

### Settings tab
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

## Dealer Fit — Four-source merge

`DealerFitOptions` now merges categories from **four** sources (was three):

1. Global — `dealerFitCategories` collection
2. Boat module — `modules/{id}.moduleDealerFitCategories[]`
3. Motor module — `modules/{id}.motorDealerFitCategories[]`
4. **Trailer module** — `modules/{id}.trailerDealerFitCategories[]` (new)

Synthetic IDs (`module-<name>`, `motor-<name>`, `trailer-<name>`) are looked up by category name so saved selections rebind automatically across the three module-level sources.

---

## Testing Infrastructure

- `tests/v1.4-trailers.spec.ts` — 5-test Playwright smoke suite covering Trailers catalog, pricing manager, settings, Rego workspace, and the Highfield quote trailer step
- Read-only by design — every spec uses `test.skip()` guards so the suite is safe against any dev env regardless of seeded data
- Full manual test matrices in `testing/v1.4/README.md` (§§3-8) cover every mutation path: importer, catalog, quote integration, rego flow, dealer fit merge, pricing overrides

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
- `src/components/trailer-catalog-picker.tsx` — shared dialog-based picker with overrides merge
- `src/components/rego-picker.tsx` — shared boat/trailer rego dropdown
- `src/components/rego-workspace.tsx` — Rego module workspace (Types + Settings)
- `scripts/seed-trailers.ts` — xlsx importer with dry-run flag
- `tests/v1.4-trailers.spec.ts` — Playwright smoke suite
- `testing/v1.4/README.md` — per-step test matrices

**Modified**
- `src/components/trailers-workspace.tsx` — full Pricing Manager tab with waterfall + overrides
- `src/components/highfield-quote-flow.tsx` — `effectiveTrailerConfig` shadow memo, boat/trailer rego snapshots, `Pick from Catalog` CTA
- `src/components/finalize-quote-dialog.tsx` — payload writes `trailer.catalog`, `registration.boatRegoSnapshot`, `registration.trailerRegoSnapshot`
- `src/components/dealer-fit-options.tsx` — four-source merge
- `src/app/(app)/modules/[id]/page.tsx` — routing branches for `moduleType === 'trailers'` and `moduleType === 'rego'`
- `src/app/(app)/data-warehouse/add/page.tsx` — adds `Trailer Brand` + `Rego Authority` vendor types
- `tasks/v1.4-trailers-module-design.md` — full design spec
