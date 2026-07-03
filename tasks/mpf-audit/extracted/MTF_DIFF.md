# MTF Diff — MPF extraction vs live HelmLogic (READ-ONLY)

Generated 2026-07-03T07:12:02.318713+00:00 · Phase 2 (motors / trailers / factory options)

## Headline

- **Motors**: 189 of 216 live Yamaha rows matched by model code; **183 rows with price/cost drift**; 90 MPF codes missing in live; 0 live codes not in current MPF.
- **Trailers**: 384 of 431 current MPF trailers matched to 449 live docs by name; **267 with field drift**; 47 MPF trailers missing in live; 65 live trailers not in current MPF (incl. obsolete vendor).
- **Factory options (Highfield)**: 1038 live optionalFeatures across models — 1011 matched by code (0 price-clean, 1011 price mismatch), 27 live codes absent from the MPF Highfield catalog. MPF catalog holds 1057 active options (869 not referenced by any live model).
- **RU200KAM**: not present in Motor/Trailer/FO modules — the RU200KAM $76.82 drift is a Highfield hull/variant price (Boat Module scope, lands in the phase-2 BOATS diff).

## Motors — biggest price drifts (top 25)

| Model code | Field | Live | MPF | Δ |
|---|---|---:|---:|---:|
| F150XC / LF150XC | Trade Price -> hull_trade | 44086.0 | 38040.0 | -6046.00 |
| F150XC / LF150XC | Commercial Price -> hull_commercial | 42600.0 | 43966.82 | +1366.82 |
| F150XC / LF150XC | Boating Alliance Price -> hull_boating_alliance | 42600.0 | 43966.82 | +1366.82 |
| F150XC / LF150XC | Sell Price -> hull_campaign | 44711.0 | 38578.0 | -6133.00 |
| F150XC / LF150XC | Total CTD -> cost | 37281.97 | 32168.33 | -5113.64 |
| F150XSA / LF150XSA | Trade Price -> hull_trade | 55330.0 | 49282.0 | -6048.00 |
| F150XSA / LF150XSA | Commercial Price -> hull_commercial | 53472.0 | 54840.14 | +1368.14 |
| F150XSA / LF150XSA | Boating Alliance Price -> hull_boating_alliance | 53472.0 | 54840.14 | +1368.14 |
| F150XSA / LF150XSA | Sell Price -> hull_campaign | 56104.0 | 49972.0 | -6132.00 |
| F150XSA / LF150XSA | Total CTD -> cost | 46789.46 | 41675.82 | -5113.64 |
| F150XSA2 / LF150XSA2 | Trade Price -> hull_trade | 57493.0 | 51446.0 | -6047.00 |
| F150XSA2 / LF150XSA2 | Commercial Price -> hull_commercial | 55561.0 | 56930.42 | +1369.42 |
| F150XSA2 / LF150XSA2 | Boating Alliance Price -> hull_boating_alliance | 55561.0 | 56930.42 | +1369.42 |
| F150XSA2 / LF150XSA2 | Sell Price -> hull_campaign | 58298.0 | 52167.0 | -6131.00 |
| F150XSA2 / LF150XSA2 | Total CTD -> cost | 48618.91 | 43505.27 | -5113.64 |
| F250USB2 / LF250USB2 | NSM Retail -> hull_cash | 88620.0 | 85636.0 | -2984.00 |
| F250USB2 / LF250USB2 | Trade Price -> hull_trade | 77728.0 | 74596.0 | -3132.00 |
| F250USB2 / LF250USB2 | Commercial Price -> hull_commercial | 75077.0 | 72051.33 | -3025.67 |
| F250USB2 / LF250USB2 | Boating Alliance Price -> hull_boating_alliance | 75077.0 | 72051.33 | -3025.67 |
| F250USB2 / LF250USB2 | Sell Price -> hull_campaign | 78850.0 | 75670.0 | -3180.00 |
| F250USB2 / LF250USB2 | Total CTD -> cost | 65731.71 | 63082.55 | -2649.16 |
| F150XC | Trade Price -> hull_trade | 22147.0 | 19124.0 | -3023.00 |
| F150XC | Commercial Price -> hull_commercial | 21411.0 | 22093.72 | +682.72 |
| F150XC | Boating Alliance Price -> hull_boating_alliance | 21411.0 | 22093.72 | +682.72 |
| F150XC | Sell Price -> hull_campaign | 22461.0 | 19394.0 | -3067.00 |

