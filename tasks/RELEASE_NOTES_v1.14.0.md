# HelmLogic — Release Notes v1.14.0

**Date:** 2026-06-15
**Branch:** `claude/v1.12-v1.13-push` (joint v1.12 + v1.13 + v1.14 triple push)
**Theme:** Catalogue polish — inline editing on Motors · column tooltips · per-tab CSV export

This release rolls into the same merge as v1.12 + v1.13. Three releases, one PR. v1.14 is the polish round that finishes the catalogue table family — Motors Table picks up the inline editing affordances the Trailers Table got in v1.13, every table gets column-header help tooltips, and Motors + Trailers both gain per-tab CSV export.

---

## Release Stats

| Metric | Value |
|---|---|
| Stories shipped | 3 (3.8.6 · 3.8.8 · 9.2.3 retro-flip) |
| Stories deferred to v1.15 | 4 (3.7.6 · 3.7.7 · 3.9.1 · 9.2.1) |
| Stories held at v1.14 (blocked) | 2 (11.3.2 · 11.3.3 — NSM-Hub service-account) |
| Components extended | 2 (`motors-table-view.tsx` + `trailers-table-view.tsx`) |
| New release-schedule entries | 1 (`'v1.14': { shipped: true }`) |

---

## Story 9.2.3 — Fit-up section on customer-facing quote PDF

### What's actually in this release

**Status flip only.** Story 9.2.3 was implemented in v1.11 as part of the locked Story 9.2.3 product decision ("single Fit-up & Rigging summary line on the customer PDF; never per-item breakdown"). The code shipped with v1.11. The Firestore planning row stayed `planned` because the v1.11 retarget pass treated it as a v1.14 carry-over.

This release flips its status to `shipped` to bring the planning surface in line with reality. No new code.

If you opened a quote in v1.11 that included fit-up selections, the customer PDF already had the "Fit-up & Rigging: $X,XXX" summary line. Nothing about that changes here.

---

## Story 3.8.6 — Column-header help text + tooltips

### What ships

Every column header on the Motors Table + Trailers Table now has a small `?` icon next to the label that reveals a tooltip on hover. The tooltips capture the spec-domain knowledge that operators need but the column names don't fit:

**Motors Table tooltips:**
- **Part #** — Manufacturer's part number / SKU. Used by Yamaha MPF imports.
- **Model** — Model name as it appears on the data sheet.
- **Series** — Series the motor belongs to (e.g. F25, F70). Drives the series filter chip row.
- **HP** — Horsepower rating. Multi-engine syntax "N × HP" is parsed at the quote-flow side.
- **Shaft** — Shaft length code (S / L / X / U). Matters for transom compatibility.
- **Cost** — Dealer cost. Inline-editable.
- **Sell (ex GST)** — Retail price excluding GST. GST gets added at finalize.

**Trailers Table tooltips:**
- **Image** — Native `<img>` per CLAUDE.md lesson (Next.js `<Image>` breaks external CDNs).
- **Code** — Model code / SKU. Read-only — edits happen via the trailer module editor.
- **Name** — Display name shown on quotes. Inline-editable.
- **ATM (kg)** — Aggregate Trailer Mass — fully loaded weight. **Drives rego band selection at quote time**.
- **Tare (kg)** — Empty weight. Subtract from ATM for payload capacity.
- **Wheels** — Wheel size code (e.g. '13" STEEL WHEEL').
- **Cost** — Dealer cost. Missing rows highlight in rose.
- **Sell (ex GST)** — Retail price excluding GST.
- **Margin** — `(Sell − Cost) / Sell × 100`. Red < 15% · amber < 25% · emerald ≥ 25%.
- **Rego** — State-specific rego is calculated at quote time from the trailer ATM.

Boats Table tooltips ship in v1.15 polish (same pass as Boats Table inline editing).

---

## Story 3.8.8 — Catalog data export per tab

### What ships

**Export CSV** button on the Motors Table + Trailers Table. Exports the currently-filtered rows (so the search + series-filter on Motors actually drives the export, not the whole catalogue).

CSV format:

- **Motors:** Part Number, Model Name, Series, HP Rating, Shaft, Cost, Sell (ex GST)
- **Trailers:** Code, Name, ATM (kg), Tare (kg), Wheels, Cost, Sell (ex GST)

Filename includes the ISO date: `motors-2026-06-15.csv` / `trailers-2026-06-15.csv`.

This is separate from the v1.11 Pricing + Configurator Audit Workbook (which exports + imports every catalogue collection in one xlsx with diff-preview on commit). The per-tab CSV is a quick "give me just THIS table to paste into a meeting" surface for the operator who doesn't want the full audit workbook for a quick scan.

XLSX export ships in v1.15 (same pass as Boats Table CSV export, so all three tables ship CSV + XLSX in one round).

---

## 3.8.1 + 3.8.2 retrofit — Motors Table now editable

### What ships

The `InlineEditCell` component v1.13 shipped on the Trailers Table is now wired into the Motors Table. Editable fields:

- **Model Name** (text)
- **HP Rating** (text — accepts the multi-engine "N × HP" syntax)
- **Shaft** (text)
- **Cost** (currency, positive-validated)
- **Sell (ex GST)** (currency, positive-validated)

Part Number stays read-only — it's the natural key (used by Yamaha MPF imports). Editing it would break import idempotency.

Writes go to `data-warehouse/{vendorId}/parts/{motorId}` directly. Optimistic local update on the row so the UI reflects the new value without a re-fetch.

Boats Table inline editing is the bigger lift (expandable variant rows) and ships in v1.15.

---

## v1.14 NOT in scope (deferred to v1.15)

- **3.7.6 — Org-level pricing overrides surfaced inline in catalog tables** — needs the override-write path wired (separate from the vendor catalog write).
- **3.7.7 — Migrate per-vendor imports under catalog tabs** — needs the existing per-module import surfaces audited first.
- **3.9.1 — Optional features editor (drill-down panel per model)** — needs design.
- **9.2.1 — Fit-up tab on each module page** — different surface from the v1.11 Step-5 selector; needs its own design pass.

## v1.14 NOT in scope (still blocked)

- **11.3.2 — Migration tooling (bulk + delta-sync)** + **11.3.3 — Cutover** — both blocked on NSM-Hub `nsm-service-quotation` read service-account. Still held at v1.14 targetRelease — will land in the first release after access clears.

---

## Files Changed

**New scripts:**
- `scripts/ship-v114-features.py` — applied (3 → shipped, 4 → v1.15, 2 → held)
- `scripts/list-v114-features.py` — inspection helper

**Modified:**
- `src/lib/release-schedule.ts` — `'v1.14': { shipped: true }` + `FORWARD_RUNWAY_START` bumped 14 → 15
- `src/components/motors-table-view.tsx` — inline edit + tooltips + CSV export
- `src/components/trailers-table-view.tsx` — tooltips + CSV export (inline edit shipped in v1.13)
- `CLAUDE.md` — v1.14 row added

**New docs:**
- `tasks/RELEASE_NOTES_v1.14.0.md`
- `tasks/USER_GUIDE_v1.14.0.md`
