# NSM Master Price File — `Boat Module.xlsx` — Evidence-Grade Audit

**Source**: `tasks/mpf-source/Boat Module.xlsx` (24.4 MB) — read-only analysis, 2026-07-03.
**Companion evidence**: `boat-module.evidence.json` (full 678-column map, block indices, brand counts, two complete sample rows, Dropdowns decode).
**Companion doc**: `hull-only.md` for `Hull Only Module.xlsx`.

---

## 1. Workbook shape

| Sheet | Declared | Actual content | Notes |
|---|---|---|---|
| `Boat Module` (visible) | 4,731 rows × 4,144 cols | **2,301 rows × 678 cols** | Col 678 literally contains an `END` marker. Everything beyond is phantom (stale dimension). |
| `Dropdowns` (hidden) | 3,479 rows × 26 cols | 6 populated columns | Data-validation vocabularies (see §5). |

**Header layout** (unusual — three header rows plus in-data header repeats):

- **Row 1** — block headers (`BOAT`, `Model Code`, `STANDARD FACTORY INCLUSIONS - 01`…).
- **Row 2** — a `Check Code Referance` [sic] numbering row: column *N* carries check code *N−2*. A stale duplicate fragment (codes 589–618) floats at cols 703–732 in the phantom zone.
- **Row 3** — repeated header text, except col 3 which holds the first brand marker `STACER`.
- **Data starts at row 4.**
- **Brand divider rows** re-appear mid-data (rows 143, 200, 226, 233, 248, 262, 278, 955, 1005). Each is a *full repeated header row* (~610 non-empty cells) with the brand name in col 1 and — critically — **brand-specific relabelling of the spec and cost columns** (see §2 block 4 and §10).

## 2. Full column layout (blocks, exact indices)

Real data occupies columns 1–678. Per-column headers, fill counts and value samples for every column are in `boat-module.evidence.json → column_map`. Block summary:

