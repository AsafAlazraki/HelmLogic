# v1.4 — Release Notes (Engineering-facing)

The authoritative release notes live at
[`tasks/RELEASE_NOTES_v1.4.md`](../../tasks/RELEASE_NOTES_v1.4.md). This file
mirrors the headline content so testers have everything in one place without
jumping folders.

> **Release Date:** 2026-04-20  •  **Branch:** `Dev` → `main`  •  **Prior version:** v1.3.0

---

## Release stats

- **2 new module types** added: `trailers` and `rego`
- **1 new vendor type**: `Rego Authority`; one existing type promoted: `Trailer Brand`
- **9 implementation steps** per `tasks/v1.4-trailers-module-design.md` §11 — all complete
- **14 commits** on the `Dev` branch from design lock through seed import
- **Live data:** 7 trailer brand vendors, 46 series, 449 trailer docs, 1 trailers module doc

---

## Source of requirements

Northside Marine supplied `Trailer Module.xlsx` — a 20-column dealer pricing
sheet covering Dealer → Discount → Settlement → Nett → Freight → Landed → PD →
CTD → MU% → GP → RRP → Sell plus PD parts, factory options, lead times, and
rego hints. v1.4 ingests the full sheet and exposes it on a new Trailers
workspace. A parallel new Rego module consolidates boat + trailer registration
fees previously hard-coded on Highfield model documents.

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

## Data Model Summary

See [`overview.md`](./overview.md) for the tester-facing explanation.
Complete schema in [`tasks/v1.4-trailers-module-design.md`](../../tasks/v1.4-trailers-module-design.md) §8.

Key paths:
```
data-warehouse/{trailerBrandVendorId}/series/{seriesId}/trailers/{trailerId}
data-warehouse/{regoAuthorityVendorId}/regoTypes/{typeId}
organisations/{orgId}/trailerOverrides/{trailerId}    (new collection)
modules/{trailersModuleId} -- moduleType: 'trailers', trailerBrandVendorIds[]
modules/{regoModuleId}     -- moduleType: 'rego', regoVendorIds[]
modules/{boatModuleId}     -- trailerDealerFitCategories[] (live read path for quote flow)
```

---

## Quote payload additions

When a quote is finalized:
- `trailer.catalog` — frozen `TrailerSnapshot` from the catalog picker, or absent.
- `registration.boatRegoSnapshot` — frozen rego type for boat rego, or absent.
- `registration.trailerRegoSnapshot` — frozen rego type for trailer rego, or absent.
- Legacy boolean/price fields remain for backwards compatibility.

Duplicate-quote rehydration restores all three snapshots.

---

## Files Changed (Key Components)

**New files**
- `src/components/trailer-catalog-picker.tsx` — shared dialog-based picker with overrides merge
- `src/components/rego-picker.tsx` — shared boat/trailer rego dropdown
- `src/components/rego-workspace.tsx` — Rego module workspace (Types + Settings)
- `scripts/seed-trailers.ts` — xlsx importer with dry-run flag + REST write path
- `scripts/create-trailers-module.ts` — creates the `modules/trailers-module` doc
- `scripts/verify-trailers-live.ts` — post-seed verification script
- `tests/v1.4-trailers.spec.ts` — Playwright smoke suite
- `testing/v1.4/*.md` — this folder

**Modified**
- `src/components/trailers-workspace.tsx` — full Pricing Manager tab with waterfall + overrides
- `src/components/highfield-quote-flow.tsx` — `effectiveTrailerConfig` shadow memo, boat/trailer rego snapshots, `Pick from Catalog` CTA
- `src/components/finalize-quote-dialog.tsx` — payload writes `trailer.catalog`, `registration.boatRegoSnapshot`, `registration.trailerRegoSnapshot`
- `src/components/dealer-fit-options.tsx` — four-source merge
- `src/app/(app)/modules/[id]/page.tsx` — routing branches for `moduleType === 'trailers'` and `moduleType === 'rego'`
- `src/app/(app)/data-warehouse/add/page.tsx` — adds `Trailer Brand` + `Rego Authority` vendor types
- `tasks/v1.4-trailers-module-design.md` — full design spec

For the full engineering changelog see [`tasks/RELEASE_NOTES_v1.4.md`](../../tasks/RELEASE_NOTES_v1.4.md).
