# MPF Audit — Parts Module.xlsx

**Source**: `tasks/mpf-source/Parts Module.xlsx` (40.5 MB, 21 sheets)
**Method**: openpyxl 3.1.5, `read_only=True, data_only=True` (values as last calculated by Excel). Strictly read-only.
**Evidence**: `parts-module.evidence.json` (same directory) — per-sheet headers, key-column counts, 3 sample rows.
**Date**: 2026-07-03

---

## 1. Executive shape

The workbook is NSM's parts-side brain. It contains four distinct layers:

| Layer | Sheets | Role |
|---|---|---|
| **Master working sheets** | `Parts Maintenance`, `Dealer Fit Module` | NSM-curated catalogue + the Dealer Fit Option (DFO) assembly engine. These are the sheets the rest of the MPF reads from. |
| **DMS extract** | `Parts Data Drop` | Raw 26k-row inventory dump from the dealer management system ("As at 27.02.2026") — stock on hand, bin locations, cost/list/retail. |
| **Vendor price lists** | `Highfield`, `BLA - 27.03.2026`, `Viking`, `Oceansouth`, `Frank Marine`, `BLA Price List` (old), `Minn Kota`, `SAW`, `RWB Marine`, `Garmin`, `Lowrance`, `GME Marine PL 9.6.26`, `GME Marine Price List` (old, hidden), `Simrad`, `Hella`, `Camec` | Pasted supplier price files used to source cost (CTD) for the master sheets. 16 sheets, 14 distinct vendors (BLA and GME each appear twice — current + superseded). |
| **Vocabulary / scratch** | `Dropdowns` (hidden), `Parts Enquiry` (hidden) | Data-validation source lists consumed by the Boat Module and this workbook; an interactive one-part price calculator. |

Price-field conventions (consistent across master sheets, all **ex GST** unless noted):
- **CTD** = Cost To Dealer (buy price). **Adj CTD** = CTD after an inflation factor. **Act CTD** = actual all-in cost (parts + labour cost + sundry + sublet).
- **MU** = markup fraction on cost; **GP** = gross profit in dollars.
- **Sell / Act Sell** = NSM retail sell ex GST. `Act Sell ≈ Parts Sell + Labour Ret + Sundry + Sublet`, rounded.
- **Base List / RRP** = supplier list / recommended retail (RRP usually **inc** GST on vendor sheets).
- The `Highfield` sheet is the exception: its Trade/Retail columns are **inc GST** and its cost is **USD** converted at a hardcoded 0.7 FX.

This is the origin of HelmLogic's `'Act Sell'` / `'Act CTD'` field convention on `dealerFitSelections` items.

---

## 2. Sheet-by-sheet

### 2.1 `Parts Enquiry` (hidden) — scratch calculator
- 16 × 15 grid, only 7 populated rows; no dataset. Blocks: part lookup (`NSM OP Code / Supplier / Sup. Code / Min / Max / SOH / Anchor`), a Cost → Landed → MU/GP → Sell what-if, and a Service Operation TTF block.
- The captured example even shows a **negative margin** (cost 367.28 landed 394.30 vs sell 289) — it is a sandbox, not truth.
- **Mapping**: none — do not import. Confidence: certain.

