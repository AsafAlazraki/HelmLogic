# BOATS — MPF vs HelmLogic reconciliation (Phase 2, read-only)

Generated 2026-07-03T06:57:51.055258+00:00 from `tasks/mpf-audit/extracted/boats.json` against live Firestore (`data-warehouse/LafOLpLb6QIFE856TiD4`: 7 ranges, 84 models, 628 variants).

## Headline counts (588 Highfield MPF SKUs)

| Bucket | Count |
|---|---|
| Exact match (sell AND cost within $0.01) | 0 |
| Price mismatch | 582 |
| Missing in HelmLogic | 6 |
| HL-only variants not in MPF current set | 46 |

## Price drift

- Sell (MPF cash ÷ 1.1 vs HL `sellPriceExclGst`): signed **$12,981.85**, absolute **$12,981.85**
- Cost (MPF Landed Hull Cost vs HL `cost`): signed **$5,276,426.08**, absolute **$5,276,426.08**

Positive delta = MPF is higher than HelmLogic.

## 20 worst offenders by |sell delta|

| SKU | Model | MPF cash exGst | HL sellPriceExclGst | Sell Δ | MPF landed | HL cost | Cost Δ |
|---|---|---|---|---|---|---|---|
| HBA001 | ADV7 | 96,300.00 | 94,445.45 | 1,854.55 | 64,198.57 | 23,527.00 | 40,671.57 |
| HBA002 | ADV7 | 96,300.00 | 94,445.45 | 1,854.55 | 64,198.57 | 23,527.00 | 40,671.57 |
| HBA003 | ADV7 | 96,300.00 | 94,445.45 | 1,854.55 | 64,198.57 | 23,527.00 | 40,671.57 |
| HBA004 | ADV7 | 96,300.00 | 94,445.45 | 1,854.55 | 64,198.57 | 23,527.00 | 40,671.57 |
| HBA005 | ADV7 | 96,300.00 | 94,445.45 | 1,854.55 | 64,198.57 | 23,527.00 | 40,671.57 |
| HBA006 | ADV7 | 96,300.00 | 94,445.45 | 1,854.55 | 64,198.57 | 23,527.00 | 40,671.57 |
| HBA007 | ADV7 | 96,300.00 | 94,445.45 | 1,854.55 | 64,198.57 | 23,527.00 | 40,671.57 |
| HBR005 | RU230KAM | 2,518.18 | 2,518.18 | 0.00 | 1,671.43 | 698.00 | 973.43 |
| HBR006 | RU230KAM | 4,836.36 | 4,836.36 | 0.00 | 3,214.29 | 1,702.00 | 1,512.29 |
| HBR007 | RU230KAM | 2,518.18 | 2,518.18 | 0.00 | 1,671.43 | 698.00 | 973.43 |
| HBR008 | RU230KAM | 4,090.91 | 4,090.91 | 0.00 | 2,721.43 | 1,381.00 | 1,340.43 |
| HBR009 | RU250KAM | 2,781.82 | 2,781.82 | 0.00 | 1,850.00 | 794.00 | 1,056.00 |
| HBR010 | RU250KAM | 5,418.18 | 5,418.18 | 0.00 | 3,602.86 | 1,936.00 | 1,666.86 |
| HBR011 | RU250KAM | 2,781.82 | 2,781.82 | 0.00 | 1,850.00 | 794.00 | 1,056.00 |
| HBR012 | RU250KAM | 4,672.73 | 4,672.73 | 0.00 | 3,110.00 | 1,615.00 | 1,495.00 |
| HBR013 | RU280KAM | 2,954.55 | 2,954.55 | 0.00 | 1,965.71 | 850.00 | 1,115.71 |
| HBR014 | RU280KAM | 5,945.45 | 5,945.45 | 0.00 | 3,955.71 | 2,146.00 | 1,809.71 |
| HBR015 | RU280KAM | 2,954.55 | 2,954.55 | 0.00 | 1,965.71 | 850.00 | 1,115.71 |
| HBR016 | RU280KAM | 4,890.91 | 4,890.91 | 0.00 | 3,254.29 | 1,689.00 | 1,565.29 |
| HBR017 | RU320KAM | 3,345.45 | 3,345.45 | 0.00 | 2,222.86 | 979.00 | 1,243.86 |

## Missing in HelmLogic

| SKU | Name | Range | Model found in HL? |
|---|---|---|---|
| HBS15## | Highfield - SP660 (HYP) DG-G-WB | Sport | yes — variant missing |
| HBADV9008 | Highfield - ADV9 (Dune) | Adventure | no — model missing too |
| HBADV9009 | Highfield - ADV9 (Mangrove) | Adventure | no — model missing too |
| HBADV9010 | Highfield - ADV9 (Ocean) | Adventure | no — model missing too |
| HBADV9011 | Highfield - ADV9 (Polar) | Adventure | no — model missing too |
| HBADV9012 | Highfield - ADV9 (Sky) | Adventure | no — model missing too |

## HL-only variants (live, not in MPF current section)

| Variant | Model | Range | Note |
|---|---|---|---|
| HBC129 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC130 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC131 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC132 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC133 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC134 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC135 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC136 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC137 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC138 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC139 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC140 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC141 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC142 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC143 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC144 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC145 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC146 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC147 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC148 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC149 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC150 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC151 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC152 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC158 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC161 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC163 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBR001 | RU200KAM | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR002 | RU200KAM | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR003 | RU200KAM | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR004 | RU200KAM | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR021 | RU200AL | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR022 | RU200AL | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR023 | RU200AL | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR024 | RU200AL | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR041 | RU250 Easy Go | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR042 | RU300 Easy Go | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBU001 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU002 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU003 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU004 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU005 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU006 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU007 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU008 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| demo-default-pvc | PA860 | Patrol | placeholder/demo |

## Non-Highfield brands (no HL counterpart expected yet — D4 creates vendors at import)

| Brand | Current boats |
|---|---|
| Cap Camarat | 11 |
| Formosa | 39 |
| Haines Signature | 9 |
| Jeanneau | 4 |
| Merry Fisher | 12 |
| Stabicraft | 37 |
| Stacer | 91 |
| Surtees | 19 |

Total non-Highfield current boats: **222**
