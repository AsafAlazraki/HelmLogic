# Service Module.xlsx — Full Decode

> Evidence-grade audit, 2026-07-03. Read-only (`openpyxl read_only=True, data_only=True`).
> File: `tasks/mpf-source/Service Module.xlsx` (30.7 MB, 6 sheets — 1 hidden).
> Companion evidence: `service-small.evidence.json`.

## Verdict up front

**This is a CATALOG, not a ledger.** The headline "63,073 rows" is a phantom: sheet
`Std Service Schedules` reports `max_row=63073` but the **last populated row is 280**
(verified by full scan — zero populated cells after row 280). The 63k dimension is stale
formatting metadata (styled-but-empty rows), a classic Excel `dimension` artifact.
Real content across the workbook:

| Sheet | Reported | Real data | Purpose |
|---|---|---|---|
| Std Service Schedules | 63,073 × 367 | **189 engine rows** (rows 4–280, with blank separators) × ~260 used cols | Per-Yamaha-outboard-model standard service price matrix (20 hr → 1,000 hr) + 5-Year Service Plan + per-model service-parts BOM |
| Schedule Notes | 102 × 50 | ~90 rows | NSM vs Yamaha labour-hour matrices (interval × cylinder count), parts-inclusion R/I matrix, printable 4-cyl/6-cyl service checklists |
| Operation Codes | 1,166 × 73 | **366 op-code rows** in rows 8–504 + orphan legacy block rows 1143–1163 | Flat-rate labor-operation catalog (the `serviceOperations` analog) |
| Oils and Lubes | 50 × 23 | ~30 rows | Consumables price list (oils, fuel, grease, LUBE1–8 + SUND1–7 banded codes) |
| Labour Rates | 63 × 26 | ~20 rows | Hourly-rate card: Retail / PD / Detail / Trade / Internal / per-brand Warranty rates |
| Dropdowns (hidden) | 1,199 × 16 | col C: 1,198 values; col P: 6 values | Data-validation lists (engine model list mirror + pickup/delivery options) |

Cell A1 of the main sheet reads **"Yamaha Price File"** and A2 **"Outboard Spec Enquiry"** —
the whole module is Yamaha-outboard-centric, derived from the Yamaha dealer price file.

---

## 1. Sheet: `Std Service Schedules` (the core matrix)

### Layout
- Row 1: numeric column index ruler (helper row). Row 2: band headers. Row 3: field headers. Data from row 4.
- **One row per Yamaha engine model code** (e.g. `LXF450USA2`, `F30LA`, `9.9F`), grouped in
  blocks by model family with blank separator rows. 189 model rows, **81 distinct family codes**
  (col D, e.g. `6KN`, `6GR`, `6BT`, `63V`, `68F`).
- Year Model values: 2023 (22 rows), 2024 (112), 2025 (23), blank (32). Cylinders: 1–8.

### Column regions (row-2 bands / row-3 headers)
| Cols | Band | Fields |
|---|---|---|
| C–G | identity | `Engine HP` (actually holds the full model code), `Model Code` (family), `Cyl's`, `Year Model` |
| I–AO (9–41) | **11 service intervals**: 20 hr, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1,000 hr | per interval: `CTD` / `Sell` / `Time Allow.` (hrs) |
| AQ–AU (43–47) | **5 Year Service Plan** | `CTD`, `GP ($)`, `Margin`, `Sell`, `60 Repayments` (= Sell/60); band notes `Inflation 2.5%` |
| AW–BA (49–53) | Gear Oil | `Type` (e.g. GL5), `CODE` (LUBE1–8), `Qty`, `CTD`, `SELL` |
| BC–BF (55–58) | Engine Oil | `Type` (10W30/10W40), `Qty w Filter`, `CTD`, `SELL` |
| BH–BJ (60–62) | Sundries | `CODE` (SUND1–7), `CTD`, `SELL` |
| BL–IY (64–259) | **Per-model service-parts BOM** — ~27 repeating part blocks | each block: part-no / `Description` / `QTY` / `CTD` / `SELL` (+ `Labour (Hrs)` on some). Blocks: External Anodes ×3, Internal Anodes (Access) ×3, Internal Anodes (Non-Access) ×3, Oil Filter, Fuel Filter (Boat / Engine / VST ×3), Drain-bung washers ×2, Spark Plugs, Timing Belt + Tensioner, Water-pump Impeller ×2 / Housing ×2 / Repair Kit, Thermostat ×3 + Gasket, OCV Filters. "Not Required" is the explicit null. |
| 261+ | `Motor Support` | **header only — no data in any row** (dead region) |

