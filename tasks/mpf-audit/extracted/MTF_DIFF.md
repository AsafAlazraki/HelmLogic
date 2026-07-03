# MTF Diff — MPF extraction vs live HelmLogic (READ-ONLY)

Generated 2026-07-03T09:58:39.100262+00:00 · Phase 2 (motors / trailers / factory options)

## Headline

- **Motors**: 208 of 235 live Yamaha rows matched by model code; **0 rows with price/cost drift**; 71 MPF codes missing in live; 0 live codes not in current MPF.
- **Trailers**: 431 of 431 current MPF trailers matched to 496 live docs by name; **4 with field drift**; 0 MPF trailers missing in live; 65 live trailers not in current MPF (incl. obsolete vendor).
- **Factory options (Highfield)**: 1038 live optionalFeatures across models — 1011 matched by code (1011 price-clean, 0 price mismatch), 27 live codes absent from the MPF Highfield catalog. MPF catalog holds 1057 active options (869 not referenced by any live model).
- **RU200KAM**: not present in Motor/Trailer/FO modules — the RU200KAM $76.82 drift is a Highfield hull/variant price (Boat Module scope, lands in the phase-2 BOATS diff).

## Motors — biggest price drifts (top 25)

| Model code | Field | Live | MPF | Δ |
|---|---|---:|---:|---:|

Motors missing in live (71): 11H2AI, 11H2AK, 12H2AI, 12H2AK, 12J2AI, 12J2AK, 12L2AP, 12L2AR, 12L3AI, 12L3AJ, 12L3AK, 12L3AL, 12O3AI, 12O3AJ, 12S3AJ, 16H2AI, 16J2AI, 16J2AJ, 16L2AP, 16L2AR, 16L3AI, 16L3AJ, 16L3AK, 16L3AL, 16O2BP, 16O3AJ, 16Q3BJ, 16R3AJ, A*1 11H2AI, A*1 12H2AI, A*1 12J2AI, A*1 16H2AI, A*1 16J2AI, A*1 16J2AJ, A*1 16L3AI, A*1 16L3BJ, A*1 16O3CJ, A1-0000-01, A2-0000-01, A4-0000-00 …

Live codes not in current MPF (0): 

## Trailers — biggest drifts (top 25)

| Trailer | Field | Live | MPF | Δ |
|---|---|---:|---:|---:|
| MACKAY PU Series Trailer - PU5000-14-M | sellPriceExclGst | 9760.0 | 9140.0 | -620.00 |
| MACKAY PU Series Trailer - PU5000-14-M | cost | 7455.66 | 6976.42 | -479.24 |
| MACKAY MLJ Series Trailer - MLJ6000T-14-HB | sellPriceExclGst | 21400.0 | 20980.0 | -420.00 |
| MACKAY MLJ Series Trailer - MLJ6000T-14-HB | cost | 16342.48 | 16024.11 | -318.37 |
| MACKAY MLJ Series Trailer - MLJ6000T-14-HB | atmKg | 2600.0 | 3000.0 | +400.00 |
| MACKAY PU Series Trailer - PU5000-14-M | atmKg | 1480.0 | 1650.0 | +170.00 |

MPF trailers missing in live (0): 

## Factory options (Highfield) — per-model summary

