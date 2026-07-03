# Motor Module.xlsx — Evidence-Grade Analysis

**File**: `tasks/mpf-source/Motor Module.xlsx` (33.8 MB) · 5 sheets · analyzed 2026-07-03 with openpyxl 3.1.5 `read_only=True, data_only=True` (cached values only; strictly no writes).
**Companion evidence**: `motor-trailer-fo.evidence.json` in this directory.

---

## Sheet inventory & real extents

| Sheet | State | Declared dims | Real extent | Purpose |
|---|---|---|---|---|
| Motor Library | visible | A1:AAI2186 (2,186 × 711) | **last data row 628, last headered col YA (649)**; 509 non-empty rows; **376 motor data rows** + ~130 section banners | Master motor catalog + full cost/price/PD/service model |
| Rebate Programs | visible | C4:C16 | 13 campaign names | Feeds Motor Library col Y `Rebate Program` |
| Dropdowns | hidden | A1:R2094 | 2,094 rows, 9 populated cols | Flattened lookup lists consumed by Boat Module validations |
| Yamaha_Dealer_Current | hidden | A1:X267 | 266 rows | Pasted Yamaha **CONFIDENTIAL DEALER PRICE LIST** (Jul-2024 + Jan-2024 side by side) — **stale** |
| Data Drop | hidden | C1:D4 | 3 unit rates | Labour-Internal $130.09/hr, Oil 4-Stroke $7.41/L, Fuel 95 $2.20/L |

Declared rows 629–2,186 and columns 650–711 of Motor Library are **phantom formatting** (verified by full scan: last non-empty row = 628).

## Motor Library layout (the tricky part)

- **Rows 1–3 are NOT headers**: col A carries audience banners `Yamaha - Retail` / `Yamaha - Trade` / `Yamaha - Commercial`; row 1 also carries a column-number ruler (C=1, D=2, …, YA=649); row 3 has the `PRE DELIVERY CHARGES` banner over col AD.
- **Row 4 is the real header row.**
- Data starts row 5, interleaved with **section banner rows** (col C set, col D empty): `Four Stroke Models`, `YAMAHA - XTO Offshore`, `TWIN RIG OPTIONS - …` (5 variants), `VMAX SHO - Forward Orders Only`, `EPROPULSION - Electric Outboards`, plus ~100 boat-package banners (`SIG 620F w Yamaha - F150XCB`, `Powerplants - Merry Fisher`, Jeanneau/Cap Camarat powerplants…). Blank spacer rows sit between models.

## Natural keys

- **Col D `MODEL`** = Yamaha model code (`F250XSB`, `T60LC`, `XF450USA`) — the natural key, BUT **only 279 distinct across 376 rows**. Duplicates are systematic: the same code re-appears under twin/triple-rig sections, white-cowl variants and campaign re-lists; twin-rig rigging-kit codes (`12L3AI`, `16L3AJ`…) repeat up to 7×. An importer must dedupe with section context or priority rules.
- **Col C `MODEL` (display)** = `Yamaha - {code}` (e.g. `Yamaha - F225UCB`) — this exact string is what the **Boat Module's motor columns store** (see linkage below).
- Col FH `Alternate Model Code` exists for aliasing.

## Column map (649 headered columns, by band)

