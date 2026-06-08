# HelmLogic — Release Notes v1.11.0

**Date:** 2026-06-02
**Branch:** `claude/app-overview-wKiZ1`
**Theme:** Fit-Up release — end-to-end quote integration + catalog expansion + workshop status

---

## Mark's checklist — pre-launch signoff

Mark McWilliams' 8/06/2026 email asked for **"an accurate and audited quote, fully complete and beautiful from HelmLogic"** with 8 specific items. v1.11 ticks all 8. Each item is proven end-to-end by `tests/bm-email-checklist.spec.ts` (driving a real Classic CL380 build on the live dev URL, screenshotting every checkpoint, byte-sniffing the downloaded PDF).

| # | Mark's ask | Where it lives | Status |
|---|---|---|---|
| 1 | Proposal formed correctly · customer name in correct places | `src/components/proposal-pdf.tsx` cover + body + token substitution | ✅ |
| 2 | Images right during config (no trailers when picking the hull) | Step 1 carousel filters `currentStep !== 4` trailer slides | ✅ |
| 3 | All correct FFO presented | Step 2 — Standard Inclusions + Factory Options + Additional Factory Boat Notes | ✅ |
| 4 | Engine + rigging options | Step 3 motor hero + Choose Another Motor + Dealer Services · Step 5 fit-up rigging | ✅ |
| 5 | Trailer options | Step 4 — Trailer Base + Trailer Hardware + Additional Factory Trailer Notes | ✅ |
| 6 | DFOs (Dealer-Fit Options) | Step 5 — boat / motor / trailer dealer-fit categories grouped | ✅ |
| 7 | Rego + compliance | Step 1 `RegoPicker` (state-aware) · Step 6 itemised registration breakdown | ✅ |
| 8 | Fit-out costs — basic / standard / complex for each model | Step 5 — SIMPLE / MEDIUM / COMPLEX tier package cards | ✅ |

**Proof artifact:** `test-results/bm-checklist/` (10 screenshots + `bm-checklist.pdf`).

### Audit-trail completeness (also under "audited")

Three audit-trail gaps caught during the pre-launch sweep and fixed in the same PR:

| Gap | Fix |
|---|---|
| `fitUpCatalogAudit` events were written but nothing READ them — admins couldn't see who changed a fit-up price | `CatalogAuditHistory` (the audit panel on Catalog Manager) now merges `catalogAudit` + `fitUpCatalogAudit` into one chronological feed with a Wrench icon for fit-up rows |
| `fit-up-catalog-manager.tsx` CSV bulk-import path was missing its audit write (only 6 of 7 mutation sites had one) | Adds a single summary event per import — "50 updated · 30 created" — rather than 80 individual rows |
| No spec covered the audit surface | New `tests/v1.11-audit-trail.spec.ts` exercises the unified panel, the Fit-Up Catalog edit affordance, and the proposal-view Activity tab |

Together with the existing per-quote `auditLog` (created · finalised · sent · locked · unlocked · version-forked · content-overridden · discount-changed · lifecycle-transitioned · scenario-created · fit-up-status-changed) the operator can answer "who did what when" without inspecting Firestore.

### Fit-Up edit dialog polish (also under "beautiful")

The Add / Edit dialog on `Manage → Fit-Up Catalog` got a presentation rework. Same fields, same save logic — restructured so it doesn't read as a stack of plain inputs:

- Wider canvas (`max-w-3xl`, vertical scroll, sticky save bar at the bottom)
- Four card sections with coloured dot headers — **Basics** (blue) · **Customer-facing** (emerald) · **Internal** (amber) · **Assignment scope** (violet)
- Tier picker is now a 3-button pill row in the tier's own colour (simple = emerald, medium = amber, complex = rose), not a dropdown
- Image preview promoted from a 64 × 64 thumbnail below the input to an 80 × 112 preview alongside it
- Cost + Sell laid out side-by-side on the same row
- Section labels use the same uppercase tracking-widest treatment as the rest of the admin surface

---

## Release Stats

