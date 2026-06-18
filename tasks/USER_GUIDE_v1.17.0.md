# v1.17 — User Guide

**Audience**: Org admins + salespeople.
**Theme**: Catalog editing at scale. Faster bulk operations + better filtering.

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| Mark up a batch of motors by 15% | Catalog Manager → Motors | 1. Bulk markup |
| Paste 200 new rows from Excel | Catalog Manager → Motors / Trailers | 2. Paste from spreadsheet |
| Find every F70 across brands | Catalog Manager → top search box | 3. Cross-tab filter |
| Attach a list of compatible trailers to a boat | Boat model editor | 4. Trailer compatibility |
| See when the USD rate is stale | Catalog Manager → motor cards | 5. Stale rate warning |

## 1. Bulk markup

**To mark up a batch of motors by, say, 15%:**
1. Open Catalog Manager.
2. Click into a Motor Brand vendor (e.g. Yamaha).
3. Optionally narrow the table with the search box or the Series filter.
4. Tick the checkbox in the table header to select every filtered row, or tick individual rows.
5. The bulk-action toolbar appears at the top of the table when at least one row is selected.
6. Type `15` in the markup input. Click "Apply markup".
7. Each selected row's sell price is recalculated as `cost × 1.15`, rounded. Rows without a cost are skipped and the count appears in the summary toast.

The same flow works on Trailers Tables. If org-override mode is on, the markups write to the org override layer instead of the vendor catalog, exactly like inline edits do.

**Tips**
- The header checkbox is scoped to whatever is currently filtered. So if you have "F70" in the search box, "select all" picks only F70 rows.
- Markups under -100% are rejected (would invert the price).
- Use a single summary toast to verify how many writes landed.

## 2. Paste from spreadsheet

**To bulk-import or update from Excel / Google Sheets:**
1. Open Catalog Manager, pick a vendor.
2. Click "Paste" (next to Export CSV).
3. In the dialog, paste your spreadsheet rows. The first row must be your headers.
4. The dialog auto-detects the key column (Part Number > Model Code > SKU > etc.) and shows a preview diff: how many rows would be created, updated, unchanged, or skipped.
5. Click "Apply" to commit.

**What this affects**
- Existing rows are MERGED, not replaced. Any field you don't supply stays as-is. Your prior edits are safe.
- Rows without a key value get skipped automatically.
- A summary toast tells you how many rows landed in each bucket.

**Tips**
- Copy directly from Excel or Sheets and paste. Tabs are detected automatically. CSV with quoted fields also works.
- Re-paste the same data and every row reports as "unchanged". Use this to confirm a clean state.

## 3. Cross-tab filter

The "Search brands or models..." input at the top of the Catalog Manager sidebar now does double-duty. It still filters the brand list, and it also passes through to the table on the right. So typing "F70" narrows the sidebar to vendors carrying F70 AND narrows the active table to F70 rows.

**Tips**
- Clear the search to release the filter from both layers.
- Highfield's pricing workspace doesn't currently receive the filter (different surface, v1.18+).

## 4. Trailer compatibility

A boat model can now declare which trailers it's compatible with. When the operator builds a quote, Step 4 will auto-filter to that list.

**To attach a trailer list to a boat model**:
1. Open the boat model editor.
2. Scroll to the "Compatible Trailers" panel (dashed border with the Truck icon).
3. Tick every trailer code that fits this model. The list shows every trailer brand across the catalog.
4. Click Save. The button is disabled until something has actually changed.

**Tips**
- Empty list = no filter. Operators see every trailer at Step 4. That's the default for existing models, so behaviour stays unchanged unless you set a list.
- Configuration like this lives with you as operators. The platform supports it; you decide which combinations matter for your dealership.

## 5. Stale exchange rate warning

The exchange-rate manager already tracks `lastUpdatedAt` per currency. v1.17 adds a helper that any card can call to flag a rate as stale (default threshold: 30 days). UI cards consuming foreign-currency rates can render an amber warning so salespeople know to ping the admin for a refresh.

Open Exchange Rates from the strategy panel on the Catalog Manager top bar to see the current state + the audit history per currency.

## Synthesis: how catalog-editing-at-scale works now

The flow now goes: filter the catalog with one search box (cross-tab), select the rows you want (multi-row checkboxes), apply the change (bulk markup, paste, or inline edit). Each operation is auditable, idempotent where it matters (paste merge), and writes to the right layer (vendor catalog vs org override) based on your toggle.

The math is consistent because every surface goes through `derive-pricing.ts`: `applyMarkup` for batch + inline alike, `derivePricing` for the canonical { cost, sell, marginPct, marginTone, sellIncGst, fromOverride } shape, `GST_MULTIPLIER` everywhere instead of magic 1.1s scattered through the code.

## What v1.17 did NOT ship (deferred to v1.18+)

- Customer-facing surfaces (My Customers, My Quotes, Customer Detail Sheet). Epic 8.1 starts v1.21.
- Quote variations + contract signing. Epic 2.4 / 2.6 in v1.18+.
- Margin threshold enforcement. Epic 2.2 in v1.19.
- Mobile-responsive polish. v2.2.
- NSM-Hub migration tooling. Still service-account-blocked, carries to v1.18.
- HL save error + RU200KAM $76.82 delta. Awaiting repro; ship once a reliable trigger lands.