### 2.2 `Parts Maintenance` — THE parts master (working sheet)
- Header row 1; row 2 = column numbers (1–26); data grouped under ALL-CAPS section rows in col C.
- **Rows**: 3,915 non-empty; **3,667 rows with a `Code`**, **3,532 distinct** → ~135 duplicate codes (anomaly §6).
- **Columns** (0-based index): C(2) `Parts & Accessories Module` (display name), D(3) `Supplier` (code), E(4) `Code` (natural key), F(5) `Supplier Description`, G(6) `P&A` (parts cost), H(7) MU, I(8) `CTD`, J(9) MU, K(10) GP, L(11) `Sell`, M(12) `Base List`, N(13) `Install Type`, O(14) `TTF (Hours)`, P(15) `Labour ($)`, Q(16) `Parts CTD`, R(17) `Sundry CTD`, S(18) `Total CTD`, T(19) MU, U(20) GP, V(21) `Parts`, W(22) `Sundry`, X(23) `Labour`, Y(24) `Sell inc Install (if appl.)`, AA(26) `Operation Code`, AB(27) `Operation Description`.
- **Natural key**: `Code` (e.g. `SG002`, `GME-GX700WPK`) — NSM's own op-code, not the supplier part number.
- **Two price points per item**: supply-only (`CTD` → `Sell`) and installed (`Total CTD` → `Sell inc Install`), driven by `Install Type` (top values: `Supply Only - Installation Not Required` 495, `Labour Estimated - (0.5)` 368, `(0.25)` 356, `Propeller Installation` 320…), `TTF (Hours)` × shop rate, plus sundries.
- **Supplier linkage**: `Supplier` column mixes registry IDs and free text — 42 values match Supplier Module `Supplier Id` exactly (YAM 566, LOW 444, SIM 353, HIGHF 328, BBB 200, BLA 127, MIN 120, GME 96 …), but there are non-registry variants: `Yam` (313, case drift of YAM), `HIG` vs `HIGHF`, `NSM`, `Sublet`, `Factory`, `DFO KITS`, and free-text names (`Cross Creative Desig`, `Hookem Fishing`, `Boatcatch Pty Ltd`).
- **Service pipeline hook**: `Operation Code` / `Operation Description` (cols 26–27) mirror the Code/name — these are the DMS service-operation codes.
- **Mapping** (§5): `fitUpItems` + `serviceOperations`. Confidence: **high**.

### 2.3 `Highfield` — vendor price list (with FX)
- Title block rows 1–5 (`Exchange Rate 0.7` at row 1; "Pricing Current as at 8.05.2026"; "Pricing Excludes Freight & Installation"). Header row 6.
- **1,016 rows, 1,016 distinct `Code`** (`HEE022`…). Columns: Code, Equipment, Colour, Category, `Price` (USD), `AUD $` (=Price/0.7), Margin/GP/`Trade (inc GST)`, Margin/GP/`Retail (inc GST)`.
- **Categories**: Console 274, Spare parts 265, Roll bar&Ladder 150, Seat 96, EVA Teak 94, Cover 47, Top 36, EP 34, Tow post 20.
- ⚠️ Inc-GST prices + hardcoded 0.7 FX both violate HelmLogic conventions (ex-GST storage; org `exchangeRates/USD` doc).
- **Mapping**: Highfield vendor accessories under `data-warehouse/LafOLpLb6QIFE856TiD4` (optional features / accessories), converting to ex-GST and dynamic FX. Confidence: **high**.

