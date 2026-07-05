# NSM MPF — Small Modules Decode

> Evidence-grade audit, 2026-07-03. Read-only. Sources under `tasks/mpf-source/`.
> Covers: Price Matrix, Registration, Freight, Administration, Customer, Contacts, BMT Stock Holdings, NSM Boat Module Sample.csv.
> Companion evidence: `service-small.evidence.json`. Customer/contact PII is masked in this doc.

---

## 1. Price Matrix.xlsx — the pricing brain (3 sheets)

### Sheet `Price Matrix` (70 rows × 21 cols)
Two banner notes: **"NB: Trade/Sub Dealer Pricing is Discount off Retail"** and
**"NB: All Admin Loads removed 18.08.2025 as per MM / JF Request"**.

Header (row 7, cols C–U): `Brand | Franchise Code | (spacer) | Exchange Rate | BMT Labour Rate | Retail Labour Rate | Reviewed | CTD | Other | Sub Dealer | Trade | Sell | Factory Options | Dealer Fit Options | (gap) | Warranty Allowance | Admin Load | (gap) | Notes`.

Semantics (decoded): one row per brand/franchise (= product class). `Exchange Rate` names the buy currency
($A / $NZ / Euro / $US). `CTD` = extra load applied on cost-to-dealer; `Sell` = margin/markup applied to build
retail; `Sub Dealer` / `Trade` = **discount off retail** per the banner (so 0 = no trade discount);
`Factory Options` and `Dealer Fit Options` carry their own margin rates; `Warranty Allowance` and `Admin Load`
are extra loads (Admin Loads all zeroed since 18.08.2025 — only Jeanneau/Merry Fisher keep 0.005 warranty).
Values are fractions (0.29 = 29%). `RRP` literal = "sell at supplier RRP" (no computed margin);
`\xa0` (blank) = not applicable.

**Region A — Boat brands (rows 8–14):**
| Brand | Code | FX | Reviewed | CTD | Other | SubDlr | Trade | Sell | F.Opt | DFO | Warr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Stabicraft | 9SC | $A | 2025-03-05 | 0 | .29 | 0 | 0 | **.29** | .29 | .225 | 0 |
| Stacer | 9ST | $A | 2025-03-05 | 0 | .105 | 0 | 0 | **.105** | .15 | .225 | 0 |
| Surtees | 9SR | $NZ | 2025-03-05 | **.2** | .21 | 0 | 0 | **.21** | .25 | .225 | 0 |
| Jeanneau / Merry Fisher | 9JE | Euro | 2025-03-05 | 0 | .24 | 0 | 0 | **.24** | .25 | .225 | .005 |
| Haines Signature | 9HS | $A | 2025-03-05 | 0 | .185 | 0 | 0 | **.185** | .185 | .185 | 0 |
| Highfield Inflatables | **9HI** | $A | 2025-03-05 | 0 | .45 | **.175** | **.05** | **.475** | .5 | .3 | 0 |

Highfield is the only boat brand with trade tiers: Sub Dealer 17.5% off retail, Trade 5% off retail. Notes cite Bill Hull meetings / Margins Guide emails.

**Region B — Trailers (rows 16–21):** Trailers generic `TRA`, Redco/Tinka `9MY`, Dunbier `9DU`, Mackay `9MC`, GFab `GFAB` — all .22 across CTD-adjacent cols / Sell .22, F.Opt .25, DFO .2. Stacer Trailers `9ST` flat .2.

**Region C — Motors (rows 23–25):** Yamaha `9YA` and Yamaha Accessories `YAM`: CTD .075, Other/Sell .115, SubDlr/Trade .075, F.Opt/DFO .2 (reviewed 2025-05-27). **Rigging Kits `9YA`: Sub Dealer −0.05 and Trade −0.05** (negative discount = charged 5% ABOVE the base under the discount-off-retail convention), Sell .25.

