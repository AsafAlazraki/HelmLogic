# THE ULTIMATE TEST — one quote, two systems, same figure to the cent

**Date**: 2026-07-03 · **Phase 6 of the MPF migration audit** · Evidence in this directory.

The same boat package was quoted by **NSM's Master Price File** (their Excel machinery,
formulas recalculated by LibreOffice from a copy of the workbooks) and by **HelmLogic**
(real Chromium browser driving the production build against live Firestore).
**Every component figure matches to the cent. The package totals are identical: $79,022 inc GST.**

---

## 1. What "a quote in the MPF" concretely is

The MPF has **no interactive configurator and no quote sheet** — verified by a sheet census
of all 17 workbooks (`tasks/mpf-audit/inventory.json`) and by tracing the hidden `Dropdowns`
sheet's row-1 cells, which are vocabulary plumbing, not selection cells:
`Dropdowns!C1 = ='Boat Module'!C950` (feeds the master boat-name list from the pseudo-sale
row) and `T1/V2/X2/Z2 = [7]/[4]/[4]/[5]Dropdowns!…` (external vocabulary pulls from the
Trailer/Motor/Rigging modules). Nothing reads those cells back into any price computation.

**A quote IS the boat row plus display-name joins into the sibling modules.** For this test,
row 829 of `Boat Module.xlsx` (`HBS113`, *Highfield - SP560 (PVC) W-W-WB*):

| What | Cell(s) | Content |
|---|---|---|
| Hull sell ladder (Cash) | `QR829` | **41,340 inc GST** — hand-entered literal (the matrix formula would give 41,266.50; NSM hand-rounds the ladder) |
| Ladder GP% | `QS829` | `=((QR829/1.1)-IY829)/(QR829/1.1)` — live, recalculates to 33.45% |
| Landed hull cost | `IY829` | `=(SUM(IM829:IV829)/IJ829)+IW829+IX829` → **25,010.00 AUD** (USD 16,611 ÷ 0.7 + 300 + 980) |
| Motor menu slot 1 (Recommended) | `KZ829` | `Yamaha - F90XB` → Motor Library by display name |
| Slot-1 rigging kit | `LA829` | `Mech Rigging Kit - 6X3 Concealed (Left Hand) Mount w 6Y5 2 Gauges, 5m Harness, 15' Cables & Filter` |
| Slot-1 prop | `LB829`/`LC829` | live `VLOOKUP`s → Motor Library col 200 → Parts Maintenance → **6FP-45943-00** |
| Standard trailer | `NZ829` | `REDCO Custom / Highfield SP560 Aluminium - TA600-MOB` |
| Dealer-fit lines 1–2 | `OL829`/`OM829` | `Tube Covers to suit PVC Boat - 5.6 Mtr` · `VHF Radio - GME GX750B Hideaway with 1.8m Aerial` |
| Rego band | `KM829` | `4.51m to 6.0m` → Registration Module |

Because the selection lives in the row itself, **no cell writes were needed** — the quote was
"configured" by reading the row's own menus, and component prices were read from the
LibreOffice-**recalculated** copies of each module (mode recorded in `comparison.json`;
recalc-vs-saved drift on row 829: one float-noise digit on the GP%, zero on any price).

## 2. The configuration quoted (identical in both systems)

- **Boat**: Highfield SP560 (PVC), colour W-W-WB (*White / White / White/Blue*) — SKU `HBS113`
- **Motor**: Yamaha F90XB — MPF menu slot 1 / HL "NSM Recommended" Slot-1 card (rigging kit + prop carried by the slot)
- **Trailer**: REDCO Custom / Highfield SP560 Aluminium TA600-MOB (standard; auto-assigned by HL)
- **Dealer fit ×2**: Tube Covers 5.6 Mtr + VHF GME GX750B Hideaway pack
- **Rego ON**: boat band 4.51–6.0 m + trailer band Over 1.021 t (QLD)
- No factory options, no fit-up, price level **NSM Retail / Cash**

## 3. The figures

| Component | MPF (recalculated) | HelmLogic (browser + PDF) | Δ |
|---|---|---|---|
| Boat hull package | 41,340.00 inc GST → **37,581.82 ex** | **$37,581.82** | 0.00 |
| Motor F90XB (NSM Retail) | **17,643.00** | **$17,643** | 0.00 |
| Trailer TA600-MOB (Sell) | **10,430.00** | **$10,430** | 0.00 |
| Dealer fit — Tube Covers (Act Sell) | **4,634.00** | **$4,634** | 0.00 |
| Dealer fit — VHF pack (Act Sell) | **1,016.00** | **$1,016** | 0.00 |
| Boat rego 4.51–6.0 m | **250.00** | **$250** | 0.00 |
| Trailer rego >1.021 t | **283.00** | **$283** | 0.00 |
| **Sum ex GST** | **71,837.82** | **71,837.82** (displayed 71,838) | 0.00 |
| **Package inc GST** | **79,022** (same summation convention) | **$79,022** (browser summary = customer PDF) | **0.00** |

