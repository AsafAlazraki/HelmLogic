# HelmLogic v1.34.0 — The Motor Release

**Date:** 2026-07-27 · **Branch:** `claude/app-overview-wKiZ1` (dev) · **Status:** complete on dev, prod merge pending

## Release Stats

- **14 stories · 68 points** across 6 epics (Guided Configuration, Promotions, Data Management, Service Quoting, Platform & Tooling, Testing & Evidence)
- **228 MPF motor rows** now drive every motor surface (catalogue, quoting, rebates, PDFs)
- **122 Incapsula-walled Yamaha images** harvested via real-browser TLS-bridge session and mirrored to Storage
- **FFR-33 held at $103,731 exact** through every change in the cycle (re-proven after grid bundles, rebates on/off, and the motor-only flow)
- New Firestore surfaces: `data-warehouse/{vendorId}/rebates/{id}` (+ `sales` subcollection) — deliberately inside the existing recursive data-warehouse rules wildcard, **no rules deploy required**
- New route: `/modules/{id}/motor-quote` (full-screen motor-only proposal flow)

## 1. Motor-only FULL quote flow (the headline)

"New Motor Quote" on the Yamaha module now opens the **same full-screen proposal flow as boats** — literally the same `HighfieldQuoteFlow` component in `motorOnly` mode — entering straight at the Motor step:

- **Steps:** Motor → Dealer Fit → Administration → Summary (boat step ids kept internally; `visibleSteps` drives the stepper/navigation so every boat render-gate is untouched).
- **Whole-catalogue search** over 228 motors (model / code / HP); no auto-pick.
- **Dollar-for-dollar MPF row composition:** the motor's price levels (NSM Retail / Trade / Commercial / Boating Alliance), its assigned rigging + prop standards from `masterAccessories`, its own `Install - Sell` as a standard install line, and its named `Engine Removals` charge resolved from the service-operations catalogue as an optional repower line.
- **Inc-GST Display-Sheet convention forced on** (MPF motor money is "RRP + Freight Inc GST"); finalize stamps `pricingConvention: 'display-sheet-v2'` + `quoteKind: 'motor'`.
- **Finalize lands in the same proposal page + proposal-style PDF**, with the Yamaha-branded motor hero on the cover (motor photo full-bleed, org logo, Yamaha logo, inc-GST total). Vessel band, base-vessel card, boat/trailer rego, and boat spec pages are all skipped; the Acceptance recap says "Motor".
- The popup counter-quote wizard remains on the **Service module only** (counter sales); its motor path is a focused 3-step wizard (Customer → Motor → Review) with trade-in + balance payable.

## 2. Yamaha Rebates (MPF campaign mechanism, end to end)

The motor module's Promotions tab is now **Rebates** — modelled on the MPF's own campaign machinery (col Y `Rebate Program`, col Z `Rebate Discount`, col BF campaign `Sell Price`):

