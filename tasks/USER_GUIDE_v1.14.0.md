# HelmLogic — User Guide v1.14.0

**For:** Catalogue admins
**Companion to:** `RELEASE_NOTES_v1.14.0.md`

v1.14 is the **catalogue polish round**. It ships in the same merge as v1.12 (Service Quote detail + PDF + customer schema) and v1.13 (Service Quote send + Trailers Table + inline editing + parity audit). v1.14 finishes the catalogue table family — Motors Table picks up the inline editing affordances Trailers got in v1.13, every column header gains a help tooltip, and Motors + Trailers both gain per-tab CSV export.

---

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| Edit a Motor's name / HP / Shaft / Cost / Sell in place | Catalog Manager → Motor Brand → click the cell | §1 |
| Understand what a column actually represents (e.g. "what's ATM?") | Hover the `?` next to the column header | §2 |
| Export the current view of Motors or Trailers as CSV | Click "Export CSV" above the table | §3 |
| See the fit-up section on the customer quote PDF | Already there — it's been on PDFs since v1.11 (§4) | §4 |

---

## 1. Inline editing on the Motors Table

### How

Catalog Manager → pick a Motor Brand vendor (e.g. Yamaha) → click any cell on the table. An inline input replaces the read view.

- **Tab** or **Enter** to commit · **Esc** to cancel
- Tiny spinner pip appears while saving
- Toast confirms on success
- Validation error (e.g. "Not a number", "Positive number") shows below the input

### What's editable

- **Model Name** (text)
- **HP Rating** (text — accepts multi-engine "N × HP" syntax)
- **Shaft** (text)
- **Cost** (currency, positive-validated)
- **Sell (ex GST)** (currency, positive-validated)

### What's not

- **Part Number** stays read-only. It's the natural key the Yamaha MPF import uses — changing it would break upsert idempotency. If a part number is wrong, fix it on the import source first, re-import, then HelmLogic catches up.

### What about Boats?

Boats Table inline editing is the bigger lift (expandable variant rows under each model). Ships in v1.15. Trailers + Motors are the v1.13 + v1.14 surfaces.

---

## 2. Column-header tooltips

Hover the small `?` icon next to any column header on the Motors or Trailers Table for a one-line explanation. Useful when:

- You're new to the spec domain ("what does 'Shaft' mean — S / L / X / U?")
- You're explaining the table to a sales-floor newbie
- You forget which column drives margin band tinting (it's Sell − Cost / Sell ×100)

Headers covered: every column on Motors + Trailers. Boats Table headers gain tooltips in v1.15.

---

## 3. Per-tab CSV export

### Motors Table

"Export CSV" button next to the search bar. Exports the currently-filtered rows — so if you've narrowed by Series filter + search term, those filters drive the export. The full table exports when no filters are set.

Columns: Part Number, Model Name, Series, HP Rating, Shaft, Cost, Sell (ex GST).

Filename: `motors-{date}.csv` (e.g. `motors-2026-06-15.csv`).

### Trailers Table

Same button, same behaviour. Columns: Code, Name, ATM (kg), Tare (kg), Wheels, Cost, Sell (ex GST). Filename: `trailers-{date}.csv`.

### How does this differ from the v1.11 Audit Workbook?

| | Per-tab CSV (v1.14) | Audit Workbook (v1.11) |
|---|---|---|
| **Scope** | Just one table (Motors *or* Trailers) | Every catalogue collection in one xlsx |
| **Direction** | Export only | Round-trip (export + diff-preview import) |
| **Audit** | None | One summary entry per import lands in Catalog Audit |
| **Best for** | Quick scan / paste-into-meeting | Annual price review · bulk edit cycles |

XLSX export per tab ships in v1.15 (so all three tables ship CSV + XLSX in one round).

---

## 4. Fit-up section on the customer-facing PDF

This isn't new — the fit-up summary line has been on the customer PDF since v1.11. The Firestore planning row stayed `planned` because the v1.11 retarget pass treated it as a v1.14 carry-over.

v1.14 just flips the status to `shipped` so the planning surface reflects reality. If you've sent any v1.11 quotes with fit-up selections, you've already seen the "Fit-up & Rigging: $X,XXX (ex GST) / $Y,YYY (inc GST)" line on the customer PDF.

(In case you missed it: the customer PDF rolls fit-up to a single summary line. The per-item breakdown stays operator-only by product decision — marine-sales convention.)

---

## What this release did NOT ship (deferred to v1.15)

- **Org-level pricing overrides inline (Story 3.7.6)** — for an org admin to override the vendor catalogue price without touching the source. Needs the override-write path wired.
- **Per-vendor imports under catalog tabs (Story 3.7.7)** — move the per-module Yamaha MPF / Sam Allen / Trailer Pricing import UIs under the Catalog Manager surface so they're one click away from the table they affect.
- **Optional features editor — drill-down panel per model (Story 3.9.1)** — currently optional features edit through the module editor; v1.15 brings them into the catalogue table flow.
- **Per-module Fit-up tab (Story 9.2.1)** — different surface from the v1.11 Step-5 selector + the Manage → Fit-Up Catalog admin. Needs its own design pass.

## What this release did NOT ship (still blocked)

- **NSM-Hub migration tooling (Story 11.3.2)** + **NSM-Hub cutover (Story 11.3.3)** — both still blocked on the `nsm-service-quotation` read service-account. Designed; not buildable until access clears.
