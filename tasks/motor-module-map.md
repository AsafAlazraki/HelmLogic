# Motor Module — Full Acquaintance Map (v1.34 kickoff)

**Date:** 2026-07-17 · Basis for the "make motors absolutely perfect" phase.
Compiled from three code sweeps (data layer / UI surfaces / quote pipeline) + a live Firestore census.

## 1. The mental model

**One catalog, one source of truth**: the Yamaha vendor `mRAzkE8PUX8GMHELCvJo`, dataSet `FQ5uTMyUorrJPlpbWIY8` ("Yamaha Outboards"), rows at `data-warehouse/{vendor}/dataSets/{ds}/rows`. Live census: **235 rows = 228 real motors + 7 Excel section pseudo-rows** ("TWIN RIG OPTIONS - …", "Triple Rig Options", "YAMAHA - XTO Offshore" divider — no MODEL CODE).

Rows are schemaless with TWO naming worlds coexisting (MPF Motor-Module columns like `MODEL CODE`/`HP Rating`/`NSM Retail`, and importer names like `Part Number`/`Model Name`/`Act Sell`); every consumer reads through `||` fallback chains. The full dealer economics live on the row (GP, MU, holdback, PD allowances, install CTD/sell, labour hrs, PDI splits, freight, rebates).

**Money**: `priceLevels` built at import (`extract-motors.py` → `import-motors-trailers-fo.py`, upsert by `MODEL CODE`, never clear-and-replace): `hull_cash`=NSM Retail, `hull_trade`+`hull_subdealer`=Trade Price, `hull_commercial`, `hull_boating_alliance`, `hull_campaign`=campaign "Sell Price", `cost`=Total CTD. Values are raw inc-GST money (Display-Sheet convention). Canonical resolver: `resolvePriceLevel` in `src/lib/catalog/derive-pricing.ts`. Census: all 228 real motors carry the ladder; **0 retail-below-cost rows; 0 duplicate display names**.

**The module**: `modules/KddayQaREA5tdZzzXjDW` "Yamaha Outboards" (mainVendorId = Yamaha). Thin config: dealer-fit categories + 1 test promotion.

## 2. Surfaces (who reads what)

| Surface | File | Reads | Notes |
|---|---|---|---|
| Motor module page | `yamaha-motor-workspace.tsx` (mounted by `modules/[id]/page.tsx:658` Motor-Brand branch) | dataSet rows (name-heuristic dataset pick) | Tabs: Catalog (search/HP-filter/sort, grouped grid, read-only detail sheet) · Pricing (MPF workspace) · Promotions · Fit-up · Settings. URL-synced `?motorTab=` |
| Per-motor editor | `motor-configuration-details.tsx` at `modules/{id}/motor/{motorId}` | dataSet row | Photo upload → Storage → writes `SummaryImage`+`imageUrl` (Incapsula workaround); Factory Accessories (Propeller/Rigging/Other via MasterDataBrowser, **full-array replace** on save); Documents tab is a stub |
| Catalog Manager Motors tab | `motors-table-view.tsx` | **`data-warehouse/{vendor}/parts`** | 🚨 `/parts` is EMPTY for Yamaha (0 docs, verified live) — this surface shows nothing; inline edit/CSV/bulk markup all point at the wrong collection. The v1.17 `yamaha-mpf` importer-registry entry also targets `/parts` |
| Boat-model Motor Options tab | `motor-options.tsx` (Catalog Explorer) | dataSet rows | Per-configType compat match; `motorOverrides {hiddenIds, manualIds}`; sets `steeringType` on rows; accessory authoring incl. a "Sync Demo" seeder that writes hardcoded demo accessories |
| Quote flow Step 3 | `highfield-quote-flow.tsx:1724+` | dataSet rows | Vendor→dataset discovery, HP-compat filter, overrides, NSM Recommended menu, auto-select closest-to-maxHp, accessories, Engine Specs dialog, motor promotions band |
| Motor-only quoting | `CatalogItemPicker` via "New Motor Quote" → service module's counter-quote flow | all Motor-Brand vendors' rows | **No dedicated motor quote flow exists.** Line-item picker only: no recommended menu, no rigging/prop bundle, no PD, no Display-Sheet composition |
| PDF / proposal | `proposal-pdf.tsx` / `proposal-view.tsx` | `quote.motor` snapshot | Propulsion band + per-accessory lines, SummaryImage fallback, motor-scope dealer-fit routed under the band |

## 3. Quote pipeline (boat quotes)

