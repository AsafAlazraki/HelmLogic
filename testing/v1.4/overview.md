# v1.4 — Overview (Business Context for Testers)

Read this **before** you touch the app. The rest of the v1.4 docs assume you
understand what problem this release solves and the new vocabulary it
introduces.

---

## The business problem

Northside Marine (the pilot dealer) had two operational pain points:

1. **Trailers were unmanaged.** Dealer sales quotes mentioned a trailer by name
   or shoved its price into the boat module's "additional options". There was
   no catalog, no brand-by-brand pricing, and no per-dealer margin data. When
   a factory updated its pricing sheet, the dealer had nothing to import against
   — so margins decayed. The dealer's own master pricing sheet,
   `Trailer Module.xlsx`, has **449 trailer SKUs across 6 brands** with a full
   15-column dealer pricing waterfall. v1.4 ingests that file.
2. **Rego (registration) fees were hard-coded on each boat doc.** Each boat
   model had a `registration.price12Months` number typed into it. There was no
   concept of "QLD Small Trailers ≤1.02t = $151" as a **rego type** that any
   boat/trailer could reference. v1.4 introduces a shared rego module.

---

## What shipped — plain English

### 1. Trailers module — `/modules/{trailersModuleId}`
A new type of module (`moduleType: 'trailers'`) sitting alongside Catalog,
Motor Brand, MPF and Rego modules. It has three tabs:

- **Catalog** — the searchable grid of every trailer, grouped by brand and
  series. Each card shows image, code, name, key specs, and sell-ex-GST price.
  Click a card to open a detail sheet with specs, features, factory options,
  and a read-only pricing summary.
- **Pricing Manager** — the **big one for admins**. Every trailer gets a
  collapsible row that expands to show the full **pricing waterfall** — the
  15-step path from Dealer price → Discount → Settlement → Nett → Freight →
  Landed → PD $ → Sundry → Detailing → Total PD Charges → Total Nett CTD →
  Markup % → Gross Profit → RRP → Sell ex GST. Every row shows the column
  letter from the source xlsx (`AN`, `AO`, etc.) so dealers can cross-check
  the import. Admins can **override the final Sell price per-org** — writes
  to `organisations/{orgId}/trailerOverrides/{trailerId}`. When a quote picks
  up that trailer, it captures the overridden price (not the source).
- **Settings** — multi-select of Trailer Brand vendors; per-module dealer-fit
  categories; role assignment.

### 2. Rego module — `/modules/{regoModuleId}`
New `moduleType: 'rego'`. Shared between boats and trailers.

- **Types tab** — each Rego Authority vendor gets a card listing its
  registration types: name, sell price ex GST, `appliesTo: 'boat' | 'trailer' | 'both'`,
  optional description, active toggle.
- **Settings tab** — pick which Rego Authority vendors this module covers.

### 3. Highfield quote flow integration
Two changes to the Highfield quote builder:

- **Trailer step (Step 4)** — new **"Pick from Catalog"** button opens a
  dialog showing every trailer from every assigned brand. Click one → its
  full detail (id, code, name, image, sell price, price levels, full pricing
  detail, specifications, optional features) is **snapshot-frozen** into the
  quote. From that point the quote shadows the boat model's default trailer
  config with the snapshot. If the admin later edits the catalog, this quote
  does **not** change — that's by design.
- **Rego dropdown** — on both the Boat Registration card and the Trailer
  Registration card, a new "Rego Module" dropdown lists all active rego types
  filtered by `appliesTo`. Picking a rego snapshots it into the quote the
  same way. Legacy `isRegoSelected` / `isTrailerRegoSelected` toggles still
  work when no rego module is configured — full backwards compatibility.

### 4. Vendor types
- **`Trailer Brand`** — existed as a type previously but was unused. Now live.
  7 vendors seeded: REDCO/TINKA, GFAB, STACER, DUNBIER, DUNBIER/HAINES BMT,
  MACKAY, Obsolete.
- **`Rego Authority`** — new vendor type. Carries a `regoTypes/` sub-collection.
  You'll create at least one during testing (e.g. "QLD Transport").

### 5. Four-source Dealer Fit merge
`DealerFitOptions` now merges categories from **four** sources (was three):
1. Global — `dealerFitCategories` collection.
2. Boat module — `modules/{id}.moduleDealerFitCategories[]`.
3. Motor module (config lives on **boat** module doc) — `motorDealerFitCategories[]`.
4. Trailer module (config lives on **boat** module doc) — `trailerDealerFitCategories[]` *(NEW)*.

> Important nuance: despite the new "Dealer Fit" manager inside the Trailers
> workspace Settings tab, the read path in the quote flow pulls from the
> **boat module's** `trailerDealerFitCategories` field. Categories saved in the
> Trailers workspace Settings tab are currently a dead write. The boat-module
> config is the source of truth. This mirrors how motors work.

---

## New Firestore data model

