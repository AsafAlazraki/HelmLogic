# FFR-33 working notes — Display-Sheet composition parity (LIVE DOC)

**Ruling (Asaf, 2026-07-07): the MPF Display Sheet is the spec. Fix forever, every boat, FAST.**

## The reconciliation (proven, to the dollar)

Mark's SP560 (HYP) LG-W-WB + F90XB + TA600-MOB + options:
- MPF Display Sheet: **$103,731** inc GST = 85,648 (package) + 2,720 (T Top) + 630 (Stern Shade) + 5,004 (tube covers) + 1,016 (VHF) + 2,488 (Fusion) + 5,296 (Garmin) + 760 (spare wheel) + 169 (decals) — options added RAW.
- HL: **$99,112** = (72,561 core + 17,541 options) × 1.1.
- Delta $4,619 = −5,831 (their package machinery HL didn't compose) + 1,212 (GST HL added to options).

## Root causes and status

1. **Stale override layer** — organisations/{org}/modelOverrides carried pre-MPF FO prices
   (USD-as-AUD cost==sell era). ✅ FIXED + LIVE: 29 prices across 6 models synced to catalog
   (`scripts/sweep-override-staleness.py --apply`, log `apply-log-override-sweep.jsonl`,
   re-audit 0 shadows). Nightly drift check still to add.
2. **Package composition** — their package includes PD + install. ⏳ IN FLIGHT.
3. **GST basis** — THE BIG ONE, see below. ⏳ IN FLIGHT.

## KEY DATA FINDINGS (verified against source)

- **Boat Module row 838** (SP560 HYP LG-W-WB): col 459 `Cash` = **48,350 inc GST**
  (= HL variant ex 43,955 × 1.1, hand-rounded ✓). Ladder cols 459-470.
  Fit-out tier trios at cols 517-549 (Est Hrs 29/39/52 → Sell inc GST 5,300/7,100/9,400).
  Motor labour cols 551-555: `Motor PD Labour` 0.37h · `Motor Install Labour` 4h ·
  `Rigging Kit Labour` 5.8h · `Total Engine Labour Allowance` ~11h.
- **Yamaha F90XB row**: `NSM Retail` = 17,643 = **"RRP + Freight Inc GST"** (their own
  column title!). So the NSM Retail / hull_cash motor figures are **GST-INCLUSIVE**.
  Also: `Install - Sell` 680 · `Install - CTD` 540.36 · `Total PD Allowance` 90 ·
  `TTF` 4h · `Labour (Hrs)` 0.37 · `Sell Price` 15,635 (ex-GST-ish dealer figure) ·
  `Trade Price` 15,415 · `Commercial/BA Price` 14,907.01.
- **Implication**: HL currently treats NSM Retail (motors), trailer Sell, DFO Act Sell,
  FO prices as EX-GST and adds 10% — that's ~10% high vs NSM's intent on every
  non-hull component. Their sheet works entirely in inc-GST money; the ex figure is
  back-derived (`Total Price (Excluding GST)` = package/1.1).
- Their sheet's $85,648 = hull 48,350 + motor package (17,643 + install/PD + rigging kit
  + prop) + trailer package (TA600 + PD) + regos (250 + 283) — exact decomposition being
  confirmed by the display-sheet-decomposer agent →
  `tasks/mpf-audit/analysis/display-sheet-composition.md`.

## Implementation plan (fast path)

1. **Quote composition** (highfield-quote-flow + quote-financials):
   - Non-hull catalog figures (motor priceLevels, trailer sell, FO, DFO, motor accessories,
     trailer options, fit-up?) contribute to the INC-GST total at face value; their ex-GST
     display value = figure / 1.1. Hull stays: ex stored, inc = hand-rounded ladder value.
   - Rego: GST-free, added raw (unchanged in effect).
   - Auto-add PD/install lines per the Display Sheet: motor `Install - Sell` + PD allowance,
     rigging install (hours × org rate) — exact list from the decomposer doc; boat PD +
     trailer PD from their module columns.
2. **Unit tests**: money-math suite must be updated to the new spec (Display Sheet parity),
   with the SP560 $103,731 as a fixture.
3. **Battery section M — Display-Sheet package parity, EVERY boat, nightly**: compute
   their package (hull cash + default composition) vs HL's for all 809 boats.
4. **Override drift check**: nightly diff of override FO prices vs catalog (stale-layer
   alarm; sweep already applied).
5. **Proof**: rebuild Mark's exact SP560 config in the browser → PDF must read $103,731.

## Deltas that change on old evidence (expected, spec changed)

- The ultimate test's $79,022 was computed under the OLD HL convention (GST added to
  components, no PD). Under Display-Sheet parity the same config produces THEIR number.
  Evidence docs to be updated after implementation; the email to Mark already explains.