1. **List build** (`:1724-1814`): Motor-Brand vendor from module associations → dataset by name heuristic → rows get `sellPriceExclGst`/`costPrice`/`priceLevels` stamped → HP filter against `model.specifications.motorConfigurations[0]` (per-engine HP + engine count; `parseHpRating` local to the flow) → minus `hiddenIds`, plus `manualIds` (bypass filter).
2. **NSM Recommended** (`:1941-1986`): `variant.motorMenu` name-resolved against loaded motors; `selectMenuMotor` stashes the slot (riggingKit/propPartNo/engineHole).
3. **FFR-33 composition** (`:2058-2114`): slot rigging kit name-matched in org `riggingKits` → "(installed)" line at `totalSellInstalledExclGst`; prop from `serviceParts.partNumber` at `packageSupplyFitIncGst → retailIncGst → sellPrice`. **Grid-picked motors never set the slot → no bundle** (documented gap, v1.34 queue).
4. **Finalize** (`finalize-quote-dialog.tsx:298-334`): `quote.motor` snapshot (name/brand/prices via `resolvePriceLevel(priceLevelUsed)`/image/specs/menuSlot) + accessories folding in the powertrain lines under display-sheet.
5. **Render**: proposal view + PDF Propulsion band; pdTier is a separate first-class package line.

Guards today: smoke I.2 (50-code price parity), J (menu names resolve), K.4 (dup-name budget, menu rows have NSM Retail), **section M** (every boat's slot kit + prop resolve/price, ratcheted), unit tests (hero-carousel chain, R-HP curation), e2e (`yamaha-motors`, `ffr30-motor-carousel-spotcheck`, `ffr33-sp560-proof` at $103,731 exact, BM checklists).

## 4. Rough edges — ranked for the perfection pass

**Broken now**
1. **Catalog Manager Motors tab reads an empty collection** (`/parts` vs dataSet rows) — the dealer-fit-tab bug class again: admin surface disagrees with the layer that drives quotes. Inline editing/CSV/bulk markup are dead for Yamaha.

**Strategic gap (the announced next phase)**
2. **No real motor-quoting experience.** "New Motor Quote" funnels into the service counter-quote picker: catalogue-price line items with no recommended packages, no rigging/prop bundle, no PD/install economics (which ARE on the motor rows: install sell/CTD, labour, PDI splits), no Display-Sheet-style motor package PDF. The MPF's own "Motor Quote Module" pseudo-row is that entry point in their world.

**Data quality (live census)**
3. **Images**: 82/235 rows have no image; 122 still point at the Incapsula-blocked `yamaha-motor.com.au` CDN; only 31 mirrored to Storage. (Story 3.10.5, image pipeline, now targeted v1.34.)
4. **`steeringType` typed on only 11 rows** while raw `Control` exists on 224 ("Tiller handle" on 38) — the tiller/forward-control compat check is effectively unenforced; derivable mechanically from `Control`.
5. **17 motors with unparseable/absent `HP Rating`** (incl. F200LC, LF200XA, XF425 family) — invisible to the HP filter, reachable only via manualIds/menu.
6. **7 section pseudo-rows** pollute any surface listing rows (grids, counter-quote picker).
7. **Accessory hygiene**: 403/833 accessories categorised "Other"; `isStandard` on only 226/833; `masterAccessories` saves are full-array replaces (one bad write drops all).

**Known ledger items (already tracked)**
8. Grid-motor bundles (v1.34 queue) · 31 unresolved rigging-kit names + 1 prop (section-M ratchet, non-HF brands) · 29 NSM menu-vs-HP-envelope contradictions (NSM ask) · prop 4-price ambiguity (NSM ruling) · PD tier 2/3 picker.

**Code hygiene**
9. Two HP parsers (`parseHpRating` in the flow vs `getMotorHp` in the workspace) — same intent, duplicated, divergence risk.
10. Dataset discovery by name heuristic in three places vs hardcoded id in scripts.
11. Motor promotions: 1 test promo; `hull_campaign` level populated but unsurfaced as a rebate story.

## v1.34 pixel-pass ledger (2026-07-19)

**26 audit findings confirmed by adversarial verification; fixed this cycle:**
PDF money presentation (inc-GST total leads, ex/GST as sub-line), admin
preview mislabel (Contract → DOCUMENT_TYPE_LABEL) + motor tab now previews
the MOTOR document with a sample package, motors-table twin-HP wrap +
header copy + empty Series column, picker skeleton loading rows +
catalogue copy, orphaned part-count line, trade-in $ affordance + label
consistency, wizard title per quote kind, module-page wrong-dashboard
flash (vendor-loading gate), PDF install-line stutter / code echo /
ragged spec grid / image-less hero tightening.

**Recorded, deliberately deferred (generic surfaces / cosmetic lows):**
generic module dashboard dead zone (all modules, not motor-specific),
active-tab underline width, X icon on Back to Hub, picker tab icon
metaphors, disabled-Back affordance, anchored-row triple status icons,
Export/Import JSON toolbar row, model-name normalisation (MPF data),
stock-card copy redundancy, PDF-sections selected-state repro.

**MPF data contradiction for the NSM asks list:** the twin-rig row
"Yam - F130XA + LF130XA" carries HP Rating "2 × 300" in NSM's own file
(should be 2 × 130 by its own model name). Same class as the 29
menu-vs-envelope contradictions — reported, not hand-patched (MPF is
source of truth).