| Band | Columns | Content |
|---|---|---|
| C–Q | identity + specs | C/D model, **E HP Rating**, **F Shaft Length**, G Cylinders/Displacement, H Engine Colour, I Image Link (yamaha-motor.com.au CDN), **J Control** (steering), K Starting, L Tilt & Trim, N Fuel Tank, O Prop (default), P Sales Install, Q Supplier |
| R–AA | landed cost chain | R Dealer List → S Holdback 3% → T Store Price → U DIGS → V Dealer Buy → W Freight ExGST → X Landed CTD → Y Rebate Program / Z Rebate Discount → **AA Nett CTD** |
| AC–AV | pre-delivery (PD) | AC PD Operation Code (`YAM_PD_F2.5B`), labour hrs/$, oil, fuel, flusher, 4 parts slots, detailing, sundry → **AV Total PD Allowance** |
| AX–AZ | totals | **AX Total CTD** (true landed cost), AY MU, AZ GP |
| BB–BY | **five price levels** | see table below |
| CI–CY | install / removal / PDI | Installation description + Op Code + TTF + labour + sundries → Install CTD / **Install Sell**; Engine Removals; PDI cost splits |
| DA–EX | **Rigging Option 01–50** | rigging-kit *description strings* (Rigging Module vocabulary); `.` = empty slot |
| EY–FC | accessory codes | FLUSHER, COWL COVER, MOTOR SUPPORT, FUEL FILTER, TILT LIMIT SWITCH |
| FF–FI | extra specs | WEIGHT, REV RANGE, Alternate Model Code, Gearbox |
| FT–GR | **Additional FO's 01–25** | fuel tanks / fuel lines (sparse) |
| GT–KO | **Prop Option Default + 02–100** | propeller *description strings* (`PROPELLER - Saltwater T II SDS - 15"`) |
| KQ–SP | service parts matrix | 20Hr–1,000Hr labour + ~25 part groups (oil filter, anodes ×7 types, impellers, thermostats…), each `Description/Qty/Cost/Sell` |
| TZ–YA | service schedules | Schedule Group; per-interval Labour/Parts/Sundry/Total for 3-month→10-year services; 6-Year Service Plan (total, indexed, per-month); Tech Instructions + Invoice Text per interval |

## Price-level columns → HelmLogic `priceLevels`

Probed values (row 6, F2.5SMHB / row 8, F4SMHA):

| MPF column | Header | F2.5SMHB | F4SMHA | HelmLogic |
|---|---|---|---|---|
| BC | **NSM Retail** | 1,485 | 2,055 | `hull_cash` → "NSM Retail" ✅ |
| BF | Sell Price (retail − rebate − discount) | 1,468 | 1,936 | *(no slot — campaign price, see open questions)* |
| BL | **Trade Price** | 1,468 | 1,901 | `hull_trade` AND `hull_subdealer` → "Trade Price" ✅ |
| BS | **Commercial Price** | 1,359.79 | 1,885.68 | `hull_commercial` → "Commercial Price" ✅ |
| BY | **Boating Alliance Price** | 1,359.79 | 1,885.68 | `hull_boating_alliance` → "Boating Alliance Price" ✅ |
| AX | Total CTD | 1,219.32 | 1,606.96 | `cost` ✅ |

**Decisive corroboration** — the hidden `Dropdowns` sheet enumerates the exact same five levels per motor: `C = Yamaha - {model}`, `D = NSM Retail`, `E = BMT Sell`, `F = BMT Trade`, `G = BMT Sub Dealer`, `H = Commercial`. Note **BMT Trade == BMT Sub Dealer** in every probed row, which is precisely why HelmLogic maps `hull_trade`/`hull_subdealer` to the same "Trade Price". Confidence: **HIGH**.

## Motor specs & compatibility vocabularies

- **HP Rating (col E)**: 239 ints + 5 floats + string forms — `2 x 70` … `2 x 450`, `3 x 250/300/350`, `Electric`. ⚠️ MPF uses **lowercase letter `x`** (`2 x 300`); the HelmLogic lesson cites `2 × 300` (multiplication sign) — `getMotorHp()` must accept both.
- **Shaft (col F)**: `15"`(14) `20"`(72) `25"`(137) `30"`(78) + `LS`/`SS`/`XS` and triple-rig composite `25" / 30" / 25"`(8).
- **Control / steering (col J)** — feeds HelmLogic `steeringType` compatibility: `Tiller handle`(44), `Remote mech`(66), `Mech with Hydraulic Steering`(13), `Mech. Tie Bar Required for Steering^`(4), `DEC - Digital Electronic Control`(18), `DEC with Hydraulic Steering`(12), `DEC with Digital Electro Hydraulic Steering`(12), `DEC with Digital Electric Steering`(101), `In Box - 703 Remote`(2), `DBW`(5), `SBW`(7).
- **Starting**: Manual / Electric / `Manual (E-Kit OP)` / `Manual & Electric`. **Tilt & Trim**: TotalTilt(135), Power Trim & Tilt(95), Manual(19), Power Tilt(3), TotalTiltTM(2).
- **Supplier (col Q)**: Yamaha 234, Jeanneau 109 (factory-fitted powerplants), EPROPULSION 32.

