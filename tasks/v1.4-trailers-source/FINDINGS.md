# Trailer Module.xlsx — Findings

> Source: `tasks/v1.4-trailers-source/Trailer Module.xlsx` (6.58 MB, via Git LFS)
> Parser: openpyxl — all values read with `data_only=True`

## 1. Workbook shape

| Sheet | Dims | Purpose |
| --- | --- | --- |
| `Trailer Spec Enquiry` | 33 × 15 | A spec-enquiry form template — not data |
| `Trailer Module` | 3563 × 385 | **Main dataset** — every trailer + its pricing, features, options, rego fields |
| `Dropdowns` | 617 × 18 | Controlled vocabulary driving data-validation pickers |

## 2. Brand / Series / Trailer hierarchy

The sheet is **one flat table** but it's visually grouped by Brand → Series → Trailer. Brand/Series rows have a name but no `Code`; trailer rows have a `Code`.

Top-level brand buckets (from `Dropdowns!R1`):
- REDCO / TINKA TRAILERS
- STACER TRAILERS
- DUNBIER TRAILERS
- MACKAY TRAILERS
- GFAB TRAILERS
- NSM CUSTOM TRAILERS
- DUNBIER / HAINES BMT TRAILERS (package-only)
- OBSOLETE TRAILERS (discontinued)
- TRAILER NOT REQUIRED (sentinel)

Counts (rough, best-effort grouping):
- **~455 total trailer rows**
- **~53 series** across ~7 active brands

## 3. Column structure (main sheet)

### Identity + specs (cols C–O)
`Brand/Make/Model`, `Supplier`, `Code`, `Long Description`, `Image Link`, `Boat Size (Mtr)`, `Wheel Size`, `Tare (Kg)`, `ATM (KG)`, `Winch`, `Between Guards (mm)`, `Trailer Length (Mtr)`, `Trailer Plug`

### Trailer features (cols R–AL)
21 free-text "Trailer Features" columns (usually one summary paragraph in col R, rest empty).

### Pricing waterfall (cols AN–CA) — **not a price-level model**
```
Dealer → Discount → Settlement → Nett Price → Freight → Landed
  → PD (Operation, Hrs, $)
  → Rego Label Holder + Cost, R Clip + Cost, Parts 3/4/5 + Cost, Sundry, Detailing
  → Total PD Charges
  → Total Nett CTD → MU% → GP → RRP → Sell
  → Rego Type → Rego $ → Sell inc Rego
```

This differs from the Yamaha / MPF price-level structure in the design doc. We need to decide whether to:
- **A)** Flatten to a single "Sell" per trailer and layer price levels on top (like motors), or
- **B)** Store the full waterfall and let the org-level settings pick which step is "sell".

### Factory Options (cols CD–FX)
20 repeating blocks of `Name | Description | Cost | Sell`.
**217 of ~455 trailers** have at least one factory option populated. Example: `EX050ADDG — SPARE WHEEL & CARRIER - 13" 155 Multifit — cost $315 / sell $440`.

### Dealer Fit Options (cols FZ–GS)
20 columns, one name per slot (e.g., "Trailer Plug - 7 Pin Flat Plug", "Trailer Adjustment - 12 to 14ft"). Most slots are `.` (placeholder for "not applicable"). These are **per-trailer**, not module-level as the current design doc assumes.

### Registration / compliance (cols KE onward)
Embedded rego form fields — "Is the trailer imported?", "VIN", "Tare (kg)", "Tyre Size", "ATM", "Under 2.5m Wide", "Fire Extinguisher?", "Gas Appliances Installed?", "Does trailer comply with VSB1", "Registered by", etc. These are **not catalog data** — they're data-capture fields for when a trailer is registered.

### Noise
- Row 2 is blank, Row 3 is a manual column-index row (1, 2, 3...).
- Cols 257–290 are all `\xa0` (non-breaking space) spacers.
- Cached cross-workbook formulas reference `[Parts Module.xlsx]`.

## 4. Implications for the v1.4 design doc

The current design in `tasks/v1.4-trailers-module-design.md` assumes:
- ❌ **One Excel file per brand.** Reality: one combined file.
- ❌ **Yamaha-style price levels (Retail / Trade / Sub-Dealer / etc.).** Reality: a pricing waterfall with one "Sell" value.
- ❌ **Module-level dealer fit categories only.** Reality: dealer fit items are attached per-trailer in the source (though they're the same 5 reusable items).
- ⚠️ **Flat brand → trailer hierarchy.** Reality: brand → series → trailer (three levels).
- ✅ **Multi-brand single module.** Correct direction.

## 5. Decisions we need from the user before coding

1. **Series** — store as a sub-collection (`data-warehouse/{vendorId}/series/{id}/trailers/{id}`) like boat ranges, or as a `series` field on each trailer doc? Recommendation: sub-collection, matches the Highfield `ranges → models → variants` shape.
2. **Pricing model** — (A) flatten to single Sell + Rego and map price levels later, or (B) ingest the waterfall fields verbatim for audit? Recommendation: (A) for the UI; store raw waterfall as `pricingDetail` for auditing.
3. **Factory vs Dealer fit options** — keep separate (Factory = vendor-catalog, Dealer = org-configurable overlay) or merge into one "options" set per trailer? Recommendation: keep separate — Factory stays with the trailer in `data-warehouse`, Dealer Fit populates the module's dealer fit categories.
4. **Registration / compliance block** — out of scope for v1.4 catalog import, or keep as a free-form `registrationFields` map per trailer?
5. **Obsolete + Trailer Not Required rows** — filter out on import, or preserve with an `isActive: false` flag? Recommendation: preserve with flag so historical quotes still resolve.

Once you confirm (1)–(5), I'll update the design doc and start the importer.
