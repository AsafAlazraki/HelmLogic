# MPF Phase 2 — Service/Pricing config diff (live vs extracted)

> READ-ONLY comparison, 2026-07-03T09:58:40.600188+00:00. Org `AcFZVEFA5UDJG2hyetWT` as billh@nsmarine.com.au.

## serviceOperations

- Live: **369** docs · MPF extracted: **364** ops (285 unique op keys — truncated-code families like `DFO_` x34 collapse; import disambiguates doc IDs with dedupe suffixes)
- Matched by code: **285** · price/hour drift on matched: **0**
- In MPF but NOT live: **0** unique keys (would be created on import)
- In live but NOT in MPF: **5** ['DIAG', 'IMP-REP', 'WINTER', 'YAM-100', 'YAM-200']
- Distinct live hourlyRate values: [144.55, 165] (MPF retail = 144.55 ex GST / 159 inc)

## serviceParts (vs Oils & Lubes consumables)

- Live: **26378** docs · MPF consumables: **27**
- Matched by partNumber: **27** · drift: **0** []
- In MPF but NOT live: **0** (created on import)
- In live but NOT in this MPF slice: **30** (untouched — Parts Module wave handles the full parts master)

## exchangeRates — HEADLINE CHECK (quotes convert with this!)

- Live docs: {'AUD': 1, 'EUR': 0.6, 'NZD': 1.2, 'USD': 0.7}
- **AUD**: MPF 1.0 vs live 1 — match
- **NZD**: MPF 1.2 vs live 1.2 — match
- **USD**: MPF 0.7 vs live 0.7 — match
- **EUR**: MPF 0.6 vs live 0.6 — match
- Convention verified: HelmLogic computes `baseAud = totalUsd / exchangeRate` (highfield-pricing-workspace.tsx) — same divisor style as MPF's Exchange Rates sheet.

## Rego catalog

- Path found: `data-warehouse/{vendorId}/regoTypes/{regoTypeId} (rego-workspace.tsx; seeded vendor qld-transport)`
- Rego Authority vendors live: [{'id': 'qld-transport', 'name': 'Queensland Transport (MSQ + TMR)', 'state': 'QLD'}]
- `qld-transport` regoTypes: 28
    - boat-10m-to-15m: Recreational Vessel — 10m to 15m — $408 (boat)
    - boat-45m-to-8m: Recreational Vessel — 4.5m to 8m — $163 (boat)
    - boat-8m-to-10m: Recreational Vessel — 8m to 10m — $245 (boat)
    - boat-over-15m: Recreational Vessel — over 15m — $610 (boat)
    - boat-up-to-45m: Recreational Vessel — up to 4.5m — $122 (boat)
    - mpf-10.01-to-15m-pensioner-concession: 10.01 to 15m (Pensioner / Concession) — $390 (boat)
    - mpf-4.51m-to-6.0m-pensioner-concession: 4.51m to 6.0m (Pensioner / Concession) — $138 (boat)
    - mpf-6.01m-to-10.00m-pensioner-concession: 6.01m to 10.00m (Pensioner / Concession) — $220 (boat)
    - mpf-boat-registration-not-required: Boat Registration Not Required — $0 (boat)
    - mpf-heavy-trailers-over-4.55t: Heavy Trailers - Over 4.55t — $998 (trailer)
    - mpf-ppsr-fee: PPSR Fee — $5 (fee)
    - mpf-registration-not-required: Registration - NOT REQUIRED — $0 (trailer)
    - mpf-rego-1: Up to and inc 4.5m — $127 (boat)
    - mpf-rego-2: 4.51m to 6.0m — $250 (boat)
    - mpf-rego-3: 6.01m to 10.00m — $414 (boat)
    - mpf-rego-4: 10.01 to 15m — $609 (boat)
    - mpf-rego-5: Boat Transfer Fee — $33 (fee)
    - mpf-rego-6: Small Trailers - Up to 1.02t — $166 (trailer)
    - mpf-rego-7: Large Trailers - Over 1.021t — $283 (trailer)
    - mpf-rego-8: Trailer Transfer Fee — $33 (fee)
    - mpf-replacement-plate: Replacement Plate — $36 (fee)
    - mpf-unregistered-vehicle-permit: Unregistered Vehicle Permit — $39 (fee)
    - mpf-up-to-and-inc-4.5m-pensioner-concession: Up to and inc 4.5m (Pensioner / Concession) — $77 (boat)
    - mpf-vin-plate: VIN Plate — $9 (fee)
    - trailer-0-750: Boat Trailer — up to 750kg ATM — $95 (trailer)
    - trailer-1501-2500: Boat Trailer — 1501 to 2500kg ATM — $245 (trailer)
    - trailer-2501-4500: Boat Trailer — 2501 to 4500kg ATM — $335 (trailer)
    - trailer-751-1500: Boat Trailer — 751 to 1500kg ATM — $165 (trailer)

### MPF QLD Registration Module vs live
MPF bands (SELL, GST-free, as at 1/7/25):
    - Up to and inc 4.5m [REGO 1]: CTD 126.35 → SELL 127.0
    - 4.51m to 6.0m [REGO 2]: CTD 249.5 → SELL 250.0
    - 6.01m to 10.00m [REGO 3]: CTD 414.0 → SELL 414.0
    - 10.01 to 15m [REGO 4]: CTD 608.05 → SELL 609.0
    - Boat Registration Not Required [—]: CTD 0.0 → SELL 0.0
    - Small Trailers - Up to 1.02t [REGO 6]: CTD 165.11 → SELL 166.0
    - Large Trailers - Over 1.021t [REGO 7]: CTD 282.19 → SELL 283.0
    - Heavy Trailers - Over 4.55t [—]: CTD 997.5 → SELL 998.0
    - Registration - NOT REQUIRED [—]: CTD 0.0 → SELL 0.0
    - Boat Transfer Fee [REGO 5]: CTD 32.55 → SELL 33.0
    - Trailer Transfer Fee [REGO 8]: CTD 32.55 → SELL 33.0
    - Replacement Plate [—]: CTD 35.05 → SELL 36.0
    - Unregistered Vehicle Permit [—]: CTD 38.9 → SELL 39.0
    - VIN Plate [—]: CTD 8.14 → SELL 9.0
    - PPSR Fee [—]: CTD 4.2 → SELL 5.0
    - Up to and inc 4.5m (Pensioner / Concession) [—]: CTD 76.05 → SELL 77.0
    - 4.51m to 6.0m (Pensioner / Concession) [—]: CTD 137.6 → SELL 138.0
    - 6.01m to 10.00m (Pensioner / Concession) [—]: CTD 219.85 → SELL 220.0
    - 10.01 to 15m (Pensioner / Concession) [—]: CTD 389.65 → SELL 390.0

**Assessment**: the live `qld-transport` regoTypes were seeded as *indicative* rates (scripts/seed-qld-registration.py). MPF is the authoritative dealer price list — live band boundaries AND fees differ (e.g. live boat band 4.5-8m $163 vs MPF 4.51-6.0m $250; live trailer bands by ATM kg vs MPF by weight-class tonnes). Import will upsert MPF bands as new regoTypes and flag the seeded indicative ones for review, not delete them.

## organisations/{org}/pricingMatrix (NEW collection)
- Live docs: 48 — import will create/patch from pricing-matrix.json

## organisations/{org}/engineServiceSchedules (NEW collection)
- Live docs: 189 — import will create/patch from engine-service-schedules.json

## organisations/{org}/freightConfig (NEW collection)
- Live docs: 2 — import will create/patch from freight-config.json

