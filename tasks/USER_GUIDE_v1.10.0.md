# HelmLogic — User Guide v1.10.0

**For:** Org admins + salespeople + dealer-ops
**Companion to:** `RELEASE_NOTES_v1.10.0.md`

This release ships the **dealer-ops + service-quoting foundation**: a master Fit-Up Catalog, a Service Quoting Catalog (operations + parts), a new Boats Catalogue read-view for fast audit, and four bug fixes that you'll feel immediately on the proposal PDF.

---

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| Build my fit-up library | `Manage → Fit-Up Catalog` | §1 |
| Bulk-import a fit-up sheet | Same tab → Import | §1.4 |
| Bulk markup my fit-up sell prices | Same tab → select rows → Apply markup | §1.5 |
| Build my service-quoting operations + parts library | `Manage → Service Catalog` | §2 |
| Audit every boat in a brand | New `Boats` page in the sidebar | §3 |
| See my cover letter back on proposal PDFs | Any proposal | §4 |
| Get an honest "locked" toast instead of silent fail | Locked proposal | §4 |

---

## 1. Fit-Up Catalog

### What it is
A **per-organisation master library** of fit-up items (rigging, installation, prep). Each item has a name, a tier (Simple / Medium / Complex), a cost, an optional sell price, and optional internal notes.

### To do
1. Go to **Manage → Fit-Up Catalog** (new tab, right of Modules).
2. Click **Add item**.
3. Fill in name + tier + cost (and optionally sell price + notes).
4. Save.

### 1.1 Tier filter
Chips at the top let you focus on All / Simple / Medium / Complex. Counts update as you go.

### 1.2 Edit / Delete
Pencil icon on a row to edit, trash icon to delete. No undo on delete.

### 1.3 Export
Click **Export** — downloads `fit-up-catalog-YYYY-MM-DD.xlsx` with all items in one sheet.

### 1.4 Import
- Click **Import**, pick a `.xlsx` or `.csv` file.
- The system detects your name column from any of: `name`, `item name`, `item`, `title`, `description`, `part description`.
- Tier is normalised by first letter: anything starting with `s` → Simple, `m` → Medium, `c` or `h` → Complex.
- **Upsert by name** — items already in your catalog with the same name (case-insensitive) get updated. New names are created. Rows without a name are skipped.
- Toast at the end: `N updated · M created · K skipped (no name)`.

### 1.5 Bulk operations
1. Tick the checkbox on each row you want to act on. Or **Select all visible** at the top of the list.
2. The toolbar appears with three actions:
   - **Apply markup %** — overwrites `sellPrice = cost × (1 + markup/100)`, rounded 2dp. The confirm dialog warns you that existing sell prices on selected items will be overwritten.
   - **Change tier** — sets the tier on all selected items.
   - **Delete** — permanent. No undo. Safe today because the quote-flow integration (Epic 9.2) isn't live yet — no quote references these items.

### 1.6 What this affects today
**Nothing in the quote flow yet.** The salesperson side of fit-up (checkbox on quote, summary line on PDF) ships with Epic 9.2 in v1.16+. We pulled the catalog **forward** so dealer-admins can begin authoring real data now — when 9.2.x lands, the salesperson UI will have something to point at.

### 1.7 Tips
- Notes are **operator-internal** — they will NOT surface on customer PDFs (per the locked Story 9.2.3 product decision: single summary line, no itemised breakdown).
- Start small. A short, accurate catalog beats a long catalog full of guesses on tier/cost.
- You can edit any field on any item any time. There's no "lock" on the catalog.

---

## 2. Service Catalog (Operations + Parts)

### What it is
Two sister catalogs for the service-quoting flow:

- **Operations** — labor codes (e.g. *ENG-100 Engine service 100hr*) with flat-rate hours × hourly rate.
- **Parts** — parts catalog (e.g. *OIL-FILT-X1 Oil filter X1*) with cost, sell price, stock level.

### To do
1. Go to **Manage → Service Catalog** (new tab, right of Fit-Up Catalog).
2. Pick the **Operations** sub-tab or **Parts** sub-tab.
3. Add items the same way as the Fit-Up Catalog (Add → fill fields → Save).

### 2.1 Operations — sell price derivation

Each operation has an **hourly rate** and a **flat rate hours**. Sell price for the operation defaults to:

```
sellPrice = flatRateHours × hourlyRate
```

If you set a **Sell override** explicitly, that value is used instead. The list view shows the resolved sell with cost underneath.

### 2.2 Operations — bulk markup
Bulk markup on operations adjusts the **hourly rate** (the lever), not the sell-price override. Keeps the derivation transparent — you can always read an operation and reason about why the sell is what it is.

