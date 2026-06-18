# v1.17 — Catalog Editing at Scale + Bug Sweep

**Date**: 2026-06-16
**Branch**: `claude/app-overview-wKiZ1` → `main`
**Theme**: Turn the catalog from "edit one row at a time" into "edit thousands of rows efficiently", drain the awaiting-repro bug backlog where we can.

## Release Stats

- **7 Phase A stories shipped** (data-ops, all unblocked).
- **2 Phase B bugs resolved**: trailer-catalog data gap (by 3.10.2 + 3.11.3) and 3.7.8 placement decision.
- **2 Phase B bugs parked awaiting repro** (HL save error, RU200KAM $76.82 delta). Plans documented in `tasks/v1.17-BUG-SWEEP.md`.
- **2 NSM-Hub stories** (11.3.2 + 11.3.3) carry to v1.18, still service-account-blocked.
- **53/53 ticks** across `tests/v1.17-everything.spec.ts`. Every story validated.

## Phase A — Data Ops

### 3.10.1 Multi-row select + bulk markup
Per-row checkbox column + select-all-filtered header checkbox on **MotorsTableView** and **TrailersTableView**. When any row is selected, a bulk-action toolbar mounts with a markup input and an "Apply markup" button. The markup math is cost-driven: `next sell = round(cost × (1 + pct/100))`. Rows without a cost are skipped and reported in the summary toast. Trailers retrofit routes through the existing `patchTrailer` pipeline so v1.14's org-override mode is honored.

### 3.10.2 Paste from spreadsheet
New `PasteFromSpreadsheet` dialog. Operator pastes TSV (from Excel / Google Sheets) or CSV. The dialog:
- auto-detects the key column with the v1.4 priority list (Part Number > Model Code > Model ID > SKU > Code > ID > Model > Model Name > first column),
- builds a diff (created / updated / unchanged / skipped),
- writes via `setDoc({ merge: true })` so operator edits stay safe (no clear-and-replace per the v1.4 lesson),
- shows a summary toast "N created · M updated · K unchanged · L skipped".

Idempotent: re-paste the same payload, every row reports "unchanged". Wired into MotorsTableView via a "Paste" button next to Export CSV. Reusable across surfaces.

### 3.10.3 Cross-tab catalog filter
The "Search brands" input on the Catalog Manager page now threads through to the active table view as `initialSearch`. Type "F70" and the sidebar narrows to Yamaha and the active Motors Table narrows to F70 rows. Three components updated: `MotorsTableView`, `TrailersTableView`, `BoatsTableView`. Highfield workspace skipped (different component, deferred to v1.18+).

### 3.2.1 Internal Data Normalisation Layer
New `src/lib/catalog/derive-pricing.ts`:
- `derivePricing()` returns the canonical pricing shape: `{ cost, sell, sellIncGst, marginAbs, marginPct, marginTone, missingPricing, fromOverride }`.
- `marginTone` is one of `'red'` (< 15%), `'amber'` (< 25%), `'emerald'` (>= 25%), `'none'`.
- `applyMarkup(cost, pct)` is the single source of truth for the bulk-markup math.
- `GST_MULTIPLIER = 1.1`. `sellIncGst` always `Math.ceil(sell × GST_MULTIPLIER)` per the v1.3 lesson.
- Scope for v1.17: motors + trailers. Boats / fit-up / service-quote intentionally left out (different price-level + per-state derivation patterns); broader sweep slips to v1.18+ if helpful.

### 3.11.3 Importer plug-in registry
New `src/lib/catalog/importer-registry.ts`. Standardises Yamaha MPF, Sam Allen rigging, and the generic Trailer Brand importer into one `registerImporter()` + `getImporterForVendor()` pattern. Each importer declares id, label, vendor-match predicate, column map, key column, optional row transformer, and target collection path. Adding a new vendor in v1.18+ is just another `registerImporter()` call.

### 3.9.4 Trailer compat editor
New `src/components/trailer-compat-editor.tsx`. Boat <-> trailer matrix mirroring the v1.16/3.9.3 dealer-fit pattern. Each boat model gets an `applicableTrailerCodes: string[]` field. Step 4 of the quote will auto-filter trailers to that list (with a "Show all" escape hatch). Empty list = no filter, so existing models behave exactly like v1.16.

### 3.9.5 Per-org exchange-rate editor + stale-rate detector
The CRUD + audit change-log surface already shipped pre-v1.17. v1.17 adds:
- `isRateStale(lastUpdatedAt, thresholdDays = 30)` exported from `derive-pricing.ts`. Cards consuming foreign-currency rates (motors / boats) can call it to render an amber warning chip when the rate is over 30 days old.
- Accepts JS Date, ms epoch, or Firestore Timestamp shape.

## Phase B — Bug Sweep

See `tasks/v1.17-BUG-SWEEP.md` for the full status grid.

- **Trailer Catalog missing models**: resolved structurally by 3.10.2 + 3.11.3. Operator can paste from the source spreadsheet now.
- **3.7.8 Delivered deals placement**: decision documented in `tasks/v1.17-DECISIONS.md`. No new dashboard; use the existing Archive toggle on Recent Proposals.
- **HL save error** + **RU200KAM $76.82 delta**: stay parked awaiting repro. Plan documented for the moment a reliable trigger lands.
- **11.3.1 NSM-Hub customer reconciliation**: carries to v1.18, still service-account-blocked.

## What's NOT in v1.17

- Customer-facing surfaces (Customer Detail Sheet, Customer Pipeline, My Customers / My Quotes). Epic 8.1 starts v1.21.
- Quote variations + contract signing. Epic 2.4 / 2.6. v1.18+.
- Margin threshold enforcement. Epic 2.2. v1.19.
- Mobile-responsive polish. v2.2.
- NSM-Hub migration (11.3.2, 11.3.3). Still service-account-blocked.

## Files Changed

### New
- `src/lib/catalog/derive-pricing.ts`
- `src/lib/catalog/importer-registry.ts`
- `src/components/paste-from-spreadsheet.tsx`
- `src/components/trailer-compat-editor.tsx`
- `tests/v1.17-everything.spec.ts`
- `tasks/v1.17-plan.md`
- `tasks/v1.17-BUG-SWEEP.md`
- `tasks/v1.17-DECISIONS.md`
- `tasks/RELEASE_NOTES_v1.17.0.md`
- `tasks/USER_GUIDE_v1.17.0.md`

### Updated
- `src/components/motors-table-view.tsx` (3.10.1 + 3.10.2 + 3.10.3 wiring)
- `src/components/trailers-table-view.tsx` (3.10.1 retrofit + 3.10.3)
- `src/components/boats-table-view.tsx` (3.10.3)
- `src/app/(app)/pricing-manager/page.tsx` (3.10.3 cross-tab filter)
- `src/lib/release-schedule.ts` (v1.17 flag at close)

## Required after merge

- Run `scripts/ship-v117-features.py` (lands separately) to flip the 7 Phase A stories to `status: shipped` in Firestore.
- Flip `RELEASE_WINDOWS['v1.17'].shipped = true` (already in the release-schedule.ts commit).
- `FORWARD_RUNWAY_START` bump 17 → 18.
