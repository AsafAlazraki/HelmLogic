# Trailer Module.xlsx — Evidence-Grade Analysis

**File**: `tasks/mpf-source/Trailer Module.xlsx` (7.6 MB) · 3 sheets · analyzed 2026-07-03 with openpyxl 3.1.5 `read_only=True, data_only=True` (strictly no writes).
**Companion evidence**: `motor-trailer-fo.evidence.json` in this directory.

---

## Sheet inventory & REAL extents (the phantom-row file)

| Sheet | State | Declared max row | **Real extent** | Purpose |
|---|---|---|---|---|
| Trailer Spec Enquiry | visible | 91 | last non-empty row **34** | Interactive one-trailer quote/spec calculator form (worked example: Custom TA700T-EH $3,500kg for Surtees 700), not a data table |
| Trailer Module | visible | 913 | last non-empty row **695**; **470 trailer rows**; 51 brand/series banner rows; OBSOLETE section rows 654–695 (39 rows) | Master trailer catalog |
| Dropdowns | hidden | **1,048,576** | last non-empty row **645** | Per-brand + master trailer name lists for Boat Module validation |

The 1,048,576 declared rows on `Dropdowns` are **phantom whole-column formatting/data-validation**. Verified two ways: empty-run scan (2,500-row cutoff) and an independent full scan to row 50,000 — both agree the last non-empty row is 645. Iterating the declared extent would touch a million styled-empty rows for nothing.

## Trailer Module sheet structure

- **Row 1 = headers** (through col GS). **Row 3 is a column-number ruler** (`1..44+`) sitting *inside* the data range — an importer keying on "first non-empty row after header" will swallow it.
- **Col A = brand/series banners** (51): `REDCO`, `REDCO - Sportsman Trailers`, `TINKA - Aluminium Trailers`, `GFAB TRAILERS`, `STACER TRAILERS`, `DUNBIER TRAILERS` (with 15 sub-series like `ROLLAMATIC WIDE SERIES (Width Between Guards 1790mm)`), `MACKAY TRAILERS`, `DUNBIER / HAINES BMT TRAILERS (NB: Only available in Haines BMT Package)`, and `OBSOLETE` at row 654.
- **Spacer rows contain single-space strings** — `is not None` filters overcount; strip before testing.

### Column map

| Cols | Content |
|---|---|
| C | **`Brand / Make / Model`** display string — the natural key the Boat Module stores (468 distinct / 470 rows) |
| D | Supplier: Dunbier Marine Products 231 · Mayfair Marine 2000 (REDCO/TINKA) 113 · GFAB Trailers 46 · Telwater (Stacer) 37 · Formosa 24 · Haines/Dunbier BMT 19 |
| E | `Code` — supplier SKU (452 distinct; 14 dup values, e.g. `SRW5.7M-13TB` ×4) |
| F, G | Long Description, Image Link (dunbier.com / mayfairmarine.com.au) |
| H–O | **Boat Size (Mtr)** ⚠️ mixed types (`4.3`, `1450 Exp`), Wheel Size (`13" 165/5P`), **Tare (Kg)**, **ATM (KG)**, Winch ratio, Between Guards (mm), Trailer Length, Trailer Plug |
| Q–AL | `TRAILER FEATURES` banner + **Trailer Features 1–21** free-text |
| AN–AS | Cost chain: **Dealer** → Discount → Settlement → **Nett Price** → Freight → **Landed** |
| AU–AZ | Factory lead times (days): Lockout / Build / Completion / Shipping / **Estimated Lead Time** |
| BB–BQ | PD block: PD Operation (`PD Trailer - Tandem Axle Braked`…), PD Hrs/$, rego label holder + R-clip + 3 parts lines w costs, Sundry, Detailing → **Total PD Charges** |
| BS–BW | **Total Nett CTD** → MU % → GP → RRP → **Sell** |
| BY–CA | **Rego Type / Rego ($) / Sell inc Rego** (see below) |
| CC–DZ | `FACTORY OPTIONS` banner + **Factory Option 1–10** as `Code / Description / Cost / Sell` quads (slots 11–20 headered but empty; option codes like `GFAB-0090`, `EX056IN`, `TW2793A`; some negative-price swap options) |
| FZ–GS | **Dealer Fit Option 1–20** description strings (trailer plugs ×4, `Trailer Adjustment - 15 to 17ft`, stone-guard deflectors; slots 7–20 all `.`) |

## Rego linkage — flat, single-state

