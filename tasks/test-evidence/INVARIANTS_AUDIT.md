# Financial-Invariants Audit — 2026-07-04

**Scope**: 9 money-math invariants walked over every live current-MPF boat variant (809 across 9 brands, 291 unique models) plus org-level serviceOperations (369) and riggingKits (845).
**Method**: `scripts/mpf/audit-invariants.py` — READ-ONLY Firestore walk (zero writes), 1-cent tolerance (0.0105 float slack). Raw data: `tasks/test-evidence/invariants-audit.json`.
**Every flagged row was then triaged against the MPF source workbooks** (`tasks/mpf-source/*.xlsx`) before being called a defect. The classifications below are source-verified, not guessed.

At-a-glance (first run, 2026-07-04 07:53):

| Invariant | Checked | Clean | Flagged | Verdict after source triage |
|---|---|---|---|---|
| I1 inc/ex GST consistency | 4,814 | ✅ all | 0 | Clean |
| I2 price-ladder ordering | 801 | ✅ all | 0 | Clean |
| I3 landed-cost chain recompute | 809 | ✅ all | 0 | Clean |
| I4 margin sanity (cost ≤ sell) | 801 | 794 | 7 | **NSM's own numbers, verbatim** — their MPF sells 7 Stacer hulls below their own landed cost |
| I5 motor menu vs HP envelope | 1,302 | 1,224 | 78 | **49 = audit-formula error** (per-engine HP tested against a TOTAL-HP envelope; fixed) · **29 = NSM's own file contradicts itself** · plus **1 real app bug found and fixed** (R-HP on twin-rig hulls) |
| I6 deposit schedules sum to 100% | 223 | ✅ all | 0 | Clean |
| I7 trailer menu resolves + priced | 679 | 670 | 9 | **All 4 trailer names are NSM's own dead/unpriced references** |
| I8 serviceOperations sell derivable | 369 | ✅ all | 0 | Clean (276 informational: explicit MPF sell ≠ hours × rate — MPF sell is authoritative by design D-decision) |
| I9 rigging-kit totals recompute | 845 | 5 | 840 | **Audit-formula error** — the asserted sell-side identity does not exist in the MPF; replaced with the cost-side identity that does |

Re-run counts with the corrected I5/I9 formulas are at the bottom of this file.

---

## I4 — 7 negative-margin variants: NSM's own pricing, imported exactly

All 7 are Stacer hulls (`sa409apr`, `sa429apr`, `sp319shssr`, `sp359shssr`, `sps409palr`, `sps429palr`, `sps449palr`). Verified cell-by-cell against `Boat Module.xlsx`:

| Code | MPF Landed Hull Cost | MPF Cash Sell (inc GST) | Sell ex GST | Margin |
|---|---|---|---|---|
| SA409APR | $10,202.00 | $10,710 | $9,736.36 | **−$465.64** |
| SA429APR | $12,069.00 | $13,170 | $11,972.73 | −$96.27 |
| SP319SHSSR | $2,027.49 | $2,055 | $1,868.18 | −$159.31 |
| SP359SHSSR | $2,248.00 | $2,425 | $2,204.55 | −$43.45 |
| SPS409PALR | $8,681.00 | $8,995 | $8,177.27 | −$503.73 |
| SPS429PALR | $9,903.05 | $10,395 | $9,450.00 | −$453.05 |
| SPS449PALR | $10,505.11 | $11,095 | $10,086.36 | −$418.75 |

Our `cost` equals their Landed Hull Cost to the cent and our sell equals their Cash column to the cent — **parity holds; the negative margin is inside NSM's own file** (deliberate loss-leader pricing or a stale cost — their call, flagged back to NSM alongside the Stabicraft/Haines findings).

## I5 — motor menus vs HP envelope: one real app bug, the rest split audit-error / NSM-data

The MPF's Min HP / Max HP columns are **TOTAL installed HP** (proven: the twin-F150 Stabicraft 2350 carries envelope 225–350 with shaft "Sng UL / Twin XL"). The first audit run compared **per-engine** HP against that total envelope, so all 49 twin-rig rows (twin F150s = 300 total, comfortably inside 225–350) were false alarms. The audit script now accepts a menu entry when either its per-engine or its total HP lands in the envelope.

**The real app bug this surfaced (fixed, FFR-31)**: the Step-5 curation rule R-HP made the same per-engine-vs-total mistake. On a hull with both envelope bounds set that runs twins (e.g. Stabicraft 2350, envelope 225–350), any dealer-fit item named for the per-engine motor ("Cowl Cover to suit F150") was wrongly hidden. Fix: `CurationContext` gains `maxEngines` (derived from `motorEnvelope.shaft` "Twin/Triple/Quad" wording or the motor-config type) and R-HP tests the item's HP interval scaled by every plausible engine count — still fail-open. 4 new unit tests; 554/554 green. Note the motor menu itself was never affected: NSM Recommended renders the curated slots unfiltered.

