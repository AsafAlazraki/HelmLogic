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

## Upcoming steps

See `tasks/v1.4-trailers-module-design.md` §11 "Implementation order". Each step below will get its own section here when it ships:

4. Trailers Workspace — Catalog tab
5. Trailer step integration in `HighfieldQuoteFlow`
6. Rego module + types UI; Highfield rego picker migration
7. Dealer Fit merge — add `trailerDealerFitCategories`
8. Pricing Manager tab — waterfall view
9. Playwright smoke suite — seed → module → quote → finalize

---

## Test data

For local testing:
- Use **Bill Hull** (`billh@nsmarine.com.au`) — parent org user for Northside Marine.
- To see the new Rego Authority vendor type in action, create a vendor manually via `/data-warehouse/add` (e.g., "Queensland Registration", `vendorType: Rego Authority`, `currency: AUD`). Later steps will add the rego-types sub-collection UI.
- The real trailer data ships with the importer in step 3 — do not seed manually.