### Sample rows (real values)
- `LXF450USA2` (6KN, 8-cyl, 2024): 20 hr CTD **453.89** / Sell **761** / 3.5 hrs; 100 hr 1,062.45 / 1,409 / 6.8; 500 hr 1,353.92 / 2,170 / 8.5; 5-Year Plan CTD **19,401**, Sell **29,800**, 60 repayments **496.67**; Gear oil GL5/LUBE8 1.95 L; Engine oil 10W30 7.8 L; Sundries SUND7. Parts BOM incl. anode `6AW-45251-00` ×1 CTD 42.88 / Sell 67.36, oil filter `N26-13440-03` 15.76/24.76, boat fuel filter `90794-46911` 32.72/54.
- `F30LA` (6BT, 3-cyl, 2024): 20 hr 274.65 / 443 / 2.3 hrs; 5-Year Plan 8,835 → Sell 13,771; 60 repayments 229.52.
- Tail row 280: `Z200` (68F, 6-cyl, 2-stroke era) — identity only, pricing columns empty (stale legacy row).

### Pricing arithmetic (verified)
- Interval `Sell` ≈ labour hrs × retail rate ($159 inc GST, see Labour Rates) + included parts + consumables; `CTD` uses the internal rate ($130.09 ex GST). The repeating `…0909` decimals are `X / 1.1` GST-exclusive conversions.
- `Time Allow.` per interval matches the **Schedule Notes → "NSM Engine Service Labour"** matrix by cylinder count (e.g. 8-cyl 100 hr = 6.8 hrs, 500 hr = 8.5 hrs) — NSM deliberately deviates from the adjacent "Yamaha (Suggested)" matrix (Yamaha 8-cyl 100 hr = 5.0).

**Natural key**: engine model code (col C), unique per row within the sheet. Family code (col D) is a grouping attribute, not a key.

---

## 2. Sheet: `Schedule Notes`

1. **Labour matrices** (rows 5–16): two side-by-side tables — *NSM Engine Service Labour* and
   *Yamaha (Suggested) Engine Service Labour* — rows = interval (20 hr…1000 hr), cols = 1/2/3/4/6/8 cyl,
   values = flat-rate hours. This is the master flat-rate-hours table that feeds `Time Allow.`.
2. **Parts-inclusion note** (rows 18–20): "Parts Included in standard Service Cost: Engine oil, Gear oil,
   Oil Filter, Drain Bung Washers, Thermo Gasket, Impeller, Boat Fuel Filter." (1-cyl also includes engine fuel filter.)
3. **"Yamaha Pay As You Go" matrix** (rows 23–39): part-type × interval with codes `R` (replace),
   `I` (inspect), `I/R`, `-` — the rule set for which BOM blocks fire at which interval.
4. **Printable service checklists** (rows 42–98): two columns — "4 CYL 500HR" and "6 Cyl 500HR" —
   `[  ]`-style technician checklists (Carry out / Check while running / After running / Additional work).

---

## 3. Sheet: `Operation Codes` — the `serviceOperations` analog

Header (row 5): `Operation / Option | Op Code | Labour (Hrs) | Labour Cost | Sundry 1 | Sundry 2 | Sundry 3 | Sublet | Total CTD | MU | GP | Labour | Sundry 1 | Sundry 2 | Sundry 3 | Sublet | Sell | Procedure`.

Row 6 holds the **rate constants**: cost-side labour basis **$130.0909/hr** (internal rate ex GST),
sell-side labour **$159/hr** (retail inc GST); sundry sell multipliers 1 / 0.9 / 0.8; sublet markup 0.15.
Cost columns 5–11 build `Total CTD`; sell columns 14–19 build `Sell`; `MU`/`GP` are derived.
Col U `Procedure` holds the repair-order text: `" [   ] <operation name>"`.

