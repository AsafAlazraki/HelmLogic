# v1.4 — Trailers & Rego Module Test Notes

> Branch: `Dev`
> Design: `tasks/v1.4-trailers-module-design.md`
> Findings: `tasks/v1.4-trailers-source/FINDINGS.md`
> Source data: `tasks/v1.4-trailers-source/Trailer Module.xlsx` (Git LFS, 6.58 MB)

This doc is the **single entry point for the test team**. Every v1.4 change ships with notes here so regression and acceptance passes have full context.

---

## How to read this doc

Each section below tracks one shipped piece of work on v1.4. When a PR merges into `Dev`, the author adds:

- **What shipped** — one line
- **Files touched** — so reviewers know the blast radius
- **Test matrix** — checklist of what to verify (UI + data)
- **Known gotchas** — anything unusual

---

## Step 1 — Vendor types: `Trailer Brand` + `Rego Authority`

**Shipped:** Added `Rego Authority` to the vendor-type vocabulary. `Trailer Brand` was already present but previously unused; it's now live alongside the new Rego type. MPF browser now excludes all three catalog/picker vendor types (Motor Brand, Trailer Brand, Rego Authority) from parts-vendor lists.

**Files touched:**
- `src/app/(app)/data-warehouse/page.tsx` — `vendorTypes` array + `getVendorTypeIcon` (added `FileCheck` for Rego)
- `src/app/(app)/data-warehouse/add/page.tsx` — `<SelectItem>` list
- `src/docs/backend.json` — `vendorType` enum
- `src/components/master-data-browser-dialog.tsx` — `catalogVendorTypes` filter

**Test matrix:**

### Data Warehouse — list page (`/data-warehouse`)
- [ ] Filter dropdown contains `Rego Authority` and `Trailer Brand`, in the listed order (Boat → Motor → Trailer → Rego → Electronics Brand → Electronics Supplier → Parts Wholesaler → MPF → Other).
- [ ] Selecting `Rego Authority` in the filter shows the correct badge icon (`FileCheck` / tick-document) next to the vendor type in each card.
- [ ] Selecting `Trailer Brand` in the filter shows the Truck icon badge.
- [ ] With no matching vendors, the list shows the empty state (no crashes).

### Data Warehouse — add page (`/data-warehouse/add`)
- [ ] Vendor Type dropdown shows all 9 options including `Rego Authority` and `Trailer Brand`.
- [ ] Saving a vendor with `vendorType: 'Rego Authority'` creates the doc correctly in Firestore (`data-warehouse/{id}` with `vendorType: 'Rego Authority'`).
- [ ] Saving a vendor with `vendorType: 'Trailer Brand'` does the same.

