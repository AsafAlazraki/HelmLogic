# NSM Display Sheet — Package Composition Reverse-Engineering (SP560 case)

**Question**: how does NSM's Display Sheet reach a package headline of **$85,648 inc GST** for
`Highfield - SP560 (HYP) LG-W-WB` + Yamaha F90XB + REDCO TA600-MOB, annotated
*"Including Boat Pre Delivery and Boat Registration / Motor Pre Delivery and Installation Charges / Trailer Pre Delivery and Trailer Registration"* —
and how does HelmLogic replicate that composition for every boat.

**Method**: openpyxl over the MPF source workbooks in `tasks/mpf-source/` (`data_only=True` for cached values AND `data_only=False` for formulas), 2026-07-07. Strictly read-only. The Display Sheet workbook itself is **not** in our file set (it is a downstream quote tool; `Administration Module.xlsx → Dropdowns` lists "Display Sheet" as deal-status stage 1), so the composition below is reconstructed from the modules the Display Sheet looks up — and validated to the dollar against Mark's option lines and totals.

---

## 0. Verdict up front

- The package is a **straight SUM of already-inc-GST catalog sell figures** — one hull line, one boat-rego line, one boat+engine pre-delivery line, one motor line, one rigging line, one prop line, one trailer line, one trailer-rego line. No package-level markup, no package-level GST step.
- Best-evidence reconstruction reaches **$85,638 vs the $85,648 headline — residual +$10 (0.012%)**, isolated to the prop/rigging *labour-machinery* pennies (§1.4). Every other component is proven exact.
- All **8 option add-on lines match this MPF snapshot to the dollar**, and `85,648 + options = 103,731` exactly, and `103,731 / 1.1 = 94,300.91` exactly — which proves the snapshot is contemporaneous with Mark's quote and pins the GST semantics (§4).

---

## 1. The exact arithmetic for row 838

### 1.1 Identity

`Boat Module.xlsx` → sheet `Boat Module`, **row 838**:

| Cell | Header | Value |
|---|---|---|
| C838 (col 3) | BOAT | `Highfield - SP560 (HYP) LG-W-WB` |
| D838 (col 4) | Model Code | `HBS116` |
| E838 (col 5) | Matrix | `Highfield Inflatables` |
| IY838 (col 259) | Landed Hull Cost | 29,251.4286 (`=(SUM(IM:IV)/IJ)+IW+IX` = 19,580 USD ÷ 0.7 + 300 + 980) |
| KM838 (col 299) | Boat Registration (band) | `4.51m to 6.0m` |
| KZ838 (col 312) | Recommended Motor Option | `Yamaha - F90XB` |
| LA838 (col 313) | Rigging Kit Option | `Mech Rigging Kit - 6X3 Concealed (Left Hand) Mount w 6Y5 2 Gauges, 5m Harness, 15' Cables & Filter` |
| LB838/LC838 (314/315) | Prop Part No. / Description | `6FP-45943-00` / `Propeller - Aluminium SDS GP K Series - 15"` |
| NZ838 (col 390) | Std Trailer | `REDCO Custom / Highfield SP560 Aluminium - TA600-MOB` |

### 1.2 The component ledger (all figures **inc GST**)