**366 coded operations** in rows 8–504, organized in ~35 titled sections:
Labour Estimates (`DFO_LAB_0.05` … in 0.05–N hr steps), Rego Letters/Decals (`DEC-REG-STD/CUS`, `DEC-NAME-CUS`),
Trailer Pre-Deliveries (`PDTR01–07`, e.g. `PDTR04` "PD Trailer - Tri Axle Braked" 2.5 hrs → Sell 417.50),
Trailer Adjustments, Jockey Wheels, Spare Wheels, Dealer Fit Options, Viper Pro winches (`DFO-VIP-*`),
Underwater lights, Seat installs, Yamaha Accessories (`YAM*`, `YAMA-TILT-*`), Speciality Rigging (`RIG-MEC-*`),
Navionics SD, Electronic installs (`DFO-ELE-*`), Battery / Fuel-filter / Yamaha installs, Electric-motor installs,
Engine removals (`DFO-ENG-REM*`), Steering, Rigging (`RIG-MEC-0300` = 3.0 hrs → 510), Trailer ops (`DFO-TRA-*`),
Safety equipment, Washdown kits, Anchor winches, Bimini/covers, Factory-option extra-install charges per brand
(`9SR-FAC-*` Surtees, `9ST-FAC-*` Stacer, `9SC-FAC-RIGGING` Stabicraft), a large Highfield block
(`9HI-CON-*` consoles, `9HI-FAC-SEAT-*` seats, `9HI-ELE/STEER/TOW/ROLL/LAD/TOP-*`),
SUBLETS (`Sublet` estimates $100–$500 at cost = sell/1.267), service labour lines (`LAB_20H{1..8}CYL`),
and Pickup/Delivery (`PU`, `PUDL` Northside 2.2 hrs → $350, `PUDS`/`PUDW` $450, `PUD`/`PUDHSM` $650).

Also non-coded sentinel rows: "Installation Not Required", "Supply Only", "Factory Fit", "NB: LABOUR TO BE QUOTED", "Cables Supplied with Rigging Kit" — all zero-priced.

**Orphan legacy block, rows 1143–1163** (after a ~640-row gap): 17 `DFO-ELE-xxxx` electronics ops
on an older labour basis ($124.36/hr) where **Sell < CTD** (e.g. `DFO-ELE-0202` CTD 253.73, Sell 240) —
clearly stale, pre-rate-rise remnants that were superseded by the DFO-ELE section at rows 158–196. Exclude on import.

**Natural key**: `Op Code`. Caveats: `Sublet` and `Factory Fit` are shared/non-unique codes; the orphan block duplicates the DFO-ELE keyspace with different prices.

## 4. Sheet: `Oils and Lubes`
Header: `Type | Notes | Part No. | Serv Cost | Unit | CTD | MU | GP | Sell`. Contents: Engine Oil 2-stroke/4-stroke
(`90790-BZ404` $7.41 → $15/L), Volvo oil, oil/fuel disposal, fuels, ATF, gearbox oil, bearing grease, then the
**banded codes referenced by the main matrix**: `LUBE1–8` (gear-oil price bands by HP: 2-6 hp … F200-F350) and
`SUND1–7` (sundries bands by HP: 2-5 hp … 250-350 hp, e.g. SUND7 CTD 14.18 → Sell 19.75).

## 5. Sheet: `Labour Rates`
Header: `Description | Code | Actual | Rate (Exc GST) | Rate (inc GST)`. `Actual` = internal cost **$105/hr** for every row.
- Retail (`GEN`), Pre Delivery (`PD`), Detail (`DET`): **144.55 ex / 159 inc**
- Trade (`TRA`), Internal (`PDI`), Internal-PD (`PD`): **130.09 ex / 143.10 inc**
- Warranty general (`WAR`) 138.18/152; per-brand warranty rates: Yamaha 114.55/126.01, Stacer 75/82.50, Stabicraft 100/110, Surtees·Jeanneau·Haines·Highfield 138.18/152, Malibu 110/121, Whittley 85/93.50, Mercury 144.55/159, Volvo 127.50/140.25.
Note `PD` code appears twice (retail-PD 159 vs internal-PD 143.10) — rate depends on context, not code alone.