| Model | Live OFs | Matched | Price OK | Price drift | Missing in MPF |
|---|---:|---:|---:|---:|---:|
| cl260 | 5 | 5 | 5 | 0 | 0 |
| cl290 | 5 | 5 | 5 | 0 | 0 |
| cl290ft | 5 | 5 | 5 | 0 | 0 |
| cl310 | 9 | 9 | 9 | 0 | 0 |
| cl310ft | 5 | 5 | 5 | 0 | 0 |
| cl310ls | 9 | 9 | 9 | 0 | 0 |
| cl340 | 15 | 15 | 15 | 0 | 0 |
| cl340ft | 5 | 5 | 5 | 0 | 0 |
| cl340ls | 15 | 15 | 15 | 0 | 0 |
| cl340max | 10 | 10 | 10 | 0 | 0 |
| cl360 | 15 | 15 | 15 | 0 | 0 |
| cl360ls | 15 | 15 | 15 | 0 | 0 |
| cl360max | 10 | 10 | 10 | 0 | 0 |
| cl380 | 15 | 15 | 15 | 0 | 0 |
| cl380ls | 15 | 15 | 15 | 0 | 0 |
| cl380max | 10 | 10 | 10 | 0 | 0 |
| cl400 | 9 | 9 | 9 | 0 | 0 |
| cl420 | 14 | 14 | 14 | 0 | 0 |
| cl460 | 14 | 14 | 14 | 0 | 0 |
| ul220 | 1 | 1 | 1 | 0 | 0 |
| ul240 | 1 | 1 | 1 | 0 | 0 |
| ul240lt | 1 | 1 | 1 | 0 | 0 |
| ul260 | 1 | 1 | 1 | 0 | 0 |
| ul260lt | 1 | 1 | 1 | 0 | 0 |
| ul290 | 1 | 1 | 1 | 0 | 0 |
| ul290lt | 1 | 1 | 1 | 0 | 0 |
| ul310 | 1 | 1 | 1 | 0 | 0 |
| ul340 | 1 | 1 | 1 | 0 | 0 |
| sp300 | 1 | 1 | 1 | 0 | 0 |
| sp330 | 3 | 3 | 3 | 0 | 0 |
| sp360 | 3 | 3 | 3 | 0 | 0 |
| sp390 | 4 | 4 | 4 | 0 | 0 |
| sp420 | 4 | 4 | 4 | 0 | 0 |
| sp460 | 4 | 4 | 4 | 0 | 0 |
| sp520 | 3 | 3 | 3 | 0 | 0 |
| sp560 | 3 | 3 | 3 | 0 | 0 |
| sp600 | 2 | 2 | 2 | 0 | 0 |
| sp660 | 3 | 3 | 3 | 0 | 0 |
| sp700st | 3 | 3 | 3 | 0 | 0 |
| sp700wlwindlass | 3 | 3 | 3 | 0 | 0 |
| sp760st | 3 | 3 | 3 | 0 | 0 |
| sp760wlwindlass | 3 | 3 | 3 | 0 | 0 |
| sp900 | 3 | 3 | 3 | 0 | 0 |
| adv7 | 4 | 4 | 4 | 0 | 0 |
| pa420 | 28 | 26 | 26 | 0 | 2 |
| pa460 | 28 | 26 | 26 | 0 | 2 |
| pa500 | 50 | 48 | 48 | 0 | 2 |
| pa540-open | 58 | 57 | 57 | 0 | 1 |
| pa540st | 32 | 31 | 31 | 0 | 1 |
| pa600-open | 60 | 58 | 58 | 0 | 2 |
| pa600ew | 52 | 50 | 50 | 0 | 2 |
| pa600st | 53 | 52 | 52 | 0 | 1 |
| pa660ew | 49 | 48 | 48 | 0 | 1 |
| pa660st | 50 | 49 | 49 | 0 | 1 |
| pa700ew | 49 | 47 | 47 | 0 | 2 |
| pa700st | 50 | 48 | 48 | 0 | 2 |
| pa760ew | 51 | 49 | 49 | 0 | 2 |
| pa760st | 52 | 50 | 50 | 0 | 2 |
| pa860ew | 51 | 49 | 49 | 0 | 2 |
| pa860st | 52 | 50 | 50 | 0 | 2 |
| coaster-540-open | 13 | 13 | 13 | 0 | 0 |
| coaster-540-st | 1 | 1 | 1 | 0 | 0 |
| coaster-600-st | 1 | 1 | 1 | 0 | 0 |

Full detail (every field delta, every code) in `mtf-diff.json`.