| # | Component | Source workbook / sheet / cell | Value | Proof of inc-GST basis |
|---|---|---|---|---|
| 1 | **Hull — Hull Only Pricing "Cash"** | Boat Module `QR838` (col 460) | **48,350** | GP formula `QS838 = ((QR838/1.1)-IY838)/(QR838/1.1)` divides by 1.1 before comparing to landed cost. Hardcoded (hand-rounded up from Landed × 1.5 × 1.1 = 48,264.86). 48,350/1.1 = 43,954.55 ex — HelmLogic's $43,955. |
| 2 | **Boat registration (4.51–6.0 m band)** | Registration Module → `Registration Costs` row 10: `C10='4.51m to 6.0m'`, `G10='REGO 2'`, `J10=249.50` (CTD), **`K10=250` (SELL)** | **250** | Government charge (GST-free in substance; carried at SELL as a flat dollar figure — see §4). |
| 3 | **Boat + engine Pre-Delivery — "Pre Delivery - Basic" tier** | Boat Module `TF838` (col 526) | **5,300** | `TF = ROUNDUP(TC × 1.25 × 1.1, -2)` — the ×1.1 is the GST step. Full chain in §1.3. |
| 4 | **Motor — Yamaha F90XB "NSM Retail"** | Motor Module → `Motor Library` **row 82**, col **BC** | **17,643** | Col BB header is literally **"RRP + Freight Inc GST"**; BC (NSM Retail) equals BB. Motor **Total CTD** `AX82 = 13,035.51` already contains the $90 PD-materials allowance (`AV82 = 90`: oil 3.2 L, fuel 1 L, flusher, SMPC000P ×6, labour 0.372 h) — this is the "Motor Pre Delivery" of the annotation. |
| 5 | **Rigging kit (kit + install)** | Rigging Module → `Rigging Kits` **row 382** (part `6X3-6Y52L-LS-15-05`; duplicated verbatim at row 412): Kit Sell `K=2,110` + Install Retail Sell `V=1,000` → **Total Sell Price `AC382`** | **3,110** | GP col `AB382 = 488.43 = 3,110/1.1 − Total CTD 2,338.84` — GP computed ex-GST ⇒ 3,110 is inc GST. (⚠️ corrects `rigging-module.md`, which called these ex-GST.) |
| 6 | **Propeller (supply + fit)** | Parts Module → `Parts Maintenance` **row 2676** (`6FP-45943-00`): Sell `L=247` + install (op `YAM_PRO_025`, 0.15 h @ $159 retail inc = 23.85 + sundry) → **"Sell inc Install" `Y=272`** | **272** *(≈282 on the Display — the $10 residual lives here, §1.4)* | Labour billed at the **Retail** rate $159/hr **inc GST** (Service Module → `Labour Rates` row 9: 144.55 ex / 159 inc). |
| 7 | **Trailer — REDCO Custom SP560 TA600-MOB "Sell"** | Trailer Module → `Trailer Module` **row 143**, col **BW** | **10,430** | GP `BU143 = 1,904.26 = 10,430/1.1 − Total Nett CTD 7,577.56` ⇒ inc GST. **Trailer PD is already inside**: `BQ143 Total PD Charges = 176.06` (op `PD Trailer - Single, Axle Braked`, 1.25 h @ 130.09 + rego-label holder 2 + R-clip 0.44 + shackle 6 + sundry 5) is a component of `BS143 Total Nett CTD = 7,577.56` = Landed 7,401.50 + 176.06. Hence *"Including Trailer Pre Delivery"*. |
| 8 | **Trailer registration (Large > 1.021 t)** | Trailer Module `BZ143 = 283` (= Registration Costs `K17`); `CA143 "Sell inc Rego" = 10,713 = BW + BZ` | **283** | Flat QLD band by ATM (1,500 kg > 1,021 kg). |

**Sum: 48,350 + 250 + 5,300 + 17,643 + 3,110 + 272 + 10,430 + 283 = 85,638.**
**Headline: 85,648. Residual: +10 (0.012%).**

### 1.3 The Pre-Delivery tier chain (formulas, row 838) — this is the $5,831 of "machinery" HelmLogic wasn't composing

Read with `data_only=False`; every cell cited:

```
JN838  Boat PD (hrs)                 = 18                          (static)
JO838  Labour Rate ($)               = '[2]Labour Rates'!$G$14     = 130.0909  (Internal, ex GST)
UF838  Motor PD Labour               = VLOOKUP(KZ838, Motor Library col 28)   = 0.3725 h
UG838  Motor Install Labour          = VLOOKUP(KZ838, Motor Library col 87)   = 4.0 h   (op YAM_IME_04.00)
UH838  Rigging Kit Labour            = VLOOKUP(LA838, Rigging Kits col 13)    = 5.8 h
UJ838  Total Engine Labour Allowance = ROUNDUP(SUM(UF:UI))                    = 11 h

SX838  PD Basic Est Hrs   = JN838 + UJ838              = 29 h      ← boat PD + ALL engine labour
SY838  Labour $           = SX838 × 130.0909           = 3,772.64
TC838  Total CTD          = ROUNDUP(SUM(SY:TB), -2)    = 3,800     (parts/sundry/sublet cols empty here)
TF838  Sell (inc GST)     = ROUNDUP(TC × 1.25 × 1.1, -2) = ROUNDUP(5,225, -2) = 5,300

Standard tier: TJ = ROUNDUP(SX × 1.33) = 39 h → TR = 7,100
Complex tier:  TV = ROUNDUP(TJ × 1.33) = 52 h → UD = 9,400
```

**Key insight**: the tier is *boat PD + motor PD labour + motor install labour + rigging install labour in one number*. That is why the headline can honestly say "Including Motor Pre Delivery and Installation Charges" without a separate $680 install line (Service Module op `YAM_IME_04.00` sells at 680 — it is **not** added again; its 4.0 h are inside the 29 h). Which tier the salesperson picks is a Display-Sheet dropdown; Mark's SP560 quote used **Basic**. (Note the tier PD Codes are mislabelled in the source: the "Basic" tier's code cell `SW838` says `PD-HIG-STD`; only "Complex" has `PD-HIG-COM`.)

### 1.4 The $10 residual — honest accounting

Sum of stored catalog values = 85,638; headline = 85,648. The gap sits in the **rigging/prop labour machinery**, the only two lines whose stored values come from *inconsistent internal rounding conventions*:

- **Prop**: the MPF holds FOUR prices for `6FP-45943-00` — Parts Maintenance current `Sell 247` / `Sell inc Install 272` (row 2676), an obsolete duplicate `240/265` (row 4397), and `Parts Data Drop` row 23667 with Yamaha list `259.35 ex / 285.29 inc`. A Display-Sheet prop line of **282** (which closes the residual to zero: 3,392 − 3,110 = 282) is inside the spread of these coexisting prices.
- **Rigging install**: stored `V382 = 1,000 = ROUND(CTD 807.53 × 1.25, -2)` — a different rounding function than the kit's `K382 = 2,110 = ROUNDUP(CTD × 1.375, -1)`. A Display-side `ROUNDUP(..., -1) = 1,010` also closes the residual exactly.

Everything else is eliminated: hull/motor/trailer/regos/PD-tier are dollar-exact, and all 8 option lines match this snapshot exactly (§1.5), so version drift is ruled out for every component except the prop/rigging pennies. **For HelmLogic the residual is immaterial**: implement the composition of §2 from stored sell values; do not reverse-engineer NSM's last $10 of rounding.

### 1.5 Option add-on lines — all verified exact (this is what proves the snapshot)

The Display Sheet adds options **raw into the inc-GST total** (see §4). Every figure found at its source:

| Display line | Source | Cell | Value |
|---|---|---|---|
| Fabric T Top **2,720** | Factory Options Module row **15472** (`HET005`, "Top - Fabric T Top for SUS750" — cost 1,647.14, FO-MU 0.5) | col L | 2,720 ✓ |
| Stern Shade **630** | Factory Options Module row **15508** (`HET008`, "Stern Shade for SP560") | col L | 630 ✓ |
| Tube covers HYP 5.6 **5,004** | Parts Module → **`Dealer Fit Module`** row **746** (`IBC-TCHYP - 5.6 Mtr`) | col R | 5,004 ✓ |
| VHF GX750B **1,016** | Dealer Fit Module row **32** (`GME-GX750BPK1`, bundle w/ 1.8 m aerial, 3 h install) | col R | 1,016 ✓ |
| Fusion stereo **2,488** | Dealer Fit Module row **81** (`FUS-RA670KIT02`, 6.5 h install) | col R | 2,488 ✓ |
| Garmin 125sv **5,296** | Dealer Fit Module row **99** (`GAR-125SV2-KIT01`, 3.75 h install) | col R | 5,296 ✓ |
| Spare wheel **760** | **Trailer Module row 143, Factory Option 1** ("Spare Wheel & Carrier", cost `CF=550`) | col **CG** | 760 ✓ |
| Rego decals **169** | Parts Maintenance row **440** (`DEC-RSHYP`, "Rego Decals (Std) t/s Hypalon Tubes") | col L/Y | 169 ✓ |

