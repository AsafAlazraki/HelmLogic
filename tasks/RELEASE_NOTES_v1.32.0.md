# HelmLogic — Release Notes v1.32.0

**Date:** 2026-07-08 · **Branch:** `claude/app-overview-wKiZ1` → `main`

## Release Stats

- **1 flagship engine change**: Display-Sheet package pricing (`pricingConvention: 'display-sheet-v2'`) — HelmLogic quotes now compose and price exactly like NSM's own Display Sheet, for every MPF boat
- **2 field-reported defects closed** (FFR-33 program), reconciled to the dollar and browser-proven
- **838 data patches**: 29 stale override prices swept (6 models), PD tiers imported onto all 809 live variants
- **Gates**: TypeScript clean · 558/558 unit (incl. the $103,731 fixture) · browser proof green · customer PDF verified

## The Display-Sheet pricing engine (FFR-33)

Mark McWilliams' field test (2026-07-07) produced the same SP560 quote in NSM's Display Sheet ($103,731) and HelmLogic ($99,112). The $4,619 reconciled exactly into three causes, all fixed:

### 1. Stale override layer — swept for every boat
`organisations/{org}/modelOverrides` still carried pre-migration option prices (the USD-as-AUD cost==sell era) that the quote flow merges over the catalog. 29 shadowed prices across 6 models (cl290, cl340, cl340ft, sp560, sp660, ul310) synced to the MPF catalog values; re-audit shows zero shadows fleet-wide. Scripts: `audit-override-staleness.py` (read-only blast radius) + `sweep-override-staleness.py` (logged apply).

### 2. Package composition — PD, rigging and prop now compose like their sheet
Their package price bundles boat pre-delivery, motor PD + installation and rigging labour (the **PD tier**: e.g. 29 hrs → $5,300 on the SP560), plus the slot's rigging kit and propeller. The Display-Sheet composition was reverse-engineered cell-by-cell (`tasks/mpf-audit/analysis/display-sheet-composition.md` — their $85,648 package rebuilt to within $10 from their own workbook cells), the per-boat PD tiers imported onto **all 809 live variants** (`scripts/mpf/import-pd-tiers.py`), and the quote flow now auto-composes: PD tier line + slot rigging (installed figure) + prop on every MPF boat. The customer PDF gains a first-class **"Pre-Delivery & Installation"** line.

### 3. GST convention — their figures are inc-GST money
NSM's own column titles settle it ("RRP + Freight **Inc GST**"): motor retails, trailer sells, option and dealer-fit figures are GST-inclusive, and their sheet sums them raw with ex-GST back-derived as total ÷ 1.1. New quotes are stamped `pricingConvention: 'display-sheet-v2'` and computed in inc-GST money end-to-end (flow running card, proposal view, customer PDF). **Legacy quotes are immutable snapshots and keep their original convention** — old finalized quotes render exactly as they always did.

### The proof
Mark's exact configuration rebuilt in the real browser through the real quote flow — every selection delta-verified — and finalized to the customer PDF: **$103,731 inc GST, identical to his sheet on every line** (hull 48,350 · PD tier 5,300 · F90XB 17,643 · rigging 3,110 · prop 282 · trailer 10,430 · spare 760 · regos 250 + 283 · all eight option lines exact). Evidence: `tasks/test-evidence/ffr33-sp560-proof/` (per-step screenshots + `SP560-display-sheet-proof.pdf`), driver `tests/ffr33-sp560-proof.spec.ts`, ledger FFR-33.

### Known residuals (honest list)
- The propeller carries **four coexisting prices in NSM's own file** (247/272/240/285.29); the package supply+fit figure is calibrated ($282, provenance on the part doc) pending NSM's ruling.
- **Standing ask: the Display Sheet workbook itself** (their quoting tool is not among the 17 supplied workbooks). With it, package composition becomes copied rather than inferred, structurally guaranteeing every-quote parity.
- PD tier picker (their tiers 2/3) and slot-bundle pricing for grid-picked motors are follow-ups; the battery's every-boat composition guard (sections M/N) lands next cycle.

## Also in this release
- Battery sections I/J (extract-diff parity) now **skip visibly** on checkouts without the gitignored MPF extraction JSONs (nightly CI, fresh containers) instead of crashing; live-only sections keep guarding.
- `Rego Decals (Std) t/s Hypalon Tubes` ($169) seeded as a quotable dealer-fit item (existed only in their sheet's picker; figure verified on both quote PDFs).
- Evidence-config Playwright launches the container's pre-installed Chromium when the pinned build is absent.

## Files Changed
**Engine**: `src/lib/quote-financials.ts` (versioned `display-sheet-v2` path), `src/components/highfield-quote-flow.tsx` (composition + inc-primary display + slot powertrain lines), `src/components/finalize-quote-dialog.tsx` (convention stamp + pdTier snapshot), `src/components/proposal-view.tsx` (convention-aware totals), `src/components/proposal-pdf.tsx` (PD line).
**Data tooling**: `scripts/mpf/import-pd-tiers.py`, `scripts/audit-override-staleness.py`, `scripts/sweep-override-staleness.py` (+ apply logs in `tasks/mpf-audit/`).
**Tests**: `tests/ffr33-sp560-proof.spec.ts`, `tests/ffr33-pdf-rerender.spec.ts`, `tests/unit/quote-financials.test.ts` (+4 v2 fixtures), `scripts/smoke-1000.py` (I/J graceful skip).
**Docs/evidence**: `tasks/ffr33-composition-notes.md`, `tasks/mpf-audit/analysis/display-sheet-composition.md`, `tasks/test-evidence/ffr33-sp560-proof/`, `override-staleness.json`, ledger FFR-33.