**Region D — Accessories/Electronics suppliers (rows 27–55):** Generic Accessories `GEN` (.2, F.Opt .25), Electronics `ELE` (.2 flat). Then supplier rows: BLA, Sam Allen `SAW`, Marine Warehouse, Supercharge, Century, Oceansouth, Bargain Boat Bits, Sarca `ANC`, EJ Milde, Frank Marine (CTD .5), RW Marine, Hella, Narva, Inflatable Boat Centre (.05), Salty Captain, Permatrim — all **`RRP`** sell columns with only a CTD load (mostly .2). Garmin/Lowrance/Simrad/Raymarine/Fusion/GME/Minn Kota/Momentum: CTD .1, everything else blank. Volvo `9VO` .45 margins / F.Opt-DFO .25; Lone Star `LSM` .18 flat; ePropulsion `9EP` .25 with 0 trade discounts.

**Region E — Sublets & Admin (rows 58–59):** Sublets .15 CTD + RRP; Administration `ADMIN` all zeros.

**Region F — Retail Sliding Scale (rows 61–69):** margin by price band for retail parts:
≤$10 → 100%; $10.01–25 → 90%; $25.01–35 → 80%; $35.01–50 → 70%; $50.01–100 → 60%; $100.01–500 → 50%; $500.01–1000 → 40%; $1000.01–2500 → 30%. (Values mirrored into the `Other` and `Sell` columns.)

### Sheet `Exchange Rates` (13 rows)
`Currency | Review Date | Rate | Notes`: AUD 1 (2026-06-03), NZ **1.2** (2025-11-10), USD **0.7** (2025-06-11), EURO **0.6** (2025-04-10) — "As per discussion with MM 12.05.2026". Rates are divisor-style buy rates (AUD = foreign/rate for NZ; foreign×(1/rate) for USD/EUR — see Freight sheets using `/1.2` for NZ and `/0.7`-equivalent ×(1/0.7) for USD).

### Sheet `Exchange Rate Calculator` (52 rows)
Working scratchpad: Nett Factory Invoice 82,897.60 vs converted 66,142.64 → back-solved "Actual Exchange Rate" 1.2533; 40 line slots prorating each invoice line by the same factor; reconciliation row "Outstanding from Initial Invoice Totals = 0". A tool, not master data.

### HelmLogic mapping
- Rows → **per-vendor/per-product-class margin config**. HelmLogic price levels (NSM Retail / Trade / Sub-dealer / Commercial / Boating Alliance) are *outputs*; this matrix holds the *derivation rules* (margin on cost → retail; discount-off-retail → trade tiers). Best fit: extend org-level pricing config (v1.15 Story 3.7.6 org pricing overrides territory) with `marginMatrix` per vendor: `{sellMarkup, subDealerDiscount, tradeDiscount, factoryOptionsMarkup, dealerFitMarkup, ctdLoad, warrantyLoad, currency}`. Confidence: **High** on semantics, **Medium** on placement.
- Exchange Rates sheet → `organisations/{orgId}/exchangeRates/{currencyCode}` — **direct 1:1** (High). Note NSM stores NZ as 1.2 (divide) while HelmLogic Highfield flow multiplies USD by org rate — normalize direction on import.
- Retail Sliding Scale → parts-pricing rule for Service/Parts quoting (band-based margin). No HelmLogic surface yet; relevant to Epic 11 parts pricing. Confidence: High on decode.
- Open questions: exact formula direction of `CTD` load vs `Other`; why `Other` ≈ `Sell` on most rows (appears to be legacy duplicate); Stabicraft franchise code `9SC` here vs `9SB` PD-code prefix in Boat CSV.

---

## 2. Registration Module.xlsx (1 sheet, 34 rows)

