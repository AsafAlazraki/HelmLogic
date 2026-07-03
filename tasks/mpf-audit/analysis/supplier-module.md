# MPF Audit — Supplier Module.xlsx

**Source**: `tasks/mpf-source/Supplier Module.xlsx` (256 KB, 1 sheet)
**Method**: openpyxl 3.1.5, `read_only=True, data_only=True`. Strictly read-only.
**Date**: 2026-07-03

---

## 1. Structure

Single sheet `Sheet1`, header row 1, **1,606 data rows, 1,606 distinct `Supplier Id`** — a clean flat registry (clearly a DMS export: the Gen.Receipt/Parts Receipt columns are DMS invoice-processing settings).

| # | Column | Non-empty / 1,606 | Notes |
|---|---|---|---|
| 1 | `Supplier Id` | 1,606 | **Natural key.** Short mnemonic code (`AMEX`, `ONE`, `2 KOOL`, `YAM`, `BLA`, `HIGHF` …) |
| 2 | `Supplier Name` | 1,606 | |
| 3–6 | `Address1`, `Suburb`, `Post Code`, `State` | 1,550 / 1,544 / 1,516 / 1,519 | AU addresses |
| 7 | `Phone No.` | 1,407 | |
| 8 | `Payment Terms` | 1,502 | e.g. `Net 14 Days`, `Net 7 days`, `<None>` |
| 9 | `Email` | 1,141 | some are websites pasted as email (`www2kool@yahoo.com.au`) |
| 10 | `Contact` | **223** | sparse |
| 11 | `ABN` | 1,502 | |
| 12 | `ACN` | **27** | near-empty |
| 13 | `Mobile` | 459 | |
| 14 | `CR Limit` | 1,606 | credit limit (0 common) |
| 15 | `Payment Type` | 1,539 | `EFT`, `Direct DR` … |
| 16–19 | `Gen.Receipt Invoice Format`, `Gen.Receipt Invoice Tax Type`, `Parts Receipt Invoice Format`, `Parts Receipt GST Calc` | 1,606 / 1,605 / 1,606 / 1,606 | DMS invoice/GST processing config (`Unit Ex Tax`, `Net Inc Tax`, `Other Acquisition`, `Net Invoice Total`) |

Sample rows: `AMEX / Amex Fees` (an expense pseudo-supplier), `ONE / 1 Solar LED Energy Systems (Brendale QLD)`, `2 KOOL / 2 Kool (Paradise Point QLD)`.

## 2. How other modules reference suppliers

- **Parts Module → `Parts Maintenance.Supplier`**: references `Supplier Id` — **42** of its ~60 distinct supplier values match the registry exactly (YAM, LOW, SIM, HIGHF, BBB, BLA, MIN, GME, SAW, GAR, HELLA, EJM, IBC, ATL, ALLMAR, VIK, RWB …). The rest are case-drift (`Yam`), truncations (`HIG`), free-text names (`Cross Creative Desig`, `Hookem Fishing`, `Boatcatch Pty Ltd`), or pseudo-suppliers (`NSM`, `Sublet`, `Factory`, `DFO KITS`).
- **Parts Module → `Parts Data Drop.Franchise`**: 164 distinct franchise codes; **70** are registry `Supplier Id`s. The `9XX` family (`9HI` Highfield, `9ST` Stacer, `9ME`, `9DU`, `9VO` …) are internal DMS franchise prefixes for boat/trailer brands, deliberately distinct from purchasing suppliers.
- **Vendor price-list sheets**: sheet names correspond to registry suppliers (BLA, SAW, VIK, GME, HELLA, CAM/Camec …) — the linkage is by convention, not formula.
- **Rigging Module**: no supplier column; supplier implied per section (Yamaha, ePropulsion, brand factories).
- The registry contains far more suppliers (1,606) than the parts sheets use (~60 active) — it is the full accounts-payable ledger including one-off and expense vendors (AMEX fees etc.).

## 3. Proposed HelmLogic mapping

| Item | Target | Rationale | Confidence |
|---|---|---|---|
| Registry rows | **NEW collection** `organisations/{orgId}/suppliers/{supplierId}` (doc id = trimmed `Supplier Id`) | No existing HelmLogic collection holds supplier master data. `serviceParts` (v1.10) has stock but no supplier registry to link to; `fitUpItems` carries cost with no source-of-cost. Fields: id, name, address block, phone/mobile/email/contact, abn/acn, paymentTerms, paymentType, creditLimit. The four DMS invoice-format columns are DMS-internal — capture into a `dms{}` sub-object or drop | **High** |
| Link from parts | `supplierId` field on `serviceParts` / `fitUpItems` / vendor price-list items | Mirrors `Parts Maintenance.Supplier` and `Parts Data Drop.Franchise`; requires a normalisation map for drift values (`Yam→YAM`, `HIG→HIGHF`) and a policy for pseudo-suppliers (`NSM`, `Sublet`, `Factory` → keep as internal supplier docs or an enum) | Medium-high |
| Import policy | Import **active** suppliers only (those referenced by parts/franchise data ≈ 70–100), keep the rest in a cold archive or import all with `active:false` | 1,606 includes expense/one-off vendors irrelevant to quoting | Medium — needs a product decision |

## 4. Anomalies

1. **Pseudo-suppliers**: expense entries (`AMEX / Amex Fees`) mixed into the vendor registry.
2. **Referencing drift**: `Yam` vs `YAM` (313 vs 566 uses in Parts Maintenance), `HIG` vs `HIGHF` — joins on raw values fragment supplier history.
3. **`9XX` franchise codes are not suppliers** — 94 of 164 Parts Data Drop franchise codes are absent from the registry; do not force-create suppliers from franchise codes.
4. **Data quality**: websites in the Email column; `Contact` only 14% populated; `ACN` 1.7%; `<None>` literal in Payment Terms.
5. **One row gap**: 1,607 max_row → 1,606 real (header only; clean otherwise — best-quality file of the three).