| # | Cols | Block | Internal structure |
|---|---|---|---|
| 1 | 1 | Brand section marker | 9 divider rows only (`STABICRAFT` … `OBSOLETE`); Stacer opens the sheet without one |
| 2 | 2 | — | always empty |
| 3 | 3–6 | Identity | `BOAT` display name · `Model Code` (natural key) · `Matrix` (brand key → `Price Matrix.xlsx`) · `Image Link` (URL) |
| 4 | 7–21 | Hull specs | **Labels are brand-dependent** (redefined by each divider row). Generic: HullLength, Beam, Depth, ImageType(10), LOAincEngine, LOAonTrailer, HOT, [14 unused], FuelCapacity, HullWeightDry, MaxMainMotorWeight, [18 unused], Bottomsides, Topsides, Transom. Highfield relabels: 7=OA Length, 8=Beam, 9=Tube Dia., 11=Int Length, 12=Int Width, 13=Deadrise, 16=Max Load, 17=Max People, 19=Boat Weight, 20=Air Chambers. Values are unit-bearing strings (`46 kg`, `65 ltr`, `15 deg`). |
| 5 | 23–74 | Standard Factory Inclusions | Title col 23; SFI-01…51 at 24–74, free text one item per cell (inflatables often pack everything into SFI-01); col 74 usually the spec-change disclaimer |
| 6 | 76–241 | Factory Options | Title col 76; FO-01…165 at 77–241. Cells hold **option codes** (`VWRAP01`, `BIM35PL`, `HEC001-BG`, `CAPC 10.5WA26-264`) keying into `Factory Options Module.xlsx`; `.` = empty slot |
| 7 | 243–259 | Landed-cost chain | Currency, EX Rate, Duty, [246], Base Cost, Factory Discounts ×2 (248/249), Boat Prep, Base Freight, Documentation, Fumigation, Ocean Freight, Fuel Surcharge, Other Charges (factory currency) → Other Chg $A, Road Freight (AUD) → **Landed Hull Cost** (AUD). Divider rows relabel several of these per brand (Highfield: `ABP Compl.`, `Factory Pre Rig`, `Cav Plate Ext`, `Stamp Duty`, `Devanning`) |
| 8 | 261–264 | Current factory promos | Promo name/validity, Full Rebate, Factory Contribution, NSM Contribution (all inc GST); only ~70 rows populated |
| 9 | 266–271 | Markups | HO-MU, BMT-MU, Factory Options-MU, Dealer Fit Options-MU, Admin Load, Warranty Adj — per-row copies of the brand's `Price Matrix.xlsx` row |
| 10 | 273–278 | Pre-delivery header | Pre Delivery Code (`{franchise}_{modelCode}_PD`, e.g. `9ST_SP309S2SP_PD`), Boat PD hrs, Labour Rate (~$130.09/hr), Boat Detailing $, Fuel Allocation L, Tilt Limit Switch |
| 11 | 280–289 | P/D Parts & Accessories 01–10 | Display-name refs to Parts Module items fitted at pre-delivery; `NR - Not Required` / `.` sentinels |
| 12 | 291–297 | Handover | H/O hrs, Tie Down Straps, H/O Parts ×2, H/O Other-1, Sundry Charges-1 $, Promo Gear Allowance $ |
| 13 | 299–300 | Registration | Boat rego **length band** (`Up to and inc 4.5m` …), rego decals option |
| 14 | 302–306 | Safety gear | Adults, Safety Gear water class, PFD qty, PFD type, Anchor kit |
| 15 | 308–316 | Motor envelope + Motor Option 1 | Min HP, Max HP (strings `25 HP`), Shaft Lgth (`S/SS/LS/XL`, `Sng UL / Twin XL`), Eng Configuration (Tiller/Remote), Recommended Motor Option, Rigging Kit Option, Prop Part No. (Yamaha part#), Prop Description, Engine Hole |
| 16 | 317–388 | Motor Options 2–13 | 12 blocks, **6-col stride**: [spacer, Motor Option N, Rigging Kit Option, Prop Part No., Prop Description, Engine Hole]; block N starts at col 318+6(N−2); `NR - ENGINE NOT REQUIRED` fills unused slots |
| 17 | 390–399 | Trailer options | Std Trailer + Options 2–10; display-name refs with the trailer code embedded (`TALS749S13 - T Light Alloy Short 749 ATM…`, `REDCO Sportsman - RE1213`); `TRAILER NOT REQUIRED` sentinel |
| 18 | 401–443 | Additional Dealer Fit Options | Title col 401; Lines 01–42 = display-name refs to dealer-fit items (`Tube Covers to suit Hypalon Boat - 3.8 Mtr`) |
| 19 | 445–450 | Deposit payment schedule | Fractions summing to 1.0 (e.g. Highfield 0.3 confirmed / 0.7 handover; Stacer 0.2 / 0.8) |
| 20 | 452–457 | Factory lead times | Lockout / Build / Completion / Shipping / Estimated total, in days |
| 21 | 459–479 | Hull Only Pricing | (price **inc GST**, GP% ex-GST) pairs: Cash, Trade, Sub Dealer, Sub (Exclusive), AUS Sailing, Warranty, Spare 2–5 (`#VALUE!` junk) |
| 22 | 481–514 | Paint & Graphics | Opt 01–30 codes (`GLOSS-DB`, `SUR-SOLID-White`, `SIG-HCOL-BW`) or plain text; 512–514 `NB: Leave Blank` |
| 23 | 516–550 | Pre-Delivery tiers ×3 | Basic @516, Standard @528, Complex @540; each 11 cols: Description, PD Code (`PD-{BRAND}-{BAS|STD|COM}`), Est Hrs, Labour $, Parts CTD, Sundry CTD, Sublet CTD, Total CTD, GP %, GP $, **Sell (inc GST)** |
| 24 | 552–556 | Engine labour allowances | Motor PD Labour, Motor Install Labour, Rigging Kit Labour, Total Engine Labour Allowance (hrs) |
| 25 | 558–608 | **MPDC** | *Mechanical Pre-Delivery Check List* — 50 lines of workshop checklist text (`Clamps tight`, `Check lock port to STB`) with inline section headings (BOAT / FUEL SYSTEM / STEERING / BATTERY / ACCESSORIES / MOTOR / TRAILER); Line 50 unused |
| 26 | 610–640 | **DPDC** | *Detail Pre-Delivery Check List* — 30 lines of detailing/valet checklist text (`Wash and Cham`, `Cut and Polish`, `NSM Stickers x 2`) |
| 27 | 641–662 | — | empty gap |
| 28 | 663–678 | Spare scratch block | `Spare` + numbered cols; 23 rows used; col 678 = `END` |
| 29 | 679–4,144 | **PHANTOM** | zero values anywhere |

**MPDC vs DPDC decoded (task 6)**: these are **checklists, not charges**. MPDC = *Mechanical* Pre-Delivery Check List (technician QA items before handover); DPDC = *Detail* Pre-Delivery Check List (cleaning/detailing/branding items). Headers at cols 558/610 say so verbatim, and cell contents are instruction text, not codes/hours/costs. Both are near-identical boilerplate denormalised onto every one of ~1,964 rows.

## 3. Real data rows & brands

- **2,003 real boat rows** = rows with a Model Code, minus 7 brand-divider rows (their Model Code cell holds the literal `Model Code`) and 2 pseudo-sale rows.
- **810 current** (rows 4–1004) / **1,193 obsolete** (rows ≥ 1005, under `OBSOLETE MODELS (Models that ar No Longer Available)` [sic] — 59.6% of the sheet is dead stock history, including entire previous-year Highfield ranges).

| Brand (current section) | Rows | Model-code style |
|---|---|---|
| Highfield Inflatables | **588** | NSM stock codes `HB{series}{nnn}` (HBR=Roll-Up, HBU=Ultralite, HBC=Classic, HBS=Sport, HBP=Patrol, HBE=electric/ZeroJet); one row per **SKU** = model × material (PVC/HYP) × colour code (`W-W-WD`) — exactly HelmLogic's variant grain |
| Stacer | 91 | factory codes (`SP309S2SP`) |
| Formosa | 39 | factory codes (`GRT 425 TIL`) |
| Stabicraft | 37 | factory codes |
| Surtees | 19 | factory codes |
| Merry Fisher (Jeanneau) | 12 | factory codes |
| Cap Camarat (Jeanneau) | 11 | factory codes — **priced via the `Merry Fisher` matrix row** |
| Haines Signature | 9 | factory codes |
| Jeanneau (yachts) | 4 | factory codes |

Obsolete: Highfield 976, Stacer 132, Stabicraft 50, Haines 12, Merry Fisher 12, Surtees 10, Jeanneau 1. **633 Model Codes appear twice** — almost all current-vs-obsolete duplication → any import must key on Model Code *and* section, or import only rows < 1005.

Two **pseudo-boat rows** (not boats): row 950 `Motor Repower Sale` (Model Code `Motor Quote Module`, matrix Yamaha) and row 952 `Trailer Sale` (`Trailer Quote Module`, matrix Administration) — entry points that let a repower or trailer-only sale be quoted through the boat workflow, with marketing copy in their inclusions block.

## 4. Sample boats (full dumps in evidence JSON)

1. **Row 5 — Stacer 309 Skimma (`SP309S2SP`)**, AUD-native: base 1,367 + road freight 82.49 → landed 1,449.49; HO-MU 0.105/0.15; hull-only Cash 1,730 inc GST at *all* dealer levels (flat RRP, GP 7.8%); PD tiers PD-STA-BAS/STD/COM sell 300/500/600 inc GST; motor envelope 2–6 HP tiller, 4 real motor options then `NR` sentinels; no trailer.
2. **Row 445 — Highfield CL380 (HYP) W-W-WD (`HBC066`)**, USD-imported: see §6 for the full cost chain; factory options as codes (`HEC001-BG`…), 3 motor options (F25SMHC/F25SWTC), dealer-fit line `Tube Covers to suit Hypalon Boat - 3.8 Mtr`, rego band `Up to and inc 4.5m`, deposit 30/70.

## 5. Hidden `Dropdowns` sheet — fully decoded

3,479 × 26, only 6 columns populated (`0`/NBSP cells are formula-artifact blanks):

| Col | Entries | Vocabulary |
|---|---|---|
| 3 | 849 | Master **boat-name list** — pseudo sale rows + every brand's section headers + boat display names (Stacer → Haines) |
| 8 | 602 | Boat-name list **continuation** (Highfield + Formosa) |
| 20 | 426 | **Trailer options** (`TRAILER NOT REQUIRED`, REDCO, Dunbier, Mackay, GFab, Stacer trailers) → feeds cols 390–399 |
| 22 | 251 | **Motor options** (`Yamaha - F2.5SMHB` … ePropulsion electric drives) → feeds Motor Option cols |
| 24 | 228 | **Propeller options** (BA Spline, G/K Series, XTO twin/triple rigs) → feeds Prop Description cols |
| 26 | 514 | **Rigging kit options**, with group headings (`TILLER CONVERSION KITS`, `MECHANICAL RIGGING KITS to 70HP - Yamaha`) → feeds Rigging Kit Option cols |

The main sheet's option cells contain the **display string** picked from these lists. (openpyxl reports the x14 data-validation extension as unsupported, so the exact DV ranges aren't introspectable, but the value ↔ list correspondence is 1:1 by observation.)