"Registration Costs — AS at 1/7/25". Columns: item description | `REV Code` | `CTD` | `SELL` (sell = CTD rounded UP to whole dollars — same convention as HelmLogic's ceil rule).

| Group | Item | REV Code | CTD | SELL |
|---|---|---|---|---|
| Boat Registration | Up to and inc 4.5 m | REGO 1 | 126.35 | 127 |
| | 4.51–6.0 m | REGO 2 | 249.50 | 250 |
| | 6.01–10.00 m | REGO 3 | 414.00 | 414 |
| | 10.01–15 m | REGO 4 | 608.05 | 609 |
| | Not Required | — | 0 | 0 |
| Trailer Registration | Small ≤1.02 t | REGO 6 | 165.11 | 166 |
| | Large >1.021 t | REGO 7 | 282.19 | 283 |
| | Heavy >4.55 t | (none) | 997.50 | 998 |
| | Not Required | — | 0 | 0 |
| Other Fees | Boat Transfer | REGO 5 | 32.55 | 33 |
| | Trailer Transfer | REGO 8 | 32.55 | 33 |
| | Replacement Plate | — | 35.05 | 36 |
| | Unregistered Vehicle Permit | — | 38.90 | 39 |
| | VIN Plate | — | 8.14 | 9 |
| | PPSR Fee | — | 4.20 | 5 |
| Pensioner/Concession boat rego | 4 bands mirroring REGO 1–4 | — | 76.05/137.60/219.85/389.65 | 77/138/220/390 |

**Single-state (QLD) only** — no state column anywhere. Boat rego banded by hull length; trailer rego banded by ATM/tare weight class.
Mapping → **v1.4 Rego module**: direct load as the QLD catalog. Trailer bands align with HelmLogic's ATM-driven band selection; boat bands (by length) match the Boat CSV col 299 (`Boat Registration` = "6.01m to 10.00m" text values → resolve to REGO 3). Concession rows and transfer/VIN/PPSR fees have no current Rego-module concept → new item types. Confidence: **High**. Open: effective-date handling (file says "as at 1/7/25"; rego prices change every July).

---

## 3. Freight Module.xlsx (3 sheets)

### `Freight Distribution Calculator` (data to row 67)
Splits one container's landed freight across the boats inside, **by linear metre with a small-boat/loaded-boat split**. Shipment `S00173451/A`. Columns: boat (variant SKU + container e.g. `UL290ST03-00 ORCA215`), `Stock Number` (`N014309`…), `LOA`, `Per LM` computed $/lm, `Variance`, `Actual CTD` (the rounded amount actually booked: e.g. 2.9 m → $200, 3.1 m → $280, 3.4 m → $320). Footer: Container Nett **$5,634.64** = total 52.8 lm @ $106.72–181.33/lm; "Small Boat Split" $4,427 actual vs $4,930 calc; one "LOADED BOAT" (SP660, N014209) carries **$1,207.64** on its own. Boats are Highfield SKUs (UL/CL/RU/SP prefixes — same variant keyspace as `data-warehouse` Highfield variants).

### `FCL Import - Highfield` (47 rows)
AWW Global Logistics quote (contact J.N., quote 2026-02-28, shipment S00169820), origin Qingdao:
Seafreight 40' inc LSS US$3,767.60 → AUD 5,382.28 (rate 0.7 → ×1/0.7); Australian local charges itemized
(port charges 870, delivery order 75, CMR/EDI 35, documentation 110, port infrastructure 620, cartage-Boondall 550,
fuel surcharge 170.50, dehire 196, tolls 50, customs 135, quarantine 40) → sub-total 2,851.50.
Estimate total **8,233.78** + **10% Freight Buffer** → **SEAFREIGHT CTD 9,057.16**; ÷ 70.5 lm sample container
= **$128.47 per linear metre** (the constant feeding per-boat freight).

### `Quadrant Pacific - Surtees` (47 rows)
Same template, NZ (Tauranga): NZ$2,948.28 seafreight → AUD 2,456.90 (÷1.2); 13 NZ local charges → 2,039.23;
total 4,496.13 + **5% buffer** → **CTD 4,720.93**; ÷10.7 lm = **$441.21/lm** (NZ$529.45).

### HelmLogic mapping
Feeds the Boat-Module landed-cost chain (CSV cols 251–259: Base Freight, Documentation, Fumigation, Ocean Freight,
Fuel Surcharge, Other Charges, Road Freight → **Landed Hull Cost**). Model as per-vendor freight config:
`{perLinearMetreAUD, bufferPct, quoteDate, shipmentRef}` + optional per-shipment actuals ledger.
The Distribution Calculator is operational tooling (per-shipment allocation), not catalog — candidates for a
future stock/landed-cost feature next to the v1.10 stock-import surface. Confidence: **High** on decode,
**Medium** on where it lands (no freight surface exists in HelmLogic today; Highfield seed carries freight inside cost).

---

## 4. Administration Module.xlsx (3 sheets, 1 hidden)

- **Bank Details**: Account Name "Northside Marine Pty Ltd", BSB `064 000`, account number present (masked here: `166 *** **`), card surcharges **Visa/MC 1.2%**, **Amex 2.75%**, payment reference convention "Surname / Deal #". → Maps to org-level `paymentDetails` for quote/invoice PDFs (HelmLogic has no surcharge concept yet). Confidence: High.
- **Finance Module**: Yamaha Finance (contact/phone blank). Rate ladder by term: 7 yr 9.5%, 6 yr 8.75%, 5 yr 8.25%, 4 yr 7.95%, 3 yr 7.5%, 2 yr 7.5%; establishment **fees $1,200**; two disclaimer phrases + long YMF credit-licence disclaimer (ACL 394553, ABN 29 101 928 670). → A finance-repayment estimator config; no HelmLogic finance module exists (roadmap candidate). Confidence: High on decode.
- **Dropdowns (hidden)**: 8 document-display states with 0/1 flags — `Display Sheet 0, Quotation 0, Contract 1, Tax Invoice 1, Tax Invoice (Deposit Paid) 1, Contract (Stock Allocated) 1, Delivered Deal 1, Deal at Admin Status 1, Deal Closed Down 1`. This is the MPF's **deal-lifecycle document-state list** — direct conceptual ancestor of HelmLogic's v1.9 quote lifecycle state machine (the 0/1 likely toggles bank-details/finance display on printed docs). Confidence: Medium on flag semantics.

---

## 5. Customer Module.xlsx (1 sheet)

Reported 677 rows × 481 cols; **real data ends at row 57**; the width is a ghost (stray `Spare 5` cell at R2:col481). This is **not a retail-customer registry** — it is a **B2B account list (44 rows)** with:
- **Sale-type lookup** (rows 6–16, the price-level enum): `Cash Sale/Cash, Trade, Sub Dealer, Sub (Exclusive), AUS Sailing, Commercial Sale, Spare 2–5`.
- Header (row 5): `CUSTOMER | SALE TYPE | COMPANY NAME | ABN NUMBER | STREET ADDRESS | SUBURB | STATE | P/CODE | COUNTRY | PRIMARY CONTACT | PHONE | PHONE (2) | EMAIL | Website`.
- **Sections**: `HIGHFIELD - Sub Dealer's` (row 18), `HIGHFIELD - OEM's` (29), `HIGHFIELD - Broker's` (34), `YACHT CLUBS` (50).
- Distribution: SALE TYPE — Trade 19, Sub Dealer 7, Cash 3, Commercial 3, Sub (Exclusive) 2, AUS Sailing 2, spares 4. STATE — Qld 24, NSW 2, `QLD` 1 (case inconsistency), blank 17 (yacht-club rows are name+state only).
- Anonymised samples: `M.T.S.&C.` (Sub Dealer, Coomera QLD 4209, contact J.L., s***@marinetradesupplies.com.au); `I.B.S.` (Sub Dealer, Murarrie QLD 4172, s***@inflatableboatservices.com.au); `M.C.` (Sub Dealer, Brookvale NSW 2100); `H.Y.A.` (Trade, Sanctuary Cove); `M.Y.B.` (Trade/broker, Mooloolaba); `S.Y.C.` (AUS Sailing, yacht club, minimal fields).

**Mapping**: NOT the v1.12 `Customer` schema's retail buyer (source/lifecycleStage/buyers/tradeIn don't apply). These are **dealer-network accounts** — closest HelmLogic concept is sub-dealer orgs / trade accounts tied to price levels (`Sub Dealer` → sub-dealer price level; `AUS Sailing` → a bespoke level like Boating Alliance). Import as `organisations/{orgId}/tradeAccounts` (or seed sub-dealer org docs), keyed by company name (no stable ID; ABN present on only some rows). Confidence: **High** on decode, **Medium** on target. Open: where NSM keeps actual retail customers (not in this workbook — likely their DMS).

