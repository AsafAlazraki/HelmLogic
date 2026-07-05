# MPF Audit — Rigging Module.xlsx

**Source**: `tasks/mpf-source/Rigging Module.xlsx` (985 KB, 3 sheets)
**Method**: openpyxl 3.1.5, `read_only=True, data_only=True`. Strictly read-only.
**Date**: 2026-07-03

---

## 1. Sheet inventory

| Sheet | State | max_row × max_col | Real rows | Purpose |
|---|---|---|---|---|
| `Rigging Kits` | visible | 3,039 × 65 | 1,284 any-non-empty → **~1,437 kit-like rows, 961 distinct part numbers**, 26 section headers | The rigging-kit master price list + install costing engine |
| `Rigging Spec Enquiry` | visible | 10 × 4 | 2 | One-kit lookup scratch (`Code: 6X3-CL51L-13-05` → CTD 3,151.93 / Sell 4,230) |
| `Dropdowns` | hidden | 820 × 3 | 656 | Single vocab column (`TILLER CONVERSION KITS` header + 656 kit/option names) for data validation |

---

## 2. `Rigging Kits` structure

### 2.1 Layout
- **Row 1** = headers; **row 2** = rate/markup constants (retail MU **0.25**, trade **0.05**, sub-dealer **0.05**, NSM labour rate **$130.09/hr** ex GST); **row 3** = column numbers; data from row 4.
- Data is organised into **26 sections** by embedded pseudo-header rows (description present, `CTD`/`Sell Price` text repeated in the price columns):
  TILLER CONVERSION KITS · MECHANICAL RIGGING KITS to 70HP — Yamaha · to 75HP & Above · Twin Engine · Left Hand Mounts · DIGITAL RIGGING KITS for DEC Engines · HELM MASTER L2/L3/L4 (Bolt-On vs Built-In DES, Black vs Chrome — 8 sections) · STACER (Factory Fit, as at 01.07.2024) · STABICRAFT · SURTEES (+ SURTEES DEC) · Merry Fisher (Season 2024) · Merry Fisher Sport (2023) · Cap Camarat (2023) · Merry Fisher Factory-Motor-Supplied · Jeanneau DB/43 OB · **HIGHFIELD RIGGING KITS (as at 22.05.2023)** · ePROPULSION Aus.

### 2.2 Column map (0-based)
| Block | Cols | Fields |
|---|---|---|
| Identity | 2–4 | `RIGGING KIT DESCRIPTION`, `Part Number` (key), `Build` (Service / Factory / Base List) |
| Kit (supply-only) pricing | 5–12 | `Dealer` (buy), `Factory` (header artifact; actually **Freight**, ≈4% of Dealer), `Kit CTD` (= Dealer + Freight), `MU`, `GP ($)`, `Kit Sell Price` (retail ex GST), `Trade Price` (= sell × 0.95), `Sub Dealer Price` (= trade) |
| Install costing | 14–23 | `NSM Lab` (hrs), `NSM Lab ($)` (hrs × 130.09), `Additional Parts`, `Sundry`, `Total Install CTD`, `Install MU`, `Instal GP`, `Install Retail/Trade/Sub Dealer Sell` |
| Rig + Install rollup | 25–30 | `Total CTD`, `MU`, `GP`, `Sell Price`, `Trade Price`, `Sub Dealer Price` |
| Kit components | 32–39 | 4 × (`Parts & Accessories`, `CTD`) pairs — named component + its cost (e.g. `Rigging Flange, Transom - Black` 41, `Rigging Hose - Black (1 x Mtr)` 47, `Cable Allowance - Length not Specified` 185.87) |
| Inclusions flags | 41, 45–54 | `Fuel Filter` (`Supplied in Rigging Kit` 546 / `Optional` 159), 10 × `Control Cable Length` columns (`Control Cables (Supplied in Kit) - 10 Ft` … `- 23 Ft`, `Engine Harness Supplied in Rigging Kit`, `Not Required`) |
| Legacy | 56 | `Dealer 1/7/22` — frozen 1-July-2022 base cost snapshot for delta tracking |

### 2.3 Key + pricing semantics
- **Natural key**: `Part Number` — 961 distinct. Mostly Yamaha rigging codes with an NSM positional grammar: `703-6Y52S-16-05` = control type (703 side / 704 binnacle / 6X3 concealed / 6X9 DEC…) – gauge kit (6Y5/6Y8/CL5/CL7…) – cable length (ft) – harness length (m); `##` = unspecified length. Prefixes for factory-fit brand kits (`9ST-`, `SUR-`), Jeanneau codes (`Y29E2`), synthetic keys (`9YA_TCK_F20G`), and free text (`Rigging Not Req.`, `Std w Motor`, `Order Parts Individually`).
- All prices **ex GST**. Three price tiers exactly as HelmLogic price levels: Retail / Trade / Sub-Dealer.
- Verified example: Tiller Conversion Kit F20G — Dealer 627.42 + Freight 25.10 = Kit CTD 652.52 → Kit Sell 900 / Trade 855; + 1 hr labour 130.09 → Total CTD 782.61 → Sell 1,060 / Trade 1,007.
- Pseudo-kits with zero price exist by design: `NR - RIGGING KIT NOT REQUIRED`, `SUP - Supplied Standard w Motor`, `Select from Options`.