- `BY Rego Type` vocabulary in data: **`Small Trailers - Up to 1.02t` (43 rows) / `Large Trailers - Over 1.021t` (427 rows)**; `Registration - NOT REQUIRED` exists in the header-vocab but no active rows use it.
- `BZ Rego ($)`: exactly **$166** for every small trailer and **$283** for every large one — a **QLD-only flat two-band table keyed on ATM**, not a state-aware matrix. `CA Sell inc Rego = Sell + Rego`.
- **HelmLogic implication**: this confirms the v1.4 lesson — treat MPF rego figures as operator hints only; state-by-state rego must keep being computed at quote time from the trailer's **ATM** via the Rego module catalog.

## Boat-to-trailer assignment encoding

- Boat Module (verified live, row 1814 `2350 - Supercab Adventure`) columns **`Std Trailer` + `Trailer - Option 2..10`** (10 slots: 1 standard + 9 alternates) store the Trailer Module **col-C display string** verbatim — e.g. `REDCO Stabicraft Alloy - TA730T-EH (3,500kg)`, `GFAB Tandem Axel Trailer t/s Stabicraft 2350 Series` — with sentinel **`TRAILER NOT REQUIRED`**. Membership verified 3/3 probes against Trailer Module col C.
- The validation vocabulary is the hidden `Dropdowns` **col T**: a 483-entry master flat list headed by the `TRAILER NOT REQUIRED` sentinel, interleaving series banner names with trailer names. Cols C–H hold the same data split per brand (REDCO/TINKA 57 · STACER 40 · DUNBIER 117 · MACKAY 128 · GFAB 39 · NSM CUSTOM 62).
- Same fragility as motors: **reference is by display name** — renaming a trailer orphans every boat that lists it.

## HelmLogic mapping proposal

Target: Trailer-Brand vendors under `data-warehouse/{vendorId}/trailers/{trailerId}` (v1.4 Trailers module + v1.13 `TrailersTableView` columns Image · Code · Name · ATM · Tare · Wheels · Cost · Sell · Margin · Rego).

| MPF | HelmLogic | Confidence |
|---|---|---|
| Col C display name | trailer `name` (+ join key for boat assignments) | HIGH |
| Col E Code | `code` natural key for upsert-by-natural-key imports (⚠️ 14 dups — fall back to name, or composite supplier+code) | MEDIUM-HIGH |
| K ATM / J Tare / I Wheel Size | `atm` / `tare` / `wheels` (ATM drives rego band at quote time) | HIGH |
| BS Total Nett CTD | `cost` | HIGH |
| BW Sell | `sellPriceExclGst`? — **verify GST basis** (BW ≈ round(BV RRP) to $10; if RRP is inc-GST this needs /1.1) | MEDIUM |
| G Image Link | `imageUrl` (native `<img>`, external CDN) | HIGH |
| R–AL Features 1–21 | `specifications` / feature list | HIGH |
| BY/BZ rego | import as `pricingDetail.regoTypeHint` / `regoDollarsHint` **info only** per v1.4 lesson | HIGH (that it must NOT feed quote pricing) |
| CD–DZ Factory Option quads | per-trailer optional features (trailer options on the quote's trailer step) | MEDIUM-HIGH |
| Brand banners (col A) | vendor/range grouping under each Trailer-Brand vendor | HIGH |
| AU–AZ lead times | optional ops metadata; ignore for pricing | HIGH |

### Open questions
1. GST basis of `BW Sell` (and Factory Option `Sell`) — inc or ex?
2. Should the OBSOLETE section (39 trailers, rows 654–695) be imported flagged-inactive or skipped?
3. Composite natural key: `supplier + code` vs display name — the 14 duplicated codes make bare `code` unsafe for upsert-by-natural-key.
4. Trailer factory options overlap with the Factory Options Module's trailer matrices (Dunbier/Mackay/Redco-Tinka/GFab live in BOTH files) — pick one source of truth (see `factory-options.md`).

## Anomalies (this file)

1. **Phantom 1,048,576-row Dropdowns sheet** (real: 645). Also Trailer Module 913 declared vs 695 real; Spec Enquiry 91 vs 34.
2. **Column-number ruler at row 3** inside the data range.
3. **Whitespace-only spacer cells** (single spaces) throughout.
4. **Mixed types in `Boat Size (Mtr)`**: ints (mm-style `1450`), floats (metres `4.3`), strings (`1450 Exp`) — same header, three unit conventions.
5. Duplicate codes (14) and 2 duplicate display names (`MACKAY MLJ Series Trailer - MLJ6000T-14-HB`, `MACKAY PU Series Trailer - PU5000-14-M`).
6. Numeric-formatted text remnants in money columns (` Settlement `, ` Freight `, ` PD ($) `, ` Rego ($) ` header strings repeated inside data-range distincts) — banner rows repeating headers mid-sheet.
7. Factory Option slots 11–20 and Dealer Fit slots 7–20 are headered but 100% empty (`.`) — schema noise.
