# HelmLogic — Release Notes v1.10.0

**Date:** 2026-06-02
**Branch:** `claude/app-overview-wKiZ1`
**Theme:** Dealer-ops + Service Quoting foundation

---

## Release Stats

| Metric | Value |
|---|---|
| Phases | 3 (Bug pass + Fit-Up admin + Service Catalog) + 1 (Boats read view) |
| Stories shipped | 9 (9.1.1–9.1.4 + 11.1.1–11.1.2 + 3.7.2 + 2 bug status-flips) |
| New Firestore collections | 3 (`fitUpItems`, `serviceOperations`, `serviceParts`) |
| New firestore.rules paths | 3 |
| New top-level pages | 1 (`/boats`) |
| New `/manage` tabs | 2 (Fit-Up Catalog, Service Catalog) |
| New components | 5 (catalog managers + Boats view + 2 one-shots, removed at close-out) |
| Modified components | 7 (render-quote-pdf, finalize-quote-dialog, proposal-pdf, proposal-view, stock-import, manage-organisation-page, FirebaseErrorListener) |

---

## Phase A — Production Bug Pass (commit `b516d4e`)

Four operator-reported bugs, root-caused and fixed.

### A.1 Cover letter restored on the customer PDF

The salesperson "Your message" content block was silently dropping from rendered PDFs.

**Root cause:** `renderQuotePdf` (the v1.8 single-source pipeline) never fetched the `SalespersonProfile` doc. `ProposalPDFDocument` hard-gates the `salesperson-message` block on `salespersonProfile` being present — when always `null`, the block disappeared.

**Fix (`src/lib/render-quote-pdf.ts`):** Added `getDoc(doc(firestore, 'organisations', orgId, 'salesTeam', quote.createdByUid))` to the parallel `Promise.all`. Keyed by `quote.createdByUid` so any PDF rendered shows the salesperson assigned to that quote. Profile URLs flow through the existing image-preload pipeline. Dev-only canary fires if a salesperson-message block resolves with non-empty HTML but `salespersonProfile.messageHtml` is empty.

### A.2 Dealer-fit option names render reliably

Some dealer-fit lines on proposals had blank names with only a dollar amount visible.

**Root cause:** Pick-time snapshot used a narrow field-name fallback chain. MPF / vendor-feed imports use a much wider set (`Part Description`, `PART DESCRIPTION`, `Long Description`, `Title`, `Heading`, etc.).

**Fix (defence in depth):**
- `src/components/finalize-quote-dialog.tsx` — widened the fallback chain at snapshot time, added a `code` field (Part Number / SKU / nsmCode / factoryCode fallback).
- `src/components/proposal-pdf.tsx` + `src/components/proposal-view.tsx` — render-side defence: `{item.name || item.code || 'Dealer Fit Item'}`.

### A.3 Locked-quote discount save honest-fails

Save Discount on a locked quote silently failed — appeared to succeed until refresh.

**Fix:** Added an explicit `if (quote.isLocked === true) { toast destructive "Quote is locked"; return; }` guard before the `updateDoc` in `handleSaveDiscount`. Operators get an immediate "Quote is locked — Create v2 to change discount" toast.

### A.4 Stock-import duplicate stock-number race

Concurrent imports with blank `stockNumber` cells could collide on the `IMP-<ms>` fallback.

**Fix (`src/components/stock-import.tsx`):** Switched to `IMP-${Date.now().toString(36).slice(-6)}-${Math.random().toString(36).slice(2,6)}`. Base-36 encoding + 4 random chars.

---

## Phase B — Fit-Up Admin (Epic 9.1.x, full scope)

The master catalogue layer of the fit-up epic. **Per-boat tie-in arrives with Epic 9.2 at v1.16+** (this release ships the catalogue foundation only — by design).

### B.1 Schema (Story 9.1.1)

**New collection:** `organisations/{orgId}/fitUpItems/{itemId}`

```ts
interface FitUpItem {
    name: string;
    tier: 'simple' | 'medium' | 'complex';
    cost: number;
    sellPrice?: number | null;
    notes?: string | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
```

`firestore.rules`: new `match /fitUpItems/{itemId} { allow read, write: if isSignedIn(); }` inside the `organisations/{orgId}` block.

### B.2 Editor (Story 9.1.2)

New **`/manage → Fit-Up Catalog`** tab.

- Add / Edit / Delete dialog with validation (name required, cost ≥ 0, sell price ≥ 0 if set).
- Tier filter chips at the top with counts (All / Simple / Medium / Complex).
- Each row shows tier badge, name, optional notes, cost + sell-price-if-set.