### 2.3 Parts — bulk markup
Bulk markup on parts overwrites `sellPrice = cost × (1 + markup/100)`. Same destructive-overwrite warning as the fit-up bulk markup.

### 2.4 Import / Export
Same xlsx/csv flow as Fit-Up:
- **Operations** key column: `code` / `op code` / `operation code` / `labor code` / `labour code`. Upserts by code (case-insensitive).
- **Parts** key column: `part number` / `partnumber` / `sku` / `code`. Upserts by part number (case-insensitive).

### 2.5 What this affects today
**Nothing — service quoting isn't live yet.** The service-quote flow itself (create form, dashboard, PDF, lifecycle) ships in Epic 11.2 at v1.11+. The NSM-Hub migration (Epic 11.3) brings historical data into these collections.

### 2.6 Tips
- The catalogs are independent — adding an operation doesn't auto-create a part and vice versa.
- Stock level on parts is optional and operator-internal — won't be shown on customer-facing surfaces.

---

## 3. Boats Catalogue (read-view)

### What it is
A new top-level page at **`/boats`** (in the sidebar between Dashboard and Pricing Manager) that shows every model in a selected boat brand with its variants underneath.

### To do
1. Click **Boats** in the sidebar.
2. Pick a brand from the dropdown (top-right).
3. Search by model name / code / range.
4. Click any row to expand and see the variants (material × colour SKUs with their own pricing).

### What this affects
**Nothing — it's read-only.** Edits stay in the existing module-page editors. This view is a fast catalogue audit surface for dealer-admins to scan the whole catalogue and spot pricing anomalies or missing variants.

### Tips
- Variants are lazy-loaded per row, so the initial render is fast even on brands with hundreds of models.
- The "Sell (ex GST)" column on the model row is the model-level price. Expand to see variant-level prices.
- The "ex GST" label is intentional — GST is applied at finalize, not displayed in the catalogue.

---

## 4. The four bug fixes

### 4.1 Cover letter restored on proposal PDFs
The "Your message" salesperson cover letter is back on every customer PDF. If you've set up your Sales Team profile (`/manage` → relevant tab) with a message, it appears.

Keyed to the **quote's creator**, not the current user — a PDF rendered by anyone shows the salesperson assigned to that quote.

### 4.2 Dealer-fit option names appear reliably
Dealer-fit items that previously rendered blank on PDFs now show their full description, with a part code / SKU as fallback and a "Dealer Fit Item" generic label as last resort. All your legacy quotes will populate immediately.

### 4.3 Locked-quote discount — honest feedback
On a locked quote, clicking Save Discount now shows an immediate "Quote is locked — Create v2 to change discount" toast. Before, the change appeared to save until you refreshed.

### 4.4 Stock imports — duplicate stock-number race fixed
Concurrent bulk imports with blank stock-number cells no longer collide on the `IMP-<ms>` fallback. Replaced with a collision-safe `IMP-<base36-time>-<random>` suffix.

---

## How v1.10 fits the bigger picture

| Release | What it shipped | Status |
|---|---|---|
| v1.9 | Quote-lifecycle wrap-up (Compatibility / Preview / Lifecycle / Scenarios / SharePoint) | ✅ Shipped |
| v1.9.5 | Planning + groundwork (roadmap reshuffle + Epic 11 seed + clickable popups + Create-Proposal hotfix) | ✅ Shipped |
| **v1.10 (this one)** | **Dealer-ops + Service Quoting foundation + bug pass** | **✅ Shipped** |
| v1.11 | Service-quote flow (Epic 11.2) + NSM-Hub migration (Epic 11.3) + repro'd bugs | 🟡 Planning |
| v1.16+ | Fit-up integration with quote flow (Epic 9.2) | 📋 Backlog |
| v2.2 | Fit-up auto-classification (Epic 9.3.1) | 📋 Backlog |

---

## What v1.10 did NOT ship (deferred)

| Item | When | Reason |
|---|---|---|
| Fit-up on the quote flow | Epic 9.2 — v1.16+ | Locked product plan — quote-flow integration is its own slice |
| Fit-up auto-classification | Epic 9.3 — v2.2 | Depends on 9.2 being live |
| Service-quote create form / dashboard / PDF | Epic 11.2 — v1.11+ | Catalogue is the foundation; quote consumption is the next phase |
| NSM-Hub customer reconciliation + migration | Epic 11.3 — v1.11 | Needs the `nsm-service-quotation` service-account |
| HL Error on saving project | v1.11 | Awaiting concrete repro |
| Import doesn't work correctly | v1.11 | Awaiting concrete repro |
| RU200KAM $76.82 price delta | v1.11 | Awaiting real-quote + MPF-row repro |
| Trailer Catalog missing models | v1.11 | Data re-import, not code |
| Decision: Delivered deals + stock dashboard placement | Open | Pending operator decision |
