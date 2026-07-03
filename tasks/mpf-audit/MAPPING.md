# MPF → HelmLogic Master Mapping

> Phase 1 synthesis · 2026-07-03 · Policy (decision logged): **HelmLogic's data model flexes to fit the MPF.**
> Content must match the MPF exactly; form is upgraded (typed fields, explicit references, one source per fact, audit trail).
> Detailed per-workbook analysis lives in `tasks/mpf-audit/analysis/*.md`; machine evidence in `*.evidence.json`; every step in `AUDIT_LOG.jsonl`.

## 1. The big picture — where each workbook lands

| MPF workbook | Real scale | HelmLogic destination | Confidence |
|---|---|---|---|
| **Boat Module** | 2,003 boats (810 current / 1,193 obsolete), 678 real cols, 29 blocks | `data-warehouse/{vendor}/ranges/models/variants` (Highfield 588 SKUs are *exactly* variant grain) + per-boat assignment docs (motors/trailers/rigging/props/dealer-fit) + landed-cost chain + pre-delivery checklists | High |
| **Motor Module** | 376 motors | Yamaha vendor catalog; priceLevels mapping **confirmed**: NSM Retail→`hull_cash`, Trade→`hull_trade`+`hull_subdealer`, Commercial→`hull_commercial`, Boating Alliance→`hull_boating_alliance`, Total CTD→`cost` | High |
| **Trailer Module** | 470 trailers (+obsolete tail) | Trailer-brand vendors (Dunbier etc.); QLD 2-band rego table stays info-only per v1.4 lesson | High |
| **Factory Options Module** | 19,171 option rows in 706 boat sections (+obsolete section) | `models/{id}.optionalFeatures` keyed by **option code** (the one code-keyed join in the MPF) | High |
| **Parts – Dealer Fit Module** | 1,795 DFOs, 95 sections, Act CTD/Act Sell verified | `organisations/{org}/dealerFitSelections` — the literal origin of the Act Sell/Act CTD convention | Very high |
| **Parts – Parts Maintenance** | 3,532 part codes w/ install hrs + op codes | `fitUpItems` + `serviceOperations` linkage | High |
| **Parts – Parts Data Drop** | 26,347 DMS inventory rows (164 franchises) | `serviceParts` (key: Franchise+Part) | Very high |
| **Parts – 15 vendor lists** | ~60k rows total (BLA/SAW/RWB/Garmin…) | NEW `supplierPriceLists` (cost-refresh sources) | Medium-high |
| **Rigging Module** | 961 kit part numbers, 26 sections, 3-tier pricing + install | NEW `riggingKits` collection | High |
| **Supplier Module** | 1,606 suppliers (ABN/terms/credit) | NEW `organisations/{org}/suppliers` | High |
| **Service Module** | 189 engines × 11 service intervals + BOMs; 366 flat-rate op codes | `serviceOperations` + `serviceParts` + NEW engine service-schedule structure | High |
| **Price Matrix** | Per-franchise margins + trade tiers + retail sliding scale + FX | NEW `pricingMatrix` (org-level pricing brain) + `exchangeRates` | High |
| **Registration Module** | QLD-only banded rego catalog | v1.4 Rego module with explicit `state: 'QLD'` wrap | High |
| **Freight Module** | Per-linear-metre, per-vendor rates | Per-vendor freight config feeding landed cost | High |
| **Administration Module** | Bank details, finance config | Org settings (bank/finance blocks) | Medium |
| **Customer Module** | 44 **B2B dealer-network accounts** (NOT retail customers) | Sub-dealer / price-level assignments — NOT `customers` | High |
| **Contacts Module** | Staff directory (57) | Org staff/salesTeam reference | Medium |
| **BMT Stock Holdings** | Empty template | Nothing to import; schema informs stock module | n/a |
| **Hull Only Module** | Stale generated Highfield price list | **Reconciliation fixture only** — not an import source | n/a |

## 2. Schema flexes required (per the logged decision)