## Prop / rigging linkage

Rigging Options (50 slots) and Prop Options (100 slots) hold **description strings**, not part codes — they join to the Rigging Module / parts catalog by description (`Mech Rigging Kit - 703 Side Mount w 6Y5 2 Gauges, Cables & Filter (up to 70HP)`, `PROPELLER - Alum K Series (Light Hulls) - 13"`). The Boat Module carries its own per-motor-slot `Prop Part No.` + `Prop Description` pairs (real Yamaha part numbers like `6CE-45976-20`), so props resolve to part numbers only via the Boat Module or the Dropdowns propeller list (1,906 entries, col P).

## How the Boat Module references motors

Boat Module (`Boat Module.xlsx`, sheet `Boat Module`, header row 1; verified live at row 1814 "2350 - Supercab Adventure") has `Recommended Motor Option` + `Motor Option 2..13` (13 slots, not 12). Each stores the Motor Library **col-C display string** — `Yamaha - F225UCB`, `Yamaha - F150XSA + LF150XSA` (twin rig), sentinel `NR - ENGINE NOT REQUIRED`. Each slot has adjacent `Prop Part No.` / `Prop Description` columns. The validation vocabulary is the hidden Motor `Dropdowns` col C. **Reference is by display name, not part number** — renaming a motor in the library silently orphans boat rows.

## HelmLogic mapping proposal

| MPF | HelmLogic | Confidence |
|---|---|---|
| Col D `MODEL` | motor doc natural key (Part Number equivalent for Yamaha MPF imports; keep read-only in inline edit per v1.14) | HIGH |
| Col C display string | display name; also the join key to decode Boat Module motor slots | HIGH |
| BC/BL/BS/BY | `priceLevels` per the table above | HIGH |
| AX Total CTD | `cost` | HIGH |
| E HP Rating (via multi-engine parser) | `minHp/maxHp` compat inputs + HP display | HIGH |
| J Control | `steeringType` | MEDIUM-HIGH — vocab needs normalization to HelmLogic's enum |
| F Shaft | shaft spec | HIGH |
| DA–EX rigging, GT–KO props | rigging/prop option lists (description-keyed) | MEDIUM — need part-number resolution via Dropdowns/Boat Module |
| KQ–YA service matrix | v1.10+ `serviceOperations` seeding candidate (labour + parts per interval per motor) | MEDIUM — separate epic |

### Open questions
1. **BF `Sell Price`** (campaign-discounted retail) has no HelmLogic price level — import as time-boxed promo or ignore? Rebate campaigns carry validity dates (col Y + Rebate Programs sheet).
2. Whole-dollar BC/BF/BL values look **GST-inclusive** (RRP+Freight Inc GST feeds BC) while HelmLogic stores `sellPriceExclGst` — confirm the intended divide-by-1.1 (or that motor levels are stored inc-GST intentionally in the current importer).
3. Dedupe policy for the 51 duplicated model codes (prefer first occurrence under `Four Stroke Models`? skip campaign re-lists?).

## Anomalies (this file)

1. **Phantom extent**: 2,186 declared rows vs 628 real; 711 declared cols vs 649 headered.
2. **Header at row 4** with banner/ruler rows above and section banners inside the data range — naive header-row-1 importers read garbage.
3. Float dust everywhere (`1155.0002541000001` Dealer List) — cached formula outputs, round on import.
4. **Yamaha_Dealer_Current is stale** (effective 1 Jul 2024 / 30 Jan 2024) while the visible library carries Jun-2026 campaigns — never import it as current cost.
5. `.` placeholder strings fill unused option slots (thousands of cells) — must be treated as empty.
6. Rebate Programs sheet mixes expired (2025) and current (Jun-2026) campaigns with no status flag other than the date embedded in the name.