### 2.4 How kits relate to boats / motors
- **Boat Module** (`Boat Module.xlsx`, 4,731 × 4,144): each motor-option block carries a `Rigging Kit Option` column (repeating every 6 cols from col 312: 312, 318, 324, 330, …) whose values are **the `RIGGING KIT DESCRIPTION` strings** from this sheet (verified: 45+ of 87 distinct values in block 1 match exactly; the rest are `NR`/tiller placeholders). The Boat Module's hidden `Dropdowns` sheet col 25 (`Rigging Kit Option`, 447 values) is a copy of these descriptions — the join is **by display string, not part number**.
- **HP applicability is encoded in section titles and description text** ("up to 70HP", "F75 to F350HP", "150-250HP"), not in a structured column — mirrors HelmLogic's `minHp/maxHp` motor-config need but requires parsing.
- **Parts Module `Dealer Fit Module`**: 255 rigging part numbers are duplicated as Dealer Fit Options (Helm Master / DEC / Mechanical sections) with install labour rolled in — the DFO sheet is the "kit + install as one sellable line" projection of this sheet.
- Brand-specific factory-fit sections (Stacer/Stabicraft/Surtees/Jeanneau/Highfield) price the same kits per boat brand, some with brand-prefixed part numbers.

---

## 3. `Rigging Spec Enquiry` — scratch
Two populated cells beneath a `Code` lookup: CTD 3,151.93 / Sell 4,230 for `6X3-CL51L-13-05`. A VLOOKUP calculator; no dataset. **Do not import.**

## 4. `Dropdowns` (hidden) — vocabulary
One populated column (656 values) starting under `TILLER CONVERSION KITS`: kit display names used for data validation in this workbook and referenced by the Boat Module vocabulary. Derived from `Rigging Kits` — do not import as data.

---

## 5. Proposed HelmLogic mapping

| Item | Target | Rationale | Confidence |
|---|---|---|---|
| `Rigging Kits` rows | **NEW collection** — e.g. `data-warehouse/{yamahaVendorId}/riggingKits/{kitId}` or org-level `organisations/{orgId}/riggingKits` | No existing HelmLogic collection models rigging kits. They are motor-dependent, boat-assignable bundles with 3-tier pricing + install labour — structurally closest to `fitUpItems`+`fitUpPackages`, but the HP-range applicability, control/gauge/cable taxonomy, and Boat-Module references justify a first-class collection. Fields: `partNumber` (key), `description`, `section`/`family`, `build`, `kitCost` (dealer+freight), `sellPriceExclGst`, `tradePrice`, `subDealerPrice`, `installHours`, `installParts`, `installSundry`, `totalSellInstalled`, `components[] {name, ctd}`, `fuelFilterIncluded`, `controlCables`, `hpRange {min,max}` (parsed), `brandScope` | **High** (need for new collection); **medium** on placement (vendor vs org — pricing embeds NSM's shop rate → leans org-level) |
| 3-tier prices | HelmLogic price levels (`getPriceForLevel()` — Retail / Trade / Sub-Dealer) | Identical tier semantics to Motor priceLevels convention | High |
| Install block | `serviceOperations`-style labour (`flatRateHours × hourlyRate`) | $130.09/hr shop-rate × hrs is exactly the serviceOperations derivation rule | High |
| 255 kit-as-DFO duplicates | Deduplicate: rigging kit = source of truth; DFO references kit id | Avoid double-maintenance that already bit NSM (prices drift between the two sheets) | Medium |
| Spec Enquiry, Dropdowns | none / derived | Scratch + projection | Certain |

**Open questions**: (1) Single-vendor (Yamaha) assumption breaks for ePropulsion/ZeroJet sections — org-level collection with `vendor` field probably safer. (2) Should factory-fit brand kits (Stacer/Surtees/…) live with the boat vendor instead? (3) How should `##` (unspecified cable length) kits behave at quote time — prompt for length?

---

## 6. Anomalies

1. **`### NLA ###` embedded in part numbers** (e.g. `6X9-HBS00-BO-1E ### NLA ###`) — availability status stuffed into the key; ~dozens of rows. Strip to a `status: 'nla'` field.
2. **`#N/A` price rows** — e.g. row ~1036 `6X9-CL51L-10-12 ### NLA ###` has `#N/A` in all price columns (dead lookups frozen as text).
3. **Duplicate part numbers with different descriptions** — `Y29E2` appears as both a standalone kit and inside combo strings (`Y29E2 + Y9312`, `Y29E2/Y9312`); combo part numbers are not atomic keys.
4. **Numeric part number** — `7851816805` (Stabicraft row): type drift (number vs string) will break string joins.
5. **`Factory` header actually contains Freight** (~4% of dealer cost) — header/content mismatch.
6. **`Build` column polluted with pasted prices** — expected values `Service`/`Factory`/`Base List`, but 30+ rows contain raw numbers (1330, 2160, 5300 …).
7. **Row-2 constants row** (MU rates, $130.09 labour rate) sits inside the data range — importers must skip rows 2–3.
8. **Repeated pseudo-header section rows** (26) inside the data range, with `CTD`/`Sell Price` text in numeric columns.
9. **String-based Boat-Module join** — kits are referenced by description text; any description edit silently orphans Boat Module rigging options (447-value dropdown copy already drifts from the 1,225 live descriptions).
10. **Stale "as at" dates per section** (2022–2024) — brand sections are updated at different times; freshness is per-section, not per-file.
11. **max_row 3,039 vs ~1,445 real rows** — trailing ghost rows.
