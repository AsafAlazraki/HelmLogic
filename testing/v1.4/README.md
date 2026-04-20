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

## Upcoming steps

See `tasks/v1.4-trailers-module-design.md` §11 "Implementation order". Each step below will get its own section here when it ships:

2. Trailers module type + module creation UI
3. `scripts/seed-trailers.ts` importer (with dry-run)
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