`85,648 + 2,720 + 630 + 5,004 + 1,016 + 2,488 + 5,296 + 760 + 169 = 103,731` ✓ exactly Mark's full-package total.

Two option-source rules fall out of this:
1. **Boat-scoped dealer-fit options** (row 838 cols OL–OO name exactly these four bundles: tube covers / VHF / Fusion / Garmin) price from **`Dealer Fit Module` col R** — the "supply + install, one line, inc GST" projection (parts sell + install labour at $159/hr retail + sundries, GP checked ex-GST: e.g. VHF `Q32 = 104.09 = 1,016/1.1 − O32 819.54`).
2. **Trailer-scoped options** price from the **trailer row's own Factory Option quads** (cols CC–DZ), not from the parts catalog.

---

## 2. The GENERAL composition formula (per boat row)

For any Boat Module row *r*, with selected motor slot *m* (of 13), selected trailer slot *t* (of 10), and selected PD tier *τ* ∈ {Basic, Standard, Complex}:

```
PACKAGE(r, m, t, τ)  [inc GST]  =
    HULL(r)          Boat Module col 460 "Hull Only Pricing → Cash"        (already inc GST; use the
                     price-level ladder cols 460–470 for Trade/SubDealer/etc. — Trade = Cash×0.95,
                     SubDealer = Cash×0.825 per Price Matrix discount columns)
  + BOAT_REGO(r)     Registration Costs SELL for the row's length band (col 299):
                     ≤4.5m→127 · 4.51–6.0m→250 · 6.01–10m→414 · 10.01–15m→609 · NotRequired→0
  + PD_TIER(r, m, τ) Boat Module cols 516–550. Derivation if recomputing:
                       allowanceHrs = ROUNDUP(motorPdHrs(m) + installHrs(m) + riggingHrs(kit(r,m)))
                       basicHrs     = boatPdHrs(r, col 274) + allowanceHrs
                       hrs(τ)       = basicHrs · ROUNDUP(basic×1.33) · ROUNDUP(std×1.33)
                       CTD          = ROUNDUP(hrs × internalRate 130.0909, -2)
                       SELL         = ROUNDUP(CTD × 1.25 × 1.1, -2)
                     (motorPdHrs = Motor Library col 28; installHrs = col 87; riggingHrs = Rigging Kits col 13)
  + MOTOR(r, m)      Motor Library col BC "NSM Retail" for the slot's display name (col 312+6(m−1));
                     inc GST; PD materials already inside its CTD. Skip if slot = 'NR - ENGINE NOT REQUIRED'.
  + RIGGING(r, m)    Rigging Kits col AC "Sell Price" (= Kit Sell col K + Install Retail Sell col V) for the
                     slot's rigging description (col 313+6(m−1)); inc GST.
                     Skip if 'NR - RIGGING KIT NOT REQUIRED' (labour hrs then = 0 in the tier too).
  + PROP(r, m)       Parts Maintenance "Sell inc Install" col Y for the slot's Prop Part No.
                     (col 314+6(m−1)); inc GST. Skip if 'Prop Not Required' / 'Supplied with Motor'.
  + TRAILER(r, t)    Trailer Module col BW "Sell" for the slot's display name (cols 390–399); inc GST;
                     trailer PD already inside its CTD. Skip if 'TRAILER NOT REQUIRED'.
  + TRAILER_REGO(t)  Trailer Module col BZ (ATM band: ≤1.02t→166 · >1.021t→283 · >4.55t→998 · NR→0).
                     (col CA "Sell inc Rego" = BW + BZ is the precomputed pair.)

OPTIONS are then added RAW (no further GST step):
    boat factory options   → Factory Options Module col L (sell inc GST) via codes in cols 77–241
    boat dealer-fit lines  → Dealer Fit Module col R (supply+install inc GST) via names in cols 402–443
    trailer factory options→ trailer row's own FO quads, Sell member (cols CC–DZ)
    parts/decals           → Parts Maintenance col L (supply) or col Y (supply+install)

TOTAL_INC = PACKAGE + Σ options          TOTAL_EX = TOTAL_INC / 1.1
```