### B.3 Import / Export (Story 9.1.3)

- **Export** — xlsx-based, writes `fit-up-catalog-YYYY-MM-DD.xlsx`.
- **Import** — accepts `.csv` + `.xlsx`. Detects name column from a priority list (`name` / `item name` / `item` / `title` / `description` / `part description`). Normalises tier with first-letter detection (`simple` / `medium` / `complex` / first letter heuristic). **Upserts by name (case-insensitive)** — partial re-imports don't clobber operator edits, per the v1.4 remediation lesson.
- Toast: `N updated · M created · K skipped (no name)`.

### B.4 Bulk Operations (Story 9.1.4)

- Checkbox on every row + Select-all-visible.
- Bulk-actions toolbar appears when 1+ selected:
  - **Apply markup %** — `sellPrice = cost × (1 + pct/100)`, rounded 2dp. Confirm dialog warns about overwriting existing sell prices.
  - **Change tier** — set tier on all selected.
  - **Delete** — `writeBatch` delete with destructive copy ("no undo — Epic 9.2 not live yet so no quote depends on these").

---

## Phase C — Service Quoting Catalogue (Epic 11.1.x)

Foundation for absorbing NSM-Hub's service-quoting module. The service-quote flow itself (Epic 11.2) ships in v1.11+; this release lays the catalogue + schema.

### C.1 Schema (Story 11.1.1)

Two sister collections:

```ts
// organisations/{orgId}/serviceOperations/{opId}
interface ServiceOperation {
    code: string;              // natural key (uppercase-matched on import)
    name: string;
    flatRateHours: number;
    hourlyRate: number;
    cost?: number | null;
    sellPrice?: number | null; // derives from flatRateHours × hourlyRate unless set
    notes?: string | null;
}

// organisations/{orgId}/serviceParts/{partId}
interface ServicePart {
    partNumber: string;        // natural key (uppercase-matched on import)
    name: string;
    cost: number;
    sellPrice?: number | null;
    stockLevel?: number | null;
    notes?: string | null;
}
```

`firestore.rules` adds matching read/write-if-signed-in entries for both.

### C.2 Catalogue admin (Story 11.1.2)

New **`/manage → Service Catalog`** tab with two sub-tabs.

#### Operations sub-tab
- CRUD dialog with code + name + hours + rate + cost + sell-override + notes.
- CSV/xlsx import — detects code column from `code / op code / operation code / labor code / labour code`. Upserts by code (case-insensitive).
- Bulk markup applies to `hourlyRate` (the lever) — keeps the `flatRateHours × hourlyRate` derivation transparent.
- Bulk delete + Select-all-visible.

#### Parts sub-tab
- CRUD dialog with part number + name + cost + sell-override + stock level + notes.
- CSV/xlsx import — detects part-number column from `part number / partnumber / sku / code`. Upserts by part number (case-insensitive).
- Bulk markup overwrites `sellPrice = cost × (1 + pct/100)`.
- Bulk delete + Select-all-visible.

---

## Phase D — Boats Catalogue Read-View (Story 3.7.2)

New top-level page **`/boats`** (in the sidebar, between Dashboard and Pricing Manager).

- Vendor dropdown (Boat Brand vendors only).
- Search by model name / code / range.
- Table: code · model · range · cost · sell (ex GST).
- Each row is clickable → expands to show its variants underneath (material × colour SKUs with their own pricing).
- Variants are **lazy-loaded per-row** so the initial render is fast even across vendors with hundreds of models.
- Read-only by design — edits stay in the existing module-page editors.

---

## Defensive Code Changes

### `FirebaseErrorListener` — non-essential-read denylist

**Problem:** Pre-v1.10 the global Firebase error listener threw on **every** permission-denied event, which `global-error.tsx` rendered as a full-page "Something went wrong". A single denied `list()` on an admin-only sub-collection could white-screen `/manage` or `/feature-tracking` for every user.

**Fix:** Added a narrow path-suffix denylist to `src/components/FirebaseErrorListener.tsx`:
- `/fitUpItems` (Epic 9.1.x)
- `/serviceOperations` (Epic 11.1.x)
- `/serviceParts` (Epic 11.1.x)

Only **read** ops (`get` / `list`) are swallowed (log to console, return null data so the tab shows its empty state). **Writes** still throw — bulk markup / item save cannot silently fail. Customer-facing paths (`quotes`, `contentBlocks`, `emailTemplates`, `sharePointConfig`, `salesTeam`) are NOT denylisted.

