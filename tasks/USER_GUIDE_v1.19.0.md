# v1.19 — User Guide

**Audience**: Org admins + salespeople + GMs.
**Theme**: Pricing controls. Margin discipline at finalize time, model-level fit-out package pricing, foundation for variations.

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| Set a margin floor for your org | /manage → Organisation settings (manual today) | 1. Margin threshold |
| Approve a below-threshold quote | Proposal view → Finalize | 2. GM override |
| Set a package price for a model's basic / moderate / complex fit-out | Catalog Manager → boat model editor → Fit-Up Complexity card | 3. Per-model fit-out pricing |

## 1. Margin threshold

**Default**: 15% (warn-band 15–20%, fail-band below 15%).

**To change for your org**:
- Set `organisation.marginThresholdPct` directly in Firestore for now. UI admin surface for the threshold value lands v1.20.

**What happens at finalize**:
- The salesperson clicks Create Proposal.
- The system computes the live margin from `buildQuoteFinancials(payload).marginPercent`.
- Above threshold + 5pts: passes through quietly.
- Within 5pts of threshold (warn band): passes through but the live margin widget renders amber.
- Below threshold: gate engages (see section 2).

## 2. GM override

When a quote is below the threshold, two paths:

**You have the `can_override_margin` permission** (org admin toggles per role on `/manage`):
- A margin-override dialog opens.
- Enter a reason (min 6 characters) — "trade-in offset", "strategic account", "end-of-line clearance".
- Click Approve. The override is recorded on the quote audit log with your uid + reason + timestamp.
- The finalize proceeds.

**You do NOT have `can_override_margin`**:
- A destructive toast appears: "Quote below 15% margin threshold. Current margin X%. A GM override is required to finalize. Ask someone with the Override margin threshold permission to complete this quote."
- Finalize blocks. You can adjust the quote (add value, reduce discount) or hand it to a GM.

## 3. Per-model fit-out pricing

**To set a package price for a model**:
1. Open Catalog Manager → click into a Highfield model (e.g. CL380).
2. Scroll to the Fit-Up Complexity card.
3. Below the complexity dropdown, you'll see three new inputs under "Package pricing (ex GST)": Basic, Moderate, Complex.
4. Enter the package price for any tier you want to lock in. Leave the others blank.
5. Save.

**What this affects**:
- The v1.18 default behaviour (sum of selected fit-up items from the catalog) still wins when ALL three tiers are blank.
- When a tier has a value, the v1.20 quote flow will offer "Use package price" alongside the itemised view.
- Today (v1.19) the schema + admin surface ship; the quote-flow consumption lands in v1.20.

**Tips**:
- Set Basic but leave Moderate and Complex blank to lock in just an entry-level package; the other tiers fall back to summed-items.
- Empty input = null in the doc. Negative values are rejected.

## Synthesis: where v1.19 lands you

- Pricing discipline now has teeth. A quote with thin margin can't slip out the door without a GM signing for it on the audit log.
- Model-level fit-out pricing means you can stop running "Complex" through the per-item catalog summation and instead lock in a clean dealer-package number. v1.20 wires the consumption in the quote flow.
- Quote variations are NEW concept landing this cycle. Schema is in, rules are in, helpers are in. v1.20 ships the salesperson editor + customer accept page + variation PDF render, layering on top of this foundation.

## What v1.19 did NOT ship (deferred to v1.20)

- Variation editor UI + customer accept page + variation PDF render (foundation ships v1.19, surfaces v1.20).
- Reporting & Analytics Dashboard (8.2.1, retargeted from v1.19 to v1.20).
- Receipt PDF rendering UI (lib v1.18, UI v1.20).
- Contract Signing Pack Generation (v1.20).
- Org-level UI to edit `marginThresholdPct` (today it's a Firestore field edit; admin UI v1.20).
- Quote-flow consumption of per-model fit-out pricing (schema v1.19, consumption v1.20).