## 6. Relationship encoding (task 5) — the key finding

**A boat row declares its compatible motors / rigging / props / trailers / dealer-fit / services by exact display-name string, not by ID.**

- **Motors**: `Recommended Motor Option` + `Motor Option 2..13` hold Yamaha model display names (`Yamaha - F25SMHC`) = the natural key into `Motor Module.xlsx`. Each option carries its own rigging kit (name), prop (Yamaha **part number** + description) and engine-hole assignment. Min/Max HP + Shaft + Tiller/Remote define the envelope — mirroring HelmLogic `motorConfigurations[0].engines[0].minHp/maxHp` + `steeringType`.
- **Trailers**: display names with the trailer code embedded as a prefix (`TALS749S13 - …`, `REDCO Sportsman - RE1213`) → `Trailer Module.xlsx`.
- **Dealer fit / P/D parts / H/O parts**: item display names → `Parts Module.xlsx`.
- **Factory options are the exception**: they use **codes** (`VWRAP01`, `HEC001-BG`) → `Factory Options Module.xlsx`.
- **Sentinels are meaningful**: `NR - …`, `TRAILER NOT REQUIRED`, `.` = empty slot; `Supplied with Motor` on props.
- **`Matrix`** (col 5) is **not** a link to a compatibility matrix — it names the brand row in **`Price Matrix.xlsx`** (Brand, Franchise Code `9ST/9HI/9JE…`, currency, CTD/Other/Sell/Factory-Options/Dealer-Fit markups, Trade/Sub-Dealer **discounts**, Warranty Allowance, Admin Load). The per-row MU columns (266–271) are copies resolved from that matrix. Franchise codes also prefix the Pre Delivery Codes.