This is the deeper systemic fix flagged in the v1.9 `SendQuoteDialog` / `emailTemplates` lesson — finally landed.

### Controlled-Tabs gating on `/manage`

Converted `<Tabs defaultValue="details">` → controlled `<Tabs value={activeTab} onValueChange={setActiveTab}>`. The Fit-Up Catalog + Service Catalog tab contents are wrapped in `{activeTab === '...' && ...}` so the heavy admin components only mount when the tab is active. Combined with the listener denylist, a missing rule on the new collections cannot crash the parent page.

---

## v1.9.5 Backfill

v1.9.5 shipped to prod (PR #36) but no planning rows were ever created to represent its work. The Roadmap rendered v1.9.5 as "0 activities · 0 pts". The `V195StoriesSeedButton` (temporary, removed in the v1.10 close-out cleanup) creates the 6 missing story docs retroactively:

- v1.9.5 — Roadmap reshuffle to dealer-ops priority (157 stories re-targeted) — 5 pts
- v1.9.5 — Capacity-aware bin-packing across releases — 3 pts
- v1.9.5 — Service Quoting groundwork (Epic 11 seed + NSM-Hub absorption plan) — 5 pts
- v1.9.5 — Clickable release-detail popups on the Roadmap — 2 pts
- v1.9.5 — Create Proposal crash hotfix (SendQuoteDialog emailTemplates gating) — 2 pts
- v1.9.5 — Restructure Workbench tooling (in-app one-shot for the v1.10 reshuffle) — 3 pts

**Total: 20 pts**. All `status: shipped`, `targetRelease: v1.9.5`.

---

## NOT in v1.10 (explicit deferrals)

| Item | When | Why |
|---|---|---|
| Epic 9.2 — Fit-up integration with quote flow (per-module + checkbox + PDF summary line) | v1.16+ | Locked product plan — quote-flow integration is its own slice |
| Epic 9.3 — Auto-classification rules | v2.2 | Depends on 9.2 being live |
| Epic 11.2 — Service-quote create form / dashboard / PDF / lifecycle | v1.11+ | Catalogue is the foundation; quote consumption is the next phase |
| Epic 11.3 — Customer reconciliation + NSM-Hub migration | v1.11 | Needs `nsm-service-quotation` service-account access |
| HL Error on saving project | v1.11 | Awaiting concrete repro |
| Import doesn't work correctly / Import Screen Bug | v1.11 | Awaiting concrete repro |
| RU200KAM $76.82 price delta | v1.11 | Awaiting real-quote + MPF-row repro |
| Trailer Catalog missing many trailer models | v1.11 | Data re-import, not code |
| 3.7.8 — Decision: Delivered deals + stock dashboard placement | Open | Decision pending operator input |

---

## Files Changed

**New:**
- `src/components/fit-up-catalog-manager.tsx`
- `src/components/service-catalog-manager.tsx`
- `src/components/boats-table-view.tsx`
- `src/app/(app)/boats/page.tsx`
- `src/components/v195-stories-seed-button.tsx` (temporary, removed at cleanup)

**Modified:**
- `src/lib/render-quote-pdf.ts` (salesperson profile fetch + canary)
- `src/components/finalize-quote-dialog.tsx` (widened dealer-fit fallback)
- `src/components/proposal-pdf.tsx` (render-side defence)
- `src/components/proposal-view.tsx` (defence + locked-discount guard)
- `src/components/stock-import.tsx` (base36+random suffix)
- `src/components/manage-organisation-page.tsx` (new tabs + controlled Tabs + lazy mount)
- `src/components/FirebaseErrorListener.tsx` (non-essential-read denylist)
- `src/components/roadmap-view.tsx` (release-detail popups, one-shot mount)
- `src/lib/release-schedule.ts` (`'v1.10': { shipped: true }`)
- `src/lib/nav-links.ts` (Boats entry)
- `firestore.rules` (3 new collection rules)

**Docs:**
- `tasks/RELEASE_NOTES_v1.10.0.md` (this file)
- `tasks/USER_GUIDE_v1.10.0.md`
- `CLAUDE.md`, `tasks/SESSION_HANDOVER.md`, `.agents/evolution.md`

**Removed at cleanup (per one-shot lifecycle):**
- `src/components/v110-retarget-button.tsx`
- `src/components/v110-bump-unbuilt-button.tsx`
- `src/components/v195-stories-seed-button.tsx` (after click)
