# HelmLogic v1.31 — User Guide

> Audience: org admins + salespeople now working on top of the migrated NSM Master Price File data.
> Companion to: `tasks/RELEASE_NOTES_v1.31.0.md` (engineering changelog).

v1.31 is a data release more than a feature release: everything NSM's Master Price File spreadsheet knew is now in HelmLogic — boats, motors, trailers, factory options, dealer-fit, fit-up parts, rigging kits, service pricing, suppliers, franchise margins, freight and rego. This guide covers what that means day-to-day and the handful of new surfaces you'll use.

---

## At-a-glance map

| What you want to do | Where to do it | Section |
|---|---|---|
| Quote with NSM's recommended motor / trailer / dealer-fit for a boat | Highfield quote flow — "NSM Recommended" sections | [1](#1-nsm-recommended-on-the-quote-flow) |
| See what a boat really costs landed (FX, duty, freight) | Catalog pricing workspace → landed-cost breakdown | [2](#2-landed-cost-breakdown) |
| Browse or edit rigging kits, suppliers, pricing matrix, freight | `/manage` → **MPF Data** | [3](#3-the-mpf-data-tab) |
| Price a service from an engine's factory schedule | Service quote → engine schedule picker | [4](#4-engine-service-schedule-picker) |
| Quote a non-Highfield brand (Stacer, Stabicraft, Surtees…) | Same catalog surfaces — 9 brands now populated | [5](#5-nine-brands-of-boats) |
| Trust the numbers | Nothing to do — see the parity proof | [6](#6-how-we-know-the-data-is-right) |

---

## 1. NSM Recommended on the quote flow

The MPF's curated per-boat relationships now drive the Highfield quote flow. When you pick a boat that has MPF data behind it, you'll see **NSM Recommended** sections:

### To use a recommended motor / trailer

1. Build a quote as normal.
2. On the motor step, the boat's curated motor menu (up to 13 factory-matched options) appears above the general HP-filtered list — each entry pre-matched to the boat.
3. On the trailer step, the curated trailer menu works the same way.
4. Dealer-fit lines, standard inclusions, deposit schedule and lead times from the MPF also render where relevant.

**What this affects**: recommendations only — you can still pick anything the HP filter allows. Boats without MPF menus (or quotes started before the migration) render exactly as before.

**Tips**: if a recommended motor is missing from the list, it's usually a deliberate skip (Mercury package engines and ePropulsion electrics weren't imported into the Yamaha vendor) — the general list still has everything HelmLogic carries.

## 2. Landed-cost breakdown

### To see a boat's true landed cost

1. Open the Catalog pricing workspace for a boat brand.
2. Rows imported from the MPF show a **(landed)** tag on cost.
3. Expand the breakdown to see the full chain: base cost → factory charges → exchange rate → duty → freight legs → landed AUD.

**What this affects**: margin maths gets honest — cost is no longer a single opaque number. A flag appears if the MPF's own formula deviated from its stored value on that row.

**Tips**: freight rates per vendor live in `/manage` → MPF Data → Freight, so a freight change flows into future landed-cost conversations.

## 3. The MPF Data tab

`/manage` → **MPF Data** is the new admin home for the collections the migration created:

- **Rigging kits** — 846 kits with 3-tier ex-GST pricing and install hours.
- **Suppliers** — 1,606 suppliers with ABN, terms and credit details.
- **Supplier price lists** — vendor cost-refresh sources.
- **Pricing matrix** — per-franchise markups, trade tiers and the retail sliding scale (the org's pricing brain, formerly buried in spreadsheet formulas).
- **Engine service schedules** — 189 engines × 11 service intervals with parts BOMs.
- **Freight config** — per-vendor, per-linear-metre rates.

**To edit**: open the relevant manager, edit inline, save. Everything is org-admin gated the same way as the rest of `/manage`.

**Tips**: these are live pricing inputs. The pricing matrix in particular is what the MPF used to compute every franchise margin — treat edits like price-file changes, not settings tweaks.

## 4. Engine service-schedule picker

### To price a service from the factory schedule

1. Open a service quote (service module dashboard → quote card).
2. Use the **engine schedule picker** to choose the engine and interval (e.g. F150 — 300 hr).
3. The priced interval (labor + parts BOM) comes straight from the imported schedule.

**What this affects**: service quoting stops being from-memory — 189 engines' factory schedules are one picker away.

## 5. Nine brands of boats

The catalog now holds NSM's real multi-brand range: 810 current boats across 9 brands (Highfield, Stacer, Stabicraft, Surtees, Jeanneau — including Merry Fisher and Cap Camarat as ranges — and more; Formosa is net-new). Each carries the MPF's price ladder and curated menus.

**Tips**: obsolete boats (1,193 in the MPF) were deliberately NOT imported (decision D1) — if an old model seems missing, that's why. They can be brought in later as an archive.

## 6. How we know the data is right

You don't have to take the migration on faith:

- **36,551 writes, 0 errors**, every one logged with before/after evidence in `tasks/mpf-audit/apply-log-*.jsonl`.
- **34,512-check parity battery**: every migrated price, cost, spec and relationship re-read from live Firestore and compared to the MPF. 34,498 passed; each of the 14 fails is individually explained (they're bugs *in the source spreadsheet*, or approved skips) — **zero unexpected deltas**. Full proof: `tasks/test-evidence/MPF_PARITY.md`.
- **A fail→fix→retest ledger** (FFR-1…FFR-16) records every failure hit during the cycle, its root cause, the fix and the green re-run.
- The migration also **fixed live data that was already wrong**: 1,011 Highfield factory options had USD prices stored as AUD with cost equal to sell; they're now correct.
- Money math itself is under 460 unit tests that run on every merge, plus a nightly synthetic pass of the whole app.

---

## How the MPF migration works (synthesis)

The governing decision was: **HelmLogic's data model flexes to fit the MPF** — content matches the spreadsheet exactly, form gets upgraded. The MPF joined boats to motors/trailers/parts by display-name text through hidden dropdown sheets (one rename breaks it silently); HelmLogic stores those as validated references. The MPF mixed inc-GST and ex-GST bases sheet by sheet; HelmLogic stores ex-GST everywhere with the conversion recorded. The MPF baked exchange rates into formulas; HelmLogic uses explicit `exchangeRates`. Broken cells (`#N/A`, `#VALUE!`, not-listed-anymore parts) were quarantined and reported, never imported as prices. Where NSM's spreadsheet is wrong today (Stabicraft factory options reference a re-keyed obsolete section), HelmLogic imported the *correct* join and the bug is documented for NSM.

Nothing about day-to-day quoting changed shape: prices still resolve through price levels, GST still applies at finalization, margins still compute from cost — there's just vastly more, and more trustworthy, data underneath.

---

## What v1.31 did NOT ship (deferred / awaiting inputs)

- **Ultimate-test final comparison** — the side-by-side "same quote in the MPF vs in HelmLogic, same figure" walkthrough is rendered and extracted (SP560 + F90XB, cash $41,340.00 target) but the final comparison sign-off is pending.
- **CL380 checklist solo re-run** — the browser checklist failed under suspected network contention (FFR-16); it's queued to re-run solo on a quiet bridge.
- **NSM asks (we need inputs from NSM)**: Yamaha motor images that sit behind Incapsula and are genuinely unfetchable server-side (38 URLs — need NSM-supplied assets); SharePoint-hosted trailer images behind the M365 auth wall (need an export); a refreshed Yamaha price file; and a fix in *their* MPF for the broken Stabicraft factory-option keying.
- **Supplier price lists follow-up wave** — the 15 vendor lists (~60k rows) land after the masters, per decision D10.
- **Obsolete-boat archive import** (1,193 rows) — importable later per D1.