HL customer PDF (`hl-customer-quote.pdf`, page 6–7): Net total excl. GST **$71,838**,
GST (10%) **$7,184**, **TOTAL INVESTMENT (INCL. GST) $79,022** — `hlPdfTotal` verified
equal to the browser figure in `comparison.json`.

## 4. Verdict

**PASS — parity to the cent.** Every catalog figure the MPF quotes for this package is the
figure HelmLogic quotes, and the assembled package total is identical. The one presentational
difference (HL prints the ex-GST package rounded to whole dollars) sits on top of an
underlying sum that matches exactly (the unrounded boat line $37,581.82 is visible in both
the browser summary and the PDF).

## 5. Findings (all deltas ≠ 0 explained; see `comparison.json → findings`)

1. **GST basis (pre-documented open question)** — MPF hull-ladder prices are inc GST, but motor
   NSM Retail / trailer Sell / dealer-fit Act Sell / rego SELL are stored raw in HelmLogic and
   have 10% applied on top. Both systems agree on every raw figure; NSM must confirm the
   intended GST basis of those columns (rego is GST-free by law — today HL taxes it).
2. **Rego band divergence** — HL's RegoPicker auto-matches *Recreational Vessel — 4.5 m to 8 m*
   ($163 ex GST, QLD Transport seed) for the 5.6 m hull; the MPF band *4.51 m to 6.0 m* ($250,
   imported in Phase 4 as `data-warehouse/qld-transport/regoTypes/mpf-rego-2`) sits in the same
   dropdown and was selected manually for this test. NSM should reconcile $250 vs $163.
3. **Cosmetic display bug** — the Step-6 *Powertrain* line renders the stale
   `selectedMotor.sellPriceExclGst` ($13,912.21) instead of `getPriceForLevel()` ($17,643).
   Card, running total, finalize payload and PDF are all correct.
   `src/components/highfield-quote-flow.tsx` ~line 2934.
4. **Routing bug** — the org-scoped route `/{orgSlug}/modules/{id}/quote/{modelId}` loses
   `?range=&vendor=` in flight (OrgSlugLayout's slug correction replaces the pathname without
   search params) → permanent "Context Error". The plain `/modules/…` route works and was used.
   `src/app/(app)/[orgSlug]/layout.tsx` line 36.
5. **MPF-side hand-rounding** — the SP560 Cash 41,340 is a hand-entered ladder literal
   (formula-expected 41,266.50, +73.50). HL snapshots the listed price rather than recomputing —
   correct per the v1.4 "snapshot, don't recompute" rule.

## 6. Evidence files

| File | What |
|---|---|
| `mpf-quote.pdf` / `mpf-quote.png` (+ `-fullpage`) | THEIR system: the actual Boat Module sheet, reduced to the quote columns of row 829, LibreOffice-printed (Cash **$41,340.00**, motor/rigging/prop/trailer/DF/rego visible) |
| `mpf-figures.boatrow.json` / `mpf-figures.components.json` | Recalculated cell values + provenance (file/sheet/row/col) for every component |
| `hl-step1.png` … `hl-step5.png`, `hl-step1b-colour-rego.png` | OUR system: every quote step in the real browser |
| `hl-summary.png` / `hl-summary-total-closeup.png` | Step-6 summary with **$71,838 / $79,022 INC GST** |
| `hl-customer-quote.pdf` (+ `-page1/2.png`, `-investment-page.png`, `-totals-page.png`) | The generated customer proposal PDF — the side-by-side partner to `mpf-quote.png` |
| `hl-proposal-view.png`, `hl-run-notes.json` | Finalized proposal view + machine notes of every selection made |
| `comparison.json` | Config, both systems' figures, deltas, interpretation, findings, `hlPdfTotal` |

Reproduce: MPF side `scripts/mpf/ultimate-test/01…05-*.py` (works on `/tmp/ultimate` copies;
sources in `tasks/mpf-source/` untouched); HL side `tests/ultimate-test.spec.ts` via
`E2E_BASE_URL=http://localhost:9002 npx playwright test tests/ultimate-test.spec.ts --config=playwright.evidence.config.ts`.