Structural rules an implementer must honour:

1. **Never add the motor-install op ($680) or rigging labour ($1,000) as separate lines when a PD tier is charged** — those hours are already inside the tier. Conversely, if a deal is quoted with *no* PD tier, then motor install (Service ops `YAM_IME_*`), rigging install (Rigging Kits cols O–V) and boat PD must be charged individually.
2. **Trailer and motor prices are self-contained**: their PD money is inside their CTDs/sells. Only the *boat+engine labour* rides in the separate PD-tier line.
3. **Everything sums at inc-GST catalog values**; ex-GST is derived by ÷1.1 at the end. NSM's per-line values are already hand-/formula-rounded — snapshot them, don't recompute (matches the existing CLAUDE.md rule "snapshot the listed price, don't recompute").
4. All joins are **display-string joins** (motor name, rigging description, trailer name, part name) — resolve to IDs at import time per the boat-module.md §6 warning.

---

## 3. Where each component already lives in HelmLogic (v1.31 MPF import) vs what's missing

Verified against `scripts/mpf/extract-boats.py`, `extract-service.py`, `extract-pricing-config.py`, `import-*.py`:

| Component | HelmLogic today | Status |
|---|---|---|
| Hull Cash ladder (cols 459–479) | variant `priceLevels` / `sellPriceExclGst` (imported ÷1.1); `landedCostChain` on the boat rec (extract-boats.py L254, L271–288 verifies col 460 vs formula) | ✅ imported |
| Motor NSM Retail + Total CTD | motor `priceLevels` (hull_cash→NSM Retail …) + `cost` | ✅ imported — **⚠️ GST-basis flag**: BC 17,643 is INC GST per col BB header; HelmLogic's quote math treated 17,643 as ex GST (that's most of why HL's 79,817 ≠ NSM's package). Decide: either store ÷1.1 or mark motor priceLevels as inc-GST. Same check for trailer BW (inc GST, proven §1.2 #7). |
| Trailer Sell + PD-inside-CTD | `data-warehouse/{vendorId}/trailers/*` (`cost` = Total Nett CTD incl PD 176.06, `sell`) + rego hints info-only per v1.4 lesson | ✅ imported |
| Boat rego bands / trailer rego bands | v1.31 "QLD rego" import → Rego module catalogs (extract-pricing-config.py `reg()` with min/max length + concession rows); per-boat band captured as `rec.registration.lengthBand` (extract-boats.py L352) | ✅ imported |
| Per-boat motor menu incl. rigging + prop per slot | `motorMenu` (extract-boats.py L319: `riggingKit`, `propPartNo`, `propDesc` per slot L313–315) + `trailerMenu` L327 | ✅ imported |
| Rigging kits w/ kit sell + install hours + install sell | `organisations/{orgId}/riggingKits` (846 docs; `rigging-kits-manager.tsx`, used by `highfield-quote-flow.tsx`, `catalog-item-picker.tsx`) | ✅ imported |
| Motor install / prop install / trailer PD ops | `organisations/{orgId}/serviceOperations` (364 ops: `YAM_IME_04.00` sell 680, `YAM_PRO_025` sell 26.85, `PDTR02` sell 218.75) | ✅ imported |
| Labour rate card (Internal 130.09 ex / Retail 159 inc) | v1.31 `labour-rates.json` → pricing config (extract-service.py L98, L120: `rateConstants`) | ✅ imported |
| Parts / dealer-fit sells | `serviceParts` (26,345) + dealer-fit (1,791 DFO) collections | ✅ imported |
| **PD tiers per boat (cols 516–550)** — Basic/Standard/Complex hrs + CTD + Sell | **not captured** by extract-boats.py (no col 516/552 reads) | ❌ **needs importing** — either (a) snapshot the three tier sells per boat, or (b) import the two inputs below and derive by the §2 formula |
| **Boat PD hrs (col 274) + handover hrs (col 291) + PD parts lines (cols 280–289)** | not captured | ❌ needs importing (boat-level fields) |
| **Engine labour allowance inputs**: Motor Library col 28 (PD hrs) & col 87 (install hrs) as *first-class motor fields*; Rigging Kits install hrs (col 13/O) | rigging hrs likely present on riggingKits docs; motor PD/install hrs unverified as fields | ⚠️ verify/import — required to derive tiers for arbitrary motor swaps |
| **Package assembly rule itself** (§2) in the quote flow | HelmLogic composes hull+motor+trailer+regos only (79,817) — no PD-tier line, no rigging/prop lines from the motor slot | ❌ **the actual build work** — Step-5/pricing-workspace change: add PD-tier selector (Basic default) + auto rigging/prop lines from the selected motor-menu slot |

The ~$5,831 gap HelmLogic saw = PD tier 5,300 + rigging 3,110 + prop 272 **minus** the double-GST HL applied to NSM's already-inc motor/trailer/rego figures (≈ 2,850) — both must be fixed together or the delta won't reconcile.

## 4. GST behaviour — precise statement

1. **Every price line the Display Sheet sums is already GST-inclusive at catalog level**: hull Cash (proven by GP formula ÷1.1), motor NSM Retail (header "RRP + Freight Inc GST"), rigging Sell (GP ex-GST check), prop Sell-inc-Install (labour at $159 *inc* rate), trailer Sell (GP ex-GST check), PD tier Sell (explicit ×1.1 in `TF = ROUNDUP(TC×1.25×1.1,-2)`), factory options col L (cost 1,647 × 1.5 × 1.1 ≈ 2,718 → 2,720), dealer-fit col R (GP ex-GST check).
2. **Rego lines (250 boat / 283 trailer) are flat government charges** carried at the Registration Costs SELL column (CTD 249.50/282.19 → SELL 250/283, roundup to whole dollars). They are summed into the same inc-GST total without any GST arithmetic of their own; on a tax invoice they'd be GST-free supplies, but the Display Sheet does not distinguish — see (3).
3. **Options are added RAW into the inc-GST total** — no re-rating, no rounding pass: `85,648 + 2,720 + 630 + 5,004 + 1,016 + 2,488 + 5,296 + 760 + 169 = 103,731` exactly.
4. **The ex-GST total is a single division at the end**: `Total Price (Excluding GST) 94,300.91 = 103,731 ÷ 1.1` exactly (94,300.909… displayed to cents). Note this technically overstates the GST content by treating the rego charges as taxable; NSM accepts that simplification, and HelmLogic should replicate the display math while keeping regos separately tagged for invoice correctness.
5. **Rounding conventions are per-line and heterogeneous** (hand-rounded hull; ROUNDUP −2 tiers; ROUNDUP −1 kit sells; ROUND −2 rigging install; whole-dollar parts) — a fresh recompute will drift by dollars. **Import the stored sell values; never re-derive them.**

## 5. Residual & confidence summary

| Claim | Confidence |
|---|---|
| Additive structure (8 components, §2) | **Proven** — annotations + formula chain + 99.988% dollar match + exact options/total/ex-GST reconciliation |
| Hull / motor / trailer / regos / PD-tier values | **Exact** (cell-cited) |
| Rigging + prop values | Exact to stored values; **+$10 residual** vs headline lives here (two candidate $10 rounding variants, §1.4) |
| GST semantics | **Proven** (÷1.1 identities exact) |