| Metric | Value |
|---|---|
| Phases | 2 (A — end-to-end fit-up quote flow, B — fit-up expansion) |
| Stories shipped | 5 fit-up (9.2.1, 9.2.2, 9.2.3, +9.3.1 simplified, + Phase B umbrella) |
| New Firestore collections | 1 (`fitUpPackages`) |
| New Firestore fields on existing docs | 4 on `fitUpItems` (`category`, `customerDescription` + existing) ; 4 on `quotes` (`fitUpStatus`, `fitUpStatusAt`, `fitUpStatusByUid`, `fitUpStatusByName`) ; 3 expanded on `quote.fitUpSelections[i]` (`category`, `customerDescription`, `quantity`, `priceOverride`, `quoteNote`) |
| New firestore.rules paths | 1 (`fitUpPackages`) |
| New audit-log event type | 1 (`fit-up-status-changed`) |
| New helpers | 1 (`src/lib/fit-up-status.ts`) |
| Modified components | 8 (`fit-up-catalog-manager`, `fit-up-quote-selector`, `highfield-quote-flow`, `finalize-quote-dialog`, `proposal-view`, `quote-financials`, `FirebaseErrorListener`, `catalog-export-import`) |
| New one-shot retarget button | 1 (`V111ExpansionRetargetButton`, removed in close-out) |

---

## Phase A — End-to-end Fit-Up quote flow (umbrella build row)

**Pulled forward from v1.16:** Stories 9.2.1 (Fit-Up Module Tab), 9.2.2 (Include fit-up checkbox), 9.2.3 (Customer PDF summary line), plus a simplified take on 9.3.1 (auto-classification — full rule engine remains a v2.2 plan).

### Step 5 picker (`src/components/fit-up-quote-selector.tsx`)

`FitUpQuoteSelector` mounted under Dealer Fit on Step 5 of `highfield-quote-flow`. Card grid mirroring the dealer-fit picker (tier badge + name + price + Added pill). Tier-chip + Suggested-tier filters in the header; Suggested is biased by motor HP (`≥150` → complex, `≥50` → medium, `<50` → simple — heuristic, not a rule engine).

### Multi-level assignment (Epic 9.2.1 wider)