Consequence for import: joins are **string-fragile**. Every rename in a source module silently orphans boat-row references. HelmLogic import must resolve names → document IDs at import time and log unresolved strings.

## 7. Landed-cost chain (task 7) — verified arithmetic

```
Landed Hull Cost =
    (Base Cost + Factory Discounts + Boat Prep + Base Freight + Documentation
     + Fumigation + Ocean Freight + Fuel Surcharge + Other Charges)   [factory currency]
    ÷ EX Rate                    [AUD per-unit rate: USD 0.7, NZ 1.2, EURO 0.6, AUD 1]
    (+ Duty — untestable, 0 in both samples)
    + Other Chg $A + Road Freight [already AUD]
```

- **Stacer row 5**: 1,367/1 + 82.49 = **1,449.49** ✓ exact.
- **Highfield row 445**: 4,504/0.7 + 300 + 490 = **7,224.2857** ✓ exact. EX Rate is a **divisor** — same semantics as HelmLogic's `organisations/{orgId}/exchangeRates/USD`.

Sell derivation (row 445): Cash ≈ Landed × (1 + HO-MU 0.5) × 1.1 GST = 11,920 → listed **11,940 inc GST** (hand-rounded). Then ladder: Trade = Cash × 0.95 · Sub Dealer = Cash × 0.825 · Sub (Exclusive) ≈ Sub Dealer × 0.975 · AUS Sailing = Cash × 0.80 · Warranty ≈ Landed × 1.065. The 5% / 17.5% factors are exactly the Price Matrix "Trade/Sub Dealer are discounts" columns. **All sell prices are inc GST; costs ex GST** — HelmLogic stores `sellPriceExclGst`, so import divides by 1.1 (and NSM's rounding is to catalog dollars, vs HelmLogic's ceil-at-finalize rule — snapshot the listed price, don't recompute).

## 8. Proposed HelmLogic mapping

| MPF block (cols) | HelmLogic target | Rationale | Confidence | Open question |
|---|---|---|---|---|
| Brand segments / `Matrix` | `data-warehouse/{vendorId}` per brand; `Matrix`→vendor pricing profile | Brand = vendor; Highfield already exists (`LafOLpLb6QIFE856TiD4`) | High | Create vendors for Stacer/Stabicraft/Surtees/Jeanneau/Haines/Formosa now or on demand? |
| Section header rows (`Stacer - SKIMMAS`) | `ranges/{rangeId}` | Series grouping = HelmLogic range; Highfield ranges derivable from HB-prefix (HBC→Classic…) | High | Highfield current section (280–948) has *no* sub-section rows — derive range from SKU prefix/name |
| Boat row (Highfield) | `ranges/…/models/{modelId}/variants/{variantId}` | One row per material×colour SKU = exactly variant grain; `HBC066` → variant SKU code | High | Model grouping key = name minus `(PVC/HYP) colour` suffix — confirm parser on `Classic FT - CL290FT HYP - B-G` style |
| Boat row (other brands) | `models/{modelId}` with a single variant | Aluminium brands have no material/colour split | High | — |
| `Model Code` (col 4) | variant `sku` / import natural key | Upsert-by-natural-key rule (CLAUDE.md) | High | Duplicated in OBSOLETE — import rows <1005 only, or flag `status:'obsolete'` |
| Specs (7–21) | `model.specifications` | Same content; **per-brand label schema** (see §2) | Medium | Needs per-brand field mapping table + unit parsing (`46 kg`, `15 deg`) |
| `Image Link` (6) | `model.imageUrl` / variant image | Direct | High | Many CDN hosts — native `<img>` + weserv rules apply |
| SFI 24–74 | `model.standardInclusions[]` (exists on PDF as Standard Inclusions) | Free-text list | High | — |
| Factory Options 77–241 | `model.optionalFeatures` with `applicableVariantIds` | Codes; Highfield colour-suffixed codes (`HEC001-BG` vs `-WWD`) encode *variant-specific* applicability — exactly `applicableVariantIds` | High | Requires joining `Factory Options Module.xlsx` for desc/price; colour-suffix → variant mapping convention to confirm |
| Landed chain 243–259 | `variant.cost` (= Landed Hull Cost) + import-metadata breakdown | HelmLogic stores cost for margin; full chain is audit detail | High | Keep full chain in an import snapshot subdoc? Duty semantics unverified (always 0 in samples) |
| Currency/EX Rate | vendor `currency` + `organisations/{orgId}/exchangeRates` | Matches Highfield USD flow already in prod | High | Boat Module bakes EX 0.7; HelmLogic converts live — decide source of truth at import |
| Promos 261–264 | `modules/{moduleId}/promotions` | Existing per-module promotions | Medium | Promos here are per-boat with validity text — parse dates? |
| MUs 266–271 | org pricing config / `modelOverrides` margin fields | Brand-level markup policy | Medium | HelmLogic has no per-vendor markup matrix today — candidate new org config doc |
| Pre-delivery 273–297 + tiers 516–550 | `organisations/{orgId}/serviceOperations` (labor codes, `flatRateHours × hourlyRate`) + `fitUpItems`/`fitUpPackages` for P/D & H/O parts | PD tiers are labor ops (code, hrs, rate, sell) = serviceOperations shape; P/D parts = fit-up items fitted pre-handover | Medium | Three tiers per boat × brand → dedupe to per-brand `PD-{BRAND}-{TIER}` ops with per-model hour overrides? Human call |
| Rego 299–300 | Rego module catalogs + `model.registration` | v1.4 rule: jurisdictional data from authoritative catalogs; band strings are inputs to that catalog | Medium | Boat rego bands are length-based (boat), unlike trailer ATM bands — extend Rego module? |
| Safety 302–306 | `fitUpPackages` (safety-gear bundle) or model default fit-up | Safety pack is a dealer-fitted bundle by water class | Medium | Product decision: package vs model metadata |
| Motor envelope 308–311 | `specifications.motorConfigurations[0].engines[0].minHp/maxHp` + `steeringType` | Exact existing schema | High | Multi-engine strings (`Sng UL / Twin XL`, twin configs) need the `getMotorHp()`-style parsing |
| Motor Options 1–13 (312–388) | new `model.motorOptions[]` snapshot array: `{motorName→motorId, riggingKitName, propPartNo, propDescription, engineHole, recommended:bool}` | Richer than min/max HP filter — this is NSM's curated per-boat motor menu incl. rigging+prop per option | Medium | HelmLogic currently *filters* motors by HP; adopting curated options is a feature decision (Epic 9.3-adjacent). Name→ID resolution against Motor Module needed |
| Trailer options 390–399 | `model.trailerConfig` (Std Trailer) + compatible-trailer list | Std Trailer = existing trailer config; options 2–10 = compatibility list | Medium | Trailer names must resolve to Trailer-Brand vendor docs; REDCO/GFab/Mackay vendors may not exist yet |
| Dealer Fit 401–443 | `organisations/{orgId}/dealerFitSelections` / `fitUpItems` with model-scope assignment | Per-boat curated dealer-fit list = fit-up assignment scope (v1.11 multi-level assignment fits perfectly) | High | Items live in Parts Module with Act Sell/Act CTD — join by name |
| Deposit 445–450 | org Document Defaults (deposit / payment schedule) — v1.11 card | Same concept, currently org-level | Medium | MPF is per-boat (0.2/0.8 vs 0.3/0.7) — needs per-model override or per-vendor default |
| Lead times 452–457 | `model.leadTimeDays` (new) | Simple scalar set | High | Not in HelmLogic schema today — trivial add |
| Hull Only Pricing 459–479 | variant `priceLevels` object (Cash/Trade/SubDealer/SubExclusive/AUSSailing/Warranty) | Mirrors motor `priceLevels` pattern (hull_cash→NSM Retail etc.) | High | Store inc-GST as-is or ÷1.1 to `sellPriceExclGst`? HelmLogic convention says ex-GST — but NSM's hand-rounding is on the inc-GST figure |
| Paint & Graphics 481–511 | `optionalFeatures` (category: Paint & Graphics) | Option codes like factory options | Medium | Codes need a lookup source (likely Factory Options Module too) |
| Engine labour 552–556 | `serviceOperations` (install labor codes) | Labor hours × rate | Medium | — |
| MPDC/DPDC 558–640 | Do **not** import per-boat; one org-level checklist template (future workshop feature) | Identical boilerplate on every row; belongs with v1.11 `fitUpStatus` workshop direction | High | Where do checklists live? No HelmLogic surface yet — park as org doc |
| Pseudo rows 950/952 | Skip (repower/trailer quoting are HelmLogic modules already) | Not boats | High | — |
| OBSOLETE section | Skip or import with `status:'obsolete'` | 1,193 rows of history; current Firestore catalog is source of truth | High | Human call: is obsolete history needed for used-boat/trade-in valuation? |

## 9. Cross-file reference map

```
Boat Module ──Matrix──────────────▶ Price Matrix.xlsx (brand markups/discounts, franchise codes, FX)
            ──Factory Option codes▶ Factory Options Module.xlsx
            ──Motor display names─▶ Motor Module.xlsx
            ──Rigging names───────▶ Rigging Module.xlsx
            ──Trailer names───────▶ Trailer Module.xlsx
            ──Parts/dealer-fit────▶ Parts Module.xlsx
            ──Rego bands──────────▶ Registration Module.xlsx
            ──Hull-only prices◀───  Hull Only Module.xlsx (generated price list, stale snapshot)
            ──PD codes────────────▶ Service Module.xlsx (presumed; codes `PD-{BRAND}-{TIER}`, `{franchise}_{model}_PD`)
```

## 10. Anomalies (full list in evidence JSON)

1. **Dimension bloat**: 4,731×4,144 declared vs 2,301×678 actual; explicit `END` marker at col 678; phantom check-code fragment at cols 703–732.
2. **Header-in-data**: 9 brand divider rows repeat the full header AND **redefine spec-column semantics per brand** (cols 7–21) and parts of the cost chain (cols 251–257). Their Model Code cell holds the literal string `Model Code` — an importer that doesn't skip them creates a garbage "boat".
3. **Pseudo-boat rows** `Motor Repower Sale` / `Trailer Sale` with marketing copy in the inclusions block.
4. **633 duplicate Model Codes** (current vs OBSOLETE); obsolete section = 59.6% of rows; a few in-section dupes (`Stabicraft - 2350 Supercab (Adventure)` ×2).
5. **Two adjacent `Factory Discounts` columns** (248/249); 249 mixes labels (`Ship Craddle` [sic]) with amounts.
6. **Unit-bearing strings everywhere** (`46 kg`, `25 HP`, `287 cm` under a `(Mtr)` header) — Highfield rows put cm/deg values under metre-labelled generic headers.
7. **`#VALUE!` literals** frozen into Spare 2–5 price columns (~1,948 rows); **negative GP%** on some hull-only prices (e.g. −8.5% — loss-priced or stale cost).
8. **Price Matrix says Highfield currency `$A`** while every Highfield row uses USD @ 0.7 (matrix row stale; Exchange Rates sheet + rows agree).
9. **Cap Camarat priced via the Merry Fisher matrix row** (shared Jeanneau franchise `9JE`).
10. Typos as data: `Check Code Referance`, `Total Enginge Labour Allowance`, `Models that ar No Longer Available`, `Propellor`, `Ship Craddle`.
11. MPDC Line 50 unused; MPDC/DPDC boilerplate duplicated ~1,964×.
12. x14 data-validation extension unreadable by openpyxl (dropdown wiring inferred from the hidden sheet + observed values).
13. Stray `Hull Only Pricing` value at row 4 col 457; deposit-schedule and lead-time columns repeat their block title as a per-row value.
14. Hull Only Module keys are space-padded (`HBC 066`) vs `HBC066` here, and its prices are a stale 16.06.2025 snapshot (HBC066: SELL 11,850 vs Cash 11,940 here) — see `hull-only.md`.
