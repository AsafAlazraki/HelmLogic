# HelmLogic — User Guide v1.11.0

**For:** Org admins + salespeople + workshop coordinators
**Companion to:** `RELEASE_NOTES_v1.11.0.md`

This release is the **Fit-Up release, end-to-end**. The v1.10 master Fit-Up Catalog is now wired into the quote flow (search, packages, per-line quantity, price overrides, operator notes), the customer PDF carries a single Fit-up & Rigging summary line, and every quote with fit-up scope has a workshop status pill that tracks the build separately from the sales lifecycle.

---

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| Categorise my fit-up items | `Manage → Fit-Up Catalog` → Add/Edit item → Category | §1.1 |
| Filter the catalog by category | Same tab → Category chip row | §1.2 |
| Bundle items into a named package | Same tab → Packages sub-tab → Add package | §2 |
| Add fit-up to a customer quote | Step 5 of the quote builder | §3 |
| Search the fit-up catalog while picking | Step 5 → search input above the grid | §3.1 |
| Add a package on a quote | Step 5 → Packages strip → click a package | §3.2 |
| Set qty / override price / add a note per item | Step 5 → Selected fit-up items panel | §3.3 |
| Track workshop progress on a fit-up | Proposal-view header → Fit-up pill | §4 |
| See who changed the fit-up status + when | Proposal-view → Activity tab | §4.4 |

---

## 1. Catalog — categories + customer descriptions

The Fit-Up Catalog (v1.10) gains two new optional fields per item.

### 1.1 Category
Open any item (`Manage → Fit-Up Catalog` → pencil icon). The new **Category** field is free-text — type e.g. `Rigging`, `Electronics`, `Safety`, or whatever taxonomy makes sense for your dealer. Items without a category are uncategorised and still appear under the "All" filter.

**To do:**
1. Edit any item.
2. Type a category name (one new per item, but identical typing on multiple items groups them — the chip row de-dupes case-insensitively).
3. Save.

### 1.2 Category filter row
A new chip row appears under the tier chips on the catalog. Only shows when at least one item has a category. Click any category to filter the catalog to that group. Click **All** to clear.

### 1.3 Customer description
Per-item free-text. Defaults to the item **Name** when the customer-facing surface needs a label. The customer PDF rolls fit-up into a single "Fit-up & Rigging" line by product decision (Story 9.2.3) — `customerDescription` is plumbed so future detailed surfaces use it without another migration. The internal label / workshop label can stay short ("LED kit wiring loom") while customer-facing text reads cleaner ("LED accent lighting installation").

**To do:**
1. Edit any item.
2. Fill the **Customer description** textarea — what you want the customer to see.
3. Leave the **Internal notes** field for workshop or operator-only context (never shown to the customer).
4. Save.

### 1.4 CSV import + export

Both the per-tab export and the master `catalog-export-import` (multi-sheet) export now include `Category` + `Customer Description` columns. Import follows the same upsert-by-name rules from v1.10 — these two columns layer in on existing rows; the rest of your edits are preserved.

---

## 2. Packages — bundle items together

### What it is
A **package** is a named bundle of fit-up items. Selecting a package on a quote adds every item at once. Useful for repeatable installs ("Coastal Setup", "Offshore Pack", "First-time Owner Bundle").

### 2.1 Manage packages
1. Go to `Manage → Fit-Up Catalog`.
2. Click the **Packages** sub-tab (next to Items).
3. Click **Add package**.
4. Give it a name, an optional description, and tick which items belong to it. The search box filters the picker by name, category, or customer description.
5. Save.

You'll see the package list with each package's name, description, member item chips, total sell price, and Edit / Delete actions.

### 2.2 What happens when a member item is deleted
If you delete an item that's referenced by a package, the package keeps working — it just shows an amber **"N deleted items"** pill so you know to either re-link or trim. There's no destructive cascade.

---

## 3. Quote flow — Fit-Up on Step 5