Motors missing in live (90): 11H2AI, 11H2AK, 12H2AI, 12H2AK, 12J2AI, 12J2AK, 12L2AP, 12L2AR, 12L3AI, 12L3AJ, 12L3AK, 12L3AL, 12O3AI, 12O3AJ, 12S3AJ, 16H2AI, 16J2AI, 16J2AJ, 16L2AP, 16L2AR, 16L3AI, 16L3AJ, 16L3AK, 16L3AL, 16O2BP, 16O3AJ, 16Q3BJ, 16R3AJ, A*1 11H2AI, A*1 12H2AI, A*1 12J2AI, A*1 16H2AI, A*1 16J2AI, A*1 16J2AJ, A*1 16L3AI, A*1 16L3BJ, A*1 16O3CJ, A1-0000-01, A2-0000-01, A4-0000-00 …

Live codes not in current MPF (0): 

## Trailers — biggest drifts (top 25)

| Trailer | Field | Live | MPF | Δ |
|---|---|---:|---:|---:|
| MACKAY Aluminium Custom Trailer - AL7500TR-14HD-HB | sellPriceExclGst | 35370.0 | 40520.0 | +5150.00 |
| MACKAY Aluminium Custom Trailer - AL7500TR-14HD-HB | cost | 26747.05 | 30953.13 | +4206.08 |
| MACKAY PU Series Trailer - PU6500T-14LS-HB | sellPriceExclGst | 20080.0 | 25200.0 | +5120.00 |
| MACKAY PU Series Trailer - PU6500T-14LS-HB | cost | 16763.05 | 19245.79 | +2482.74 |
| MACKAY Aluminium Custom Trailer - AL8000TR-14HD-HB | sellPriceExclGst | 36880.0 | 41950.0 | +5070.00 |
| MACKAY Aluminium Custom Trailer - AL8000TR-14HD-HB | cost | 27871.45 | 32040.06 | +4168.61 |
| MACKAY Aluminium Custom Trailer - AL8000T-15XHD-HB | sellPriceExclGst | 33930.0 | 38480.0 | +4550.00 |
| MACKAY Aluminium Custom Trailer - AL8000T-15XHD-HB | cost | 25604.93 | 29391.19 | +3786.26 |
| MACKAY Aluminium Custom Trailer - AL7500T-15XHD-HB | sellPriceExclGst | 31780.0 | 36320.0 | +4540.00 |
| MACKAY Aluminium Custom Trailer - AL7500T-15XHD-HB | cost | 24000.83 | 27741.25 | +3740.42 |
| MACKAY Aluminium Custom Trailer - AL7500T-15HD-HB | sellPriceExclGst | 30820.0 | 35220.0 | +4400.00 |
| MACKAY Aluminium Custom Trailer - AL7500T-15HD-HB | cost | 23286.71 | 26902.31 | +3615.60 |
| MACKAY PU Series Trailer - PU7500TR-14HD-HB | sellPriceExclGst | 29900.0 | 34250.0 | +4350.00 |
| MACKAY PU Series Trailer - PU7500TR-14HD-HB | cost | 22664.22 | 26160.82 | +3496.60 |
| MACKAY Aluminium Custom Trailer - AL7500T-14HDE-HB | sellPriceExclGst | 30510.0 | 34860.0 | +4350.00 |
| MACKAY Aluminium Custom Trailer - AL7500T-14HDE-HB | cost | 23055.23 | 26630.86 | +3575.63 |
| MACKAY Aluminium Custom Trailer - AL7500T-14HD-HB | sellPriceExclGst | 30310.0 | 34640.0 | +4330.00 |
| MACKAY Aluminium Custom Trailer - AL7500T-14HD-HB | cost | 22907.48 | 26457.71 | +3550.23 |
| MACKAY PU Series Trailer - PU7500TR-14LS-HB | sellPriceExclGst | 28560.0 | 32710.0 | +4150.00 |
| MACKAY PU Series Trailer - PU7500TR-14LS-HB | cost | 21661.49 | 24983.41 | +3321.92 |
| MACKAY Aluminium Custom Trailer - AL7000T-15XHD-HB | sellPriceExclGst | 28160.0 | 32170.0 | +4010.00 |
| MACKAY Aluminium Custom Trailer - AL7000T-15XHD-HB | cost | 21300.95 | 24572.07 | +3271.12 |
| MACKAY PU Series Trailer - PU7500T-15XHD-HB | sellPriceExclGst | 27820.0 | 31780.0 | +3960.00 |
| MACKAY PU Series Trailer - PU7500T-15XHD-HB | cost | 21045.83 | 24272.69 | +3226.86 |
| MACKAY PU Series Trailer - PU7500T-15HD-HB | sellPriceExclGst | 27580.0 | 31510.0 | +3930.00 |