### 2.4 `Dealer Fit Module` — DFO assembly engine (working sheet)
- Title "Dealer Fit Options" row 5; note row 8: "NB: Additional BMT Dealer Fit Options…". Group row 9 (`Accessory - 1` … `Accessory - 30`), column numbers row 10, header row 11. **350 columns**.
- **Rows**: 2,320 non-empty → **1,795 DFO items** (col D `Code`, 1,791 distinct) + **95 section rows**.
- **Rollup block** (cols 2–18): `Description`, `Code` (key), `CTD`, `Inflation`, `Adj CTD`, `Tot Parts CTD`, `Parts Sell`, `Total Lab` (hrs), `Labour CTD`, `Labour Ret`, `Sundry 1`, `Sublet`, **`Act CTD`**, `MU`, `GP`, **`Act Sell`**, `Rebate`. Verified: GME-GX700WPK → Act CTD 806.50, Act Sell 996 (= Parts 417 + Labour 556.50 + Sundry 16, rounded).
- **Component slots**: 30 × ~9-col groups `Accessory / Code / CTD / Sell / Labour / Lab Hrs / Sundry / Sublet` (slot 1 also carries `Image Link` — northsidemarine.com.au product URLs). Tail: col 290 `Long Description`. Slot usage histogram: most DFOs use 1–6 slots; max observed 26.
- **Sections** (95): MINN KOTA / FUSION / GARMIN / RAYMARINE / LOWRANCE / SIMRAD / NAVICO electronics, BATTERY INSTALLATIONS, plumbing, winches, SARCA anchors, TV, solar, trailer setups, brand-specific (STABICRAFT / JEANNEAU), **rigging-kit sections duplicated from the Rigging Module** (DEC / Helm Master L2–L4 / Mechanical / Tiller — 255 DFO codes are Rigging Module part numbers), TUBE COVER OPTIONS (Highfield), PRE DELIVERY & ENGINE INSTALLATIONS (per Yamaha motor, per Stacer/Stabicraft/Surtees/Merry Fisher/Cap Camarat/Haines model, and **per Highfield model** — `HIGHFIELD - Roll-Up 200 w Airmat Floor` etc.), outboard accessories, engine removals, surveying sublets.
- **Mapping**: `organisations/{orgId}/dealerFitSelections` (it literally is that collection's source — same Act Sell/Act CTD fields); component slots would need a `components[]` array or linked kit doc. Confidence: **very high**.

### 2.5 `Parts Data Drop` — DMS inventory extract
- Header row 1: `As at 27.02.2026 | Franchise | Part | Description | Stock OH | Bin | Daily | MU | GP | List | Retail+ GST`.
- **26,347 rows, 26,244 distinct `Part`** (numbers repeat across franchises → true key = `Franchise + Part`).
- **164 franchise codes** (YAM 5,264; 9ME 3,047; BRP 2,180; BLA 2,056; GEN 1,590; SAW 1,331; BBB 880 …). Only 70 match Supplier Module IDs; `9XX` codes (9HI Highfield, 9ST Stacer, 9ME, 9DU…) are internal DMS franchise prefixes, not registry suppliers.
- `Daily` = current (daily-average) cost; `List` ex GST; `Retail+ GST` inc GST; `Stock OH` + `Bin` = live stock data.
- **Mapping**: `organisations/{orgId}/serviceParts` (parts catalog **with stock**) — near 1:1 field fit. Confidence: **very high**.

### 2.6–2.20 Vendor price lists (15 sheets)

| Sheet | Rows (keyed/distinct) | Hdr row | Key | Price columns | Notes |
|---|---|---|---|---|---|
| `BLA - 27.03.2026` | 14,058 / 14,058 | 3 | `BLA Code` | Dealer Price, Bulk Qty/Price, MU, GP, Base List, RRP, Barcode | Current BLA trade file. `Buy In` flag column. |
| `Viking Price List` | 894 / **860** | 4 | `Part no :` | `BBB Member NETT Buy` only | Buy-side only; 34 duplicate part nos. |
| `Oceansouth Price List` | 2,013 / 2,010 | 8 | `ITEM No.` | Price (Excl. GST), MU, GP, RRP (Incl. GST), Barcode | |
| `Frank Marine Price List` | 685 / 685 | 6 | `Code` | `BBB Price`, Qty | Buy-side only (BBB = Boating Buyers-group pricing). |
| `BLA Price List` | 14,142 / 14,142 | 10 | `BLA Code` | Trade, Bulk Qty/Disc %, Nett Bulk (after 5% S/D), MU, GP, Retail | **Superseded** by `BLA - 27.03.2026`; keep for delta only. |
| `Minn Kota Price List` | 217 / 217 | 3 | `BLA Code` | Trade ex GST, MU, GP, RRP inc GST, Barcode | Section rows in key col; `#DIV/0!` artifacts. |
| `SAW Price List` | 12,340 / 12,339 | 8 | `SAW #` | Stockist Price ex GST, MU, GP, RRP inc GST, Barcode, catalogue page | Sam Allen Wholesale. |
| `RWB Marine Price List` | 5,609 / 5,609 | 6 | `Code` | Price, Nett, Bulk Qty/Disc, Nett Bulk, MU, GP, RRP, catalogue pg | |
| `Garmin Price List` | 1,863 / **1,593** | 3 | `Garmin Part Number` | Dealer Net (ex GST), GM, GP, Base List, RRP (inc GST), UPC | Category section rows; **270 duplicate PNs** (multi-section listings). |
| `Lowrance Price List` | 445 / 445 | 7 | `Part Number` | Trade, Nett, MU, GP, List, Sell, RRP, Barcode + Category/Technology/long Description | ⚠️ `max_row` 65,541 — ghost formatting rows; only 445 real. |
| `GME Marine PL 9.6.26` | 134 / 134 | 4 | part number (col C) | Net Price Ex GST, Margin, GP, SRP Inc GST, **NSM Sell**, Barcode | Current GME file; has NSM's own decided sell. |
| `GME Marine Price List` (hidden) | 127 / 127 | 7 | `PART NUMBER` | Net Price Ex GST, MU, GP, SRP Inc GST, Barcode | **Superseded**; prices differ from 9.6.26 sheet. |
| `Simrad Price List` | 638 / 638 | 7 | `Part Number` | Trade, Nett, MU, GP, Base, Sell, RRP + **Install (Hrs), Sundry** | NSM added install-estimate columns → feeds installed pricing. |
| `Hella Price List` | 1,763 / 1,763 | 4 | `Catalogue No` (+ `Material`) | Nett Price, MOQ, Barcode | Buy-side only. |
| `Camec Price List` | 4,941 / **4,730** | **2** | `Part #` | Trade Price (Ex GST), RRP (Incl GST), UOM, MOQ | Row 1 empty (header detection trap); 211 duplicate part #s. |

**Mapping (all 15)**: supplier cost-source data, not quote-facing catalogue. See §5 — new `supplierPriceLists` structure (or `data-warehouse/{vendorId}/parts` for the few that are quote-facing brands like Garmin/Lowrance/Simrad/Minn Kota).

### 2.21 `Dropdowns` (hidden) — data-validation vocabulary
- 3,720 × 20; column-oriented named lists, no single header row. 5,109 distinct strings.
- Columns: col0 full parts master list (3,719 — mirrors `Parts Maintenance` display names, grouped by the same section titles), col2 `Labour Estimates` (844), col3 accessories/VHF master (2,044), col5 Pre-Delivery & Engine Installation ops (121), col7 PFD options (44), col9 `ANCHOR KITS` (36), col11 rego letters/decals (39), col13 tie-down straps (16), col15 safety-gear packs (6), col19 `PROPELLERS - Yamaha` (287).
- **3,190 of its values are exact `Parts Maintenance` descriptions** — it is a projection of the master, maintained for Excel data validation.
- **Mapping**: do not import as data; its groupings inform `moduleDealerFitCategories` / category chips. Confidence: high (as "derive, don't import").

---

## 3. Which sheets are what (classification summary)

- **Vendor price lists (16)**: Highfield, BLA ×2, Viking, Oceansouth, Frank Marine, Minn Kota, SAW, RWB, Garmin, Lowrance, GME ×2, Simrad, Hella, Camec.
- **Working sheets (2)**: Parts Maintenance, Dealer Fit Module.
- **DMS extract (1)**: Parts Data Drop.
- **Dropdown vocabulary (1)**: Dropdowns (hidden).
- **Scratch/summary (1)**: Parts Enquiry (hidden).

---

## 4. Cross-module references (verified by value matching)

1. **Boat Module ← Parts Module**: `Boat Module.xlsx` main sheet (4,731 × 4,144) has dealer-fit vocab columns whose values are exact `Parts Maintenance` descriptions (via `Dropdowns`): `Tie Down Straps` (5/6 distinct values match), `Boat Rego Decals` (7/8), `Standard Safety Gear` (4/5), `PFD Type` (3/4), `Standard Anchor Kit` (8/9), `Prop Description` (23/24 match; `Prop Part No.` is the Yamaha part). Non-matches are placeholder/`NR` strings.
2. **Boat Module ← Rigging Module**: repeating motor-option blocks carry `Rigging Kit Option` every 6 columns (cols 312, 318, 324, …); values are Rigging Kits `RIGGING KIT DESCRIPTION` strings (45+ of 87 distinct values in the first block match exactly; remainder are truncation/`NR`/tiller variants). The Boat Module's own hidden `Dropdowns` sheet col 25 `Rigging Kit Option` (447 values) is copied from the Rigging Module; col 23 `Propeller Option` (227 values) is copied from Parts Maintenance propellers (227/227 match).
3. **Dealer Fit Module ← Rigging Module**: 255 DFO codes are Rigging Module kit part numbers (whole Helm Master / DEC / Mechanical rigging sections are mirrored as DFOs with install labour added).
4. **Parts ← Supplier Module**: `Parts Maintenance.Supplier` and `Parts Data Drop.Franchise` reference `Supplier Module.Supplier Id` — but only partially (42 exact matches of ~60 supplier values; 70 of 164 franchise codes). See anomalies.
5. **String-based joins everywhere**: the Boat Module references parts/kits by **display description**, not code — renames silently break links.

---

## 5. Proposed HelmLogic mapping (per sheet)

| Sheet | Target | Rationale | Confidence |
|---|---|---|---|
| Dealer Fit Module | `organisations/{orgId}/dealerFitSelections` | Source of the existing `Act Sell`/`Act CTD` convention; sections → dealer-fit categories; add `components[]` for the 30 accessory slots, `imageLink`, `longDescription`, `rebate` | **Very high** |
| Parts Maintenance | `organisations/{orgId}/fitUpItems` (+ `serviceOperations` for Operation Code/TTF/labour) | Curated name/category/cost(CTD)/sell/tier shape matches fitUpItems; install-type + TTF + op code is exactly `serviceOperations` (`flatRateHours × hourlyRate`) | **High** |
| Parts Data Drop | `organisations/{orgId}/serviceParts` | Parts catalog *with stock* (Stock OH, Bin, cost, list, retail); key = franchise+part | **Very high** |
| Highfield | `data-warehouse/LafOLpLb6QIFE856TiD4` accessories/optional features | Vendor-catalog data for the existing Highfield vendor; convert inc-GST → ex-GST, USD via org FX doc (not 0.7 hardcode) | **High** |
| 14 other vendor lists | NEW `data-warehouse/{vendorId}/parts` (or org-level `supplierPriceLists/{supplierId}/items`) | Cost-refresh source keyed by supplier part no + barcode; not directly quote-facing; upsert-by-natural-key per CLAUDE.md import rule. Superseded BLA/GME sheets: import current only | **Medium-high** (open: one collection vs per-vendor) |
| Dropdowns | derive → `moduleDealerFitCategories` / category vocab | It is a projection of Parts Maintenance; importing would duplicate truth | **High** |
| Parts Enquiry | none | Scratch calculator | Certain |

**Open questions**: (1) Should vendor lists live under `data-warehouse` (vendor-shared across orgs) or per-org (NSM's negotiated BBB prices are org-specific — Viking/Frank Marine "BBB Member" pricing argues per-org)? (2) `serviceParts` vs a single unified parts collection — Parts Data Drop overlaps vendor lists (BLA/SAW/GAR franchises) — dedupe strategy needed. (3) Duplicate codes in Parts Maintenance (135) must be resolved before keyed upsert. (4) Are `Rebate` and `Inflation` fields still used? Mostly 0 in samples.

---

## 6. Anomalies

1. **Lowrance ghost rows**: `max_row` = 65,541 but only 445 data rows — formatting/validation stretched to sheet end. Any importer must count real rows, not `max_row`.
2. **Duplicate natural keys**: Parts Maintenance 3,667 rows / 3,532 distinct codes (~135 dupes); Garmin 270 dup PNs (section re-listings); Camec 211; Viking 34; Dealer Fit 4 (1,795/1,791).
3. **Whitespace in keys**: DFO code `' 9HI_HBP 171_PD'` has a **leading space and an internal space** — string-equality joins will miss it. Trim + normalise on import.
4. **Supplier-code drift**: `YAM` vs `Yam` (566 vs 313 rows), `HIGHF` vs `HIG`, plus free-text supplier names (`Cross Creative Desig`, `Hookem Fishing`) and pseudo-suppliers (`NSM`, `Sublet`, `Factory`, `DFO KITS`, `Decals Not Required`) that are not in the Supplier registry.
5. **Stray pasted block in Parts Maintenance col A**: an enquiry fragment (`Rev Props`, `6GS-45970-20`, `PROPELLER - XTO OS…`, `CTD`, `2382.10325`, `SELL`, `3250`, `#N/A`, `HEP002G`) lives in column A alongside legit section labels — column A is NOT a clean category column.
6. **Error artifacts**: `#DIV/0!` (Minn Kota), `#N/A` (Parts Maintenance col A; Rigging Module) survive as text via `data_only=True` — importer must treat as null.
7. **Mixed GST bases**: vendor RRP columns are inc GST; sells/costs ex GST; `Highfield` Trade/Retail inc GST — field-by-field GST normalization required.
8. **Hardcoded FX**: Highfield 0.7 USD→AUD in a cell, not a rate table.
9. **Superseded duplicates kept**: two BLA sheets (14k rows each) and two GME sheets with different prices — importing both double-counts; only the dated ones are current.
10. **Header-row variance**: header row ranges from row 1 (Parts Maintenance, Parts Data Drop, Camec row 2) to row 11 (Dealer Fit); BLA old sheet pads with `\xa0` (non-breaking spaces) in ~25 trailing columns.
11. **String-keyed cross-module joins**: Boat Module references parts and rigging kits by display description (see §4.5) — the single most fragile aspect of the whole MPF.
12. **Section rows inside data ranges**: every master/vendor sheet embeds ALL-CAPS section rows (and Minn Kota embeds them in the key column) — naive row iteration ingests categories as items.
