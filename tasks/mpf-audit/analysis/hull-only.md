# NSM Master Price File — `Hull Only Module.xlsx` — Audit

**Source**: `tasks/mpf-source/Hull Only Module.xlsx` (2.8 MB) — read-only analysis, 2026-07-03.
**Companion**: `boat-module.md` §7–§8 (the Boat Module's Hull Only Pricing block, cols 459–479, is fed by/alongside this file).

## 1. What it is

A **Highfield-only, hull-only (boat-without-motor/trailer) price list**, dated **"As at 16.06.2025"** — a *generated output document*, not a master. Three presentation sheets (one per dealer price level) plus one calculation sheet. It covers **705 Highfield SKUs** grouped under 60 model/series section rows.

This is the printable/dealer-facing counterpart of the Boat Module's Hull Only Pricing block. It contains **no specs, options, motors, trailers or checklists** — pricing only.

## 2. Sheet-by-sheet

| Sheet | Dims | Layout (1-based cols) | Purpose |
|---|---|---|---|
| `Highfield - Retail` | 894×6 | c3 boat name · c4 model code (`HBR 009`) · c6 SELL | Retail (Cash) price list, inc GST |
| `Highfield - Trade` | 894×8 | c3 name · c4 code · c6 SELL · c7 TRADE · c8 TRADE (duplicate — identical in all 705 rows) | Trade list: retail + trade price side by side |
| `Highfield - Sub Dealer` | 894×7 | c3 name · c4 code · c6 SELL · c7 SUB DEALER | Sub-dealer list |
| `Data` | 888×17 | c3 name · c4 code · c5 **cost** (AUD landed) · then (MU, GP $, price) triplets for SELL (c6–8), TRADE (c9–11), SUB DEALER (c12–14), plus c15–16 MU/GP$ and c17 a **second SUB DEALER price** (≈ Sub-Exclusive: SubDealer × 0.975) | The calc engine behind the three lists |

All three presentation sheets and Data hold the same 705 SKU rows in the same order; the presentation sheets are projections of Data.

## 3. Row grain and coverage

- **Grain = SKU (variant)**: `Classic - CL380 HYP - W-W` / `HBC 066` — model × material (PVC/HYP) × colour, identical grain to the Boat Module's Highfield rows and to HelmLogic `variants/{variantId}`.
- **Prefix census**: HBR (Roll-Up) 33 · HBU (Ultralite) 72 · HBC (Classic + Classic FT) 128 · HBE (ZeroJet electric) 4 · HBS (Sport) 198 · HBP (Patrol) 270 · plus 1 `ADV7` row (new model, non-HB code).
- **Section rows** (60) mirror the Boat Module's series/model headers, including Patrol configuration-legend rows (`NB: No Engine Well … OXB inc Bow Step & X/L Transom`).

## 4. Pricing math (verified)

For `HBR 009` (Roll-Up 250 Airfloor PVC WH): cost 1,936.38 → SELL 3,150 inc GST (ex-GST 2,863.6; GP$ 927.25; MU 0.4788 on cost) → TRADE 2,992 = SELL × 0.95 → SUB DEALER 2,598 = SELL × 0.825 → second SUB DEALER 2,533 ≈ 2,598 × 0.975.

Consistent with `Price Matrix.xlsx` Highfield row (Sell MU 0.475, Trade discount 5%, Sub-Dealer discount 17.5%) and with the Boat Module ladder (Cash / Trade ×0.95 / Sub ×0.825 / Sub-Exclusive ×0.975 / AUS Sailing ×0.80). Prices are **inc GST**, hand-rounded to clean figures; GP is computed ex-GST.

## 5. How it differs from Boat Module

| | Boat Module | Hull Only Module |
|---|---|---|
| Role | Master configurator (specs, options, motors, trailers, PD, checklists, pricing) | Generated hull-only **price list** |
| Brands | 9 brands + obsolete history | Highfield only (+1 ADV7) |
| Grain | 2,003 rows (810 current) | 705 SKUs (current only, no OBSOLETE section) |
| Key format | `HBC066` (no space) | `HBC 066` (**space-padded**) |
| Price levels | Cash/Trade/SubDealer/SubExclusive/AUSSailing/Warranty | SELL/TRADE/SUB DEALER/SubExclusive (no AUS Sailing, no Warranty) |
| Freshness | Live master (FX reviewed 06/2026 in Price Matrix) | **Stale snapshot 16.06.2025** — HBC066: cost 7,299.46 vs Boat Module landed 7,224.29; SELL 11,850 vs Cash 11,940 |

## 6. Anomalies

1. **Header/data collision at the top of every sheet**: the header row (`SELL`, `TRADE`, `MU`, `GP $` labels) shares its row with a live SKU (`Roll Up (Airfloor) - RU230KAM HYP - LG` / `HBR 008`) — the leading rows of the first block (RU200/RU230) were deleted or scrolled off, so RU230KAM HYP LG has labels where its prices should be. Data sheet row 1 likewise. Any parser must treat row 1 as *both* header and truncated data, and the RU200/RU230 Airfloor SKUs (HBR 001–008) as **missing** from this file.
2. **Space-padded model codes** (`HBC 066`) vs Boat Module `HBC066` — normalize by stripping whitespace before joining.
3. **Duplicate TRADE column** on the Trade sheet (c7 = c8 in all 705 rows).
4. Filler artifacts: `0` strings in name/code cells on blank separator rows; NBSP cells.
5. **Snapshot drift** vs Boat Module (see table above) — if both files feed an import, the Boat Module figures win.
6. `ADV7` breaks the HB-code convention (code = `ADV7`).

## 7. HelmLogic mapping

| Hull Only element | HelmLogic target | Confidence | Notes / open questions |
|---|---|---|---|
| SKU row | `data-warehouse/LafOLpLb6QIFE856TiD4/ranges/{rangeId}/models/{modelId}/variants/{variantId}` | High | Grain matches exactly; HBR→Roll-Up range `EqcKQ51svI1I2Q5poFdl`, HBU→Ultra-Light `QsGZuVwutEr5yyMkp97j`, HBC→Classic `qo7IePnRzJxjrYyLWhTn`, HBS→Sport `nQ2LE50z9Tbf2uss0Ote`, HBP→Patrol `vfXxDuMpChteKncb7LnG`, HBE→ZeroJet (range missing in HelmLogic — create?) |
| `HBx nnn` code (space-stripped) | variant `sku` / import natural key | High | Same key as Boat Module col 4 |
| Data c5 cost | variant `cost` | Medium | It's an AUD landed figure but **stale vs Boat Module** — prefer Boat Module `Landed Hull Cost` |
| SELL / TRADE / SUB DEALER / c17 | variant `priceLevels` (retail / trade / sub-dealer / sub-exclusive), stored **ex-GST** (÷1.1) per HelmLogic convention | Medium | Open question: preserve NSM's inc-GST rounded figures as display prices vs recompute ex-GST (`sellPriceExclGst` + ceil at finalize can differ by $1–2) |
| Section rows | range/model grouping only | High | No data payload |
| Whole file | **Do not import as a source of truth** — use as a cross-check fixture against the Boat Module import | High | Its real value: an independent 705-SKU reconciliation set for validating the Boat Module → Firestore pipeline (after normalizing keys + accepting the 2025-06 snapshot deltas) |

**Bottom line**: `Hull Only Module.xlsx` is a stale, Highfield-only, price-list *view* of data the Boat Module already carries at higher fidelity. Treat it as reconciliation evidence, not as an import source.