**The 29 single-engine rows are NSM's own file contradicting itself** — their curated motor slots sit outside their own Min/Max HP columns on the same boat row. Examples straight from their data: SRT-635BR envelope 200–225 HP yet the menu carries F250s; SCP609 envelope 130–150 yet the menu carries an F115; SCCP589 envelope 115–140 yet the menu carries F150s. HelmLogic shows the curated menu regardless (curation wins; the envelope only steers Step-5 relevance, which fails open), so nothing breaks in the app — but the contradiction is theirs to rule on and goes on the NSM asks list.

## I7 — 9 unresolved trailer-menu slots: all four names are NSM's own dead or unpriced references

| Trailer name in NSM's Boat Module menus | On boats | What the Trailer Module says |
|---|---|---|
| REDCO Sportsman - RES1210S | SP359 ×2 | **Does not exist anywhere in their Trailer Module** |
| REDCO Surtees Special - RS480-MO Slider | 495 Pro Fisher, 495 Workmate | That display name does not exist (only "REDCO Slider - RS480-MO" and a Highfield PA460 variant) |
| REDCO / CC7.5 Alloy Multi Roller - TA800T-EH2 (4,240kg) | CC7.5 ×2 | That display name does not exist (only Stabicraft 2350/2500 variants of the TA800T-EH2) |
| Formosa GRT Tow Catch - RE1513Q-MO (Gal Steel, Single Axle) | GRT 425/455 ×3 | **Exists but is unpriced in their own file**: Dealer 0, Nett 0, RRP 0, Sell 0, MU −1 (row 153) |

Our import carried all of this faithfully — the dangling references and the $0 trailer are in the master file itself. Goes on the NSM asks list with the other returned-value findings.

## I9 — 840/845 flags were a wrong invariant, not wrong data

The first run asserted `totalSellInstalled == sell + labour + parts + sundry`. **That identity does not exist in the MPF.** Verified against `Rigging Module.xlsx`: NSM hand-sets the combined "Rig + Install" Sell Price off Total CTD with a back-derived markup — e.g. kit 704-6Y52R-SE-50 has rollup sell $1,062 while kit-sell $940 + labour $520.36 + sundry $10 = $1,470.36. NSM deliberately sells install labour below its standalone price when bundled. Our `totalSellInstalledExclGst` is imported verbatim and its MPF parity is proven by the battery.

The identity that DOES hold in their sheet is on the cost side:

```
totalCostInstalled == kitCost + installLabour + installAdditionalParts
                      + installSundry + Σ components[].ctd
```

(also source-verified: Total Install CTD $804.23 = labour $520.36 + sundry $10 + component CTDs $273.87 [Rigging Flange $41 + Hose $47 + Cable Allowance $185.87]). The audit script now checks this identity instead.

## Corrected re-run (2026-07-04, post-fix formulas)

| Invariant | Checked | Flagged | Disposition |
|---|---|---|---|
| I1 inc/ex GST | 4,814 | 0 | ✅ |
| I2 ladder order | 801 | 0 | ✅ |
| I3 landed chain | 809 | 0 | ✅ |
| I4 margin | 801 | 7 | NSM's own below-cost pricing, verbatim (table above) |
| I5 motor envelope (per-engine OR total accepted) | 1,302 | 29 | All 29 are NSM's file contradicting its own Min/Max HP columns |
| I6 deposit schedules | 223 | 0 | ✅ |
| I7 trailer menu | 679 | 9 | All 4 names are NSM's own dead/unpriced references (table above) |
| I8 service ops | 369 | 0 | ✅ (276 informational: explicit MPF sell is authoritative) |
| I9 rigging cost identity | 845 | 28 | Extraction-window scope note (below) — zero sell-side or parity impact |

**The I9 residual, explained.** With the parts allowance counted once (the sheet's own "Additional Parts" cell IS `=Σ component CTDs`), 817 of 845 kits recompute exactly. The 28 that remain are all NEGATIVE deltas in six clean clusters (−$340 ×12, −$380 ×13, −$475, −$598, −$760, −$340.01) across a handful of gauge/DBW kit families (6X3/6X6/6X7/703/704-6YC1L etc.) and their brand-scoped copies: NSM's Total Install CTD formula on those rows sums install-component cells **beyond the four component pairs our extraction captured** (extra gauge/harness allowances on those kit families). The imported `totalCostInstalled` itself is verbatim from the MPF and parity-proven — nothing a customer or margin report sees is affected; the only gap is that our `components[]` list is a 4-slot window of a wider row. Logged as an extraction scope note, not a defect.

---

## Outcomes

1. **App fix (FFR-31)**: R-HP twin-engine scaling in `src/lib/step5-curation.ts` + `maxEngines` wiring in `highfield-quote-flow.tsx`; 4 new unit tests, 554/554 green.
2. **Audit-script fixes**: I5 accepts per-engine OR total HP against the envelope; I9 replaced with the source-verified cost-side identity.
3. **NSM asks list grows by three source-data findings**: 7 below-cost Stacer hulls, 29 motor-menu-vs-HP-column contradictions, 4 dead/unpriced trailer references (9 boat slots).
4. **Zero data patches** — every flagged value in Firestore matches the MPF to the cent; nothing to "fix" on our side without an NSM product ruling.

Re-run: `python3 scripts/mpf/audit-invariants.py` (read-only, ~4 min).