### MPF browser (Dealer Fit selection on a module)
- [ ] Creating a new dealer fit selection on a boat module does NOT list any Rego Authority or Trailer Brand vendors as options.
- [ ] Existing Motor Brand exclusion still works (Yamaha doesn't appear).
- [ ] MPF (Master Price File) and Parts Wholesaler vendors still DO appear.

### Regression
- [ ] Existing Highfield (`Boat Brand`) and Yamaha (`Motor Brand`) data warehouse cards render unchanged.
- [ ] Module pages, quote flow, dealer fit options still load for existing orgs.

**Known gotchas:**
- The vendor-type string is stored verbatim in Firestore — if you create a Rego Authority vendor with a typo (`Rego authority` vs `Rego Authority`), filters won't match. Always pick from the dropdown.
- Adding another new vendor type later requires updating **all four** files listed under "Files touched" above (same pattern documented in `.agents/evolution.md`).

---

## Step 2 — Trailers & Rego module types + `/modules/add`

**Shipped:** Added two new module types — `trailers` and `rego` — to the `/modules/add` dropdown. When either is selected the form swaps in a filtered vendor picker (only `Trailer Brand` / `Rego Authority` vendors show up) and the "Main Vendor" field is hidden (not applicable). Selected vendor IDs are persisted to `trailerBrandVendorIds[]` / `regoVendorIds[]` on the module doc, plus `trailerDealerFitCategories: []` is seeded for the Trailers case.

The module detail page (`/modules/{id}`) now routes `moduleType === 'trailers'` to a new `TrailersWorkspace` component with three tabs: **Catalog** (placeholder — real grid ships in Step 4), **Pricing Manager** (placeholder — waterfall ships in Step 8), and **Settings** (fully functional — multi-select of Trailer Brand vendors, trailer-specific dealer-fit category manager, and role assignment).

**Files touched:**
- `src/app/(app)/modules/add/page.tsx` — new `trailers` + `rego` SelectItems; conditional Main Vendor field; filtered Associated Vendors list; onSubmit writes `trailerBrandVendorIds` / `regoVendorIds` / `trailerDealerFitCategories`.
- `src/app/(app)/modules/[id]/page.tsx` — new routing branch for `moduleType === 'trailers'` that renders the full-screen blue banner header + `TrailersWorkspace`.
- `src/components/trailers-workspace.tsx` — new component: tabbed shell (catalog / pricing / settings); settings tab wires to `updateDoc(modules/{id}, { trailerBrandVendorIds })`, `ModuleDealerFitManager` (with `fieldName="trailerDealerFitCategories"`), and `ModuleRoleAssignment`.

**Test matrix:**

### Module creation (`/modules/add`)
- [ ] Module Type dropdown lists 7 options: Catalog, Used Boats, Website Listings, Master Price File, Motor Brand, **Trailers**, **Rego (Registration Authority)**.
- [ ] Selecting **Trailers**:
  - [ ] Hides the "Main Vendor" field.
  - [ ] Renames "Associated Vendors" → "Trailer Brands".
  - [ ] Shows only vendors with `vendorType: 'Trailer Brand'`.
  - [ ] Shows "No matching vendors…" message if no Trailer Brand vendors exist.
  - [ ] Submitting saves a module doc with `moduleType: 'trailers'`, `mainVendorId: null`, `trailerBrandVendorIds: [...]`, `trailerDealerFitCategories: []`.
- [ ] Selecting **Rego (Registration Authority)**:
  - [ ] Hides the "Main Vendor" field.
  - [ ] Renames "Associated Vendors" → "Rego Authorities".
  - [ ] Shows only vendors with `vendorType: 'Rego Authority'`.
  - [ ] Submitting saves `moduleType: 'rego'`, `mainVendorId: null`, `regoVendorIds: [...]`.
- [ ] Switching back to Catalog re-shows Main Vendor and the full vendor list.

### Trailers workspace (`/modules/{id}` for a `trailers` module)
- [ ] Blue header banner renders with `TRAILERS` caption and the module name.
- [ ] Three tabs render: **Catalog** (default), **Pricing Manager**, **Settings**.
- [ ] Switching tabs updates `?trailerTab=` in the URL; a browser refresh lands on the same tab.
- [ ] **Catalog tab** shows the "ships in Step 4" placeholder with a brand-count subtitle that updates when you change brand selections in Settings.
- [ ] **Pricing Manager tab** shows the "ships in Step 8" placeholder.
- [ ] **Settings tab**:
  - [ ] **Trailer Brands** section lists every `Trailer Brand` vendor in `data-warehouse`. Checking/unchecking toast-confirms and persists to `modules/{id}.trailerBrandVendorIds[]`.
  - [ ] **Trailer Dealer Fit Categories** section lets you add/rename/delete categories; writes to `modules/{id}.trailerDealerFitCategories[]`.
  - [ ] **Role Assignment** section lets you set brand captain / module manager (existing `ModuleRoleAssignment` behaviour).
  - [ ] Non-admin users see the brand checkboxes disabled.

### Regression
- [ ] Existing catalog modules (Highfield, etc.) still open correctly and show the pricing / quote flow — no routing changes for `moduleType === 'catalog'`.
- [ ] Existing motor-brand modules (Yamaha) still open with `YamahaMotorWorkspace`.
- [ ] Existing MPF modules still render `MasterPriceFileWorkspace`.
- [ ] Existing used-boats / website-listings placeholders still render unchanged (they fall through the generic non-catalog branch).

**Known gotchas:**
- A Trailers module with **no** brands selected still opens fine — the Catalog tab explicitly tells the user to add brands in Settings.
- Trailer Brand vendors and Rego Authority vendors are automatically excluded from the MPF browser (Step 1 behaviour) so dealer-fit selection on boat modules won't show them.
- The Rego workspace isn't wired yet — creating a Rego module will currently fall through to the generic "non-catalog placeholder" until Step 6 ships it.

---

## Step 3 — `scripts/seed-trailers.ts` importer (dry-run + live)

**Shipped:** A TypeScript importer that parses `Trailer Module.xlsx`, detects brand/series/trailer rows, and either writes a JSON plan (dry-run — default) or upserts the full hierarchy into Firestore (with `--live`). Parses all 455 trailers across 7 brands and 46 series, captures the full pricing waterfall into `pricingDetail`, pulls every factory option (234 trailers have ≥1), and attaches lead-time metadata.

**Files touched:**
- `scripts/seed-trailers.ts` — new. CLI flags: `--file=<path>` (defaults to `tasks/v1.4-trailers-source/Trailer Module.xlsx`), `--live` (triggers Firestore writes via firebase-admin).

**How to run (dev machine):**

```bash
# Dry-run — writes /tmp/trailer-import-plan.json for review
npx tsx scripts/seed-trailers.ts

# Live — upserts to Firestore. Needs GOOGLE_APPLICATION_CREDENTIALS pointing
# at a service-account JSON (or ADC already configured for the studio project).
npx tsx scripts/seed-trailers.ts --live
```

The script is **idempotent** — brand vendors, series docs and trailer docs are keyed by slug/code and set with `{ merge: true }`, so re-running is safe.

**Test matrix (dry-run):**
- [ ] `npx tsx scripts/seed-trailers.ts --file=/tmp/trailer.xlsx` runs cleanly.
- [ ] Console output reports: 7 brands, 46 series, 455 trailers, ~234 with factory options, 0 skipped, ≤5 warnings.
- [ ] `/tmp/trailer-import-plan.json` exists and is valid JSON with `brands`, `totals`, `warnings`, `sample` keys.
- [ ] Brand list includes REDCO/TINKA, GFAB, STACER, DUNBIER, DUNBIER/HAINES BMT, MACKAY, Obsolete.
- [ ] `plan.sample[0]` has `vendorId: 'redco-tinka-trailers'`, `code: 'RE1213'`, full `pricingDetail` waterfall, ≥1 `optionalFeatures` entry.
- [ ] `plan.sample[0].pricingDetail.sell` is within ±$1 of the Excel value (2520).
- [ ] Trailers under "Obsolete Trailers" section have `isActive: false`.

**Test matrix (live — staging/manual):**
- [ ] `GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json npx tsx scripts/seed-trailers.ts --live`
  - [ ] Creates/updates 7 docs in `data-warehouse/` with `vendorType: 'Trailer Brand'`.
  - [ ] Creates 46 series docs in `data-warehouse/{brand}/series/{seriesId}`.
  - [ ] Creates 455 trailer docs in `…/trailers/{trailerId}` with `sellPriceExclGst`, `cost`, `pricingDetail`, `optionalFeatures`.
  - [ ] Re-running the same command modifies no doc counts (idempotent).
- [ ] After import, `/data-warehouse` page lists the 7 trailer-brand vendors.
- [ ] Creating a new Trailers module (Step 2) and ticking the brands in Settings populates `trailerBrandVendorIds` correctly.

**Known gotchas:**
- The xlsx file is tracked via Git LFS (6.58 MB). On a fresh clone run `git lfs pull` first, or pass `--file=/path/to/local.xlsx`.
- 3 "Unsorted" warnings are expected (orphan MACKAY/Obsolete rows with a code but no preceding series header). Fix by adding a proper series header in the source xlsx, or leave — they still import safely under an "Unsorted" series.
- "REDCO" and "TINKA" trailers are combined into one vendor `redco-tinka-trailers` per client grouping. Historical references to a "TINKA Trailers" vendor should be migrated to this ID.

---

## Step 4 — TrailersWorkspace Catalog tab

**Shipped:** The Catalog tab is now fully functional — it loads series from every selected brand vendor, renders a clean grid of trailer cards grouped by series (with per-brand section headers), supports a single search box (matches code or name) and a brand filter dropdown, and opens a right-side detail sheet showing specs, features, factory options, and a read-only pricing-waterfall summary for any trailer.

**Files touched:**
- `src/components/trailers-workspace.tsx` — replaced the catalog placeholder with a real grid. Added `TrailerCard`, `SeriesSection`, `BrandSection`, `TrailerDetailSheet`, `WaterfallRow` sub-components. Each `BrandSection` loads its own series collection; each `SeriesSection` loads its own trailers collection (keeps the Firestore listener graph clean and avoids collection-group indexes).

**Test matrix — Catalog tab:**

### Empty state
- [ ] A Trailers module with no brands selected shows a single card "No trailer brands selected — head to Settings…".

### With brands selected (after running `seed-trailers.ts --live`)
- [ ] Pick REDCO/TINKA + MACKAY in Settings. Return to Catalog. Both brand sections render with their own header + truck icon + shortCode.
- [ ] Under each brand, every series renders as its own titled block with a count badge.
- [ ] Each trailer card shows: image (or truck icon fallback), code, name, boat-size / length / ATM badges, `Sell ex GST` price, and a factory-options count if > 0.
- [ ] Inactive trailers (Obsolete brand) render at 60% opacity with a red "Inactive" badge.
- [ ] Click a card → detail sheet opens with specs grid, features list, factory-options list (priced), and pricing waterfall summary (Dealer → Nett → Freight → Landed → PD Charges → Total Nett CTD → RRP → Sell).
- [ ] Pricing waterfall in the sheet shows a "Rego hint" footer if the source row has one (e.g., "Small Trailers - Up to 1.02t · $166").

### Search & filter
- [ ] Typing "RE12" filters every series down to matching trailers; empty series get hidden.
- [ ] Brand filter only appears when ≥2 brands are selected.
- [ ] Selecting a specific brand in the filter hides the other brands.
- [ ] Clearing the search (and selecting "All brands") restores the full catalog.

### Regression
- [ ] Pricing tab still renders the "Ships in Step 8" placeholder (editable manager is Step 8 scope).
- [ ] Settings tab unchanged from Step 2 — brand multi-select, dealer-fit categories, role assignment.
- [ ] Tab switches still sync to `?trailerTab=…` in the URL.

**Known gotchas:**
- Each `<BrandSection>` + `<SeriesSection>` spins up its own Firestore subscription. For the seeded dataset (46 series) that's ~46 listeners per Catalog view — well under Firestore limits but keep an eye on CPU on lower-end devices. If it becomes a problem, migrate to a `collectionGroup('trailers')` query filtered by `vendorId` with an index.
- Image hotlinking: trailer `imageUrl` values are external (e.g. `mayfairmarine.com.au`). Followed the project rule — native `<img>` is used, not Next.js `<Image>`.
- The detail sheet shows the source-of-truth pricing waterfall from the xlsx import. Org-level overrides aren't possible yet — that's Step 8.

---

## Step 5 — Trailer step integration in `HighfieldQuoteFlow`

**Shipped:** The Highfield quote flow's **Step 4 (Trailer)** now has a "Pick from Catalog" button beside the Trailer Base header. It opens a searchable, brand-grouped dialog listing every trailer from every brand assigned to any trailers module visible to the org. Selecting a trailer **snapshots** its full detail (id, code, name, image, sellPriceExclGst, priceLevels, pricingDetail, specifications, optional features) into state as `catalogTrailerSnapshot`; from that point the entire trailer section (base card, hardware options, summary, specs dialog, finalize payload) shadows `model.trailerConfig` with the snapshot via a single `effectiveTrailerConfig` memo. The snapshot is persisted in the quote document under `trailer.catalog` and re-hydrated on quote duplication.

**Files touched:**
- `src/components/trailer-catalog-picker.tsx` — new component (Dialog + search + brand/series lazy loaders + `TrailerSnapshot` type export)
- `src/components/highfield-quote-flow.tsx` — added `catalogTrailerSnapshot` state, `effectiveTrailerConfig` memo, picker in the Trailer Base header, replaced 8+ references to `model.trailerConfig` with `effectiveTrailerConfig`, persisted snapshot in finalize payload
- `src/components/finalize-quote-dialog.tsx` — extended `quoteData` type with optional `catalogTrailerSnapshot`; trailer payload now reads from `trailerSource = catalogTrailerSnapshot || model?.trailerConfig`, writes `trailer.catalog` provenance, prices via `resolvePrice(trailerSource)` so price levels flow through

**Test matrix:**

### Setup (once)
- [ ] Step 3 live import has been run at least once so `data-warehouse/{brandId}/series/{seriesId}/trailers` is populated.
- [ ] A trailers module exists at `/modules/add` with at least one brand ticked (step 2). Note its ID.
- [ ] Highfield Boats module (`M1Yf3R9igpJDxJnOVr6f`) is still visible to the org (regression sanity).

### Picker — open + search
- [ ] Start a quote on a Highfield model that already has a `trailerConfig` defined. Advance to step 4 (Trailer).
- [ ] **New button** "Pick from Catalog" renders inside the "Trailer Base" header strip.
- [ ] Clicking it opens a Dialog titled "Trailer Catalog" with a search input and brand-grouped list.
- [ ] The brands listed match the trailer module's `trailerBrandVendorIds`.
- [ ] Each series group shows a count badge equal to the number of trailers inside that series.
- [ ] Typing "RE12" in the search filters trailers to codes starting with RE12; empty series are hidden.
- [ ] Clicking a trailer row closes the dialog and selects that trailer.

### Snapshot behaviour
- [ ] After picking, the "From [Brand] — [Series]" provenance chip appears below the header.
- [ ] The Trailer Base card now shows the picked trailer's **image, code+name, and sellPriceExclGst** (shadowing the model's default).
- [ ] If the picked trailer has `optionalFeatures`, a **Trailer Hardware** section renders those as selectable options with the snapshot's pricing.
- [ ] The total price at the bottom of the flow includes the picked trailer's `sellPriceExclGst` (try a trailer with known price — e.g. RE1213 at $2,520).
- [ ] Toggling selected hardware options updates the total accordingly.