## 6. Sheet: `Dropdowns` (hidden)
Col C: 1,198-value engine-model list (validation source for the main sheet — includes historical models, which is why it's far longer than the 189 priced rows). Col P: the 6 pickup/delivery option labels matching op codes `PU/PUDL/PUDS/PUDW/PUD/PUDHSM`.

---

## 7. How Boat-Module MPDC / DPDC / PD columns resolve here

From `NSM Boat Module Sample.csv` (verified):
- **`Pre Delivery Code`** (col 273), e.g. `9SB_7002323000_PD` = `{franchise}_{model code}_PD`. This is a **DMS operation-code convention**, NOT a row in Service Module → Operation Codes (no `_PD` boat codes exist there; only trailer `PDTR01–07` do). The *rate* behind it resolves to Labour Rates → `PD` ($159 retail inc / $143.10 internal inc).
- **`Boat PD (hrs)`** (col 274, e.g. 12.0) × **`Labour Rate ($)`** (col 275) = boat PD labour; `Boat Detailing ($)` col 276 → Detail rate (`DET`). `Boat Hand Over (hrs)` col 291 (e.g. 2.0) prices handover labour.
- **MPDC ×50** (cols 483–533) and **DPDC ×30** (cols 535–564) are **checklist text lines stored on the boat row itself** (mechanical: bungs/fuel/steering…; detail: wash & cham, cut & polish…). They do not reference Service Module rows; the Service Module's analogous artifacts are the 4/6-cyl engine-service checklists in `Schedule Notes`.
- Trailer PD on a deal resolves to Operation Codes `PDTR0x` by axle/brake configuration.

## 8. HelmLogic mapping (proposal)

| Source | Target | Confidence | Notes |
|---|---|---|---|
| Operation Codes (366 rows) | `organisations/{orgId}/serviceOperations` | **High** | `opCode`→code (natural key), `Labour (Hrs)`→`flatRateHours`, sell-side labour rate → `hourlyRate` ($159 inc GST → store ex-GST 144.55 per HelmLogic convention), `Sell`→override where ≠ hours×rate (sundries/sublets), `Total CTD`→`cost`, section title → `category`, `Procedure` → customer/RO description. Skip zero-priced sentinels + orphan rows 1143–1163. |
| Labour Rates | rate table on `serviceOperations` config (or org `serviceDefaults`) | High | Multiple rate classes (retail/trade/warranty-per-brand) — current v1.10 `serviceOperations` assumes ONE `hourlyRate`; needs a `rateClass` concept or per-op rate snapshot. |
| Oils and Lubes | `organisations/{orgId}/serviceParts` (consumables, `unit` field) | High | LUBE/SUND banded codes need `hpBand` metadata. |
| Std Service Schedules | new `serviceSchedules` catalog keyed by engine model code: intervals[11]{ctd,sell,hours} + partsBom[] + fiveYearPlan | **Medium-High** | This is the Epic 11.3 ServiceHub-adjacent data source: one doc per engine model, or model→schedule template. Links to Motor Module via Yamaha model code (`LXF450USA2` style = same keyspace as motor imports). |
| Schedule Notes labour matrices | `flatRateHours` derivation table (interval × cyl) | Medium | Could stay embedded in schedule docs; NSM values ≠ Yamaha suggested — import NSM's. |
| Schedule Notes checklists + MPDC/DPDC | service checklist templates (future workshop feature) | Low-Medium | No current HelmLogic surface; park as JSON. |

## 9. Anomalies (Service Module)
1. **Phantom 63k rows** — data ends at row 280; import must bound-scan, not trust `max_row`.
2. **Orphan legacy op-code block** rows 1143–1163: stale rates, **Sell < CTD** (negative margin), duplicate DFO-ELE keyspace.
3. `Op Code` not unique: `Sublet` ×7, `Factory Fit`, blank codes on sentinel rows.
4. Labour Rates code `PD` maps to two different rates (retail vs internal).
5. Col-3 header says "Engine HP" but contains model codes (header/content mismatch).
6. 32 model rows have no `Year Model`; row 280 (`Z200`) has identity but no pricing.
7. `Motor Support` band (col 261) is header-only, no data.
8. Dropdowns model list (1,198) ≫ priced models (189) — most list entries have no schedule.
9. `9SC-FAC-RIGGING` uses Stabicraft franchise `9SC` (matches Price Matrix) while the Boat CSV PD code uses `9SB` prefix for a Stabicraft boat — two different Stabicraft prefixes in the ecosystem.
10. Sublet estimates: cost = sell/1.267 exactly (26.7% markup ≠ the stated 0.15 sublet MU in row 6 constants).