- Create a rebate: name, optional promo photo, optional **offer website link**, start date, **auto-end timer**, SKU search with a **temporary new price per SKU** (+ %-off bulk helper). A SKU can only ride one rebate at a time.
- While active, each selected MPF row is **stamped** (`activeRebate` + the MPF's own `Rebate Program` / `Rebate Discount` columns) so every surface that reads MPF rows sees the rebate join-free. `getActiveRebate()` gates every read client-side (start/end window enforced), so a stale stamp can never price a quote.
- **Every selling surface shows it:** red band on the Motor step (photo, saving, offer link), slashed prices on menu/grid/hero cards and the counter picker, red "Factory rebate applied / You save" banner + was-price on both customer PDFs.
- **Sales history:** finalizing a quote under a rebate records the deal (motor, customer, salesperson, discount, deal total, link) under the rebate. **End now** or the timer restores prices, moves the rebate to **Past Rebates**, and keeps SKUs, sales and the full audit changeLog browsable forever.
- Storage is vendor-scoped (`data-warehouse/{vendorId}/rebates`) — inside the deployed recursive rules wildcard, so the feature works with **zero Firestore rules action**.
- Lifecycle browser-proven: create → boat quote (band + slashed prices + PDF banner) → motor quote → both sales recorded → end → prices restored → FFR-33 re-ran at $103,731 exact.

## 3. Catalog Manager motor surfaces

- **MPF repoint:** the Motors table now reads the same dataset rows quotes price from (was the empty `/parts` collection — the v1.33 dealer-fit split-brain pattern). Dual-world accessors; every inline edit writes all field mirrors.
- **CSV round-trip:** Export emits 17 columns (specs, details, cost, all four sell levels, install sell) from a single column registry; **Import** parses the same file, upserts by Part Number (MODEL CODE), patches only changed cells through the same mirrors, creates unknown parts, never erases from blanks. Toast: `N updated · M created · K unchanged · K skipped`.
- **Define-everything sheet:** click any Part # → full editor (identity / all MPF specs incl. the CRLF fuel-tank key / every price level / install economics / accessory package with comes-standard toggles). Save on blur; live round-trip browser-proven.
- **Data derivations from the MPF's own columns:** `steeringType` from Control (213 rows), HP Rating from MODEL CODE grammar (10 rows, `hpDerivedFromCode` provenance). Genuine MPF cells always win.

## 4. Motor quoting on the service rails (counter sales)

- Motors tab in the counter-quote picker: photos, HP/shaft/control, package preview, one-click **Package** composing motor + std rigging + std prop + the row's own install line (+ engine removal in repower mode).
- Branded Yamaha motor-quote PDF (hero photo, canonical spec order, honest inc-GST money leading, trade-in + balance payable) with its own **Motor Quote document type** in Manage → Document Templates.

## 5. Dynamic PDF content for motor proposals

- `renderQuotePdf` auto-upgrades motor proposals to the **motor-quote content set** — admins author motor-proposal blocks (e.g. "Why Yamaha") independently of boat quotes, with the same toggles/ordering/preview.
- The admin-ordered `pdfStructure` now drives the **rendered** document for all document types (it was preview-only before this release).

## 6. Imagery + hardening

- 122 Yamaha CDN images (Incapsula-fronted, unfetchable server-side) harvested through a real Chromium session via the sandbox TLS bridge, mirrored to `mpf-mirror/motors/`, rows patched. Census: 153 on Storage, 0 CDN-dependent, 82 truly imageless (standing NSM asset ask).
- `/api/pdf-img` same-origin image proxy (SSRF-allowlisted) un-breaks Storage-hosted images in browser-rendered PDFs (the bucket sends no CORS headers; weserv 404s tokened URLs).
- Null-variant hardening in the quote flow (variants subscription, pdTiers) so motorOnly mode can never white-screen.

## 7. Planning catch-up

- 14 v1.34 stories seeded (`scripts/seed-v134-planning.py`), 3.10.5 retargeted to v1.35 with an honest progress note, and **story points backfilled on every live story that lacked them** (120 rows: 26 explicit estimates for the planned backlog + type-based retro-estimates for historical rows). Zero live stories without points.

## Files Changed (highlights)

- `src/components/highfield-quote-flow.tsx` — motorOnly mode (steps/nav/search/composition/pricing), rebate bands + slashed prices
- `src/app/(app)/modules/[id]/motor-quote/page.tsx` — new motor-only route
- `src/components/yamaha-rebates.tsx` + `src/lib/rebates.ts` — Rebates manager + shared read-gate
- `src/components/motors-table-view.tsx` — MPF repoint, CSV round-trip, define-everything sheet
- `src/components/catalog-item-picker.tsx` — motors tab, package composition, motorsOnly mode, rebate display
- `src/components/service-quote-flow.tsx` — 3-step motor wizard, rebate sale records
- `src/components/motor-quote-pdf.tsx` — branded motor PDF (+ rebate banner)
- `src/components/proposal-pdf.tsx` / `proposal-view.tsx` — quoteKind branches (motor hero cover, no vessel band), Investment Summary rebate banner
- `src/components/finalize-quote-dialog.tsx` — motor payload branch, rebate snapshot + sale write
- `src/lib/render-quote-pdf.ts` — motor-quote content set + rendered pdfStructure
- `src/app/api/pdf-img/route.ts` — same-origin PDF image proxy
- `scripts/mpf/derive-motor-compat-fields.py`, `scripts/mpf/browser-harvest-motor-images.mjs`, `scripts/seed-v134-planning.py`
- Tests: `yamaha-rebates.spec.ts`, `motor-only-flow.spec.ts`, `motor-quote-walkthrough.spec.ts`, `motor-detail-sheet.spec.ts`, `quote-flow-step-shots.spec.ts`, `motor-package-quote.spec.ts` (updated)