MPF trailers missing in live (47): REDCO Stabicraft - RS610T-MO (2,200kg) Steel; REDCO Stabicraft Alloy - TA450MO-B (1,300kg) Keel Rollers / Skids; REDCO Stabicraft Alloy - TA600T-MOB (1,990kg); REDCO Stabicraft Alloy - TA600T-MOB (2,200kg); REDCO Stabicraft Alloy - TA600T-EH (2500kg); REDCO Stabicraft (2150) Alloy - TA600T-EH (2500kg); REDCO Stabicraft (2350) Alloy - TA800T-EH2 (4,240kg); REDCO Stabicraft (2500) Alloy - TA800T-EH2 (4,240kg); REDCO Stabicraft Alloy - TA900T-EH (4,240kg); REDCO Stabicraft Alloy - TA900TRI-EH (4,400kg); REDCO Custom / Highfield ADV7  Aluminium - TA700T-EH; Formosa GRT Tow Catch - RE1513Q-MO (Gal Steel, Single Axle); Formosa GRT Tow Catch - TA480-MOB (Aluminium, Single Axle); Formosa GRT Tow Catch - RSX450-MO (Offroad, Single Axle); Formosa 495 Tow Catch - RS510-MO (Gal Steel, Single Axle); Formosa 495 Tow Catch - RS510T-MO (Gal Steel, Tandem Axle); Formosa 495 Tow Catch - TA500MO-B (Aluminium, Single Axle); Formosa 525 Tow Catch - RS560-MO (Gal Steel, Single Axle); Formosa 525 Tow Catch - RS560T-MO (Gal Steel, Tandem Axle); Formosa 525 Tow Catch - TA500-MOB (Aluminium, Single Axle) …

## Factory options (Highfield) — per-model summary