### 3.1 Search + category filter
The fit-up picker (Step 5, under Dealer Fit) now has a search box. Filters by name, customer description, internal notes, or category. The same dynamic category chip row from the catalog renders here too — pick a category to narrow the grid, click **All** to clear.

The tier-chip row + **✦ Suggested** (motor-HP-biased) filter from Phase A still works alongside the new filters — they all AND-combine.

### 3.2 Packages strip
When at least one package is relevant to the boat in context, a Packages strip appears above the items grid. Each package shows its name, item count, and total sell. **One click** adds every package item that's not already on the quote (items already on stay untouched). Click again to NOT toggle off — to remove items, use the Remove (×) button on each row in the Selected panel.

### 3.3 Selected fit-up items panel
Below the picker, every selected item gets its own row in a **Selected fit-up items** panel. Three controls per row:

**Qty stepper.** Min 1. Use the `+` / `−` buttons or type into the input. The running total on Step 5 multiplies by qty.

**Price override.** Per-quote, per-line override. Leave blank to use the catalog sell price (placeholder shows you what the catalog price is). Saves on blur. Override is marked with an amber "(override)" tag in the per-line total. Catalog price isn't touched — this is a quote-only override.

**Per-quote operator note.** Single-line free-text. Operator-only. **Never** shown on the customer PDF. Saves on blur. Useful for things like "Customer to supply hardware", "Schedule with Dave's crew", "Trade-in cradle reused".

To remove a selection, click the × button in the top-right of the row.

### 3.4 What this affects on the customer side
- The Step 5 running total + Investment Summary on the proposal view honour qty × override.
- The customer PDF still rolls fit-up into a **single "Fit-up & Rigging" line** — locked product decision per Story 9.2.3. Per-item, per-qty, override, and notes are all operator-only.
- The proposal-view "Line Item Cost vs. Sell" (in the Audit drawer) honours qty + override too — your margin numbers match the quoted total.

---

## 4. Workshop status on the quote

### What it is
Every quote with at least one fit-up item gets a new **workshop status** pill in the proposal-view header, next to the sales lifecycle pill.

The two are **orthogonal**: a quote can be sales-lifecycle `Accepted` while its fit-up is workshop-status `Scheduled`. They track different things.

### 4.1 The four states
- **Pending** (default) — no workshop action yet, sitting in the queue.
- **Scheduled** — booked into the workshop for a specific date.
- **In Progress** — workshop is actively building the fit-up.
- **Complete** — fit-up work has been completed and signed off.

### 4.2 To change it
1. Open the proposal-view for a quote that has fit-up items.
2. Click the **FIT-UP: <status>** pill in the header.
3. Pick the new state from the popover. Toast confirms; Activity log records it.

### 4.3 What this affects
- Pill in the proposal-view header (operator-only — never on the customer PDF).
- Activity tab — every transition logs a `Fit-up status updated` entry with the actor + timestamp + new value.

### 4.4 Activity log
The Activity tab on the proposal-view picks up a new event type. Wrench icon, teal tint, summary `Now: <status>`. Filterable like every other audit event.

---

## What this release did NOT ship (deferred to v1.12+)

- **Fit-up scheduling** (assign a specific date + technician) — only the workshop STATUS is in v1.11; date + assignee is its own slice and lands in v1.12+.
- **Customer PDF detail toggle** — the customer PDF stays as a single "Fit-up & Rigging" summary line by the locked Story 9.2.3 decision. `customerDescription` is plumbed so future surfaces can use it.
- **Auto-classification rule engine** — the v1.11 HP heuristic ("≥150 HP → Complex" etc.) is a simplified take on Story 9.3.1. The full operator-authored rule engine remains planned for v2.2.
- **Service Quoting end-to-end + Motors Table + Suggestion Approval Queue** — code IS on the dev branch and will deploy when v1.11 ships, but the planning rows have been moved to v1.12 so v1.12 release notes can give them the headline. Until then, they're "in preview".
