# HelmLogic — User Guide v1.32.0

**Audience:** org admins + salespeople at Northside Marine.

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| Quote a boat and get the same number as the Master Price File sheet | Quote flow (any MPF boat) | 1 |
| See what Pre-Delivery & Installation costs on a package | Quote flow Step 6 + the customer PDF | 2 |
| Get the rigging kit + prop priced automatically with a motor | Quote flow Step 3 (Recommended for this boat) | 3 |
| Understand the new price display (inc GST first) | Running total card, proposal, PDF | 4 |

## 1. Quotes now match the Display Sheet — to the dollar

For every boat that came from the Master Price File (all 809), a HelmLogic quote now assembles the package exactly the way the Display Sheet does: the hull's ladder price, pre-delivery and installation, the motor at NSM Retail, its rigging kit and propeller, the trailer, and registration — with options added at their listed figures.

**To do it:** quote as normal. Nothing extra to click — the package machinery is automatic.

**What this affects:** the running total, the proposal view, and the customer PDF all show the same number the Display Sheet produces for the same configuration.

**Tips:** older quotes (finalized before this release) keep their original pricing exactly as issued — nothing historical changes.

## 2. Pre-Delivery & Installation is a real line now

Every MPF boat carries its pre-delivery tier (boat PD + motor install + rigging labour, e.g. "29 hrs" on an SP560). It is included in the package automatically and appears as **"Pre-Delivery & Installation"** on the customer PDF — the exact counterpart of the sheet's "Including Pre Delivery and Installation".

## 3. Recommended motors bring their bundle

Picking a motor from **Recommended for this boat** (Step 3) automatically prices in that slot's rigging kit (installed) and propeller — the same bundle the Display Sheet builds. Picking a motor from the general grid does not add the bundle (use the recommended menu for sheet-identical packages).

## 4. Prices read inc-GST first

On MPF boats the big running number is **inclusive of GST** (the label says so), with the ex-GST figure shown alongside — matching how the Display Sheet talks about money. The PDF totals show net ex GST, GST, and the inclusive total.

## How Display-Sheet pricing works (synthesis)

The Master Price File's figures are GST-inclusive money (their own column headings say "Inc GST"). HelmLogic now sums those figures raw — hull ladder + PD tier + motor + rigging + prop + trailer + regos + options — and derives the ex-GST figure as the total ÷ 1.1, exactly like the sheet. Every stored price is a snapshot of the sheet's own cell; nothing is recomputed.

## What this release did NOT ship (deferred to v1.33)

- A picker for PD tiers 2 and 3 (the flow composes tier 1 automatically).
- Sheet-bundle pricing when a motor is picked from the general grid instead of the recommended menu.
- The nightly every-boat composition guard (battery sections M/N).
- The propeller price ruling (NSM's file carries four prices for the same prop; we calibrated to the sheet and asked NSM to rule).