| Model | Live OFs | Matched | Price OK | Price drift | Missing in MPF |
|---|---:|---:|---:|---:|---:|
| cl260 | 5 | 5 | 0 | 5 | 0 |
| cl290 | 5 | 5 | 0 | 5 | 0 |
| cl290ft | 5 | 5 | 0 | 5 | 0 |
| cl310 | 9 | 9 | 0 | 9 | 0 |
| cl310ft | 5 | 5 | 0 | 5 | 0 |
| cl310ls | 9 | 9 | 0 | 9 | 0 |
| cl340 | 15 | 15 | 0 | 15 | 0 |
| cl340ft | 5 | 5 | 0 | 5 | 0 |
| cl340ls | 15 | 15 | 0 | 15 | 0 |
| cl340max | 10 | 10 | 0 | 10 | 0 |
| cl360 | 15 | 15 | 0 | 15 | 0 |
| cl360ls | 15 | 15 | 0 | 15 | 0 |
| cl360max | 10 | 10 | 0 | 10 | 0 |
| cl380 | 15 | 15 | 0 | 15 | 0 |
| cl380ls | 15 | 15 | 0 | 15 | 0 |
| cl380max | 10 | 10 | 0 | 10 | 0 |
| cl400 | 9 | 9 | 0 | 9 | 0 |
| cl420 | 14 | 14 | 0 | 14 | 0 |
| cl460 | 14 | 14 | 0 | 14 | 0 |
| ul220 | 1 | 1 | 0 | 1 | 0 |
| ul240 | 1 | 1 | 0 | 1 | 0 |
| ul240lt | 1 | 1 | 0 | 1 | 0 |
| ul260 | 1 | 1 | 0 | 1 | 0 |
| ul260lt | 1 | 1 | 0 | 1 | 0 |
| ul290 | 1 | 1 | 0 | 1 | 0 |
| ul290lt | 1 | 1 | 0 | 1 | 0 |
| ul310 | 1 | 1 | 0 | 1 | 0 |
| ul340 | 1 | 1 | 0 | 1 | 0 |
| sp300 | 1 | 1 | 0 | 1 | 0 |
| sp330 | 3 | 3 | 0 | 3 | 0 |
| sp360 | 3 | 3 | 0 | 3 | 0 |
| sp390 | 4 | 4 | 0 | 4 | 0 |
| sp420 | 4 | 4 | 0 | 4 | 0 |
| sp460 | 4 | 4 | 0 | 4 | 0 |
| sp520 | 3 | 3 | 0 | 3 | 0 |
| sp560 | 3 | 3 | 0 | 3 | 0 |
| sp600 | 2 | 2 | 0 | 2 | 0 |
| sp660 | 3 | 3 | 0 | 3 | 0 |
| sp700st | 3 | 3 | 0 | 3 | 0 |
| sp700wlwindlass | 3 | 3 | 0 | 3 | 0 |
| sp760st | 3 | 3 | 0 | 3 | 0 |
| sp760wlwindlass | 3 | 3 | 0 | 3 | 0 |
| sp900 | 3 | 3 | 0 | 3 | 0 |
| adv7 | 4 | 4 | 0 | 4 | 0 |
| pa420 | 28 | 26 | 0 | 26 | 2 |
| pa460 | 28 | 26 | 0 | 26 | 2 |
| pa500 | 50 | 48 | 0 | 48 | 2 |
| pa540-open | 58 | 57 | 0 | 57 | 1 |
| pa540st | 32 | 31 | 0 | 31 | 1 |
| pa600-open | 60 | 58 | 0 | 58 | 2 |
| pa600ew | 52 | 50 | 0 | 50 | 2 |
| pa600st | 53 | 52 | 0 | 52 | 1 |
| pa660ew | 49 | 48 | 0 | 48 | 1 |
| pa660st | 50 | 49 | 0 | 49 | 1 |
| pa700ew | 49 | 47 | 0 | 47 | 2 |
| pa700st | 50 | 48 | 0 | 48 | 2 |
| pa760ew | 51 | 49 | 0 | 49 | 2 |
| pa760st | 52 | 50 | 0 | 50 | 2 |
| pa860ew | 51 | 49 | 0 | 49 | 2 |
| pa860st | 52 | 50 | 0 | 50 | 2 |
| coaster-540-open | 13 | 13 | 0 | 13 | 0 |
| coaster-540-st | 1 | 1 | 0 | 1 | 0 |
| coaster-600-st | 1 | 1 | 0 | 1 | 0 |

Full detail (every field delta, every code) in `mtf-diff.json`.