---

## 6. Contacts Module.xlsx (1 sheet, 57 rows)

Internal NSM staff directory: `Name | Landline | Mobile | Email`, grouped by department headers, each department with a shared line + info@ address: **BOAT SALES** (6 people incl. B.H., M.G., J.C.), **PARTS & ACCESSORIES** (5), **SERVICE** (3 incl. R.T.), **SERVICE TECHNICIANS & DETAILING** (9), **ADMINISTRATION** (5 incl. M.M.), **MARKETING** (2), **SYSTEMS SUPPORT** (2), plus 4 ungrouped rows (C.S., J.N., A.L., A.A. — the requesting user appears here). All `@nsmarine.com.au`.
Data-quality: two typo'd email domains — `nsmmarine.com.au` (C.M.) and `nsmarin.com.au` (J.M.).
**Mapping**: `organisations/{orgId}/salesTeam` + service-technician list (v1.11 `fitUpAssignedTechnician` picker wants exactly the SERVICE TECHNICIANS group). Confidence: High. Fix the 2 typo domains on import.

---

## 7. BMT Stock Holdings.xlsx (1 sheet, 84 rows × 38 cols)

Title "BMT Stock Holdings". Repeating per-brand blocks (JEANNEAU, HAINES SIGNATURE, STACER, STABICRAFT, SURTEES, HIGHFIELD), each with header `Model | Hull & Accesories | Motor | Trailer | Total BMT Cost` and an overall-totals row.
**It is an empty template**: only ONE populated row — Merry Fisher 695 with round placeholder numbers (100,000 / 50,000 / 30,000 / 180,000) which are duplicated as the OVERALL TOTALS. Everything else is 0/blank, with placeholder rows literally named "Boat". Cols beyond G unused (38-col width is a ghost). Note "Accesories" typo; 180,000 total also ≠ 100k+50k+30k (=180k — actually correct; totals formula fine).
**Mapping**: intended shape = per-model boat-motor-trailer cost aggregation of stock on hand → HelmLogic stock-management module (v1.10 stock import). Nothing to migrate; treat as a requirements hint (they want BMT-composite stock value reporting by brand/model). Confidence: High that it's a stub.