### Trailer docs
```
data-warehouse/{trailerBrandVendorId}/
    series/{seriesId}/
        trailers/{trailerId}
```
Each trailer doc has:
- **Top-level:** `code`, `name`, `imageUrl`, `isActive`, `supplier`, `features[]`,
  `cost`, `sellPriceExclGst`, `landedCost`.
- **`specifications` map:** `boatSizeMtr`, `wheelSize`, `tareKg`, `atmKg`,
  `winch`, `betweenGuardsMm`, `lengthMtr`, `plug`.
- **`pricingDetail` map** — the full 15-step waterfall (`dealer`, `discount`,
  `settlement`, `nettPrice`, `freight`, `landed`, `pdDollars`, `pdParts[]`,
  `sundry`, `detailing`, `totalPdCharges`, `totalNettCtd`, `markupPercent`,
  `grossProfit`, `rrp`, `sell`).
- **`optionalFeatures[]`** — up to 20 factory-option slots (cols CD-FX in xlsx).
- **`leadTimes` map** — factory build/lockout/completion/shipping dates.

Obsolete/"Trailer Not Required" rows are preserved with `isActive: false`.

### Rego types
```
data-warehouse/{regoAuthorityVendorId}/regoTypes/{typeId}
```
Each rego type: `name`, `sellExclGst`, `appliesTo: 'boat' | 'trailer' | 'both'`,
`description?`, `isActive?`.

### Org-level overrides (new collection)
```
organisations/{orgId}/trailerOverrides/{trailerId}
```
Each override: `sellPriceExclGst` (the override), `note?`, `overrideAt`, and
provenance fields `trailerId`, `brandVendorId`, `seriesId`. Mirrors the existing
`modelOverrides` pattern for boats.

### Module-doc field additions
- `modules/{trailersModuleId}.moduleType = 'trailers'`
- `modules/{trailersModuleId}.trailerBrandVendorIds[]` — the selected brands.
- `modules/{trailersModuleId}.trailerDealerFitCategories[]` — (dead read in v1.4, see above).
- `modules/{regoModuleId}.moduleType = 'rego'`
- `modules/{regoModuleId}.regoVendorIds[]` — the selected rego authorities.
- `modules/{boatModuleId}.trailerDealerFitCategories[]` — **live read path** for the quote flow.

### Quote payload additions (at finalize)
- `trailer.catalog` — the frozen `TrailerSnapshot`, or absent if no picker was used.
- `registration.boatRegoSnapshot` — frozen rego type for the boat, or absent.
- `registration.trailerRegoSnapshot` — frozen rego type for the trailer, or absent.
- Legacy `boatRego`, `boatRegoPrice`, `trailerRego`, `trailerRegoPrice` still present for backwards compatibility.

---

## Data that's already live (as of 2026-04-20)

The seed scripts have been run against the studio project. No need to re-seed.

| Collection | Count |
|---|---|
| Trailer brand vendors (`vendorType: 'Trailer Brand'`) | 7 |
| Trailer series docs | 46 |
| Trailer docs | 449 |
| `modules/trailers-module` | 1 (wired to 6 active brand vendors, excluding Obsolete) |
| Rego Authority vendors | 0 *(tester creates one during setup — see test-plan)* |
| Rego modules | 0 *(tester creates one during setup — see test-plan)* |
| Trailer overrides | 0 *(tester creates some during testing)* |

---

## Design decisions worth knowing

1. **Snapshot-on-select pattern.** Every time a user picks a trailer or rego in
   the quote, the full detail is frozen into the quote. Later edits in the
   catalog never affect an existing quote. Same pattern as motor configurations.
2. **No per-quote category overrides.** Dealer-fit categories are module-level.
   Selections (`selectedDealerFitIds`) are per-quote.
3. **`Obsolete Trailers` vendor is seeded but not exposed.** The importer
   captures obsolete rows so they can still be referenced in old quotes, but
   the Trailers module's `trailerBrandVendorIds` excludes it.
4. **Catalog picker respects org overrides.** When you pick a trailer whose
   price was overridden at the org level, the snapshot captures the overridden
   price — not the source-of-truth xlsx price.
5. **Rego types are sub-documents.** A rego type lives under its Authority
   vendor, not in its own top-level collection. This keeps state management
   per-authority simple.
6. **Images are external.** All trailer `imageUrl` values point to supplier
   CDNs (`mayfairmarine.com.au`, etc.). Per project convention, the UI uses
   native `<img>` not Next.js `<Image>` (Cloudflare hotlink protection breaks
   the optimization proxy).

---

## Out of scope for v1.4

Deferred per [`tasks/v1.4-trailers-module-design.md`](../../tasks/v1.4-trailers-module-design.md) §10:
- Registration & compliance form fields (xlsx cols KE-NU)
- Per-trailer promotions
- Trailer variants (material/colour SKUs)
- Migrating historical Highfield quotes onto the new rego module — new quotes only
- Per-quote dealer-fit category overrides (module-level only today)

If you see a gap, check the design doc before logging as a bug.

---

Continue to [`test-plan.md`](./test-plan.md).