1. **`riggingKits`** (new): kit → components, 3-tier ex-GST pricing, install hours at shop rate, inclusion flags.
2. **`suppliers`** (new, org-level): id, name, ABN, terms, credit, DMS invoice config.
3. **`supplierPriceLists`** (new): vendor cost-refresh sources with as-at dates.
4. **`pricingMatrix`** (new, org-level): per-franchise markup %, trade/sub-dealer discount tiers, retail sliding scale by price band. Replaces scattered hardcoded margins.
5. **Per-boat assignments** (extend models): curated motor menu (13 slots: motor + rigging kit + prop + engine hole), trailer menu (10 slots), dealer-fit lines (42) — as typed references, replacing the MPF's display-name string joins. HP-range filter becomes the fallback, curated menu the primary (pending D3).
6. **Landed-cost chain** (extend models/variants): baseCost, factory charges, exRate, duty, freight legs, other charges — currently a single `cost` field.
7. **Pre-delivery checklists** (extend models or org templates): MPDC/DPDC checklist text blocks.
8. **Per-brand warranty labour rates** (extend serviceOperations config): MPF prices warranty labour per brand; we assume one hourlyRate.
9. **Campaign/"Sell Price" level** (extend motor priceLevels): the campaign-discounted retail column has no HelmLogic slot (pending D7).
10. **Obsolete flag** (extend catalog docs): the MPF's current/obsolete split, preserved rather than dropped (pending D1).

## 3. Systemic quality upgrades (content identical, form stronger)

- **String joins → typed references.** The MPF joins boats↔motors/trailers/rigging/dealer-fit by *display-name text* through hidden Dropdowns sheets. One rename silently breaks it (we found keys with embedded spaces, `#N/A` inside part numbers, duplicate codes). Every join becomes an ID reference validated at import.
- **Bound-scanning imports.** 5+ workbooks have phantom Excel dimensions (one claims 1,048,576 rows for 645 real; one Dropdowns sheet has a 200+ row data-island gap). Importers scan to proven data boundaries, never trust declared size, and never early-stop on a single gap.
- **GST base normalization.** MPF mixes inc-GST (boat sell ladder, Highfield accessories) and ex-GST (rigging, most parts). HelmLogic stores ex-GST everywhere; import converts with the conversion recorded per row.
- **Explicit FX.** Hardcoded per-sheet FX (USD 0.7 baked into formulas, EUR ×1.75 implicit) becomes explicit `exchangeRates` references.
- **Error quarantine.** 193 cached `#N/A`/`#VALUE!` cells frozen into the MPF's values get quarantined + reported, not imported as prices.
- **Dedup with provenance.** Duplicate part codes (~135) and motor model codes (51) resolved by composite keys; every resolution logged.

## 4. Their data bugs we found (report to NSM — this is the "pulling their weight" evidence)

1. **Stabicraft factory options are broken in the MPF today**: boat rows reference option codes that resolve almost entirely to the OBSOLETE section (Sportfish: 0 of 57 active; Treker: 0 of 50). The active section was re-keyed to 10-digit codes and the Boat Module was never migrated. Verified join fix exists (FO hull-row NSM code == Model Code) — we can import *correctly* what their own spreadsheet currently gets wrong.
2. Legacy service ops where **Sell < CTD** (selling below cost if ever used) — excluded, documented.
3. 633 model codes duplicated current-vs-obsolete; 2 typo'd staff email domains; superseded vendor sheets still live; stray-space keys.

## 5. Open decisions (need Asaf's ruling before Phase 3 applies anything)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Obsolete boats (1,193 rows): import with `obsolete: true` or skip? | Import current-only now; archive importable later |
| D2 | NSM's cash prices are hand-rounded **inc-GST**; store as-is or recompute from ex-GST? | Store their inc-GST as authoritative display price; keep ex-GST derived + flagged where ≠ formula |
| D3 | Motor selection: their curated 13-slot menu vs our HP-range filter | Curated menu primary, HP filter fallback for unlisted |
| D4 | Create vendors for 8 non-Highfield brands (Stacer, Stabicraft, Surtees…)? | Yes — it's their real catalog (the only-Highfield rule was for test data) |
| D5 | 15 supplier price lists: vendor-shared or per-org (BLA pricing is negotiated)? | Per-org |
| D6 | Stabicraft FO bug: import via the verified NSM-code join (correct) or mirror their broken state (faithful)? | Import correct + report the bug to NSM |
| D7 | Campaign "Sell Price" motor column → new price level? | Add `hull_campaign` level, hidden unless populated |
| D8 | riggingKits: org-level (NSM shop rate embedded) or vendor-level? | Org-level |
| D9 | Customer Module's 44 B2B accounts → sub-dealer records now or with sub-dealer rollout phase? | With sub-dealer rollout |
| D10 | Import all 15 vendor price lists now, or masters first (Parts Maintenance/DFO/Data Drop)? | Masters first; vendor lists in a follow-up wave |

## 6. What Phase 2 does next

Read-only reconciliation: current HelmLogic Firestore vs MPF values, field by field, producing the match/mismatch/missing-each-way diff with counts per module — the evidence backbone of the visual report. No writes until decisions above are made and Phase 3 is approved.