---

## 8. NSM Boat Module Sample.csv (8 rows × 4,069 cols)

One row per boat model/trim (Stabicraft sample: 2350 Supercab Adventure/Sportfish/Profish `700232x000`, 2050 Treker Adventure/Sportfish/Profish `700201x000`, one blank row). This is the **flattened export of one Boat Module row** — the Rosetta stone for the giant Boat Module.xlsx. Column regions (from header row):

| Cols | Region |
|---|---|
| 3–21 | Identity + specs: BOAT, Model Code, **Matrix** (= Price Matrix brand key, "Stabicraft"), hull length/beam/depth, LOA inc engine / on trailer, HOT, fuel, hull weight, max motor weight, bottomsides/topsides/transom |
| 23–74 | STANDARD FACTORY INCLUSIONS ×51 text lines (+ trim-specific "X ADDITIONS above Y" sub-blocks) |
| 76–226 | Factory Options ×150: option codes (`STB-2350SCADV-101`… or numeric factory codes), `.` = empty slot |
| 231–241 | Additional Factory Options ×10 (AFO) |
| 243–259 | **Landed-cost chain**: Currency, EX Rate, Duty (0.02%), Base Cost, Factory Discounts, Factory Pre Rig, Boat Prep, Base Freight, Documentation, Fumigation, Ocean Freight, Fuel Surcharge, Other Charges (+$A), Road Freight → **Landed Hull Cost** ← Freight Module feeds here |
| 261–264 | Factory promos: full rebate / factory contribution / NSM contribution (inc GST) |
| 266–271 | **Markups**: HO-MU 29%, BMT-MU 29%, Factory Options-MU 29%, DFO-MU 22.5% ← exactly the Price Matrix Stabicraft row |
| 273–278 | **Pre-delivery**: `Pre Delivery Code` (`9SB_7002323000_PD`), `Boat PD (hrs)` 12.0, `Labour Rate ($)`, `Boat Detailing ($)` 30.00, Fuel Allocation (L) 400, Tilt Limit Switch Yes |
| 280–297 | PD Parts & Accessories ×10 (batteries, trays, filters…), Boat Hand Over (hrs) 2.0, Tie Down Straps, H/O parts, Sundry 15.00, Promo Gear Allowance 150.00 |
| 299–306 | Rego + safety: Boat Registration band text ("6.01m to 10.00m" → Registration Module REGO 3), rego decals, Adults 8, Standard Safety Gear ("Safety Gear - Open Waters"), PFD qty/type, Standard Anchor Kit |
| 308–388 | **Motor options ×13**: Min/Max HP (225–350), Shaft, Recommended Motor (`Yamaha - F225UCB`), Rigging Kit (`(FF9SC) Yamaha 2400 SCB…`), Prop part/description, Engine Hole count |
| 390–399 | Trailer options ×10 (`REDCO … TA730T-EH (3,500kg)`, GFAB tandem, "TRAILER NOT REQUIRED" filler) |
| 401–443 | Additional Dealer Fit Options ×42 lines |
| 459–479 | **Hull Only Pricing** by sale type: Cash/Trade/Sub Dealer/Sub (Exclusive)/AUS Sailing/Spare 1–5 each with GP% (all `$-`/N/A on this sample) ← Customer Module sale-type enum |
| 483–533 | **Mechanical Pre-Delivery Check List ×50** (BOAT/FUEL SYSTEM/STEERING… checklist text) |
| 535–564 | **Detail Pre-Delivery Check List ×30** (wash & cham, cut & polish…) |
| 588–603 | Spare block |
| 606–611 | Deposit Payment Schedule: pending 0% / confirmed 10% / leaving factory (HIN) 30% / notice of arrival 0% / handover 60% |
| 615–620 | Factory Lead Times (days): lockout 20 / build 14 / completion 14 / shipping 7 / estimated total 45 |