### Price levels
- [ ] If the picked trailer has `priceLevels` and the price level selector is non-default (e.g. Trade, Sub-dealer), the trailer price changes accordingly in the card **and** the total.
- [ ] If the picked trailer has no `priceLevels`, the price falls back to `sellPriceExclGst` at any level (no crashes).

### Clear
- [ ] Clicking "Clear" on the provenance chip reverts the Trailer Base card back to the model's default `trailerConfig` (or empty state if the model has none).
- [ ] Selected hardware options are cleared when the snapshot is cleared.
- [ ] Total recalculates correctly.

### Model with no default trailer
- [ ] On a Highfield model with `trailerConfig === undefined`, the empty-state message renders initially.
- [ ] After picking from the catalog, the Trailer Base card is populated and selectable.
- [ ] Clearing returns to the empty state.

### Finalize + proposal
- [ ] Finalize the quote with a catalog-picked trailer.
- [ ] Open the saved quote from Firestore (`users/{uid}/quotes/{quoteId}` or the org proposals list).
- [ ] `trailer.name`, `trailer.sellPriceExclGst`, `trailer.imageUrl` match the snapshot (not the model's default).
- [ ] `trailer.catalog` contains `brandVendorId`, `brandName`, `seriesId`, `seriesName`, `trailerId`, `code`, `capturedAt`.
- [ ] Proposal PDF (if `/modules/{id}/proposals/{quoteId}` renders) shows the correct trailer details.

### Duplicate
- [ ] From a finalized quote, duplicate/copy it (if the app has a duplicate flow) and verify the `catalogTrailerSnapshot` is restored into the Step 4 view, with the provenance chip showing the original brand/series.

### Regression
- [ ] Models with a `trailerConfig` but no catalog pick still show their default trailer, price correctly, and persist exactly as before (the catalog.catalog field should be `null`).
- [ ] Custom trailer additions (the "Additional Factory Trailer Notes/Options" block) still work and still contribute to the total.
- [ ] Motor, dealer fit, registration, promotions — all unchanged.

**Known gotchas:**
- The picker queries `modules where moduleType == 'trailers'` globally, then fetches vendor docs using `where('__name__', 'in', ...)` capped at 30 per Firestore rules. For orgs with >30 trailer brands across modules, only the first 30 will appear — not currently an issue (real data has 7 brands).
- Each brand section in the picker creates one listener per series, and each series loads its own trailers. For the real dataset (7 brands × 46 series ≈ 46 listeners) this is fine but keep an eye on heavier deployments. A future `collectionGroup('trailers')` query would collapse this into one listener.
- **Snapshot freezes pricing at select time.** If the trailer's pricing is later updated in the catalog (step 3 re-import), quotes created *before* the change keep the original numbers. This is intentional — same pattern as the motor `resolvePrice` snapshot. New quotes pick up new prices on next open.
- The snapshot captures `priceLevels` straight from Firestore. If the admin hasn't populated them yet (step 8), the fallback to `sellPriceExclGst` is used regardless of the selector.
- Legacy quotes (pre-v1.4) have no `trailer.catalog` field — proposal renderers must handle `trailer.catalog === null` gracefully. Already enforced via `?` chaining.

---

## Step 6 — Rego module + types UI; Highfield rego picker migration

**Shipped:** New `moduleType: 'rego'` is now a first-class module with its own workspace. Admins tick `Rego Authority` vendors under the Settings tab, then create `regoTypes` per vendor (e.g. "Small Trailers - Up to 1.02t, $151") under the Rego Types tab. Each rego type has `appliesTo: 'boat' | 'trailer' | 'both'`. A shared `<RegoPicker>` is wired into `HighfieldQuoteFlow` in two places: the Boat Registration card (filter='boat') and the Trailer Registration card (filter='trailer'). Picking a rego snapshots its id, vendor, name, price, appliesTo, and capturedAt into the quote — the total uses the snapshot; the legacy toggle disappears. When no snapshot is picked, the legacy flow (flat `model.registration` prices) still works so historical/unconfigured boats keep functioning.

**Files touched:**
- `src/components/rego-workspace.tsx` — new module workspace (Rego Types + Settings tabs, CRUD dialog, vendor multi-select, role assignment)
- `src/components/rego-picker.tsx` — new shared picker with grouped select, upfront type loading, snapshot on change
- `src/app/(app)/modules/[id]/page.tsx` — routes `moduleType === 'rego'` to the new workspace (with blue header banner)
- `src/components/highfield-quote-flow.tsx` — imports `RegoPicker` + `RegoTypeSnapshot`; adds `boatRegoSnapshot` + `trailerRegoSnapshot` state (and to `DuplicateInitialState`); pricing calc: snapshot wins over legacy toggle; Boat Registration Card + Trailer Registration Card each render `<RegoPicker>` on top with the legacy toggle hidden when a snapshot is set; stickers + tender-to now show when either the toggle OR the snapshot is active; snapshots are passed into `FinalizeQuoteDialog.quoteData`
- `src/components/finalize-quote-dialog.tsx` — accepts `boatRegoSnapshot`/`trailerRegoSnapshot`; `registration` payload now writes `boatRegoSnapshot`/`trailerRegoSnapshot` objects + uses snapshot prices when present

**Test matrix:**

### Setup (one-time, admin)
- [ ] In `/data-warehouse/add`, create at least one `Rego Authority` vendor (e.g. "QLD Transport", `state: QLD`, `currency: AUD`).
- [ ] In `/modules/add`, create a Rego module (Module Type = "Rego (Registration Authority)"). Confirm the Main Vendor dropdown is hidden. Tick your rego authority vendor under "Rego Authorities".
- [ ] Open the Rego module from `/modules`. The header shows "REGO" kicker + blue banner.
- [ ] On the "Rego Types" tab, each assigned authority renders as a card with an "Add Type" button. For non-admins, the buttons are hidden.
- [ ] Click "Add Type", enter Name + Sell Ex GST + Applies To, save. The row appears instantly.
- [ ] Edit and delete a type; both work with toast feedback.
- [ ] Toggle "Active" off on a type — it renders dashed / reduced opacity in the list and is excluded from the picker.

### Rego Workspace — Settings tab
- [ ] The Rego Authorities card lists every `vendorType === 'Rego Authority'` vendor with a checkbox.
- [ ] Un-ticking a vendor removes it from `modules/{id}.regoVendorIds`; re-ticking adds it back. (Check Firestore or refresh.)
- [ ] URL updates: switching between tabs sets `?regoTab=types` or `?regoTab=settings`. Refresh restores the active tab.

### Boat Rego Picker (Highfield quote flow)
- [ ] Start a Highfield quote. On step 2 (Color) after selecting material + color, the Registration block appears.
- [ ] A new dropdown "Boat Registration (Rego Module)" appears **above** the legacy "12 Months Registration (legacy)" toggle.
- [ ] The dropdown lists every active rego type with `appliesTo ∈ {'boat', 'both'}`, grouped by vendor name.
- [ ] Picking a rego hides the legacy toggle and shows a chip summarising the pick (vendor · name · price).
- [ ] The total at the bottom increases by the snapshot's `sellExclGst` (independent of `model.registration.price12Months`).
- [ ] Stickers + Tender-To decal cards still render and still contribute to the total (they're not rego-module-governed).
- [ ] Clicking "Clear" on the picker reverts to the legacy toggle; total returns to the old calculation.
- [ ] With **no rego module configured**, the picker shows "No rego types configured yet…" and is disabled; the legacy toggle works exactly as before.

### Trailer Rego Picker (Highfield quote flow, trailer step)
- [ ] Advance to step 4 (Trailer). After selecting a trailer (either model-default or catalog-pick from Step 5), the Trailer Registration card shows.
- [ ] A dropdown "Trailer Registration (Rego Module)" lists every active rego type with `appliesTo ∈ {'trailer', 'both'}`.
- [ ] Picking a rego supersedes the legacy "12 Months Trailer Rego" toggle and contributes `sellExclGst` to the total.
- [ ] Clearing reverts to the legacy toggle.

### Finalize + persistence
- [ ] Finalize a quote with a boat rego snapshot.
- [ ] Open the saved quote document: `registration.boatRego === true`, `registration.boatRegoPrice === snapshot.sellExclGst`, `registration.boatRegoSnapshot` contains `{ id, vendorId, vendorName, regoTypeId, name, sellExclGst, appliesTo, capturedAt }`.
- [ ] Same for trailer: `registration.trailerRegoSnapshot` populated.
- [ ] Legacy quotes without snapshots: `boatRegoSnapshot: null`, old fields unchanged — proposal renderer tolerates both.

### Duplicate
- [ ] Duplicate a quote with snapshots. The pickers show the original selection re-hydrated; the total matches.

### Regression
- [ ] Quotes with no rego modules configured at all still finalize, with legacy `isRegoSelected`/`isTrailerRegoSelected` behaviour and no `boatRegoSnapshot` field in the payload.
- [ ] Sticker + Tender-To options unaffected.
- [ ] Non-admin users see the rego workspace in read-only mode (no add/edit/delete buttons, no settings checkboxes).

**Known gotchas:**
- The picker loads `modules where moduleType == 'rego'` globally (not scoped to the user's org). If the test bench has multiple rego modules across orgs, types from all of them appear. This is consistent with how trailer modules are discovered and is fine for real deployments (one rego module per org).
- Rego types aren't filtered by user state yet. If multiple states are configured, the picker shows all; narrowing by `vendor.state === userProfile.state` is a follow-up.
- Snapshot freezes the price at pick-time. If the admin updates the type's `sellExclGst` later, open quotes keep the old number. Same pattern as motor + trailer snapshots.
- The legacy sticker/tender-to prices still come from `model.registration` — they aren't yet migrated to the rego module (future work).
- `useCollection` on a changing `vendorIds` array rebuilds the query only when the array's **JSON string** changes (done via `vendorIds.join(',')` in the workspace) — be careful if copying this pattern.

---

## Step 7 — Dealer Fit merge (trailer categories)

**What changed.** `DealerFitOptions` now assembles the list of dealer fit categories from **four** sources:

1. **Global** — `dealerFitCategories` collection (org- or admin-scoped).
2. **Boat module** — `modules/{id}.moduleDealerFitCategories[]` (names).
3. **Motor module** — `modules/{id}.motorDealerFitCategories[]` on the **boat** module (contextual to the boat being quoted).
4. **Trailer module** — `modules/{id}.trailerDealerFitCategories[]` on the **boat** module (new in v1.4).

The merge happens in `src/components/dealer-fit-options.tsx` at the `assignedCategories` memo (lines ~80-109). Synthetic IDs are used for the three module-level sources — `module-<name>`, `motor-<name>`, `trailer-<name>` — and `selectionsByCategory` looks them up by category **name** so that selections saved with just `category: "Spare Wheel"` still bind to the correct synthetic ID at render time.

Settings UI lives on the catalog-module settings panel: `/modules/{id}?moduleType=catalog → settings tab`. Three `ModuleDealerFitManager` blocks let admins manage each category type side-by-side on the boat module.

### Test matrix

**Setup**
- [ ] Sign in as an org admin (Bill Hull).
- [ ] Open Highfield Boats module → Settings tab.
- [ ] Confirm three "Dealer Fit Categories" managers are visible: Boat, Motor, Trailer.

**Configure categories**
- [ ] Add a boat category ("Electronics"), a motor category ("Prop Package"), a trailer category ("Spare Wheel") — one of each.
- [ ] The three lists save independently; each persists on reload.

**Merge behaviour in a live quote**
- [ ] Open a Highfield quote and advance to the Dealer Fit step.
- [ ] All four category sources appear in one list, de-duped by case-insensitive name (global wins).
- [ ] Adding a selection under a trailer-scoped category saves with `category: "Spare Wheel"` and `categoryId: "trailer-Spare Wheel"` (synthetic ID).
- [ ] Refreshing the page shows the selection under the same category tile.

**Selection lookup by name**
- [ ] Rename a module-level category (e.g. "Spare Wheel" → "Spare Wheel Kit") — existing selections **do not rebind** to the renamed category (they still read `category: "Spare Wheel"`). Expected behaviour; document for support.

**Regression**
- [ ] Quotes built before this step still show the Boat + Motor categories exactly as before.
- [ ] `moduleOnly` / `isAdmin` behaviour unchanged.
- [ ] Org-scoped `organisation.dealerFitCategories` filter (non-admin) still applies only to global categories — module-level categories are always visible to that org.

**Known gotchas**
- Selections are keyed by category **name** (not ID) for the synthetic module/motor/trailer IDs. Changing a category name orphans its selections. Keep names stable post-quote.
- The three manager blocks live on the **boat module document**, not the motor/trailer module documents — `motorDealerFitCategories` and `trailerDealerFitCategories` are fields on the boat `modules/{id}`. This is intentional: dealer fit is always configured in the context of the boat being quoted.

---

## Step 8 — Pricing Manager tab (waterfall + org override)

**What changed.** The Trailers workspace **Pricing Manager** tab is now live (was a placeholder).

- **Read-only waterfall** (from `pricingDetail`) rendered per trailer: Dealer (AN) → Discount (AO) → Settlement (AP) → **Nett Price (AQ)** → Freight (AR) → Landed (AS) → PD $ (BD) → Sundry (BO) → Detailing (BP) → Total PD (BQ) → **Total Nett CTD (BS)** → Markup % (BT) → Gross Profit (BU) → RRP (BV) → **Sell ex GST (BW)**.
- Each row shows the source xlsx column code as a tiny monotype badge so dealers can cross-check the import without leaving the UI.
- PD Parts breakdown (from `pricingDetail.pdParts[]`) renders when present.
- Every row is collapsible — summary row (image, code, name, effective sell) → click expands the full waterfall.
- **Org-level sell override** — admins click **Override** on any row to set a per-org `sellPriceExclGst`. Persists to `organisations/{orgId}/trailerOverrides/{trailerId}` with shape `{ sellPriceExclGst, note, trailerId, brandVendorId, seriesId, overrideAt: serverTimestamp }`. Mirrors the `modelOverrides` pattern for Highfield boats.
- "Org Override" badge + strikethrough source price on overridden rows. **Reset to source** deletes the override doc and the row snaps back.
- **Catalog picker merge** — `TrailerCatalogPicker` now subscribes to the full `trailerOverrides` collection at load time and merges the override price into every trailer card it displays. Selecting a trailer captures the **overridden** `sellPriceExclGst` into the snapshot, so quotes inherit the org's local pricing automatically.

### Files touched
- `src/components/trailers-workspace.tsx` — new `TrailerPricingRow`, `PricingSeriesLoader`, `PricingBrandSection`, `WATERFALL_ROWS` table; `pricing` tab rendered with brand sections + search.
- `src/components/trailer-catalog-picker.tsx` — subscribes to `organisations/{orgId}/trailerOverrides`, merges via `overridesByTrailerId` map, passes down into `BrandTrailersLoader` → `SeriesTrailersLoader`. `trailerToSnapshot(t, brand, series, overridePrice?)` picks the override when present.

### Test matrix

**Setup**
- [ ] Sign in as an org admin. Open Trailers module → **Pricing Manager** tab.
- [ ] Confirm each brand section renders with its series sub-headers and trailer rows.
- [ ] Search bar filters by code or name across all brands.

**Waterfall rendering**
- [ ] Click a trailer row — the waterfall expands in two columns (md+) with every `pricingDetail.*` numeric field labelled.
- [ ] Column codes (AN/AO/AP/…) appear as tiny monotype badges next to each row.
- [ ] Trailers with no `pricingDetail` show "No pricing waterfall imported" and still allow override on the top-level `sellPriceExclGst`.
- [ ] Markup % renders as `12.5%`, all other rows format as currency.
- [ ] `pdParts[]` — if present, renders under the waterfall with part name + cost per row.

**Org override**
- [ ] As admin, click **Override** on any row. Dialog shows source sell price.
- [ ] Enter a new number + optional note. Save → row shows "Org Override" amber badge, amber-coloured price, source strikethrough.
- [ ] Reload — override persists.
- [ ] Non-admin users do **not** see the Override button.
- [ ] As admin again, click Override → **Reset to source** → badge and amber styling disappear, row returns to the imported price.
- [ ] Override dialog validates the input (rejects empty / negative / non-numeric).

**Quote flow integration**
- [ ] Create an override on e.g. `RE1213` at $14,500 (source is different).
- [ ] Start a Highfield quote → Trailer step → open the Catalog Picker.
- [ ] `RE1213` card shows the $14,500 price in amber with the "Org Price" label.
- [ ] Pick the trailer. The pricing workspace shows $14,500 ex GST.
- [ ] Finalize. The saved quote document's `trailer.sellPriceExclGst` is $14,500, not the source price. The `trailer.catalog` snapshot `id` points to the correct brand/series/trailer triple.

**Price drift**
- [ ] Finalize a quote with override active. Later, change the override to $15,500. The existing finalized quote **retains** $14,500 (snapshot captured at quote time). New quotes pick up $15,500.
- [ ] Clear the override. New quotes pick up the source sell price; finalized quotes are unaffected.

**Regression**
- [ ] Organisations with no overrides ever set — all trailer cards render source prices, no amber styling anywhere.
- [ ] Quote payloads and proposals unchanged in shape; only `trailer.sellPriceExclGst` updates (snapshot-on-select behaviour).
- [ ] Catalog tab and Settings tab unaffected by the new Pricing Manager content.
- [ ] Dealer Fit Categories still save on the trailers module Settings tab (Step 7 behaviour intact).

**Known gotchas**
- The override is keyed by **trailer ID only** — it's brand/series-agnostic. If the same trailer ID lived under two different series it would apply to both; this doesn't happen in practice because the importer guarantees trailer IDs are unique-per-vendor.
- Overrides only touch the `sellPriceExclGst`. Editing the full waterfall (markup, margin, freight, etc.) isn't supported yet — those fields remain source-of-truth from the importer.
- The override-merge in the picker uses the `orgId` prop. If the picker is ever rendered without one, overrides are ignored (defensive fallback to source pricing). The Highfield quote flow always passes the current org.
- Subscribing to `/organisations/{orgId}/trailerOverrides` is an unbounded collection read. Scales fine to hundreds of overrides; if an org has thousands of trailers with bespoke prices, pagination is a future concern.

---

## Upcoming steps

See `tasks/v1.4-trailers-module-design.md` §11 "Implementation order". Each step below will get its own section here when it ships:

9. Playwright smoke suite — seed → module → quote → finalize

---

## Test data

For local testing:
- Use **Bill Hull** (`billh@nsmarine.com.au`) — parent org user for Northside Marine.
- To see the new Rego Authority vendor type in action, create a vendor manually via `/data-warehouse/add` (e.g., "Queensland Registration", `vendorType: Rego Authority`, `currency: AUD`). Later steps will add the rego-types sub-collection UI.
- The real trailer data ships with the importer in step 3 — do not seed manually.