Fit-up items support four optional allowlists: `moduleIds`, `brandIds`, `rangeIds`, `modelIds`. The picker AND-combines every non-empty allowlist against the current quote context (`moduleId` + `vendorId` + `rangeId` + `modelId`). Empty everywhere = universal item. The catalog editor adds chip multi-selects per level, narrowing the next level by the parent (pick a brand → only that brand's ranges + models appear).

### Quote financials + finalize snapshot

`buildQuoteFinancials` adds `fitUpTotal` + `fitUpCost` (60%-of-sell fallback when cost is missing). Finalize writes `quote.fitUpSelections[]` — each line snapshots the resolved sellPrice + cost at the moment of finalize so catalog edits don't retroactively change a sent quote. Customer PDF + `proposal-view` Investment Summary both render a single "Fit-up & Rigging" line per the locked product decision in Story 9.2.3.

---

## Phase B — Fit-Up expansion

The headline of v1.11. Fit-up gets a real spine: categorisation, packages, per-line quote controls, and a workshop status independent of the sales lifecycle.

### Catalog: categories + customer descriptions

**`FitUpItem` schema gains:**
- `category?: string` — free-text grouping (e.g. "Rigging", "Electronics", "Safety"). Drives a category-filter chip row in both the admin catalog and the salesperson selector. Empty = uncategorised.
- `customerDescription?: string` — what the customer should see on the proposal's fit-up breakdown when expanded. The PDF still rolls up to the single summary line by the locked Story 9.2.3 decision; this field is plumbed so future surfaces (or an org-admin "show detailed list" preference) can use it without another migration.

**Catalog UI:**
- Editor dialog adds `Category`, `Customer description`, and re-labels the existing `Notes` field as `Internal notes — never shown to the customer` for clarity.
- Catalog row renders a category badge alongside the tier badge.
- Category filter chip row in the catalog header — dynamic (only renders categories that exist on at least one item).
- CSV import + export gain `Category` and `Customer Description` columns. Import upserts by name (unchanged) — these two columns layer in on existing rows.

### Catalog: packages (`organisations/{orgId}/fitUpPackages`)

A new top-level concept on the catalog. A package is a named bundle of fit-up item ids. Selecting a package on a quote toggles every member item on at once.

**Schema:** `{ name: string, description?: string, itemIds: string[], createdAt, updatedAt }`.

**`firestore.rules`:** new `match /fitUpPackages/{packageId} { allow read, write: if isSignedIn(); }` inside the `organisations/{orgId}` block. Also added to the `FirebaseErrorListener` non-essential-read denylist (matches `fitUpItems` / `serviceOperations` / `serviceParts`) — a missing rule on this path can't white-screen the app.

**Catalog UI:** the catalog manager wraps in a `<Tabs>` with two tabs:
- **Items** — the v1.10 catalog UI unchanged.
- **Packages** — new. Lists every package with its member items as inline chips, total sell, and `Edit` / `Delete` actions. `Add package` opens a dialog with a name, description, and a filterable list of catalog items with checkboxes. Dangling references (member item deleted from the catalog) render as an amber "N deleted items" pill rather than throwing.

**Salesperson UX:** the quote selector renders a horizontal Packages strip above the items grid (only when at least one package is relevant in the current context). One click adds every member item that's not already on the quote. Already-on items keep their qty/override/note untouched.

### Quote-flow polish

**Search + category filter (`fit-up-quote-selector.tsx`):**
- Free-text search input — matches against `name`, `customerDescription`, `notes`, `category`.
- Category filter chips — same dynamic list as in the catalog (only categories present in the in-context items appear).

**Per-line controls (the big one):**

The selector now tracks a richer state per selection — not just yes/no, but a `FitUpSelection` wrapper:

```ts
interface FitUpSelection {
    item: FitUpItem;
    quantity: number;         // defaults to 1
    priceOverride: number | null;   // null = use catalog sellPrice
    quoteNote: string | null;       // operator-only, never customer-facing
}
```

Below the picker grid, a new "Selected fit-up items" panel renders one row per selection with three controls:
- **Qty stepper** — Plus / Minus buttons + a typed input. Min 1.
- **Price override** — typed dollar input. Empty = use catalog price (placeholder shows the catalog price). Saves on blur. Invalid values revert to the previous value.
- **Per-quote note** — typed text input, single-line. Operator-only. Saves on blur. Never rendered on the customer PDF.

Running quote total on Step 5 multiplies by quantity and honours overrides via the new `resolveFitUpLineSell(selection)` helper.

### Snapshot + financials

`fitUpSelections[i]` on the finalize payload now carries `quantity` + `priceOverride` + `quoteNote` + `category` + `customerDescription` in addition to the v1.11 Phase A fields. The financials helper (`src/lib/quote-financials.ts`) and the inline calc on `proposal-view` both compute:

```
fitUpTotal = Σ (qty × (priceOverride ?? sellPrice ?? cost))
fitUpCost  = Σ (qty × (cost ?? sellPrice × 0.6))
```

**Backwards compat:** snapshots that predate this expansion (no `quantity` field) default to `qty=1` and no override — matches the original per-line semantics exactly.

### Workshop status on the quote (`src/lib/fit-up-status.ts`)

New orthogonal state machine: `fitUpStatus: 'pending' | 'scheduled' | 'in-progress' | 'complete'`. Tracks the WORKSHOP progress of the fit-up scope, independent of the sales-side lifecycle. A quote can be sales-lifecycle `Accepted` while its fit-up is workshop-status `Scheduled`; both pills live side-by-side on the proposal-view header.

**Storage:** `quote.fitUpStatus` + `quote.fitUpStatusAt` + `quote.fitUpStatusByUid` + `quote.fitUpStatusByName`. Optional — undefined defaults to `pending`.

**UI:** `proposal-view` header gets a new popover pill (only when the quote has at least one fit-up selection — otherwise it's noise on plain vessel-only quotes). Same click-to-transition pattern as the v1.9 lifecycle pill. Each transition writes a `fit-up-status-changed` audit-log event so the Activity tab surfaces the history.

**New audit-log event type:** `'fit-up-status-changed'` added to `AuditEventType` in `src/lib/quote-audit-log.ts`. Renders with a Wrench icon + teal tint in the Activity row, summary `Now: <status>`.

### Catalog-wide export

`catalog-export-import.tsx` (the existing all-catalogs export sheet) adds:
- New columns on the Fit-Up sheet: `category`, `customerDescription`.
- New sheet: `Fit-Up Packages` — name, description, pipe-separated itemIds.

---

---

## Phase C — Fit-Up expansion-2 (demo unblocker + extended scope)

Mid-cycle scope bump: the team needs to walk an end-to-end quote with real fit-up data NOW, and the fit-up module needs to be "complete" before we move to the next release.

### Demo unblocker — `V111SeedFitUpDummyDataButton`

One-shot button on the Roadmap header. Click once → 15 catalog items spanning 6 categories (Rigging / Electronics / Safety / Sound / Plumbing / Trim) across all 3 tiers, 3 packages (Coastal Setup / Offshore Power Pack / First-Time Owner Kit). Items are catalogue-wide (no allowlist restrictions) so every quote sees them. Placeholder images, customer descriptions, prices included. Idempotent. Removed in close-out cleanup.

### Variant-level (sub-model SKU) assignment

`FitUpItem.variantIds?: string[]` AND-combined with the existing module / brand / range / model allowlists. Admin editor renders a Variants chip section only when at least one model is picked (variants lazy-load per selected model to avoid N×M×K Firestore reads). Quote selector passes `activeVariant.id` through the same `itemMatchesContext` chain.

### Item images

`FitUpItem.imageUrl?: string | null`. Editor input with live preview; catalog row renders a small thumbnail. Native `<img>` per CLAUDE.md lesson (Next/Image breaks external CDNs). `onError` hides broken images silently.

### Soft dependency hints (`oftenPairedWith`)

`FitUpItem.oftenPairedWith?: string[]` references other catalog items. Editor's `OftenPairedWithSection` is a searchable chip picker over all catalog items (self-references excluded). The quote-selector ✦ highlight on hinted items lands in a follow-up — schema + admin authoring shipped now. **NOT the operator-authored conditional rule engine — Epic 9.3.1 still v2.2.**

### Catalog audit log (`/organisations/{orgId}/fitUpCatalogAudit`)

Append-only log of catalog mutations. Logged on create/update/delete of both items and packages. Shallow before/after diff on key fields (name, tier, cost, sellPrice, category, customerDescription, imageUrl). Fire-and-forget — failed audit writes never roll back the catalog mutation. New `firestore.rules` path (signed-in read+write); `FirebaseErrorListener` denylist absorbs missing-rule edge case.

### Package-level price override

`FitUpPackage.packagePrice?: number | null`. When set, selecting the package on a quote distributes this amount across the member items as per-line `priceOverride` PROPORTIONALLY (each member gets `(catalog_sell / catalog_total) × packagePrice`). Margin still allocates correctly per line. Operator can nudge any single line back via the per-line override input. Package row in the admin shows an amber `(bundle)` tag when override is set; the selector strip shows the package price as the visible total + `(bundle)` tag.

### Fit-up scheduling (date + technician)

New quote fields `fitUpScheduledDate` (ISO yyyy-mm-dd) + `fitUpAssignedTechnician` (free-text — no roster yet). Stored alongside the workshop status. UI lives INSIDE the existing fit-up status popover on the proposal-view — `<input type="date">` + `<input type="text">` for the technician; both save on blur. Operator-only — never on customer PDF. Audit-logged via the existing `fit-up-status-changed` event type with a `note` summarising the change.

### Pricing + Configurator Audit Workbook (extended `catalog-export-import.tsx`)

Renamed from "Global Catalog Export / Import" to make the purpose explicit. Single xlsx now contains:

**Round-trippable sheets (upsert-by-natural-key on import):**
- Fit-Up · Fit-Up Packages · Service Operations · Service Parts · Model Overrides · Trailer Overrides · Vendors · Ranges · Models · Variants · Optional Features

**New export-only sheets (read-only audit):**
- Exchange Rates (per-currency rate + source + timestamp)
- Dealer Fit Selections (per-org package + single selections with item rowIds rolled up)
- Dealer Fit Categories (global)
- Motor Vendors (Motor Brand vendor metadata)
- Motor Models (with flat `hull_cash` / `hull_trade` / `hull_subdealer` / `hull_commercial` / `hull_boating_alliance` price-level columns)

Export-only sheets are skipped on import (their shape isn't safely round-trippable — `exportOnly: true` flag on the SheetSpec). Output filename: `pricing-configurator-audit-YYYY-MM-DD.xlsx`.

---

## v1.11 NOT in scope (deferred to v1.12)

The dev branch carries several things built during the v1.11 cycle that BELONG to other epics. They keep their code (and ship to prod when v1.11 merges) but the planning-system rows have been pushed to v1.12 so they get the headline they deserve:

- **11.2.1** — Service Quote Flow (Epic 11.2). Service-side quoting UX built end-to-end against the v1.10 catalogue.
- **11.1.3 / 11.1.4** — Service Catalog refinements (rate sheets / parts upsert tweaks).
- **3.7.3** — Motors Table (catalog read-view).
- **3.5.1** — Suggestion Approval Queue (operator queue for inbound feature suggestions).

v1.12 release notes will pick these up as the formal v1.12 headline. The `V111ExpansionRetargetButton` did the bulk retarget in one click.

## v1.11 EXPANSION — what didn't ship (deferred)

- **Full Epic 9.3 auto-classification rule engine** — still parked at v2.2 (matches v1.10 plan). The v1.11 HP heuristic stays as the simplified take on 9.3.1.
- **Fit-up scheduling (date + technician assignment)** — only the workshop STATUS is in v1.11; date + assignee is its own slice.
- **PDF detail toggle** — customer PDF stays as a single summary line per the locked Story 9.2.3 decision.

---

## Files Changed

**New:**
- `src/lib/fit-up-status.ts`
- `src/components/v111-expansion-retarget-button.tsx`
- `tasks/RELEASE_NOTES_v1.11.0.md`
- `tasks/USER_GUIDE_v1.11.0.md`
- `tasks/v1.11-fitup-expansion-todo.md`

**Modified:**
- `firestore.rules` (+`fitUpPackages` rule)
- `src/components/fit-up-catalog-manager.tsx` (Items/Packages tabs, category/customerDescription fields, CSV expansion, PackagesManager + Editor)
- `src/components/fit-up-quote-selector.tsx` (state model, search, category chips, packages strip, SelectionRow with qty/override/note)
- `src/components/highfield-quote-flow.tsx` (state shape `FitUpItem[]` → `FitUpSelection[]`, package + update handlers, running-total update)
- `src/components/finalize-quote-dialog.tsx` (snapshot expanded with quantity, priceOverride, quoteNote, category, customerDescription)
- `src/components/proposal-view.tsx` (Wrench icon, fit-up status pill in header, transition handler, audit-row mapping)
- `src/components/FirebaseErrorListener.tsx` (`/fitUpPackages` added to denylist)
- `src/components/catalog-export-import.tsx` (new columns + Packages sheet)
- `src/lib/quote-financials.ts` (qty × override-aware fit-up total + cost)
- `src/lib/quote-audit-log.ts` (new `fit-up-status-changed` event type)
- `src/components/roadmap-view.tsx` (mounts the new one-shot button)
- `src/lib/release-schedule.ts` (v1.11 marked shipped, runway start bumped to 12)
- `CLAUDE.md` (v1.11 row in release-state table)