**Mapping**: this row-shape ≈ HelmLogic model doc + variant + moduleConfig combined: specs → `specifications`; inclusions/options → optionalFeatures; landed-cost chain → cost fields (currently collapsed into `cost`); MU block → Price Matrix config; motor options → `motorConfigurations`; deposit schedule → v1.11 Document Defaults card (deposit/payment schedule/validity — direct match); lead times → new; MPDC/DPDC → workshop checklists (no surface). Confidence: High.

---

## 9. Consolidated anomalies (small modules)

1. **Phantom dimensions everywhere**: Customer 677→57 rows (481→18 cols), BMT 84×38 mostly empty, Freight calc 106→67, Service schedules 63,073→280. Never trust `max_row`/`max_col` on import.
2. `\xa0` (non-breaking space) used as "styled blank" throughout — must be treated as empty.
3. Stabicraft prefix collision: Price Matrix `9SC` vs Boat CSV PD code `9SB_…`.
4. Stacer boats and Stacer Trailers share franchise code `9ST` with different margin rows.
5. Rigging Kits carry **negative** trade/sub-dealer discounts (−5%) — intentional (trade pays above base) but easy to mis-sign on import.
6. Price Matrix `Other` column duplicates `Sell` on nearly every row — semantics undocumented; the "1/2/3…" ruler row (row 6) skips 15, and col 15 header is a merged spacer.
7. Registration Module is QLD-only with no state field, while HelmLogic Rego module is state-aware — needs an explicit `state: 'QLD'` wrap; "Heavy Trailers" band and concession bands lack REV codes.
8. Registration SELL rounds up (Math.ceil) exactly like HelmLogic's inc-GST rule — but note these fees are GST-free; the rounding is convention, not GST.
9. Customer Module: `Qld` vs `QLD` case drift; ABN mostly missing; 17 rows without state; no unique key besides company name.
10. Contacts: two misspelled email domains (`nsmmarine.com.au`, `nsmarin.com.au`); one contact (S.P. "Graham") phone-only.
11. Admin Finance Module has typos ("Esitmate", "indictive", "indivdual") that would leak onto customer PDFs if imported verbatim.
12. BMT Stock Holdings totals row uses placeholder data identical to its single data row — template never operationalised.
13. Freight per-lm rates differ 3.4× between suppliers (Highfield $128.47/lm vs Surtees $441.21/lm) and buffers differ (10% vs 5%) — freight config must be per-vendor, not global.
14. CSV boat rows use `.` as an empty-slot sentinel in option lists — strip on import.
15. Exchange-rate direction is inconsistent across sheets (NZ divide-by-1.2 vs USD multiply-by-1/0.7 written as rate 0.7) — normalize to one convention.
